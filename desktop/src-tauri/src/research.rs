//! Linux V1: one Rust-owned, Project-selected research child and fixed HTTP client.
use crate::supervisor::{
    child_owns_listener, drain, ManagementSupervisor, SupervisorConfig, BACKEND_SHA,
};
use crate::{read_private_token, safe_project_id, NativeError, ProjectView};
use base64::Engine;
use futures_util::StreamExt;
use reqwest::{header, Method};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    fs::File,
    io::Read,
    net::TcpListener,
    os::unix::fs::PermissionsExt,
    path::{Component, Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

const STARTUP_LIMIT: Duration = Duration::from_secs(45);
const STOP_GRACE: Duration = Duration::from_secs(5);
const MAX_BODY: usize = 65_536;
const PREFIX: &str = "/api/runtime/v1";
const RUNTIME_OVERRIDES: [(&str, &str); 7] = [
    (
        "MORGOTH_DESKTOP_RESEARCH_CONNECTIVITY_CHECK_ENABLED",
        "CONNECTIVITY_CHECK_ENABLED",
    ),
    (
        "MORGOTH_DESKTOP_RESEARCH_METRIC_RECORDER_ENABLED",
        "METRIC_RECORDER_ENABLED",
    ),
    (
        "MORGOTH_DESKTOP_RESEARCH_SOURCE_CACHE_ENABLED",
        "SOURCE_CACHE_ENABLED",
    ),
    (
        "MORGOTH_DESKTOP_RESEARCH_PROVIDER_HEARTBEAT_MINUTES",
        "PROVIDER_HEARTBEAT_MINUTES",
    ),
    (
        "MORGOTH_DESKTOP_RESEARCH_AUTONOMOUS_CYCLE_MINUTES",
        "AUTONOMOUS_CYCLE_MINUTES",
    ),
    (
        "MORGOTH_DESKTOP_RESEARCH_MAX_CYCLES_PER_OBJECTIVE",
        "MAX_CYCLES_PER_OBJECTIVE",
    ),
    (
        "MORGOTH_DESKTOP_RESEARCH_LLM_FALLBACK_ENABLED",
        "LLM_FALLBACK_ENABLED",
    ),
];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResearchPhase {
    Stopped,
    Starting,
    Paused,
    NotReady,
    Running,
    Failed,
    Stopping,
}

#[derive(Clone, Serialize)]
pub struct ResearchEngineStatus {
    pub state: ResearchPhase,
    pub project_id: Option<String>,
    pub domain: Option<String>,
    pub diagnostic: Option<&'static str>,
    pub runtime: Option<RuntimeStatus>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeStatus {
    pub schema_version: u8,
    pub project: String,
    pub domain: String,
    pub code_sha: Option<String>,
    pub initialized: bool,
    pub awakening_ready: bool,
    pub research_state: String,
    pub autonomous_task_alive: bool,
    pub profile: String,
    pub profile_status: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AutonomousFailure {
    TaskCancelled,
    TaskFailed,
    TaskExited,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeLiveness {
    pub schema_version: u8,
    pub project: String,
    pub domain: String,
    pub code_sha: Option<String>,
    pub initialized: bool,
    pub research_state: String,
    pub autonomous_task_alive: bool,
    pub autonomous_failure: Option<AutonomousFailure>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileView {
    pub id: String,
    pub status: String,
    pub reason: String,
    pub providers: std::collections::BTreeMap<String, String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProfilesResponse {
    pub schema_version: u8,
    pub current: String,
    pub recommended: Option<String>,
    pub profiles: Vec<ProfileView>,
    pub codex: CodexReadiness,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CodexReadiness {
    pub installed: bool,
    pub authenticated: bool,
    pub sandbox_available: bool,
    pub sandbox_qualified: bool,
    pub workloads_ready: bool,
}

#[derive(Serialize)]
struct ProfileSelection<'a> {
    profile: &'a str,
}

#[derive(Clone)]
pub struct ResearchClient {
    http: reqwest::Client,
    port: u16,
    token: String,
}

impl ResearchClient {
    pub fn new(port: u16, token_path: &Path) -> Result<Self, NativeError> {
        if port == 0 {
            return Err(NativeError::new("CONFIG", "Port de recherche invalide."));
        }
        let token = read_private_token(token_path)?;
        let http = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(8))
            .build()
            .map_err(|_| NativeError::new("CONFIG", "Client de recherche indisponible."))?;
        Ok(Self { http, port, token })
    }

    async fn call<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &'static str,
        profile: Option<&str>,
    ) -> Result<T, NativeError> {
        let post = method == Method::POST;
        let mut request = self
            .http
            .request(
                method,
                format!("http://127.0.0.1:{}{PREFIX}{path}", self.port),
            )
            .header("X-Morgoth-Token", &self.token)
            .header(header::ACCEPT, "application/json");
        if let Some(value) = profile {
            request = request.json(&ProfileSelection { profile: value });
        }
        let response = request.send().await.map_err(|_| {
            NativeError::new(
                if post {
                    "UNCERTAIN_RUNTIME_ACTION"
                } else {
                    "RESEARCH_TRANSPORT"
                },
                "Réponse du moteur indisponible ; vérifiez son état.",
            )
        })?;
        let status = response.status();
        if status.is_redirection() {
            return Err(NativeError::new(
                "REDIRECT_REJECTED",
                "Redirection refusée.",
            ));
        }
        if !response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| {
                v.split(';')
                    .next()
                    .is_some_and(|s| s.trim().eq_ignore_ascii_case("application/json"))
            })
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Réponse moteur incompatible.",
            ));
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BODY as u64)
        {
            return Err(NativeError::new(
                "OVERSIZED_RESPONSE",
                "Réponse moteur trop volumineuse.",
            ));
        }
        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| {
                NativeError::new(
                    if post {
                        "UNCERTAIN_RUNTIME_ACTION"
                    } else {
                        "RESEARCH_TRANSPORT"
                    },
                    "Réponse moteur interrompue ; vérifiez son état.",
                )
            })?;
            if bytes.len() + chunk.len() > MAX_BODY {
                return Err(NativeError::new(
                    "OVERSIZED_RESPONSE",
                    "Réponse moteur trop volumineuse.",
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        if !status.is_success() {
            return Err(NativeError {
                kind: "API".into(),
                code: Some("RESEARCH_REFUSED".into()),
                status: Some(status.as_u16()),
                message: "Opération de recherche refusée.".into(),
            });
        }
        serde_json::from_slice(&bytes).map_err(|_| {
            NativeError::new(
                if post {
                    "UNCERTAIN_RUNTIME_ACTION"
                } else {
                    "INCOMPATIBLE_RESPONSE"
                },
                "Réponse moteur incompatible ; vérifiez son état.",
            )
        })
    }

    pub async fn status(&self) -> Result<RuntimeStatus, NativeError> {
        let value: RuntimeStatus = self.call(Method::GET, "/status", None).await?;
        if value.schema_version != 1
            || !matches!(
                value.research_state.as_str(),
                "PAUSED" | "NOT_READY" | "RUNNING" | "FAILED" | "STOPPED" | "INITIALIZING"
            )
            || !matches!(
                value.profile_status.as_str(),
                "READY" | "BLOCKED" | "UNAVAILABLE"
            )
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "État moteur incompatible.",
            ));
        }
        Ok(value)
    }
    pub async fn liveness(&self) -> Result<RuntimeLiveness, NativeError> {
        let value: RuntimeLiveness = self.call(Method::GET, "/liveness", None).await?;
        if value.schema_version != 1
            || !matches!(
                value.research_state.as_str(),
                "PAUSED" | "NOT_READY" | "RUNNING" | "FAILED" | "STOPPED" | "INITIALIZING"
            )
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "État moteur incompatible.",
            ));
        }
        Ok(value)
    }
    pub async fn profiles(&self) -> Result<ProfilesResponse, NativeError> {
        let value: ProfilesResponse = self.call(Method::GET, "/profiles", None).await?;
        if value.schema_version != 1
            || !value.profiles.iter().any(|p| p.id == value.current)
            || value
                .profiles
                .iter()
                .any(|p| !matches!(p.status.as_str(), "READY" | "BLOCKED" | "UNAVAILABLE"))
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Profils moteur incompatibles.",
            ));
        }
        Ok(value)
    }
    pub async fn select_profile(&self, id: &str) -> Result<ProfilesResponse, NativeError> {
        if !safe_project_id(id) {
            return Err(NativeError::new("INVALID_PROFILE", "Profil invalide."));
        }
        let value: ProfilesResponse = self.call(Method::POST, "/profile", Some(id)).await?;
        if value.schema_version != 1 || value.current != id {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Profil moteur incompatible.",
            ));
        }
        Ok(value)
    }
    pub async fn start(&self) -> Result<RuntimeStatus, NativeError> {
        let value: RuntimeStatus = self.call(Method::POST, "/start", None).await?;
        if value.schema_version != 1
            || value.research_state != "RUNNING"
            || !value.autonomous_task_alive
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Démarrage moteur non confirmé.",
            ));
        }
        Ok(value)
    }
}

struct ResearchConfig {
    shared: SupervisorConfig,
    postgres_url: String,
    ollama_base_url: String,
    ollama_primary_model: String,
    ollama_agent_model: String,
    max_concurrent_agents: String,
    log_retention_days: String,
    log_level_thought: String,
    provider_home: PathBuf,
    provider_runtime: Option<ProviderRuntime>,
    runtime_overrides: Vec<(&'static str, String)>,
}

fn native_runtime_overrides() -> Result<Vec<(&'static str, String)>, &'static str> {
    let mut overrides = Vec::new();
    for (native, child) in RUNTIME_OVERRIDES {
        let Some(value) = std::env::var_os(native) else {
            continue;
        };
        let value = value
            .into_string()
            .map_err(|_| "RESEARCH_OVERRIDE_INVALID")?;
        if !valid_runtime_override(child, &value) {
            return Err("RESEARCH_OVERRIDE_INVALID");
        }
        overrides.push((child, value));
    }
    Ok(overrides)
}

fn valid_runtime_override(child: &str, value: &str) -> bool {
    if child.ends_with("_ENABLED") {
        matches!(value, "true" | "false")
    } else if child == "MAX_CYCLES_PER_OBJECTIVE" {
        value
            .parse::<u32>()
            .is_ok_and(|cycles| (1..=20).contains(&cycles))
    } else {
        value.parse::<u32>().is_ok_and(|minutes| minutes > 0)
    }
}

impl ResearchConfig {
    fn from_environment(shared: SupervisorConfig) -> Result<Self, &'static str> {
        let read = |name| {
            std::env::var(name)
                .ok()
                .filter(|s| !s.is_empty())
                .ok_or("RESEARCH_CONFIG_MISSING")
        };
        let provider_home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or("PROVIDER_HOME_MISSING")?;
        if !provider_home.is_absolute()
            || !provider_home.is_dir()
            || provider_home
                .components()
                .any(|c| c == Component::ParentDir)
        {
            return Err("PROVIDER_HOME_INVALID");
        }
        let provider_runtime = ProviderRuntime::discover();
        Ok(Self {
            shared,
            postgres_url: read("MORGOTH_DESKTOP_RESEARCH_POSTGRES_URL")?,
            ollama_base_url: read("MORGOTH_DESKTOP_RESEARCH_OLLAMA_BASE_URL")?,
            ollama_primary_model: read("MORGOTH_DESKTOP_RESEARCH_OLLAMA_PRIMARY_MODEL")?,
            ollama_agent_model: read("MORGOTH_DESKTOP_RESEARCH_OLLAMA_AGENT_MODEL")?,
            max_concurrent_agents: read("MORGOTH_DESKTOP_RESEARCH_MAX_CONCURRENT_AGENTS")?,
            log_retention_days: read("MORGOTH_DESKTOP_RESEARCH_LOG_RETENTION_DAYS")?,
            log_level_thought: read("MORGOTH_DESKTOP_RESEARCH_LOG_LEVEL_THOUGHT")?,
            provider_home,
            provider_runtime,
            runtime_overrides: native_runtime_overrides()?,
        })
    }
}

#[derive(Clone)]
struct ProviderRuntime {
    codex_executable_dir: PathBuf,
    required_runtime_dirs: Vec<PathBuf>,
}

impl ProviderRuntime {
    fn discover() -> Option<Self> {
        let native_path = std::env::var_os("PATH")?;
        Self::from_native_path(&native_path)
    }

    fn from_native_path(native_path: &std::ffi::OsStr) -> Option<Self> {
        let codex_executable_dir = find_executable_dir("codex", native_path)?;
        let codex = codex_executable_dir.join("codex");
        let mut required_runtime_dirs = Vec::new();
        // The installed npm wrapper uses env node. Resolve only its interpreter
        // directory; do not copy the native parent's whole PATH or credentials.
        let mut file = File::open(&codex).ok()?;
        let mut prefix = [0_u8; 96];
        let count = file.read(&mut prefix[..2]).ok()?;
        if count == 2 && &prefix[..2] == b"#!" {
            let remainder = file.read(&mut prefix[2..]).ok()?;
            let declaration = &prefix[..2 + remainder];
            if declaration.starts_with(b"#!/usr/bin/env node") {
                required_runtime_dirs.push(find_executable_dir("node", native_path)?);
            }
        }
        Some(Self {
            codex_executable_dir,
            required_runtime_dirs,
        })
    }

    fn path_value(&self) -> std::ffi::OsString {
        let mut dirs = Vec::new();
        for dir in std::iter::once(self.codex_executable_dir.as_path())
            .chain(self.required_runtime_dirs.iter().map(PathBuf::as_path))
            .chain([Path::new("/usr/bin"), Path::new("/bin")])
        {
            if !dirs.iter().any(|existing| existing == dir) {
                dirs.push(dir.to_path_buf());
            }
        }
        std::env::join_paths(dirs).expect("validated native executable directories")
    }
}

fn find_executable_dir(name: &str, native_path: &std::ffi::OsStr) -> Option<PathBuf> {
    for directory in std::env::split_paths(native_path) {
        if !directory.is_absolute()
            || directory.components().any(|c| c == Component::ParentDir)
            || !directory.is_dir()
            || std::env::join_paths([&directory]).is_err()
        {
            continue;
        }
        let candidate = directory.join(name);
        let Ok(meta) = candidate.metadata() else {
            continue;
        };
        if meta.is_file() && meta.permissions().mode() & 0o111 != 0 {
            return Some(directory);
        }
    }
    None
}

fn fresh_secret() -> Result<String, &'static str> {
    let mut bytes = [0_u8; 32];
    File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|_| "RESEARCH_CONFIG_UNAVAILABLE")?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

fn research_command(config: &ResearchConfig, project_id: &str, port: u16, secret: &str) -> Command {
    let mut command = Command::new(&config.shared.python);
    let path = config.provider_runtime.as_ref().map_or_else(
        || std::ffi::OsString::from("/usr/bin:/bin"),
        ProviderRuntime::path_value,
    );
    command
        .args(["-m", "scripts.research_engine", "--home"])
        .arg(&config.shared.home)
        .args(["--project", project_id, "--port"])
        .arg(port.to_string())
        .current_dir(&config.shared.backend_root)
        .env_clear()
        .env("PATH", path)
        .env("HOME", &config.provider_home)
        .env("LANG", "C.UTF-8")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("POSTGRES_URL", &config.postgres_url)
        .env("OLLAMA_BASE_URL", &config.ollama_base_url)
        .env("OLLAMA_PRIMARY_MODEL", &config.ollama_primary_model)
        .env("OLLAMA_AGENT_MODEL", &config.ollama_agent_model)
        .env("MAX_CONCURRENT_AGENTS", &config.max_concurrent_agents)
        .env("LOG_RETENTION_DAYS", &config.log_retention_days)
        .env("LOG_LEVEL_THOUGHT", &config.log_level_thought)
        .env("SECRET_KEY", secret)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (name, value) in &config.runtime_overrides {
        command.env(name, value);
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        let parent = unsafe { libc::getpid() };
        unsafe {
            command.pre_exec(move || {
                if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0
                    || libc::getppid() != parent
                {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    command
}

struct Inner {
    generation: u64,
    phase: ResearchPhase,
    stop_requested: bool,
    diagnostic: Option<&'static str>,
    child: Option<Child>,
    project: Option<ProjectView>,
    runtime: Option<RuntimeStatus>,
    last_liveness: Option<RuntimeLiveness>,
    client: Option<ResearchClient>,
}

#[derive(Clone)]
pub struct ResearchEngineSupervisor {
    inner: Arc<Mutex<Inner>>,
    management: ManagementSupervisor,
    config: Result<SupervisorConfig, &'static str>,
}

impl ResearchEngineSupervisor {
    pub fn new(
        config: Result<SupervisorConfig, &'static str>,
        management: ManagementSupervisor,
    ) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                generation: 0,
                phase: ResearchPhase::Stopped,
                stop_requested: false,
                diagnostic: None,
                child: None,
                project: None,
                runtime: None,
                last_liveness: None,
                client: None,
            })),
            management,
            config,
        }
    }

    pub fn status(&self) -> ResearchEngineStatus {
        let mut inner = self.inner.lock().expect("research supervisor lock");
        if inner
            .child
            .as_mut()
            .and_then(|c| c.try_wait().ok())
            .flatten()
            .is_some()
        {
            inner.phase = ResearchPhase::Failed;
            inner.diagnostic = Some("CHILD_EXITED");
            inner.client = None;
        }
        ResearchEngineStatus {
            state: inner.phase,
            project_id: inner.project.as_ref().map(|p| p.id.clone()),
            domain: inner.project.as_ref().map(|p| p.domain.clone()),
            diagnostic: inner.diagnostic,
            runtime: inner.runtime.clone(),
        }
    }

    fn client(&self) -> Result<ResearchClient, NativeError> {
        let mut inner = self.inner.lock().expect("research supervisor lock");
        if !matches!(
            inner.phase,
            ResearchPhase::Paused
                | ResearchPhase::NotReady
                | ResearchPhase::Running
                | ResearchPhase::Failed
        ) || inner.child.is_none()
        {
            return Err(NativeError::new(
                "RESEARCH_UNAVAILABLE",
                "Moteur de recherche indisponible.",
            ));
        }
        let child = inner.child.as_mut().expect("checked child");
        if child.try_wait().ok().flatten().is_some() {
            inner.phase = ResearchPhase::Failed;
            inner.diagnostic = Some("CHILD_EXITED");
            inner.client = None;
            return Err(NativeError::new(
                "RESEARCH_UNAVAILABLE",
                "Moteur de recherche indisponible.",
            ));
        }
        let pid = child.id();
        let client = inner.client.clone().ok_or_else(|| {
            NativeError::new("RESEARCH_UNAVAILABLE", "Moteur de recherche indisponible.")
        })?;
        drop(inner);
        if child_owns_listener(client.port, pid) != Ok(true) {
            return Err(NativeError::new(
                "RESEARCH_UNAVAILABLE",
                "Port du moteur non vérifiable.",
            ));
        }
        Ok(client)
    }

    pub async fn initialize(
        &self,
        project_id: String,
    ) -> Result<ResearchEngineStatus, NativeError> {
        if !safe_project_id(&project_id) || project_id == "default" {
            return Err(NativeError::new(
                "INVALID_PROJECT_ID",
                "Projet non supervisable.",
            ));
        }
        {
            let inner = self.inner.lock().expect("research supervisor lock");
            if inner.child.is_some()
                || matches!(
                    inner.phase,
                    ResearchPhase::Starting | ResearchPhase::Stopping
                )
            {
                return Err(NativeError::new(
                    "ENGINE_ALREADY_ACTIVE",
                    "Un moteur est déjà actif.",
                ));
            }
        }
        let management = self.management.client()?;
        let project = management.get_project(&project_id).await?;
        if project.id != project_id
            || project.legacy
            || !project.configuration_valid
            || project.runtime_checked
        {
            return Err(NativeError::new(
                "PROJECT_NOT_ELIGIBLE",
                "Configuration du projet non utilisable.",
            ));
        }
        let config = self
            .config
            .clone()
            .map_err(|code| NativeError::new(code, "Configuration native indisponible."))?;
        let expected_runtime = config
            .home
            .join("projects")
            .join(&project_id)
            .join("runtime");
        if Path::new(&project.runtime_dir) != expected_runtime {
            return Err(NativeError::new(
                "PROJECT_PATH_MISMATCH",
                "État du projet non vérifiable.",
            ));
        }
        let mut inner = self.inner.lock().expect("research supervisor lock");
        if inner.child.is_some()
            || matches!(
                inner.phase,
                ResearchPhase::Starting | ResearchPhase::Stopping
            )
        {
            return Err(NativeError::new(
                "ENGINE_ALREADY_ACTIVE",
                "Un moteur est déjà actif.",
            ));
        }
        inner.phase = ResearchPhase::Starting;
        inner.generation = inner.generation.wrapping_add(1);
        let generation = inner.generation;
        inner.stop_requested = false;
        inner.diagnostic = None;
        inner.project = Some(project.clone());
        inner.runtime = None;
        inner.last_liveness = None;
        drop(inner);
        let worker = self.clone();
        thread::spawn(move || match worker.start_once(config, project) {
            Ok(()) => worker.monitor(generation),
            Err(code) => {
                if worker.status().state != ResearchPhase::Stopped {
                    worker.stop_child(ResearchPhase::Failed);
                    let mut inner = worker.inner.lock().expect("research supervisor lock");
                    if inner.phase == ResearchPhase::Failed {
                        inner.diagnostic = Some(code);
                    }
                }
            }
        });
        Ok(self.status())
    }

    fn start_once(
        &self,
        shared: SupervisorConfig,
        project: ProjectView,
    ) -> Result<(), &'static str> {
        shared.validate()?;
        let config = ResearchConfig::from_environment(shared)?;
        self.start_with_config(config, project)
    }

    fn start_with_config(
        &self,
        config: ResearchConfig,
        project: ProjectView,
    ) -> Result<(), &'static str> {
        let secret = fresh_secret()?;
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|_| "PORT_UNAVAILABLE")?;
        let port = listener
            .local_addr()
            .map_err(|_| "PORT_UNAVAILABLE")?
            .port();
        drop(listener); // The backend launcher accepts a port, not an inherited socket.
        let mut command = research_command(&config, &project.id, port, &secret);
        let mut inner = self.inner.lock().expect("research supervisor lock");
        if inner.phase != ResearchPhase::Starting {
            return Err("STARTUP_CANCELLED");
        }
        let mut child = command.spawn().map_err(|_| "CHILD_SPAWN_FAILED")?;
        drain(child.stdout.take());
        drain(child.stderr.take());
        inner.child = Some(child);
        drop(inner);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|_| "STARTUP_FAILED")?;
        let token_path = Path::new(&project.runtime_dir).join("auth/ui_token");
        let started = Instant::now();
        loop {
            if started.elapsed() >= STARTUP_LIMIT {
                return Err("STARTUP_TIMEOUT");
            }
            let pid = {
                let mut inner = self.inner.lock().expect("research supervisor lock");
                if inner.phase != ResearchPhase::Starting {
                    return Err("STARTUP_CANCELLED");
                }
                let child = inner.child.as_mut().ok_or("CHILD_EXITED")?;
                if child.try_wait().map_err(|_| "CHILD_EXITED")?.is_some() {
                    return Err("CHILD_EXITED");
                }
                child.id()
            };
            if !child_owns_listener(port, pid)? {
                thread::sleep(Duration::from_millis(100));
                continue;
            }
            let Ok(client) = ResearchClient::new(port, &token_path) else {
                thread::sleep(Duration::from_millis(100));
                continue;
            };
            let result = runtime.block_on(client.status());
            if let Ok(status) = result {
                if !runtime_identity_matches(&status, &project) {
                    return Err("RUNTIME_IDENTITY_MISMATCH");
                }
                let phase = match status.research_state.as_str() {
                    "PAUSED" => ResearchPhase::Paused,
                    "NOT_READY" => ResearchPhase::NotReady,
                    "FAILED" => ResearchPhase::Failed,
                    _ => return Err("RUNTIME_STATE_MISMATCH"),
                };
                let mut inner = self.inner.lock().expect("research supervisor lock");
                if inner.phase != ResearchPhase::Starting {
                    return Err("STARTUP_CANCELLED");
                }
                if inner
                    .child
                    .as_mut()
                    .ok_or("CHILD_EXITED")?
                    .try_wait()
                    .map_err(|_| "CHILD_EXITED")?
                    .is_some()
                {
                    return Err("CHILD_EXITED");
                }
                inner.client = Some(client);
                inner.runtime = Some(status);
                inner.last_liveness = None;
                inner.phase = phase;
                if inner.phase == ResearchPhase::Failed {
                    inner.diagnostic = Some("BACKEND_TASK_EXITED");
                }
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn monitor(&self, generation: u64) {
        if self
            .inner
            .lock()
            .expect("research supervisor lock")
            .generation
            != generation
        {
            return;
        }
        let runtime = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime,
            Err(_) => {
                let mut inner = self.inner.lock().expect("research supervisor lock");
                if inner.generation != generation {
                    return;
                }
                if matches!(
                    inner.phase,
                    ResearchPhase::Stopped | ResearchPhase::Stopping
                ) {
                    return;
                }
                inner.phase = ResearchPhase::Failed;
                inner.diagnostic = Some("RUNTIME_MONITOR_UNAVAILABLE");
                inner.client = None;
                return;
            }
        };
        let mut liveness_failures = 0_u8;
        loop {
            thread::sleep(Duration::from_secs(2));
            let (client, project, pid) = {
                let mut inner = self.inner.lock().expect("research supervisor lock");
                if inner.generation != generation {
                    return;
                }
                if matches!(
                    inner.phase,
                    ResearchPhase::Stopped | ResearchPhase::Stopping
                ) {
                    return;
                }
                if inner
                    .child
                    .as_mut()
                    .and_then(|c| c.try_wait().ok())
                    .flatten()
                    .is_some()
                {
                    inner.phase = ResearchPhase::Failed;
                    inner.diagnostic = Some("CHILD_EXITED");
                    inner.client = None;
                    return;
                }
                (
                    inner.client.clone(),
                    inner.project.clone(),
                    inner.child.as_ref().map(Child::id),
                )
            };
            let (Some(client), Some(project), Some(pid)) = (client, project, pid) else {
                let mut inner = self.inner.lock().expect("research supervisor lock");
                if inner.generation != generation {
                    return;
                }
                inner.phase = ResearchPhase::Failed;
                inner.diagnostic = Some("RUNTIME_MONITOR_UNAVAILABLE");
                return;
            };
            if child_owns_listener(client.port, pid) != Ok(true) {
                let mut inner = self.inner.lock().expect("research supervisor lock");
                if inner.generation != generation {
                    return;
                }
                inner.phase = ResearchPhase::Failed;
                inner.diagnostic = Some("PORT_NOT_OWNED");
                inner.client = None;
                return;
            }
            if let Ok(liveness) = runtime.block_on(client.liveness()) {
                liveness_failures = 0;
                if !liveness_identity_matches(&liveness, &project) {
                    let mut inner = self.inner.lock().expect("research supervisor lock");
                    if inner.generation != generation {
                        return;
                    }
                    inner.phase = ResearchPhase::Failed;
                    inner.diagnostic = Some("RUNTIME_IDENTITY_MISMATCH");
                    inner.client = None;
                    return;
                }
                let mut inner = self.inner.lock().expect("research supervisor lock");
                if inner.generation != generation {
                    return;
                }
                if matches!(
                    inner.phase,
                    ResearchPhase::Stopped | ResearchPhase::Stopping
                ) {
                    return;
                }
                inner.phase = phase_from_liveness(&liveness);
                inner.diagnostic = if inner.phase == ResearchPhase::Failed {
                    Some(failure_diagnostic(liveness.autonomous_failure.as_ref()))
                } else {
                    None
                };
                if let Some(status) = inner.runtime.as_mut() {
                    status.initialized = liveness.initialized;
                    status.research_state.clone_from(&liveness.research_state);
                    status.autonomous_task_alive = liveness.autonomous_task_alive;
                }
                inner.last_liveness = Some(liveness);
            } else {
                liveness_failures += 1;
                if liveness_failures >= 3 {
                    let mut inner = self.inner.lock().expect("research supervisor lock");
                    if inner.generation != generation {
                        return;
                    }
                    if matches!(
                        inner.phase,
                        ResearchPhase::Stopped | ResearchPhase::Stopping
                    ) {
                        return;
                    }
                    inner.phase = ResearchPhase::Failed;
                    inner.diagnostic = Some("LIVENESS_UNAVAILABLE");
                    inner.client = None;
                    return;
                }
            }
        }
    }

    pub async fn profiles(&self) -> Result<ProfilesResponse, NativeError> {
        self.client()?.profiles().await
    }
    pub async fn select_profile(&self, profile: &str) -> Result<ProfilesResponse, NativeError> {
        let client = self.client()?;
        let result = client.select_profile(profile).await?;
        if let Ok(status) = self.client()?.status().await {
            self.update(status);
        }
        Ok(result)
    }
    pub async fn start(&self) -> Result<ResearchEngineStatus, NativeError> {
        let snapshot = self.status();
        if snapshot.state != ResearchPhase::Paused
            || snapshot.runtime.as_ref().is_none_or(|runtime| {
                runtime.profile != "codex"
                    || runtime.profile_status != "READY"
                    || !runtime.awakening_ready
            })
        {
            return Err(NativeError::new(
                "PROFILE_NOT_READY",
                "Profil Codex non qualifié ou moteur non prêt.",
            ));
        }
        let client = self.client()?;
        let status = client.start().await?;
        self.update(status);
        Ok(self.status())
    }
    fn update(&self, status: RuntimeStatus) {
        let mut inner = self.inner.lock().expect("research supervisor lock");
        if matches!(
            inner.phase,
            ResearchPhase::Stopped | ResearchPhase::Stopping
        ) {
            return;
        }
        inner.phase = phase_from_runtime(&status);
        inner.diagnostic = if inner.phase == ResearchPhase::Failed {
            Some("BACKEND_TASK_EXITED")
        } else {
            None
        };
        inner.runtime = Some(status);
    }

    fn stop_child(&self, final_phase: ResearchPhase) {
        let mut child = {
            let mut inner = self.inner.lock().expect("research supervisor lock");
            if matches!(
                inner.phase,
                ResearchPhase::Stopped | ResearchPhase::Stopping
            ) {
                return;
            }
            inner.phase = ResearchPhase::Stopping;
            inner.client = None;
            inner.runtime = None;
            inner.last_liveness = None;
            inner.child.take()
        };
        if let Some(ref mut child) = child {
            // A prior status poll may already have reaped this Child. Do not
            // signal its cached PID after it has become reusable.
            if matches!(child.try_wait(), Ok(None)) {
                unsafe {
                    libc::kill(child.id() as i32, libc::SIGTERM);
                }
            }
            let deadline = Instant::now() + STOP_GRACE;
            while Instant::now() < deadline {
                if child.try_wait().ok().flatten().is_some() {
                    break;
                }
                thread::sleep(Duration::from_millis(50));
            }
            if matches!(child.try_wait(), Ok(None)) {
                let _ = child.kill();
            }
            let _ = child.wait();
        }
        let mut inner = self.inner.lock().expect("research supervisor lock");
        inner.phase = if inner.stop_requested {
            ResearchPhase::Stopped
        } else {
            final_phase
        };
        if inner.phase == ResearchPhase::Stopped {
            inner.project = None;
            inner.diagnostic = None;
        } else if inner.phase == ResearchPhase::Failed && inner.diagnostic.is_none() {
            inner.diagnostic = Some("RUNTIME_MONITOR_UNAVAILABLE");
        }
    }
    pub fn stop(&self) {
        let mut inner = self.inner.lock().expect("research supervisor lock");
        inner.stop_requested = true;
        inner.generation = inner.generation.wrapping_add(1);
        drop(inner);
        self.stop_child(ResearchPhase::Stopped);
    }
    pub fn child_pid(&self) -> Option<u32> {
        self.inner
            .lock()
            .expect("research supervisor lock")
            .child
            .as_ref()
            .map(Child::id)
    }

    pub fn last_liveness(&self) -> Option<RuntimeLiveness> {
        self.inner
            .lock()
            .expect("research supervisor lock")
            .last_liveness
            .clone()
    }
}

fn phase_from_liveness(value: &RuntimeLiveness) -> ResearchPhase {
    match value.research_state.as_str() {
        "PAUSED" => ResearchPhase::Paused,
        "NOT_READY" => ResearchPhase::NotReady,
        "RUNNING" => ResearchPhase::Running,
        _ => ResearchPhase::Failed,
    }
}

fn failure_diagnostic(failure: Option<&AutonomousFailure>) -> &'static str {
    match failure {
        Some(AutonomousFailure::TaskCancelled) => "BACKEND_TASK_CANCELLED",
        Some(AutonomousFailure::TaskFailed) => "BACKEND_TASK_FAILED",
        Some(AutonomousFailure::TaskExited) | None => "BACKEND_TASK_EXITED",
    }
}

fn liveness_identity_matches(value: &RuntimeLiveness, project: &ProjectView) -> bool {
    value.code_sha.as_deref() == Some(BACKEND_SHA)
        && value.project == project.id
        && value.domain == project.domain
        && value.initialized
}

fn phase_from_runtime(status: &RuntimeStatus) -> ResearchPhase {
    match status.research_state.as_str() {
        "PAUSED" => ResearchPhase::Paused,
        "NOT_READY" => ResearchPhase::NotReady,
        "RUNNING" => ResearchPhase::Running,
        _ => ResearchPhase::Failed,
    }
}

fn runtime_identity_matches(status: &RuntimeStatus, project: &ProjectView) -> bool {
    status.code_sha.as_deref() == Some(BACKEND_SHA)
        && status.project == project.id
        && status.domain == project.domain
        && status.initialized
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io::Write as _, process::Stdio};

    #[test]
    fn codex_readiness_contract_requires_all_five_facts() {
        let full = serde_json::json!({
            "schema_version": 1, "current": "legacy", "recommended": null,
            "profiles": [], "codex": {
                "installed": true, "authenticated": true, "sandbox_available": true,
                "sandbox_qualified": false, "workloads_ready": false
            }
        });
        assert!(serde_json::from_value::<ProfilesResponse>(full.clone()).is_ok());
        let mut incomplete = full;
        incomplete["codex"]
            .as_object_mut()
            .unwrap()
            .remove("sandbox_qualified");
        assert!(serde_json::from_value::<ProfilesResponse>(incomplete).is_err());
    }

    #[test]
    fn native_codex_path_is_minimal_and_wrapper_runtime_is_explicit() {
        let root = tempfile::tempdir().unwrap();
        let codex_dir = root.path().join("codex-bin");
        let node_dir = root.path().join("node-bin");
        let unrelated = root.path().join("unrelated");
        for dir in [&codex_dir, &node_dir, &unrelated] {
            fs::create_dir(dir).unwrap();
        }
        let codex = codex_dir.join("codex");
        fs::write(&codex, b"#!/usr/bin/env node\n").unwrap();
        fs::set_permissions(&codex, fs::Permissions::from_mode(0o700)).unwrap();
        let node = node_dir.join("node");
        fs::write(&node, b"#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(&node, fs::Permissions::from_mode(0o700)).unwrap();
        let native_path = std::env::join_paths([&codex_dir, &unrelated, &node_dir]).unwrap();
        let runtime = ProviderRuntime::from_native_path(&native_path).unwrap();
        assert_eq!(runtime.required_runtime_dirs, vec![node_dir]);
        assert!(runtime
            .path_value()
            .to_string_lossy()
            .starts_with(&codex_dir.to_string_lossy().to_string()));
        assert!(!runtime.path_value().to_string_lossy().contains("unrelated"));
        assert!(ProviderRuntime::from_native_path(unrelated.as_os_str()).is_none());
    }

    #[test]
    fn stale_monitor_cannot_poison_a_new_engine_generation() {
        let management = ManagementSupervisor::start(Err("TEST_MANAGEMENT_UNAVAILABLE"));
        let supervisor = ResearchEngineSupervisor::new(Err("TEST_CONFIG_UNAVAILABLE"), management);
        {
            let mut inner = supervisor.inner.lock().unwrap();
            inner.generation = 2;
            inner.phase = ResearchPhase::Starting;
        }
        supervisor.monitor(1);
        let inner = supervisor.inner.lock().unwrap();
        assert_eq!(inner.phase, ResearchPhase::Starting);
        assert!(inner.diagnostic.is_none());
    }

    fn private_token() -> (tempfile::TempDir, PathBuf, String) {
        let home = tempfile::tempdir().unwrap();
        fs::set_permissions(home.path(), fs::Permissions::from_mode(0o700)).unwrap();
        let path = home.path().join("token");
        let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode([7_u8; 32]);
        fs::write(&path, &token).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        (home, path, token)
    }

    fn status(state: &str) -> RuntimeStatus {
        RuntimeStatus {
            schema_version: 1,
            project: "research_a".into(),
            domain: "crypto".into(),
            code_sha: Some(BACKEND_SHA.into()),
            initialized: true,
            awakening_ready: true,
            research_state: state.into(),
            autonomous_task_alive: state == "RUNNING",
            profile: "legacy".into(),
            profile_status: "BLOCKED".into(),
        }
    }

    fn project_at(runtime_dir: &Path) -> ProjectView {
        ProjectView {
            id: "research_a".into(),
            name: "Synthetic".into(),
            domain: "crypto".into(),
            legacy: false,
            manifest_path: None,
            workspace_root: None,
            postgres_schema: "research_a".into(),
            chroma_prefix: "research_a".into(),
            vault_dir: "/tmp/synthetic/vault".into(),
            runtime_dir: runtime_dir.to_string_lossy().into_owned(),
            configuration_valid: true,
            runtime_checked: false,
        }
    }

    #[test]
    fn runtime_identity_rejects_wrong_sha_project_domain_and_uninitialized() {
        let project = project_at(Path::new("/tmp/synthetic/runtime"));
        let good = status("PAUSED");
        assert!(runtime_identity_matches(&good, &project));
        let mut wrong = good.clone();
        wrong.code_sha = Some("0".repeat(40));
        assert!(!runtime_identity_matches(&wrong, &project));
        wrong = good.clone();
        wrong.project = "research_b".into();
        assert!(!runtime_identity_matches(&wrong, &project));
        wrong = good.clone();
        wrong.domain = "weather".into();
        assert!(!runtime_identity_matches(&wrong, &project));
        wrong = good;
        wrong.initialized = false;
        assert!(!runtime_identity_matches(&wrong, &project));
    }

    #[test]
    fn child_command_is_fixed_and_does_not_inherit_provider_secrets() {
        let home = tempfile::tempdir().unwrap();
        let config = ResearchConfig {
            shared: SupervisorConfig {
                backend_root: home.path().into(),
                python: "/usr/bin/python3".into(),
                home: home.path().into(),
            },
            postgres_url: "synthetic-db".into(),
            ollama_base_url: "synthetic-local".into(),
            ollama_primary_model: "local-a".into(),
            ollama_agent_model: "local-b".into(),
            max_concurrent_agents: "1".into(),
            log_retention_days: "1".into(),
            log_level_thought: "0".into(),
            provider_home: home.path().into(),
            provider_runtime: Some(ProviderRuntime {
                codex_executable_dir: "/opt/synthetic-codex/bin".into(),
                required_runtime_dirs: Vec::new(),
            }),
            runtime_overrides: Vec::new(),
        };
        let command = research_command(&config, "research_a", 38001, "synthetic-secret");
        let args: Vec<_> = command
            .get_args()
            .map(|v| v.to_string_lossy().into_owned())
            .collect();
        assert_eq!(args[0..2], ["-m", "scripts.research_engine"]);
        assert_eq!(args[3], home.path().to_string_lossy());
        assert_eq!(args[5], "research_a");
        assert_eq!(args[7], "38001");
        assert!(!args.iter().any(|a| a.contains("synthetic-secret")));
        let names: Vec<_> = command
            .get_envs()
            .map(|(key, _)| key.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            names,
            [
                "HOME",
                "LANG",
                "LOG_LEVEL_THOUGHT",
                "LOG_RETENTION_DAYS",
                "MAX_CONCURRENT_AGENTS",
                "OLLAMA_AGENT_MODEL",
                "OLLAMA_BASE_URL",
                "OLLAMA_PRIMARY_MODEL",
                "PATH",
                "POSTGRES_URL",
                "PYTHONDONTWRITEBYTECODE",
                "SECRET_KEY"
            ]
        );
        assert!(!names.iter().any(|n| n.starts_with("MORGOTH_LLM_")
            || n.contains("API_KEY")
            || n == "MORGOTH_DOMAIN"));
        let path = command
            .get_envs()
            .find(|(k, _)| *k == "PATH")
            .unwrap()
            .1
            .unwrap();
        assert!(path
            .to_string_lossy()
            .starts_with("/opt/synthetic-codex/bin:"));
    }

    #[test]
    fn native_runtime_overrides_are_exact_and_optional() {
        assert!(valid_runtime_override("SOURCE_CACHE_ENABLED", "false"));
        assert!(!valid_runtime_override("SOURCE_CACHE_ENABLED", "yes"));
        assert!(valid_runtime_override("AUTONOMOUS_CYCLE_MINUTES", "60"));
        assert!(!valid_runtime_override("AUTONOMOUS_CYCLE_MINUTES", "0"));
        assert!(!valid_runtime_override("AUTONOMOUS_CYCLE_MINUTES", "-1"));
        assert!(valid_runtime_override("MAX_CYCLES_PER_OBJECTIVE", "3"));
        assert!(!valid_runtime_override("MAX_CYCLES_PER_OBJECTIVE", "0"));
        assert!(!valid_runtime_override("MAX_CYCLES_PER_OBJECTIVE", "21"));
        assert!(!valid_runtime_override("MAX_CYCLES_PER_OBJECTIVE", "3.0"));
        assert!(valid_runtime_override("LLM_FALLBACK_ENABLED", "false"));
        assert!(!valid_runtime_override("LLM_FALLBACK_ENABLED", "yes"));
        let home = tempfile::tempdir().unwrap();
        let mut config = ResearchConfig {
            shared: SupervisorConfig {
                backend_root: home.path().into(),
                python: "/usr/bin/python3".into(),
                home: home.path().into(),
            },
            postgres_url: "synthetic-db".into(),
            ollama_base_url: "synthetic-local".into(),
            ollama_primary_model: "local-a".into(),
            ollama_agent_model: "local-b".into(),
            max_concurrent_agents: "1".into(),
            log_retention_days: "1".into(),
            log_level_thought: "false".into(),
            provider_home: home.path().into(),
            provider_runtime: None,
            runtime_overrides: Vec::new(),
        };
        let original = research_command(&config, "research_a", 38001, "synthetic-secret");
        assert!(!original
            .get_envs()
            .any(|(key, _)| key == "AUTONOMOUS_CYCLE_MINUTES"));
        config.runtime_overrides = vec![
            ("CONNECTIVITY_CHECK_ENABLED", "false".into()),
            ("METRIC_RECORDER_ENABLED", "false".into()),
            ("SOURCE_CACHE_ENABLED", "false".into()),
            ("PROVIDER_HEARTBEAT_MINUTES", "999999".into()),
            ("AUTONOMOUS_CYCLE_MINUTES", "60".into()),
            ("MAX_CYCLES_PER_OBJECTIVE", "3".into()),
            ("LLM_FALLBACK_ENABLED", "false".into()),
        ];
        let command = research_command(&config, "research_a", 38001, "synthetic-secret");
        for (key, value) in &config.runtime_overrides {
            assert_eq!(
                command
                    .get_envs()
                    .find(|(name, _)| name == key)
                    .unwrap()
                    .1
                    .unwrap(),
                std::ffi::OsStr::new(value),
            );
        }
        assert!(!command
            .get_envs()
            .any(|(key, _)| key == "ANTHROPIC_API_KEY"));
    }

    #[test]
    fn startup_guards_and_status_mapping_are_bounded() {
        let management = ManagementSupervisor::start(Err("TEST_MANAGEMENT_UNAVAILABLE"));
        let supervisor = ResearchEngineSupervisor::new(Err("TEST_CONFIG_UNAVAILABLE"), management);
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        assert_eq!(
            rt.block_on(supervisor.initialize("default".into()))
                .err()
                .unwrap()
                .kind,
            "INVALID_PROJECT_ID"
        );
        assert_eq!(
            rt.block_on(supervisor.initialize("../escape".into()))
                .err()
                .unwrap()
                .kind,
            "INVALID_PROJECT_ID"
        );
        supervisor.inner.lock().unwrap().phase = ResearchPhase::Starting;
        assert_eq!(
            rt.block_on(supervisor.initialize("research_a".into()))
                .err()
                .unwrap()
                .kind,
            "ENGINE_ALREADY_ACTIVE"
        );
        assert_eq!(phase_from_runtime(&status("PAUSED")), ResearchPhase::Paused);
        assert_eq!(
            phase_from_runtime(&status("NOT_READY")),
            ResearchPhase::NotReady
        );
        assert_eq!(
            phase_from_runtime(&status("RUNNING")),
            ResearchPhase::Running
        );
        assert_eq!(phase_from_runtime(&status("FAILED")), ResearchPhase::Failed);
        let live = RuntimeLiveness {
            schema_version: 1,
            project: "research_a".into(),
            domain: "crypto".into(),
            code_sha: Some(BACKEND_SHA.into()),
            initialized: true,
            research_state: "FAILED".into(),
            autonomous_task_alive: false,
            autonomous_failure: Some(AutonomousFailure::TaskFailed),
        };
        assert_eq!(phase_from_liveness(&live), ResearchPhase::Failed);
        assert_eq!(
            failure_diagnostic(live.autonomous_failure.as_ref()),
            "BACKEND_TASK_FAILED"
        );
        assert_eq!(
            failure_diagnostic(Some(&AutonomousFailure::TaskCancelled)),
            "BACKEND_TASK_CANCELLED"
        );
        assert_eq!(
            failure_diagnostic(Some(&AutonomousFailure::TaskExited)),
            "BACKEND_TASK_EXITED"
        );
        assert!(serde_json::from_str::<RuntimeLiveness>(
            r#"{"schema_version":1,"autonomous_failure":"RAW_EXCEPTION"}"#
        )
        .is_err());
    }

    #[test]
    fn exact_owned_child_stops_without_touching_another_process() {
        let management = ManagementSupervisor::start(Err("TEST_MANAGEMENT_UNAVAILABLE"));
        let supervisor = ResearchEngineSupervisor::new(Err("TEST_CONFIG_UNAVAILABLE"), management);
        let child = Command::new("/usr/bin/sleep")
            .arg("30")
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let pid = child.id();
        let mut other = Command::new("/usr/bin/sleep").arg("30").spawn().unwrap();
        {
            let mut inner = supervisor.inner.lock().unwrap();
            inner.child = Some(child);
            inner.phase = ResearchPhase::Paused;
            inner.runtime = Some(status("PAUSED"));
        }
        supervisor.stop();
        assert_eq!(supervisor.status().state, ResearchPhase::Stopped);
        assert!(supervisor.child_pid().is_none());
        assert!(!PathBuf::from(format!("/proc/{pid}")).exists());
        assert!(other.try_wait().unwrap().is_none());
        other.kill().unwrap();
        other.wait().unwrap();
    }

    #[test]
    fn already_reaped_child_is_not_signalled_again() {
        let management = ManagementSupervisor::start(Err("TEST_MANAGEMENT_UNAVAILABLE"));
        let supervisor = ResearchEngineSupervisor::new(Err("TEST_CONFIG_UNAVAILABLE"), management);
        let child = Command::new("/usr/bin/true").spawn().unwrap();
        let mut unrelated = Command::new("/usr/bin/sleep").arg("30").spawn().unwrap();
        {
            let mut inner = supervisor.inner.lock().unwrap();
            inner.child = Some(child);
            inner.phase = ResearchPhase::Paused;
        }
        thread::sleep(Duration::from_millis(30));
        assert_eq!(supervisor.status().state, ResearchPhase::Failed);
        supervisor.stop();
        assert_eq!(supervisor.status().state, ResearchPhase::Stopped);
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.kill().unwrap();
        unrelated.wait().unwrap();
    }

    fn one_response(response: Vec<u8>) -> (u16, thread::JoinHandle<String>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let thread = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut received = [0_u8; 4096];
            let size = stream.read(&mut received).unwrap();
            stream.write_all(&response).unwrap();
            String::from_utf8_lossy(&received[..size]).into_owned()
        });
        (port, thread)
    }

    #[test]
    fn fixed_authenticated_status_route_and_safe_http_failures() {
        let (_home, path, token) = private_token();
        let body = serde_json::to_string(&status("PAUSED")).unwrap();
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes();
        let (port, server) = one_response(response);
        let client = ResearchClient::new(port, &path).unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        assert_eq!(
            rt.block_on(client.status()).unwrap().research_state,
            "PAUSED"
        );
        let request = server.join().unwrap();
        assert!(request.starts_with("GET /api/runtime/v1/status HTTP/1.1"));
        assert!(request.contains(&format!("x-morgoth-token: {token}")));
        assert!(!request.contains("Origin:"));

        let liveness = RuntimeLiveness {
            schema_version: 1,
            project: "research_a".into(),
            domain: "crypto".into(),
            code_sha: Some(BACKEND_SHA.into()),
            initialized: true,
            research_state: "RUNNING".into(),
            autonomous_task_alive: true,
            autonomous_failure: None,
        };
        let body = serde_json::to_string(&liveness).unwrap();
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes();
        let (port, server) = one_response(response);
        let client = ResearchClient::new(port, &path).unwrap();
        assert_eq!(
            rt.block_on(client.liveness()).unwrap().research_state,
            "RUNNING"
        );
        let request = server.join().unwrap();
        assert!(request.starts_with("GET /api/runtime/v1/liveness HTTP/1.1"));
        assert!(request.contains(&format!("x-morgoth-token: {token}")));

        let redirect = b"HTTP/1.1 302 Found\r\nLocation: http://invalid.example/\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}".to_vec();
        let (port, server) = one_response(redirect);
        assert_eq!(
            rt.block_on(ResearchClient::new(port, &path).unwrap().status())
                .err()
                .unwrap()
                .kind,
            "REDIRECT_REJECTED"
        );
        server.join().unwrap();
        let too_large =
            b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 65537\r\n\r\n"
                .to_vec();
        let (port, server) = one_response(too_large);
        assert_eq!(
            rt.block_on(ResearchClient::new(port, &path).unwrap().status())
                .err()
                .unwrap()
                .kind,
            "OVERSIZED_RESPONSE"
        );
        server.join().unwrap();
        assert!(!serde_json::to_string(&NativeError::new("TEST", "safe"))
            .unwrap()
            .contains(&token));
    }

    #[test]
    fn synthetic_paused_profile_selection_start_uses_only_fixed_routes() {
        let (_home, path, token) = private_token();
        let mut selected = status("PAUSED");
        selected.profile = "codex".into();
        selected.profile_status = "READY".into();
        let mut running = selected.clone();
        running.research_state = "RUNNING".into();
        running.autonomous_task_alive = true;
        let before = ProfilesResponse {
            schema_version: 1,
            current: "legacy".into(),
            recommended: Some("codex".into()),
            codex: CodexReadiness {
                installed: true,
                authenticated: true,
                sandbox_available: true,
                sandbox_qualified: true,
                workloads_ready: true,
            },
            profiles: vec![
                ProfileView {
                    id: "legacy".into(),
                    status: "BLOCKED".into(),
                    reason: "synthetic".into(),
                    providers: Default::default(),
                },
                ProfileView {
                    id: "codex".into(),
                    status: "READY".into(),
                    reason: "synthetic".into(),
                    providers: Default::default(),
                },
            ],
        };
        let after = ProfilesResponse {
            current: "codex".into(),
            ..before.clone()
        };
        let replies = [
            serde_json::to_vec(&status("PAUSED")).unwrap(),
            serde_json::to_vec(&before).unwrap(),
            serde_json::to_vec(&after).unwrap(),
            serde_json::to_vec(&running).unwrap(),
        ];
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let mut requests = Vec::new();
            for reply in replies {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .unwrap();
                let mut received = [0_u8; 4096];
                let size = stream.read(&mut received).unwrap();
                requests.push(String::from_utf8_lossy(&received[..size]).into_owned());
                let header = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n", reply.len());
                stream.write_all(header.as_bytes()).unwrap();
                stream.write_all(&reply).unwrap();
            }
            requests
        });
        let client = ResearchClient::new(port, &path).unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            assert_eq!(client.status().await.unwrap().profile_status, "BLOCKED");
            let profiles = client.profiles().await.unwrap();
            assert_eq!(profiles.current, "legacy");
            assert_eq!(
                profiles
                    .profiles
                    .iter()
                    .find(|p| p.id == "codex")
                    .unwrap()
                    .status,
                "READY"
            );
            assert_eq!(
                client.select_profile("codex").await.unwrap().current,
                "codex"
            );
            assert_eq!(client.start().await.unwrap().research_state, "RUNNING");
        });
        let requests = server.join().unwrap();
        for (request, expected) in requests.iter().zip([
            "GET /api/runtime/v1/status ",
            "GET /api/runtime/v1/profiles ",
            "POST /api/runtime/v1/profile ",
            "POST /api/runtime/v1/start ",
        ]) {
            assert!(request.starts_with(expected));
            assert!(request.contains(&format!("x-morgoth-token: {token}")));
        }
        assert!(requests[2].contains("\"profile\":\"codex\""));
        assert!(!requests
            .iter()
            .any(|r| r.contains("codex-cli") || r.contains("/api/chat")));
    }

    #[test]
    fn owned_synthetic_child_runs_paused_to_explicit_start_then_reaps() {
        struct StopOnDrop(ResearchEngineSupervisor);
        impl Drop for StopOnDrop {
            fn drop(&mut self) {
                self.0.stop();
            }
        }

        let home = tempfile::tempdir().unwrap();
        fs::set_permissions(home.path(), fs::Permissions::from_mode(0o700)).unwrap();
        let runtime_dir = home.path().join("projects/research_a/runtime");
        let project = project_at(&runtime_dir);
        let script = home.path().join("fixture-python");
        let source = r###"#!/usr/bin/python3
import base64, json, os, pathlib, sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer
args = sys.argv
home = pathlib.Path(args[args.index('--home') + 1])
project = args[args.index('--project') + 1]
port = int(args[args.index('--port') + 1])
auth = home / 'projects' / project / 'runtime' / 'auth'
auth.mkdir(parents=True, exist_ok=True)
token = base64.urlsafe_b64encode(bytes([7]) * 32).decode().rstrip('=')
with open(auth / 'ui_token', 'x') as file:
    file.write(token)
os.chmod(auth / 'ui_token', 0o600)
profile = 'legacy'
state = 'PAUSED'
liveness_calls = 0
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self, value):
        body = json.dumps(value).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def authorized(self):
        if self.headers.get('X-Morgoth-Token') == token: return True
        self.send_error(401)
        return False
    def status(self):
        return dict(schema_version=1, project=project, domain='crypto', code_sha='__SHA__',
                    initialized=True, awakening_ready=True, research_state=state,
                    autonomous_task_alive=(state == 'RUNNING'), profile=profile,
                    profile_status=('READY' if profile == 'codex' else 'BLOCKED'))
    def liveness(self):
        return dict(schema_version=1, project=project, domain='crypto', code_sha='__SHA__',
                    initialized=True, research_state=state,
                    autonomous_task_alive=(state == 'RUNNING'), autonomous_failure=None)
    def profiles(self):
        return dict(schema_version=1, current=profile, recommended='codex', codex=dict(
            installed=True, authenticated=True, sandbox_available=True,
            sandbox_qualified=True, workloads_ready=True), profiles=[
            dict(id=name, status=readiness, reason='fixture', providers={})
            for name, readiness in [('legacy', 'BLOCKED'), ('codex', 'READY')]])
    def do_GET(self):
        global liveness_calls
        if not self.authorized(): return
        if self.path == '/api/runtime/v1/status':
            if state == 'RUNNING': time.sleep(10)
            self.reply(self.status())
        elif self.path == '/api/runtime/v1/liveness':
            liveness_calls += 1
            if liveness_calls > 3: self.send_error(503); return
            self.reply(self.liveness())
        elif self.path == '/api/runtime/v1/profiles': self.reply(self.profiles())
        else: self.send_error(404)
    def do_POST(self):
        global profile, state
        if not self.authorized(): return
        if self.path == '/api/runtime/v1/profile':
            value = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if value != {'profile': 'codex'}: self.send_error(409); return
            profile = 'codex'; self.reply(self.profiles())
        elif self.path == '/api/runtime/v1/start':
            if profile != 'codex': self.send_error(409); return
            state = 'RUNNING'; self.reply(self.status())
        else: self.send_error(404)
HTTPServer(('127.0.0.1', port), Handler).serve_forever()
"###
        .replace("__SHA__", BACKEND_SHA);
        fs::write(&script, source).unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700)).unwrap();
        let config = ResearchConfig {
            shared: SupervisorConfig {
                backend_root: home.path().into(),
                python: script,
                home: home.path().into(),
            },
            postgres_url: "synthetic-db".into(),
            ollama_base_url: "synthetic-local".into(),
            ollama_primary_model: "local-a".into(),
            ollama_agent_model: "local-b".into(),
            max_concurrent_agents: "1".into(),
            log_retention_days: "1".into(),
            log_level_thought: "0".into(),
            provider_home: home.path().into(),
            provider_runtime: None,
            runtime_overrides: Vec::new(),
        };
        let management = ManagementSupervisor::start(Err("TEST_MANAGEMENT_UNAVAILABLE"));
        let supervisor = ResearchEngineSupervisor::new(Err("TEST_CONFIG_UNAVAILABLE"), management);
        let _guard = StopOnDrop(supervisor.clone());
        {
            let mut inner = supervisor.inner.lock().unwrap();
            inner.phase = ResearchPhase::Starting;
            inner.project = Some(project.clone());
        }
        supervisor.start_with_config(config, project).unwrap();
        assert_eq!(supervisor.status().state, ResearchPhase::Paused);
        let monitor_owner = supervisor.clone();
        let generation = supervisor.inner.lock().unwrap().generation;
        let monitor = thread::spawn(move || monitor_owner.monitor(generation));
        let pid = supervisor.child_pid().unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            assert_eq!(
                supervisor.start().await.err().unwrap().kind,
                "PROFILE_NOT_READY"
            );
            let profiles = supervisor.profiles().await.unwrap();
            assert_eq!(profiles.current, "legacy");
            assert_eq!(
                profiles
                    .profiles
                    .iter()
                    .find(|p| p.id == "codex")
                    .unwrap()
                    .status,
                "READY"
            );
            assert_eq!(
                supervisor.select_profile("codex").await.unwrap().current,
                "codex"
            );
            assert_eq!(
                supervisor.start().await.unwrap().state,
                ResearchPhase::Running
            );
        });
        // A slow full readiness endpoint would have exceeded the old 8-second
        // monitor timeout. Three fast liveness polls must retain RUNNING.
        thread::sleep(Duration::from_secs(7));
        assert_eq!(supervisor.status().state, ResearchPhase::Running);
        assert_eq!(
            supervisor.last_liveness().unwrap().research_state,
            "RUNNING"
        );
        let deadline = Instant::now() + Duration::from_secs(12);
        while supervisor.status().state == ResearchPhase::Running && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(100));
        }
        assert_eq!(supervisor.status().state, ResearchPhase::Failed);
        assert_eq!(supervisor.status().diagnostic, Some("LIVENESS_UNAVAILABLE"));
        supervisor.stop();
        monitor.join().unwrap();
        assert_eq!(supervisor.status().state, ResearchPhase::Stopped);
        assert!(!PathBuf::from(format!("/proc/{pid}")).exists());
    }
}

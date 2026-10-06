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
const RUNTIME_OVERRIDES: [(&str, &str); 5] = [
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
    claude_dir: Option<PathBuf>,
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
            claude_dir: find_claude_dir(),
            runtime_overrides: native_runtime_overrides()?,
        })
    }
}

fn find_claude_dir() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&path) {
        if !directory.is_absolute() || directory.components().any(|c| c == Component::ParentDir) {
            continue;
        }
        let candidate = directory.join("claude");
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
    let path = config.claude_dir.as_ref().map_or_else(
        || "/usr/bin:/bin".to_owned(),
        |dir| format!("{}:/usr/bin:/bin", dir.display()),
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
    phase: ResearchPhase,
    stop_requested: bool,
    diagnostic: Option<&'static str>,
    child: Option<Child>,
    project: Option<ProjectView>,
    runtime: Option<RuntimeStatus>,
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
                phase: ResearchPhase::Stopped,
                stop_requested: false,
                diagnostic: None,
                child: None,
                project: None,
                runtime: None,
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
        inner.stop_requested = false;
        inner.diagnostic = None;
        inner.project = Some(project.clone());
        inner.runtime = None;
        drop(inner);
        let worker = self.clone();
        thread::spawn(move || match worker.start_once(config, project) {
            Ok(()) => worker.monitor(),
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
                inner.phase = phase;
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn monitor(&self) {
        let runtime = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime,
            Err(_) => {
                let mut inner = self.inner.lock().expect("research supervisor lock");
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
        let mut status_failures = 0_u8;
        loop {
            thread::sleep(Duration::from_secs(2));
            let (client, project, pid) = {
                let mut inner = self.inner.lock().expect("research supervisor lock");
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
                return;
            };
            if child_owns_listener(client.port, pid) != Ok(true) {
                let mut inner = self.inner.lock().expect("research supervisor lock");
                inner.phase = ResearchPhase::Failed;
                inner.diagnostic = Some("PORT_NOT_OWNED");
                inner.client = None;
                return;
            }
            if let Ok(status) = runtime.block_on(client.status()) {
                status_failures = 0;
                if !runtime_identity_matches(&status, &project) {
                    let mut inner = self.inner.lock().expect("research supervisor lock");
                    inner.phase = ResearchPhase::Failed;
                    inner.diagnostic = Some("RUNTIME_IDENTITY_MISMATCH");
                    inner.client = None;
                    return;
                }
                let mut inner = self.inner.lock().expect("research supervisor lock");
                if matches!(
                    inner.phase,
                    ResearchPhase::Stopped | ResearchPhase::Stopping
                ) {
                    return;
                }
                inner.phase = phase_from_runtime(&status);
                inner.runtime = Some(status);
            } else {
                status_failures += 1;
                if status_failures >= 3 {
                    let mut inner = self.inner.lock().expect("research supervisor lock");
                    if matches!(
                        inner.phase,
                        ResearchPhase::Stopped | ResearchPhase::Stopping
                    ) {
                        return;
                    }
                    inner.phase = ResearchPhase::Failed;
                    inner.diagnostic = Some("RUNTIME_STATUS_UNAVAILABLE");
                    inner.client = None;
                    inner.runtime = None;
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
        }
    }
    pub fn stop(&self) {
        self.inner
            .lock()
            .expect("research supervisor lock")
            .stop_requested = true;
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
            claude_dir: Some("/opt/synthetic-claude/bin".into()),
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
            .starts_with("/opt/synthetic-claude/bin:"));
    }

    #[test]
    fn native_runtime_overrides_are_exact_and_optional() {
        assert!(valid_runtime_override("SOURCE_CACHE_ENABLED", "false"));
        assert!(!valid_runtime_override("SOURCE_CACHE_ENABLED", "yes"));
        assert!(valid_runtime_override("AUTONOMOUS_CYCLE_MINUTES", "60"));
        assert!(!valid_runtime_override("AUTONOMOUS_CYCLE_MINUTES", "0"));
        assert!(!valid_runtime_override("AUTONOMOUS_CYCLE_MINUTES", "-1"));
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
            claude_dir: None,
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
        selected.profile = "claude".into();
        selected.profile_status = "READY".into();
        let mut running = selected.clone();
        running.research_state = "RUNNING".into();
        running.autonomous_task_alive = true;
        let before = ProfilesResponse {
            schema_version: 1,
            current: "legacy".into(),
            recommended: Some("claude".into()),
            profiles: vec![
                ProfileView {
                    id: "legacy".into(),
                    status: "BLOCKED".into(),
                    reason: "synthetic".into(),
                    providers: Default::default(),
                },
                ProfileView {
                    id: "claude".into(),
                    status: "READY".into(),
                    reason: "synthetic".into(),
                    providers: Default::default(),
                },
                ProfileView {
                    id: "codex".into(),
                    status: "BLOCKED".into(),
                    reason: "synthetic".into(),
                    providers: Default::default(),
                },
            ],
        };
        let after = ProfilesResponse {
            current: "claude".into(),
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
                "BLOCKED"
            );
            assert_eq!(
                client.select_profile("claude").await.unwrap().current,
                "claude"
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
        assert!(requests[2].contains("\"profile\":\"claude\""));
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
import base64, json, os, pathlib, sys
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
                    profile_status=('READY' if profile == 'claude' else 'BLOCKED'))
    def profiles(self):
        return dict(schema_version=1, current=profile, recommended='claude', profiles=[
            dict(id=name, status=readiness, reason='fixture', providers={})
            for name, readiness in [('legacy', 'BLOCKED'), ('claude', 'READY'), ('codex', 'BLOCKED')]])
    def do_GET(self):
        if not self.authorized(): return
        if self.path == '/api/runtime/v1/status': self.reply(self.status())
        elif self.path == '/api/runtime/v1/profiles': self.reply(self.profiles())
        else: self.send_error(404)
    def do_POST(self):
        global profile, state
        if not self.authorized(): return
        if self.path == '/api/runtime/v1/profile':
            value = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if value != {'profile': 'claude'}: self.send_error(409); return
            profile = 'claude'; self.reply(self.profiles())
        elif self.path == '/api/runtime/v1/start':
            if profile != 'claude': self.send_error(409); return
            state = 'RUNNING'; self.reply(self.status())
        else: self.send_error(404)
HTTPServer(('127.0.0.1', port), Handler).serve_forever()
"###.replace("__SHA__", BACKEND_SHA);
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
            claude_dir: None,
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
        let pid = supervisor.child_pid().unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let profiles = supervisor.profiles().await.unwrap();
            assert_eq!(profiles.current, "legacy");
            assert_eq!(
                profiles
                    .profiles
                    .iter()
                    .find(|p| p.id == "codex")
                    .unwrap()
                    .status,
                "BLOCKED"
            );
            assert_eq!(
                supervisor.select_profile("claude").await.unwrap().current,
                "claude"
            );
            assert_eq!(
                supervisor.start().await.unwrap().state,
                ResearchPhase::Running
            );
        });
        supervisor.stop();
        assert_eq!(supervisor.status().state, ResearchPhase::Stopped);
        assert!(!PathBuf::from(format!("/proc/{pid}")).exists());
    }
}

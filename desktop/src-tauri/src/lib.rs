//! Fixed, authenticated local transport for the pinned Management API V1.
use base64::Engine;
use futures_util::StreamExt;
use reqwest::{header, Method};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{io::Read, path::Path, time::Duration};

pub mod ollama_read;
#[cfg(target_os = "linux")]
pub mod research;
#[cfg(target_os = "linux")]
pub mod supervisor;

const PREFIX: &str = "/management/v1";
const READ_PREFIX: &str = "/desktop-read/v1";
const MAX_BODY: usize = 65_536;

fn required_nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct NativeError {
    pub kind: String,
    pub code: Option<String>,
    pub status: Option<u16>,
    pub message: String,
}
impl NativeError {
    fn new(kind: &str, message: &str) -> Self {
        Self {
            kind: kind.into(),
            code: None,
            status: None,
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManagementStatus {
    pub api_version: String,
    pub management_available: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DomainView {
    pub id: String,
    #[serde(deserialize_with = "required_nullable")]
    pub tagline: Option<String>,
    pub configuration_valid: bool,
    pub diagnostic: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DomainList {
    pub domains: Vec<DomainView>,
    pub runtime_checked: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectView {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub legacy: bool,
    #[serde(deserialize_with = "required_nullable")]
    pub manifest_path: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub workspace_root: Option<String>,
    pub postgres_schema: String,
    pub chroma_prefix: String,
    pub vault_dir: String,
    pub runtime_dir: String,
    pub configuration_valid: bool,
    pub runtime_checked: bool,
}
/// Only configuration facts required by the WebView; no native paths or schema names.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicProjectView {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub legacy: bool,
    pub configuration_valid: bool,
    pub runtime_checked: bool,
}
impl From<ProjectView> for PublicProjectView {
    fn from(value: ProjectView) -> Self {
        Self {
            id: value.id,
            name: value.name,
            domain: value.domain,
            legacy: value.legacy,
            configuration_valid: value.configuration_valid,
            runtime_checked: value.runtime_checked,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicProjectList {
    pub projects: Vec<PublicProjectView>,
    pub configuration_valid: bool,
    pub runtime_checked: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicProjectValidation {
    pub project: PublicProjectView,
    pub configuration_valid: bool,
    pub runtime_checked: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectList {
    pub projects: Vec<ProjectView>,
    pub configuration_valid: bool,
    pub runtime_checked: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectValidation {
    pub project: ProjectView,
    pub configuration_valid: bool,
    pub runtime_checked: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectCreation {
    pub project: ProjectView,
    pub created: bool,
    pub durability_confirmed: bool,
    pub engine_started: bool,
    pub storage_initialized: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissionRead {
    pub mission_id: String,
    pub project_id: String,
    pub objective: String,
    pub state: String,
    pub revision: i64,
    pub stages: Vec<String>,
    pub capability_gaps: Vec<String>,
    pub failure_codes: Vec<String>,
    pub resume_eligible: bool,
    pub receipt_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub evidence_kind: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MissionReadPage {
    pub project_id: String,
    pub missions: Vec<MissionRead>,
    pub next_offset: Option<u32>,
    pub source: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityRead {
    pub capability_id: String,
    pub project_id: String,
    pub version: String,
    pub documentation_digest: String,
    pub state: String,
    pub validation_state: String,
    pub approval_kind: String,
    pub source_identity: String,
    pub updated_at: String,
    pub source: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityReadPage {
    pub project_id: String,
    pub capabilities: Vec<CapabilityRead>,
    pub next_offset: Option<u32>,
    pub source: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateProjectRequest {
    pub id: String,
    pub name: String,
    pub domain: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ApiErrorEnvelope {
    error: ApiError,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ApiError {
    code: String,
    #[serde(rename = "message")]
    _message: String,
}

/// Native-only state. Its token is never serialized, formatted or returned to JS.
#[derive(Clone)]
pub struct ManagementClient {
    http: reqwest::Client,
    port: u16,
    token: String,
}

pub fn safe_project_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 63
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_')
}

/// Linux V1: reject symlinked path components, nonregular files, wrong owner/mode/content.
#[cfg(target_os = "linux")]
pub fn read_private_token(path: &Path) -> Result<String, NativeError> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::{ffi::OsStrExt, fs::MetadataExt};
    if !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(NativeError::new("CONFIG", "Chemin du jeton invalide."));
    }
    // Walk held directory descriptors: no parent component can be swapped to a symlink.
    let mut parts = path
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => Some(value),
            _ => None,
        })
        .collect::<Vec<_>>();
    let leaf = parts
        .pop()
        .ok_or_else(|| NativeError::new("CONFIG", "Chemin du jeton invalide."))?;
    let mut directory = std::fs::File::open("/")
        .map_err(|_| NativeError::new("CONFIG", "Chemin du jeton indisponible."))?;
    for part in parts {
        let name = CString::new(part.as_bytes())
            .map_err(|_| NativeError::new("CONFIG", "Chemin du jeton invalide."))?;
        let fd = unsafe {
            libc::openat(
                directory.as_raw_fd(),
                name.as_ptr(),
                libc::O_PATH | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            )
        };
        if fd < 0 {
            return Err(NativeError::new(
                "CONFIG",
                "Chemin du jeton indisponible ou non sûr.",
            ));
        }
        directory = unsafe { std::fs::File::from_raw_fd(fd) };
    }
    let name = CString::new(leaf.as_bytes())
        .map_err(|_| NativeError::new("CONFIG", "Chemin du jeton invalide."))?;
    let fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            name.as_ptr(),
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return Err(NativeError::new(
            "CONFIG",
            "Fichier de jeton indisponible ou non sûr.",
        ));
    }
    let file = unsafe { std::fs::File::from_raw_fd(fd) };
    let meta = file
        .metadata()
        .map_err(|_| NativeError::new("CONFIG", "Fichier de jeton non vérifiable."))?;
    if !meta.is_file()
        || meta.uid() != unsafe { libc::geteuid() }
        || meta.mode() & 0o077 != 0
        || meta.len() > 256
    {
        return Err(NativeError::new("CONFIG", "Fichier de jeton non privé."));
    }
    let mut raw = Vec::new();
    file.take(257)
        .read_to_end(&mut raw)
        .map_err(|_| NativeError::new("CONFIG", "Lecture du jeton impossible."))?;
    if raw.last() == Some(&b'\n') {
        raw.pop();
    }
    let token =
        std::str::from_utf8(&raw).map_err(|_| NativeError::new("CONFIG", "Jeton invalide."))?;
    if !(43..=128).contains(&token.len())
        || !token
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        || base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(token)
            .map_or(true, |v| v.len() < 32)
    {
        return Err(NativeError::new("CONFIG", "Jeton invalide."));
    }
    Ok(token.to_owned())
}
#[cfg(not(target_os = "linux"))]
pub fn read_private_token(_: &Path) -> Result<String, NativeError> {
    Err(NativeError::new(
        "UNSUPPORTED_PLATFORM",
        "La vérification du fichier privé est disponible sur Linux uniquement.",
    ))
}

impl ManagementClient {
    /// Fixed loopback destination; no proxy, redirect, ambient credential store or retry.
    pub fn new(port: u16, token_file: &Path) -> Result<Self, NativeError> {
        if port == 0 {
            return Err(NativeError::new("CONFIG", "Port de gestion invalide."));
        }
        let token = read_private_token(token_file)?;
        let http = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(8))
            .build()
            .map_err(|_| NativeError::new("CONFIG", "Client local indisponible."))?;
        Ok(Self { http, port, token })
    }
    /// Only explicit native startup settings; no frontend-supplied endpoint or token.
    pub fn from_environment() -> Result<Self, NativeError> {
        let port: u16 = std::env::var("MORGOTH_DESKTOP_MANAGEMENT_PORT")
            .map_err(|_| NativeError::new("CONFIG", "Port de gestion absent."))?
            .parse()
            .map_err(|_| NativeError::new("CONFIG", "Port de gestion invalide."))?;
        let path = std::env::var_os("MORGOTH_DESKTOP_MANAGEMENT_TOKEN_FILE")
            .ok_or_else(|| NativeError::new("CONFIG", "Fichier de jeton absent."))?;
        let path = Path::new(&path);
        if !path.is_absolute() {
            return Err(NativeError::new("CONFIG", "Chemin du jeton invalide."));
        }
        Self::new(port, path)
    }
    fn url(&self, path: &str) -> String {
        if path.starts_with(READ_PREFIX) {
            format!("http://127.0.0.1:{}{path}", self.port)
        } else {
            format!("http://127.0.0.1:{}{PREFIX}{path}", self.port)
        }
    }
    async fn call<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&CreateProjectRequest>,
    ) -> Result<T, NativeError> {
        let is_post = method == Method::POST;
        let uncertain = || {
            NativeError::new(
                "UNCERTAIN_CREATE",
                "Résultat de création incertain ; consultez le catalogue.",
            )
        };
        let mut request = self
            .http
            .request(method, self.url(path))
            .header("X-Morgoth-Management-Token", &self.token)
            .header(header::ACCEPT, "application/json");
        if let Some(value) = body {
            request = request.json(value);
        }
        let response = request.send().await.map_err(|error| {
            if is_post {
                let mut safe = uncertain();
                safe.code = Some(
                    if error.is_timeout() {
                        "TIMEOUT"
                    } else if error.is_connect() {
                        "CONNECT"
                    } else {
                        "OTHER"
                    }
                    .into(),
                );
                safe
            } else {
                let mut safe = NativeError::new("TRANSPORT", "API locale indisponible.");
                safe.code = Some(
                    if error.is_timeout() {
                        "TIMEOUT"
                    } else if error.is_connect() {
                        "CONNECT"
                    } else {
                        "OTHER"
                    }
                    .into(),
                );
                safe
            }
        })?;
        let status = response.status();
        if status.is_redirection() {
            return Err(NativeError::new(
                "REDIRECT_REJECTED",
                "Redirection de l’API locale refusée.",
            ));
        }
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !content_type
            .split(';')
            .next()
            .is_some_and(|kind| kind.trim().eq_ignore_ascii_case("application/json"))
        {
            return Err(if is_post {
                uncertain()
            } else {
                NativeError::new("INCOMPATIBLE_RESPONSE", "Réponse API incompatible.")
            });
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BODY as u64)
        {
            return Err(if is_post {
                uncertain()
            } else {
                NativeError::new("OVERSIZED_RESPONSE", "Réponse API trop volumineuse.")
            });
        }
        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| {
                if is_post {
                    uncertain()
                } else {
                    NativeError::new("TRANSPORT", "Réponse API interrompue.")
                }
            })?;
            if bytes.len() + chunk.len() > MAX_BODY {
                return Err(if is_post {
                    uncertain()
                } else {
                    NativeError::new("OVERSIZED_RESPONSE", "Réponse API trop volumineuse.")
                });
            }
            bytes.extend_from_slice(&chunk);
        }
        if status.is_success() {
            serde_json::from_slice(&bytes).map_err(|_| {
                if is_post {
                    uncertain()
                } else {
                    NativeError::new("INCOMPATIBLE_RESPONSE", "Réponse API incompatible.")
                }
            })
        } else {
            let parsed: ApiErrorEnvelope = serde_json::from_slice(&bytes).map_err(|_| {
                NativeError::new("INCOMPATIBLE_RESPONSE", "Erreur API incompatible.")
            })?;
            Err(NativeError {
                kind: "API".into(),
                code: Some(parsed.error.code),
                status: Some(status.as_u16()),
                message: "Opération de gestion refusée.".into(),
            })
        }
    }
    pub async fn management_status(&self) -> Result<ManagementStatus, NativeError> {
        let value: ManagementStatus = self.call(Method::GET, "/status", None).await?;
        if value.api_version != "1" {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Version API incompatible.",
            ));
        }
        Ok(value)
    }
    pub async fn list_domains(&self) -> Result<DomainList, NativeError> {
        self.call(Method::GET, "/domains", None).await
    }
    pub async fn list_projects(&self) -> Result<ProjectList, NativeError> {
        self.call(Method::GET, "/projects", None).await
    }
    pub async fn get_project(&self, id: &str) -> Result<ProjectView, NativeError> {
        if !safe_project_id(id) {
            return Err(NativeError::new(
                "INVALID_PROJECT_ID",
                "Identifiant de projet invalide.",
            ));
        }
        self.call(Method::GET, &format!("/projects/{id}"), None)
            .await
    }
    pub async fn validate_project(&self, id: &str) -> Result<ProjectValidation, NativeError> {
        if !safe_project_id(id) {
            return Err(NativeError::new(
                "INVALID_PROJECT_ID",
                "Identifiant de projet invalide.",
            ));
        }
        self.call(Method::GET, &format!("/projects/{id}/validation"), None)
            .await
    }
    pub async fn create_project(
        &self,
        input: &CreateProjectRequest,
    ) -> Result<ProjectCreation, NativeError> {
        if !safe_project_id(&input.id) {
            return Err(NativeError::new(
                "INVALID_PROJECT_ID",
                "Identifiant de projet invalide.",
            ));
        }
        if input.name.trim().is_empty() || input.name.len() > 128 || !safe_project_id(&input.domain)
        {
            return Err(NativeError::new(
                "INVALID_REQUEST",
                "Paramètres de projet invalides.",
            ));
        }
        self.call(Method::POST, "/projects", Some(input)).await
    }
    pub async fn list_mission_reads(
        &self,
        id: &str,
        offset: u32,
    ) -> Result<MissionReadPage, NativeError> {
        if !safe_project_id(id) || offset > 1000 {
            return Err(NativeError::new("INVALID_REQUEST", "Lecture invalide."));
        }
        let page: MissionReadPage = self
            .call(
                Method::GET,
                &format!("{READ_PREFIX}/projects/{id}/missions?limit=10&offset={offset}"),
                None,
            )
            .await?;
        if page.project_id != id
            || page.source != "DISPOSABLE_POSTGRESQL"
            || page.missions.len() > 10
            || page.missions.iter().any(|m| {
                m.project_id != id
                    || m.evidence_kind != "HISTORICAL_CHECKPOINT"
                    || m.objective.len() > 240
                    || m.stages.len() > 16
                    || m.capability_gaps.len() > 16
                    || m.failure_codes.len() > 4
                    || m.revision < 0
                    || m.receipt_count < 0
            })
            || page.next_offset.is_some_and(|n| n > 1010 || n <= offset)
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Réponse API incompatible.",
            ));
        }
        Ok(page)
    }
    pub async fn get_mission_read(
        &self,
        id: &str,
        mission_id: &str,
    ) -> Result<MissionRead, NativeError> {
        if !safe_project_id(id) || !safe_uuid(mission_id) {
            return Err(NativeError::new("INVALID_REQUEST", "Lecture invalide."));
        }
        let item: MissionRead = self
            .call(
                Method::GET,
                &format!("{READ_PREFIX}/projects/{id}/missions/{mission_id}"),
                None,
            )
            .await?;
        if item.project_id != id
            || item.mission_id != mission_id
            || item.evidence_kind != "HISTORICAL_CHECKPOINT"
            || item.objective.len() > 240
            || item.stages.len() > 16
            || item.capability_gaps.len() > 16
            || item.failure_codes.len() > 4
            || item.revision < 0
            || item.receipt_count < 0
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Réponse API incompatible.",
            ));
        }
        Ok(item)
    }
    pub async fn list_capability_reads(
        &self,
        id: &str,
        offset: u32,
    ) -> Result<CapabilityReadPage, NativeError> {
        if !safe_project_id(id) || offset > 1000 {
            return Err(NativeError::new("INVALID_REQUEST", "Lecture invalide."));
        }
        let page: CapabilityReadPage = self
            .call(
                Method::GET,
                &format!("{READ_PREFIX}/projects/{id}/capabilities?limit=10&offset={offset}"),
                None,
            )
            .await?;
        if page.project_id != id
            || page.source != "DISPOSABLE_POSTGRESQL"
            || page.capabilities.len() > 10
            || page.capabilities.iter().any(|c| {
                c.project_id != id
                    || c.source != "DISPOSABLE_POSTGRESQL"
                    || c.source_identity.len() > 200
                    || c.documentation_digest.len() != 64
                    || !matches!(
                        c.approval_kind.as_str(),
                        "NONE_RECORDED" | "TEST_FIXTURE_ONLY"
                    )
            })
            || page.next_offset.is_some_and(|n| n > 1010 || n <= offset)
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Réponse API incompatible.",
            ));
        }
        Ok(page)
    }
}

fn safe_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

#[cfg(feature = "desktop")]
mod desktop {
    use super::*;
    use crate::research::{ProfilesResponse, ResearchEngineStatus, ResearchEngineSupervisor};
    use crate::supervisor::{ManagementRuntimeStatus, ManagementSupervisor, SupervisorConfig};
    use tauri::{State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
    fn main_only(window: &WebviewWindow) -> Result<(), NativeError> {
        if window.label() == "main" {
            Ok(())
        } else {
            Err(NativeError::new("DENIED", "Fenêtre non autorisée."))
        }
    }
    #[tauri::command]
    pub fn management_runtime_status(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
    ) -> Result<ManagementRuntimeStatus, NativeError> {
        main_only(&window)?;
        Ok(supervisor.status())
    }
    #[tauri::command]
    pub async fn management_status(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
    ) -> Result<ManagementStatus, NativeError> {
        main_only(&window)?;
        let client = supervisor.client()?;
        client.management_status().await
    }
    #[tauri::command]
    pub async fn list_domains(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
    ) -> Result<DomainList, NativeError> {
        main_only(&window)?;
        supervisor.client()?.list_domains().await
    }
    #[tauri::command]
    pub async fn list_projects(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
    ) -> Result<PublicProjectList, NativeError> {
        main_only(&window)?;
        let result = supervisor.client()?.list_projects().await?;
        Ok(PublicProjectList {
            projects: result.projects.into_iter().map(Into::into).collect(),
            configuration_valid: result.configuration_valid,
            runtime_checked: result.runtime_checked,
        })
    }
    #[tauri::command]
    pub async fn get_project(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
        project_id: String,
    ) -> Result<PublicProjectView, NativeError> {
        main_only(&window)?;
        Ok(supervisor.client()?.get_project(&project_id).await?.into())
    }
    #[tauri::command]
    pub async fn validate_project(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
        project_id: String,
    ) -> Result<PublicProjectValidation, NativeError> {
        main_only(&window)?;
        let result = supervisor.client()?.validate_project(&project_id).await?;
        Ok(PublicProjectValidation {
            project: result.project.into(),
            configuration_valid: result.configuration_valid,
            runtime_checked: result.runtime_checked,
        })
    }
    #[tauri::command]
    pub async fn list_mission_reads(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
        project_id: String,
        offset: u32,
    ) -> Result<MissionReadPage, NativeError> {
        main_only(&window)?;
        supervisor
            .client()?
            .list_mission_reads(&project_id, offset)
            .await
    }
    #[tauri::command]
    pub async fn get_mission_read(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
        project_id: String,
        mission_id: String,
    ) -> Result<MissionRead, NativeError> {
        main_only(&window)?;
        supervisor
            .client()?
            .get_mission_read(&project_id, &mission_id)
            .await
    }
    #[tauri::command]
    pub async fn list_capability_reads(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
        project_id: String,
        offset: u32,
    ) -> Result<CapabilityReadPage, NativeError> {
        main_only(&window)?;
        supervisor
            .client()?
            .list_capability_reads(&project_id, offset)
            .await
    }
    #[tauri::command]
    pub fn research_engine_status(
        window: WebviewWindow,
        supervisor: State<'_, ResearchEngineSupervisor>,
    ) -> Result<ResearchEngineStatus, NativeError> {
        main_only(&window)?;
        Ok(supervisor.status())
    }
    #[tauri::command]
    pub async fn research_profiles(
        window: WebviewWindow,
        supervisor: State<'_, ResearchEngineSupervisor>,
    ) -> Result<ProfilesResponse, NativeError> {
        main_only(&window)?;
        supervisor.profiles().await
    }
    #[tauri::command]
    pub async fn ollama_status_read(
        window: WebviewWindow,
    ) -> Result<crate::ollama_read::OllamaStatusRead, NativeError> {
        main_only(&window)?;
        let reader = crate::ollama_read::OllamaReader::from_environment().map_err(|_| {
            NativeError::new("CONFIG_REJECTED", "Configuration Ollama locale invalide.")
        })?;
        Ok(reader.read().await)
    }
    pub fn run() {
        let config = SupervisorConfig::from_environment();
        let supervisor = ManagementSupervisor::start(config.clone());
        let research = ResearchEngineSupervisor::new(config, supervisor.clone());
        let on_exit = supervisor.clone();
        let research_on_exit = research.clone();
        let app = tauri::Builder::default()
            .manage(supervisor)
            .manage(research)
            .setup(|app| {
                let expected = if cfg!(debug_assertions) {
                    "http://127.0.0.1:5173"
                } else {
                    "tauri://localhost"
                };
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Morgoth · Command Center")
                    .inner_size(1120.0, 780.0)
                    .on_navigation(move |url| {
                        let origin = url.origin().ascii_serialization();
                        origin == expected || origin == "http://tauri.localhost"
                    })
                    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                    .build()?;
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                management_runtime_status,
                management_status,
                list_domains,
                list_projects,
                get_project,
                validate_project,
                list_mission_reads,
                get_mission_read,
                list_capability_reads,
                research_engine_status,
                research_profiles,
                ollama_status_read,
            ])
            .build(tauri::generate_context!())
            .expect("Morgoth desktop runtime failed");
        app.run(move |_, event| {
            if let tauri::RunEvent::Exit = event {
                research_on_exit.stop();
                on_exit.stop();
            }
        });
    }
}
#[cfg(feature = "desktop")]
pub use desktop::run;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn project_id_cannot_inject_a_path() {
        assert!(safe_project_id("research_a"));
        let long_id = "a".repeat(64);
        for value in [
            "../x",
            "x/y",
            "x?z",
            "x#z",
            "X",
            "",
            "a%2fb",
            long_id.as_str(),
        ] {
            assert!(!safe_project_id(value));
        }
    }
}

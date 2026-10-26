//! Fixed, authenticated local transport for the pinned Management API V1.
use base64::Engine;
use futures_util::StreamExt;
use reqwest::{header, Method};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{io::Read, path::Path, time::Duration};

pub mod drafts;
pub mod notes;
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
pub struct PublicProjectCreation {
    pub project: PublicProjectView,
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
pub struct KnowledgeLinkRead {
    pub label: String,
    pub target_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KnowledgeDocumentRead {
    pub schema_version: u8,
    pub document_id: String,
    pub project_id: String,
    pub title: String,
    pub recorded_at: String,
    pub links: Vec<KnowledgeLinkRead>,
    pub source: String,
    pub content: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KnowledgeReadPage {
    pub schema_version: u8,
    pub project_id: String,
    pub source: String,
    pub read_at: String,
    pub documents: Vec<KnowledgeDocumentRead>,
    pub next_offset: Option<u32>,
}

fn safe_document_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn valid_knowledge_document(item: &KnowledgeDocumentRead, project_id: &str, detail: bool) -> bool {
    item.schema_version == 1
        && item.project_id == project_id
        && item.source == "PROJECT_MARKDOWN_VAULT"
        && safe_document_id(&item.document_id)
        && !item.title.is_empty()
        && item.title.len() <= 640
        && item.recorded_at.len() <= 48
        && item.links.len() <= 32
        && item.links.iter().all(|link| {
            link.label.len() <= 640 && link.target_id.as_deref().is_none_or(safe_document_id)
        })
        && if detail {
            item.content.as_ref().is_some_and(|s| s.len() <= 16_384)
        } else {
            item.content.is_none()
        }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateProjectRequest {
    pub id: String,
    pub name: String,
    pub domain: String,
}
fn valid_project_create_input(input: &CreateProjectRequest) -> bool {
    safe_project_id(&input.id)
        && input.id != "default"
        && safe_project_id(&input.domain)
        && !input.name.trim().is_empty()
        && input.name.len() <= 128
        && !input.name.chars().any(char::is_control)
}

fn verified_project_creation(result: &ProjectCreation, input: &CreateProjectRequest) -> bool {
    result.project.id == input.id
        && result.project.domain == input.domain
        && result.project.name == input.name.trim()
        && !result.project.legacy
        && result.created
        && result.durability_confirmed
        && !result.engine_started
        && !result.storage_initialized
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
        if path.starts_with(READ_PREFIX) || path.starts_with("/desktop-knowledge/v1/") {
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
    pub async fn list_knowledge_reads(
        &self,
        id: &str,
        offset: u32,
        query: &str,
    ) -> Result<KnowledgeReadPage, NativeError> {
        if !safe_project_id(id)
            || offset > 95
            || query.len() > 80
            || query.chars().any(char::is_control)
        {
            return Err(NativeError::new("INVALID_REQUEST", "Lecture invalide."));
        }
        let encoded = query
            .bytes()
            .map(|b| {
                if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                    (b as char).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect::<String>();
        let page: KnowledgeReadPage = self.call(Method::GET,
            &format!("/desktop-knowledge/v1/projects/{id}/documents?limit=20&offset={offset}&query={encoded}"), None).await?;
        if page.schema_version != 1
            || page.project_id != id
            || page.source != "PROJECT_MARKDOWN_VAULT"
            || page.read_at.len() > 48
            || page.documents.len() > 20
            || page
                .documents
                .iter()
                .any(|d| !valid_knowledge_document(d, id, false))
            || page.next_offset.is_some_and(|n| n > 95 || n <= offset)
        {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Réponse API incompatible.",
            ));
        }
        Ok(page)
    }
    pub async fn get_knowledge_read(
        &self,
        id: &str,
        document_id: &str,
    ) -> Result<KnowledgeDocumentRead, NativeError> {
        if !safe_project_id(id) || !safe_document_id(document_id) {
            return Err(NativeError::new("INVALID_REQUEST", "Lecture invalide."));
        }
        let item: KnowledgeDocumentRead = self
            .call(
                Method::GET,
                &format!("/desktop-knowledge/v1/projects/{id}/documents/{document_id}"),
                None,
            )
            .await?;
        if item.document_id != document_id || !valid_knowledge_document(&item, id, true) {
            return Err(NativeError::new(
                "INCOMPATIBLE_RESPONSE",
                "Réponse API incompatible.",
            ));
        }
        Ok(item)
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
    use crate::drafts::{Draft, DraftInput, DraftStore, DraftUpdate};
    use crate::notes::{Note, NoteInput, NoteStore, NoteUpdate};
    use crate::research::{ProfilesResponse, ResearchEngineStatus, ResearchEngineSupervisor};
    use crate::supervisor::{ManagementRuntimeStatus, ManagementSupervisor, SupervisorConfig};
    use tauri::{Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
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
    pub async fn create_project(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
        input: CreateProjectRequest,
    ) -> Result<PublicProjectCreation, NativeError> {
        main_only(&window)?;
        if !valid_project_create_input(&input) {
            return Err(NativeError::new(
                "INVALID_REQUEST",
                "Paramètres de Project invalides.",
            ));
        }
        let client = supervisor.client()?;
        let domains = client.list_domains().await?;
        if !domains
            .domains
            .iter()
            .any(|item| item.id == input.domain && item.configuration_valid)
        {
            return Err(NativeError::new(
                "UNKNOWN_DOMAIN",
                "Domaine installé indisponible.",
            ));
        }
        let result = client.create_project(&input).await?;
        if !verified_project_creation(&result, &input) {
            return Err(NativeError::new(
                "UNCERTAIN_CREATE",
                "Résultat de création incertain ; consultez le catalogue.",
            ));
        }
        Ok(PublicProjectCreation {
            project: result.project.into(),
            created: result.created,
            durability_confirmed: result.durability_confirmed,
            engine_started: result.engine_started,
            storage_initialized: result.storage_initialized,
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
    pub async fn list_knowledge_reads(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
        project_id: String,
        offset: u32,
        query: String,
    ) -> Result<KnowledgeReadPage, NativeError> {
        main_only(&window)?;
        supervisor
            .client()?
            .list_knowledge_reads(&project_id, offset, &query)
            .await
    }
    #[tauri::command]
    pub async fn get_knowledge_read(
        window: WebviewWindow,
        supervisor: State<'_, ManagementSupervisor>,
        project_id: String,
        document_id: String,
    ) -> Result<KnowledgeDocumentRead, NativeError> {
        main_only(&window)?;
        supervisor
            .client()?
            .get_knowledge_read(&project_id, &document_id)
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
    fn draft_store(app: &tauri::AppHandle) -> Result<DraftStore, NativeError> {
        let path = app
            .path()
            .app_local_data_dir()
            .map_err(|_| NativeError::new("LOCAL_DRAFT_STORAGE", "Stockage local indisponible."))?;
        Ok(DraftStore::new(path.join("mission-workspace-v1")))
    }
    async fn draft_job<T: Send + 'static>(
        job: impl FnOnce() -> Result<T, NativeError> + Send + 'static,
    ) -> Result<T, NativeError> {
        tauri::async_runtime::spawn_blocking(job)
            .await
            .map_err(|_| NativeError::new("LOCAL_DRAFT_STORAGE", "Stockage local indisponible."))?
    }
    #[tauri::command]
    pub async fn preferred_project_read(
        window: WebviewWindow,
        app: tauri::AppHandle,
    ) -> Result<Option<String>, NativeError> {
        main_only(&window)?;
        let store = draft_store(&app)?;
        draft_job(move || store.preferred()).await
    }
    #[tauri::command]
    pub async fn preferred_project_set(
        window: WebviewWindow,
        app: tauri::AppHandle,
        project_id: Option<String>,
    ) -> Result<(), NativeError> {
        main_only(&window)?;
        let store = draft_store(&app)?;
        draft_job(move || store.set_preferred(project_id)).await
    }
    #[tauri::command]
    pub async fn local_drafts_list(
        window: WebviewWindow,
        app: tauri::AppHandle,
        project_id: String,
    ) -> Result<Vec<Draft>, NativeError> {
        main_only(&window)?;
        let store = draft_store(&app)?;
        draft_job(move || store.list(&project_id)).await
    }
    #[tauri::command]
    pub async fn local_draft_get(
        window: WebviewWindow,
        app: tauri::AppHandle,
        project_id: String,
        draft_id: String,
    ) -> Result<Draft, NativeError> {
        main_only(&window)?;
        let store = draft_store(&app)?;
        draft_job(move || store.get(&project_id, &draft_id)).await
    }
    #[tauri::command]
    pub async fn local_draft_create(
        window: WebviewWindow,
        app: tauri::AppHandle,
        input: DraftInput,
    ) -> Result<Draft, NativeError> {
        main_only(&window)?;
        let store = draft_store(&app)?;
        draft_job(move || store.create(input)).await
    }
    #[tauri::command]
    pub async fn local_draft_update(
        window: WebviewWindow,
        app: tauri::AppHandle,
        input: DraftUpdate,
    ) -> Result<Draft, NativeError> {
        main_only(&window)?;
        let store = draft_store(&app)?;
        draft_job(move || store.update(input)).await
    }
    #[tauri::command]
    pub async fn local_draft_delete(
        window: WebviewWindow,
        app: tauri::AppHandle,
        project_id: String,
        draft_id: String,
        expected_revision: u64,
    ) -> Result<(), NativeError> {
        main_only(&window)?;
        let store = draft_store(&app)?;
        draft_job(move || store.delete(&project_id, &draft_id, expected_revision)).await
    }
    fn note_store(app: &tauri::AppHandle) -> Result<NoteStore, NativeError> {
        let path = app
            .path()
            .app_local_data_dir()
            .map_err(|_| NativeError::new("LOCAL_NOTE_STORAGE", "Stockage local indisponible."))?;
        Ok(NoteStore::new(path.join("knowledge-v1")))
    }
    #[tauri::command]
    pub async fn local_notes_list(
        window: WebviewWindow,
        app: tauri::AppHandle,
        project_id: String,
    ) -> Result<Vec<Note>, NativeError> {
        main_only(&window)?;
        let store = note_store(&app)?;
        draft_job(move || store.list(&project_id)).await
    }
    #[tauri::command]
    pub async fn local_note_get(
        window: WebviewWindow,
        app: tauri::AppHandle,
        project_id: String,
        note_id: String,
    ) -> Result<Note, NativeError> {
        main_only(&window)?;
        let store = note_store(&app)?;
        draft_job(move || store.get(&project_id, &note_id)).await
    }
    #[tauri::command]
    pub async fn local_note_create(
        window: WebviewWindow,
        app: tauri::AppHandle,
        input: NoteInput,
    ) -> Result<Note, NativeError> {
        main_only(&window)?;
        let store = note_store(&app)?;
        draft_job(move || store.create(input)).await
    }
    #[tauri::command]
    pub async fn local_note_update(
        window: WebviewWindow,
        app: tauri::AppHandle,
        input: NoteUpdate,
    ) -> Result<Note, NativeError> {
        main_only(&window)?;
        let store = note_store(&app)?;
        draft_job(move || store.update(input)).await
    }
    #[tauri::command]
    pub async fn local_note_delete(
        window: WebviewWindow,
        app: tauri::AppHandle,
        project_id: String,
        note_id: String,
        expected_revision: u64,
    ) -> Result<(), NativeError> {
        main_only(&window)?;
        let store = note_store(&app)?;
        draft_job(move || store.delete(&project_id, &note_id, expected_revision)).await
    }
    #[tauri::command]
    pub async fn local_note_export(
        window: WebviewWindow,
        app: tauri::AppHandle,
        project_id: String,
        note_id: String,
    ) -> Result<String, NativeError> {
        main_only(&window)?;
        let store = note_store(&app)?;
        let root = app
            .path()
            .app_local_data_dir()
            .map_err(|_| NativeError::new("LOCAL_NOTE_STORAGE", "Stockage local indisponible."))?
            .join("note-exports-v1");
        draft_job(move || {
            store
                .export_markdown(&project_id, &note_id, &root)
                .map(|path| path.to_string_lossy().into_owned())
        })
        .await
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
                create_project,
                get_project,
                validate_project,
                list_mission_reads,
                get_mission_read,
                list_capability_reads,
                list_knowledge_reads,
                get_knowledge_read,
                research_engine_status,
                research_profiles,
                ollama_status_read,
                preferred_project_read,
                preferred_project_set,
                local_drafts_list,
                local_draft_get,
                local_draft_create,
                local_draft_update,
                local_draft_delete,
                local_notes_list,
                local_note_get,
                local_note_create,
                local_note_update,
                local_note_delete,
                local_note_export,
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
    fn project_creation_requires_safe_identity_and_non_operational_receipt() {
        let input = CreateProjectRequest {
            id: "personal".into(),
            name: "Personnel".into(),
            domain: "crypto".into(),
        };
        assert!(valid_project_create_input(&input));
        for id in ["default", "../other", "A", ""] {
            assert!(!valid_project_create_input(&CreateProjectRequest {
                id: id.into(),
                ..input.clone()
            }));
        }
        assert!(!valid_project_create_input(&CreateProjectRequest {
            name: "bad\nname".into(),
            ..input.clone()
        }));
        let project = ProjectView {
            id: input.id.clone(),
            name: input.name.clone(),
            domain: input.domain.clone(),
            legacy: false,
            manifest_path: None,
            workspace_root: None,
            postgres_schema: "p_test".into(),
            chroma_prefix: "p_test_".into(),
            vault_dir: "internal".into(),
            runtime_dir: "internal".into(),
            configuration_valid: true,
            runtime_checked: false,
        };
        let mut result = ProjectCreation {
            project,
            created: true,
            durability_confirmed: true,
            engine_started: false,
            storage_initialized: false,
        };
        assert!(verified_project_creation(&result, &input));
        let public = PublicProjectCreation {
            project: result.project.clone().into(),
            created: true,
            durability_confirmed: true,
            engine_started: false,
            storage_initialized: false,
        };
        let serialized = serde_json::to_string(&public).unwrap();
        for forbidden in [
            "manifest_path",
            "workspace_root",
            "postgres_schema",
            "vault_dir",
            "runtime_dir",
            "internal",
        ] {
            assert!(!serialized.contains(forbidden));
        }
        result.engine_started = true;
        assert!(!verified_project_creation(&result, &input));
        result.engine_started = false;
        result.project.id = "other".into();
        assert!(!verified_project_creation(&result, &input));
    }
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
    #[test]
    fn knowledge_dto_is_strict_and_project_scoped() {
        let id = "a".repeat(64);
        assert!(safe_document_id(&id));
        assert!(!safe_document_id("../secret.md"));
        let payload = serde_json::json!({"schema_version":1,"document_id":id,"project_id":"alpha","title":"Index",
            "recorded_at":"2026-10-26T00:00:00+00:00","links":[{"label":"Lien","target_id":null}],
            "source":"PROJECT_MARKDOWN_VAULT","content":"# Index"});
        let doc: KnowledgeDocumentRead = serde_json::from_value(payload.clone()).unwrap();
        assert!(valid_knowledge_document(&doc, "alpha", true));
        assert!(!valid_knowledge_document(&doc, "beta", true));
        assert!(!valid_knowledge_document(&doc, "alpha", false));
        let mut unexpected = payload;
        unexpected["private_path"] = serde_json::json!("/private");
        assert!(serde_json::from_value::<KnowledgeDocumentRead>(unexpected).is_err());
    }
}

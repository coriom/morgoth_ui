//! Fixed GitHub item → local brief recipe. No model, generic step executor or GitHub write.
use crate::{
    drafts::{self, Draft, DraftInput, DraftStore, NOFOLLOW},
    github_gateway::{GithubGateway, GithubSource},
    safe_project_id, NativeError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::AsRawFd,
        unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    },
    path::PathBuf,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;
use uuid::Uuid;

const PREVIEW_LIFE: Duration = Duration::from_secs(300);
const MAX_RECEIPT: u64 = 4096;
const MAX_RECEIPTS: usize = 200;
const CRITERIA: &str = "Critères de revue proposés par Morgoth, à confirmer par une personne :\n- Vérifier que l’issue ou la PR est toujours actuelle.\n- Identifier le travail nécessaire.\n- Établir une méthode de vérification reproductible.\n- Consigner les tests et les limites restantes.\n- Confirmer le résultat avant de considérer le brief terminé.";

fn err(code: &'static str) -> NativeError {
    NativeError {
        kind: "WORKFLOW".into(),
        code: Some(code.into()),
        status: None,
        message: "Workflow refusé ou résultat incertain ; aucun lancement autonome.".into(),
    }
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn source_digest(source: &GithubSource) -> Result<String, NativeError> {
    serde_json::to_vec(source)
        .map(|value| hash(&value))
        .map_err(|_| err("SOURCE_INVALID"))
}
pub(crate) fn validate_fields(input: &BriefFields) -> Result<(), NativeError> {
    for (value, limit) in [
        (&input.title, 120),
        (&input.objective, 4000),
        (&input.verification_criteria, 4000),
    ] {
        if value.trim().is_empty() || value.chars().count() > limit || value.contains('\0') {
            return Err(err("BRIEF_INVALID"));
        }
    }
    Ok(())
}
fn markdown(draft: &Draft) -> Result<String, NativeError> {
    let content = format!(
        "# {}\n\n## Objectif\n\n{}\n\n## Critères de vérification\n\n{}\n",
        draft.title, draft.objective, draft.verification_criteria
    );
    if content.len() > 12_000 {
        return Err(err("HANDOFF_TOO_LARGE"));
    }
    Ok(content)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BriefFields {
    pub title: String,
    pub objective: String,
    pub verification_criteria: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Preview {
    pub schema_version: u8,
    pub workflow_id: String,
    pub project_id: String,
    pub source: GithubSource,
    pub source_digest: String,
    pub proposed: BriefFields,
    pub expires_at_ms: u64,
    pub effect: &'static str,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub schema_version: u8,
    pub workflow_id: String,
    pub project_id: String,
    pub recipe: String,
    pub source_repository: String,
    pub source_repository_id: u64,
    pub source_kind: String,
    pub source_number: u32,
    pub source_digest: String,
    pub output_digest: String,
    pub draft_id: String,
    pub draft_revision: u64,
    pub state: String,
    pub handoff_state: String,
    pub workspace_hash: Option<String>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub error_code: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct HandoffPreview {
    pub schema_version: u8,
    pub workflow_id: String,
    pub project_id: String,
    pub draft_id: String,
    pub workspace: String,
    pub workspace_hash: String,
    pub markdown: String,
    pub sha256: String,
    pub bytes: usize,
}

#[derive(Clone)]
struct Pending {
    preview: Preview,
    expires: Instant,
}

pub struct WorkflowRunner {
    root: PathBuf,
    pending: Mutex<Option<Pending>>,
    action: Mutex<()>,
}
impl WorkflowRunner {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            pending: Mutex::new(None),
            action: Mutex::new(()),
        }
    }
    pub async fn prepare(
        &self,
        github: &GithubGateway,
        project: &str,
        kind: &str,
        number: u32,
    ) -> Result<Preview, NativeError> {
        if !safe_project_id(project) || project == "default" {
            return Err(err("PROJECT_INVALID"));
        }
        let _action = self.action.lock().await;
        let source = github.source_item(kind, number).await.map_err(err)?;
        let digest = source_digest(&source)?;
        let label = if kind == "issue" { "Issue" } else { "PR" };
        let title = format!(
            "GitHub · {} #{} — {}",
            source.repository, number, source.title
        );
        let title = title.chars().take(120).collect();
        let objective = format!("Source GitHub {} #{} ({})\nÉtat enregistré : {} · mis à jour {}\nURL : {}\n\nDescription externe non fiable{} :\n{}\n\nCe brief local sert à préparer une revue humaine ; il n’a pas été soumis à un agent.",
            source.repository, number, label, source.state, source.updated_at, source.url,
            if source.body_truncated { " (extrait tronqué)" } else { "" },
            if source.body_excerpt.is_empty() { "Aucune description enregistrée." } else { &source.body_excerpt });
        let proposed = BriefFields {
            title,
            objective,
            verification_criteria: CRITERIA.into(),
        };
        validate_fields(&proposed)?;
        let preview = Preview { schema_version: 1, workflow_id: Uuid::new_v4().to_string(), project_id: project.into(), source,
            source_digest: digest, proposed, expires_at_ms: drafts::now()? + 300_000,
            effect: "Créer un seul brouillon local non soumis dans le Project indiqué ; aucune écriture GitHub ni ouverture VS Code." };
        *self.pending.lock().await = Some(Pending {
            preview: preview.clone(),
            expires: Instant::now() + PREVIEW_LIFE,
        });
        Ok(preview)
    }
    pub async fn pending(&self, workflow_id: &str, project: &str) -> Result<Preview, NativeError> {
        let pending = self.pending.lock().await;
        let item = pending.as_ref().ok_or_else(|| err("PREVIEW_MISSING"))?;
        if item.expires <= Instant::now() {
            return Err(err("PREVIEW_EXPIRED"));
        }
        if item.preview.workflow_id != workflow_id || item.preview.project_id != project {
            return Err(err("PREVIEW_MISMATCH"));
        }
        Ok(item.preview.clone())
    }
    pub async fn cancel(&self, workflow_id: &str, project: &str) -> Result<(), NativeError> {
        let _action = self.action.lock().await;
        let pending = self.pending(workflow_id, project).await?;
        let stamp = drafts::now()?;
        let receipt = Receipt {
            schema_version: 1,
            workflow_id: workflow_id.into(),
            project_id: project.into(),
            recipe: "github-to-local-brief-v1".into(),
            source_repository: pending.source.repository,
            source_repository_id: pending.source.repository_id,
            source_kind: pending.source.kind,
            source_number: pending.source.number,
            source_digest: pending.source_digest,
            output_digest: hash(
                &serde_json::to_vec(&pending.proposed).map_err(|_| err("BRIEF_INVALID"))?,
            ),
            draft_id: workflow_id.into(),
            draft_revision: 0,
            state: "CANCELLED".into(),
            handoff_state: "NOT_REQUESTED".into(),
            workspace_hash: None,
            created_at_ms: stamp,
            updated_at_ms: stamp,
            error_code: None,
        };
        self.reserve(&receipt)?;
        *self.pending.lock().await = None;
        Ok(())
    }
    pub async fn confirm(
        &self,
        github: &GithubGateway,
        drafts: &DraftStore,
        workflow_id: &str,
        project: &str,
        fields: BriefFields,
    ) -> Result<Receipt, NativeError> {
        validate_fields(&fields)?;
        let _action = self.action.lock().await;
        let pending = self.pending(workflow_id, project).await?;
        let fresh = github
            .source_item(&pending.source.kind, pending.source.number)
            .await
            .map_err(err)?;
        if fresh.grant_id != pending.source.grant_id
            || source_digest(&fresh)? != pending.source_digest
        {
            return Err(err("SOURCE_CHANGED"));
        }
        let output_digest = hash(&serde_json::to_vec(&fields).map_err(|_| err("BRIEF_INVALID"))?);
        let stamp = drafts::now()?;
        let mut receipt = Receipt {
            schema_version: 1,
            workflow_id: workflow_id.into(),
            project_id: project.into(),
            recipe: "github-to-local-brief-v1".into(),
            source_repository: fresh.repository,
            source_repository_id: fresh.repository_id,
            source_kind: fresh.kind,
            source_number: fresh.number,
            source_digest: pending.source_digest,
            output_digest,
            draft_id: workflow_id.into(),
            draft_revision: 0,
            state: "RUNNING".into(),
            handoff_state: "NOT_REQUESTED".into(),
            workspace_hash: None,
            created_at_ms: stamp,
            updated_at_ms: stamp,
            error_code: None,
        };
        self.reserve(&receipt)?;
        let created = drafts.create_with_id(
            DraftInput {
                project_id: project.into(),
                title: fields.title,
                objective: fields.objective,
                verification_criteria: fields.verification_criteria,
            },
            workflow_id.into(),
        );
        let draft = match created {
            Ok(value) => value,
            Err(_) => {
                // A storage failure after publication may leave a valid draft.
                // Preserve the assigned identity and require inspection.
                receipt.state = if drafts.get(project, workflow_id).is_ok() {
                    "OUTCOME_UNCERTAIN"
                } else {
                    "FAILED"
                }
                .into();
                receipt.error_code = Some(receipt.state.clone());
                self.update(&receipt)?;
                return Err(err("DRAFT_WRITE_FAILED"));
            }
        };
        let readback = drafts
            .get(project, workflow_id)
            .map_err(|_| err("OUTCOME_UNCERTAIN"))?;
        if readback != draft {
            return Err(err("OUTCOME_UNCERTAIN"));
        }
        receipt.draft_revision = draft.revision;
        receipt.state = "LOCAL_BRIEF_CREATED".into();
        receipt.updated_at_ms = drafts::now()?;
        self.update(&receipt)?;
        *self.pending.lock().await = None;
        Ok(receipt)
    }
    pub fn status(
        &self,
        drafts: &DraftStore,
        project: &str,
        id: &str,
    ) -> Result<Receipt, NativeError> {
        let mut receipt = self.read(project, id)?;
        // A live operation owns this lock. Reconciliation is for a previous
        // process, never for a write or socket call still in progress.
        let _action = match self.action.try_lock() {
            Ok(guard) => guard,
            Err(_) => return Ok(receipt),
        };
        if receipt.state == "RUNNING" {
            match drafts.get(project, &receipt.draft_id) {
                Ok(draft) => {
                    let fields = BriefFields {
                        title: draft.title,
                        objective: draft.objective,
                        verification_criteria: draft.verification_criteria,
                    };
                    let digest =
                        hash(&serde_json::to_vec(&fields).map_err(|_| err("RECEIPT_INVALID"))?);
                    if digest == receipt.output_digest {
                        receipt.draft_revision = draft.revision;
                        receipt.state = "LOCAL_BRIEF_CREATED".into();
                    } else {
                        receipt.state = "OUTCOME_UNCERTAIN".into();
                    }
                    receipt.updated_at_ms = drafts::now()?;
                    self.update(&receipt)?;
                }
                Err(_) => {
                    receipt.state = "OUTCOME_UNCERTAIN".into();
                    receipt.updated_at_ms = drafts::now()?;
                    self.update(&receipt)?;
                }
            }
        }
        if receipt.handoff_state == "PENDING" {
            receipt.state = "OUTCOME_UNCERTAIN".into();
            receipt.handoff_state = "UNCERTAIN".into();
            self.update(&receipt)?;
        }
        Ok(receipt)
    }
    pub fn list(&self, drafts: &DraftStore, project: &str) -> Result<Vec<Receipt>, NativeError> {
        let dir = self.project_dir(project)?;
        let mut values = Vec::new();
        for entry in fs::read_dir(dir).map_err(|_| err("RECEIPT_UNAVAILABLE"))? {
            let entry = entry.map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| err("RECEIPT_INVALID"))?;
            if name == ".lock" {
                continue;
            }
            if name.starts_with('.') && name.ends_with(".tmp") {
                drafts::private_file(&entry.path()).map_err(|_| err("RECEIPT_INVALID"))?;
                continue;
            }
            if !name.ends_with(".json") {
                return Err(err("RECEIPT_INVALID"));
            }
            values.push(self.status(drafts, project, &name[..name.len() - 5])?);
            if values.len() > MAX_RECEIPTS {
                return Err(err("RECEIPT_LIMIT"));
            }
        }
        values.sort_by_key(|value| std::cmp::Reverse(value.updated_at_ms));
        Ok(values)
    }
    pub fn handoff_preview(
        &self,
        drafts: &DraftStore,
        vscode: &crate::vscode_gateway::VsCodeGateway,
        project: &str,
        id: &str,
    ) -> Result<HandoffPreview, NativeError> {
        let receipt = self.status(drafts, project, id)?;
        if !matches!(receipt.state.as_str(), "LOCAL_BRIEF_CREATED" | "PARTIAL") {
            return Err(err("HANDOFF_REFUSED"));
        }
        let view = vscode.view();
        if view.status != "AUTHORIZED" {
            return Err(err("VSCODE_UNAVAILABLE"));
        }
        let draft = drafts
            .get(project, &receipt.draft_id)
            .map_err(|_| err("DRAFT_UNAVAILABLE"))?;
        let content = markdown(&draft)?;
        Ok(HandoffPreview {
            schema_version: 1,
            workflow_id: id.into(),
            project_id: project.into(),
            draft_id: draft.draft_id,
            workspace: view.workspace.ok_or_else(|| err("VSCODE_UNAVAILABLE"))?,
            workspace_hash: view
                .workspace_hash
                .ok_or_else(|| err("VSCODE_UNAVAILABLE"))?,
            sha256: hash(content.as_bytes()),
            bytes: content.len(),
            markdown: content,
        })
    }
    pub async fn handoff(
        &self,
        drafts: &DraftStore,
        vscode: &crate::vscode_gateway::VsCodeGateway,
        project: &str,
        id: &str,
        digest: &str,
        workspace_hash: &str,
    ) -> Result<Receipt, NativeError> {
        let _action = self.action.lock().await;
        let mut receipt = self.status(drafts, project, id)?;
        if !matches!(receipt.state.as_str(), "LOCAL_BRIEF_CREATED" | "PARTIAL") {
            return Err(err("HANDOFF_REFUSED"));
        }
        let draft = drafts
            .get(project, &receipt.draft_id)
            .map_err(|_| err("DRAFT_UNAVAILABLE"))?;
        let content = markdown(&draft)?;
        if hash(content.as_bytes()) != digest
            || workspace_hash.len() != 64
            || !workspace_hash.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(err("HANDOFF_CHANGED"));
        }
        receipt.handoff_state = "PENDING".into();
        receipt.workspace_hash = Some(workspace_hash.into());
        receipt.updated_at_ms = drafts::now()?;
        self.update(&receipt)?;
        match vscode.call_brief(&content, digest, workspace_hash) {
            Ok(()) => {
                receipt.state = "COMPLETED".into();
                receipt.handoff_state = "VERIFIED".into();
                receipt.error_code = None;
            }
            Err(code) => {
                let uncertain = matches!(
                    code,
                    "VSCODE_TIMEOUT" | "VSCODE_TRANSPORT_FAILED" | "VSCODE_PROTOCOL_INVALID"
                );
                receipt.state = if uncertain {
                    "OUTCOME_UNCERTAIN"
                } else {
                    "PARTIAL"
                }
                .into();
                receipt.handoff_state = if uncertain { "UNCERTAIN" } else { "FAILED" }.into();
                receipt.error_code = Some(code.into());
            }
        }
        receipt.updated_at_ms = drafts::now()?;
        self.update(&receipt)?;
        Ok(receipt)
    }
    fn project_dir(&self, project: &str) -> Result<PathBuf, NativeError> {
        if !safe_project_id(project) || project == "default" {
            return Err(err("PROJECT_INVALID"));
        }
        drafts::prepare_root(&self.root)?;
        let dir = self.root.join(project);
        drafts::private_dir(&dir)?;
        Ok(dir)
    }
    fn path(&self, project: &str, id: &str) -> Result<PathBuf, NativeError> {
        if Uuid::parse_str(id).is_err() {
            return Err(err("WORKFLOW_ID_INVALID"));
        }
        Ok(self.project_dir(project)?.join(format!("{id}.json")))
    }
    fn read(&self, project: &str, id: &str) -> Result<Receipt, NativeError> {
        let path = self.path(project, id)?;
        let file = drafts::private_file(&path).map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
        if file.metadata().map_err(|_| err("RECEIPT_INVALID"))?.len() > MAX_RECEIPT {
            return Err(err("RECEIPT_INVALID"));
        }
        let mut bytes = Vec::new();
        file.take(MAX_RECEIPT + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| err("RECEIPT_INVALID"))?;
        let value: Receipt = serde_json::from_slice(&bytes).map_err(|_| err("RECEIPT_INVALID"))?;
        if value.schema_version != 1
            || value.workflow_id != id
            || value.project_id != project
            || value.draft_id != id
            || value.recipe != "github-to-local-brief-v1"
        {
            return Err(err("RECEIPT_INVALID"));
        }
        Ok(value)
    }
    fn reserve(&self, receipt: &Receipt) -> Result<(), NativeError> {
        let path = self.path(&receipt.project_id, &receipt.workflow_id)?;
        let dir = path.parent().ok_or_else(|| err("RECEIPT_UNAVAILABLE"))?;
        let mut count = 0usize;
        for entry in fs::read_dir(dir).map_err(|_| err("RECEIPT_UNAVAILABLE"))? {
            let entry = entry.map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
            if entry.file_name().to_string_lossy().ends_with(".json") {
                count += 1;
                if count >= MAX_RECEIPTS {
                    return Err(err("RECEIPT_LIMIT"));
                }
            }
        }
        let bytes = serde_json::to_vec(receipt).map_err(|_| err("RECEIPT_INVALID"))?;
        if bytes.len() > MAX_RECEIPT as usize {
            return Err(err("RECEIPT_INVALID"));
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(NOFOLLOW)
            .open(&path)
            .map_err(|_| err("WORKFLOW_ALREADY_ATTEMPTED"))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
        File::open(path.parent().ok_or_else(|| err("RECEIPT_UNAVAILABLE"))?)
            .and_then(|dir| dir.sync_all())
            .map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
        Ok(())
    }
    fn update(&self, receipt: &Receipt) -> Result<(), NativeError> {
        let path = self.path(&receipt.project_id, &receipt.workflow_id)?;
        let dir = path.parent().ok_or_else(|| err("RECEIPT_UNAVAILABLE"))?;
        let lock_path = dir.join(".lock");
        let lock = OpenOptions::new()
            .write(true)
            .create(true)
            .mode(0o600)
            .custom_flags(NOFOLLOW)
            .open(&lock_path)
            .map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
        let meta = lock.metadata().map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
        if !meta.is_file()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.nlink() != 1
            || meta.permissions().mode() & 0o777 != 0o600
        {
            return Err(err("RECEIPT_UNTRUSTED"));
        }
        if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX) } != 0 {
            return Err(err("RECEIPT_UNAVAILABLE"));
        }
        let before = self.read(&receipt.project_id, &receipt.workflow_id)?;
        if before.project_id != receipt.project_id
            || before.source_digest != receipt.source_digest
            || before.draft_id != receipt.draft_id
        {
            return Err(err("RECEIPT_CONFLICT"));
        }
        let bytes = serde_json::to_vec(receipt).map_err(|_| err("RECEIPT_INVALID"))?;
        if bytes.len() > MAX_RECEIPT as usize {
            return Err(err("RECEIPT_INVALID"));
        }
        let temporary = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .custom_flags(NOFOLLOW)
                .open(&temporary)
                .map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
            file.write_all(&bytes)
                .and_then(|_| file.sync_all())
                .map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
            fs::rename(&temporary, &path).map_err(|_| err("RECEIPT_UNAVAILABLE"))?;
            File::open(path.parent().ok_or_else(|| err("RECEIPT_UNAVAILABLE"))?)
                .and_then(|dir| dir.sync_all())
                .map_err(|_| err("RECEIPT_UNAVAILABLE"))
        })();
        let _ = fs::remove_file(&temporary);
        result
    }
}

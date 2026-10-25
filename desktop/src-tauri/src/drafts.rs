//! Private, Project-scoped local briefs. No backend mission or execution call.
use crate::{safe_project_id, NativeError};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::AsRawFd,
        unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt},
    },
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const MAX_FILE: u64 = 16_384;
const MAX_DRAFTS: usize = 200;
const NOFOLLOW: i32 = libc::O_NOFOLLOW | libc::O_CLOEXEC;

fn refusal(code: &'static str) -> NativeError {
    NativeError {
        kind: "LOCAL_DRAFT".into(),
        code: Some(code.into()),
        status: None,
        message: "Brouillon local indisponible ou conflit d'édition.".into(),
    }
}
fn io_error() -> NativeError {
    refusal("STORAGE_UNAVAILABLE")
}
fn now() -> Result<u64, NativeError> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| io_error())?
        .as_millis() as u64)
}
fn private_dir(path: &Path) -> Result<(), NativeError> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if !meta.is_dir()
                || meta.is_symlink()
                || meta.uid() != unsafe { libc::geteuid() }
                || meta.permissions().mode() & 0o777 != 0o700
            {
                return Err(refusal("UNTRUSTED_PATH"));
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::DirBuilder::new()
                .mode(0o700)
                .create(path)
                .map_err(|_| io_error())?;
            return private_dir(path);
        }
        Err(_) => return Err(io_error()),
    }
    Ok(())
}
fn prepare_root(root: &Path) -> Result<(), NativeError> {
    if !root.is_absolute() {
        return Err(refusal("UNTRUSTED_PATH"));
    }
    for ancestor in root
        .ancestors()
        .skip(1)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
    {
        match fs::symlink_metadata(ancestor) {
            Ok(meta)
                if meta.is_dir()
                    && !meta.is_symlink()
                    && (meta.uid() == unsafe { libc::geteuid() } || meta.uid() == 0) => {}
            Ok(_) => return Err(refusal("UNTRUSTED_PATH")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::DirBuilder::new()
                    .mode(0o700)
                    .create(ancestor)
                    .map_err(|_| io_error())?;
            }
            Err(_) => return Err(io_error()),
        }
    }
    private_dir(root)
}
fn private_file(path: &Path) -> Result<File, NativeError> {
    let meta = fs::symlink_metadata(path).map_err(|_| io_error())?;
    if !meta.is_file()
        || meta.is_symlink()
        || meta.uid() != unsafe { libc::geteuid() }
        || meta.nlink() != 1
        || meta.permissions().mode() & 0o777 != 0o600
    {
        return Err(refusal("UNTRUSTED_FILE"));
    }
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(NOFOLLOW)
        .open(path)
        .map_err(|_| io_error())?;
    let opened = file.metadata().map_err(|_| io_error())?;
    if !opened.is_file()
        || opened.uid() != unsafe { libc::geteuid() }
        || opened.nlink() != 1
        || opened.permissions().mode() & 0o777 != 0o600
        || opened.ino() != meta.ino()
    {
        return Err(refusal("UNTRUSTED_FILE"));
    }
    Ok(file)
}
fn present(path: &Path) -> Result<bool, NativeError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(io_error()),
    }
}
fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, NativeError> {
    let file = private_file(path)?;
    if file.metadata().map_err(|_| io_error())?.len() > MAX_FILE {
        return Err(refusal("OVERSIZED_RECORD"));
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| io_error())?;
    if bytes.len() as u64 > MAX_FILE {
        return Err(refusal("OVERSIZED_RECORD"));
    }
    serde_json::from_slice(&bytes).map_err(|_| refusal("INCOMPATIBLE_RECORD"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn input(project_id: &str) -> DraftInput {
        DraftInput {
            project_id: project_id.into(),
            title: "Titre".into(),
            objective: "Objectif vérifiable".into(),
            verification_criteria: "Résultat observé".into(),
        }
    }
    fn code<T>(value: Result<T, NativeError>) -> String {
        value.err().unwrap().code.unwrap()
    }

    #[test]
    fn round_trip_project_isolation_and_preference() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp
            .path()
            .join("fresh/.local/share/app/mission-workspace-v1");
        let store = DraftStore::new(root.clone());
        assert_eq!(store.preferred().unwrap(), None);
        store.set_preferred(Some("alpha".into())).unwrap();
        assert_eq!(
            DraftStore::new(root.clone())
                .preferred()
                .unwrap()
                .as_deref(),
            Some("alpha")
        );
        let draft = store.create(input("alpha")).unwrap();
        assert_eq!(store.list("alpha").unwrap(), vec![draft.clone()]);
        assert!(store.list("beta").unwrap().is_empty());
        assert!(store.get("beta", &draft.draft_id).is_err());
        let path = root
            .join("drafts/alpha")
            .join(format!("{}.json", draft.draft_id));
        assert_eq!(
            fs::metadata(&root).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let updated = store
            .update(DraftUpdate {
                project_id: "alpha".into(),
                draft_id: draft.draft_id.clone(),
                expected_revision: 1,
                title: "Titre modifié".into(),
                objective: draft.objective.clone(),
                verification_criteria: draft.verification_criteria.clone(),
            })
            .unwrap();
        assert_eq!(updated.revision, 2);
        assert_eq!(
            code(store.delete("alpha", &draft.draft_id, 1)),
            "DRAFT_CONFLICT"
        );
        assert_eq!(
            DraftStore::new(root).get("alpha", &draft.draft_id).unwrap(),
            updated
        );
        store.delete("alpha", &draft.draft_id, 2).unwrap();
        assert!(store.list("alpha").unwrap().is_empty());
    }

    #[test]
    fn rejects_paths_symlinks_bad_files_and_oversized_records() {
        let temp = tempfile::tempdir().unwrap();
        let store = DraftStore::new(temp.path().join("app"));
        assert_eq!(code(store.create(input("../escape"))), "INVALID_PROJECT_ID");
        assert_eq!(code(store.get("alpha", "../escape")), "INVALID_DRAFT_ID");
        let draft = store.create(input("alpha")).unwrap();
        let path = store
            .root
            .join("drafts/alpha")
            .join(format!("{}.json", draft.draft_id));
        fs::write(&path, "{").unwrap();
        assert_eq!(code(store.list("alpha")), "INCOMPATIBLE_RECORD");
        assert_eq!(
            code(store.update(DraftUpdate {
                project_id: "alpha".into(),
                draft_id: draft.draft_id.clone(),
                expected_revision: 1,
                title: "Modifié".into(),
                objective: "Objectif".into(),
                verification_criteria: "Critère".into()
            })),
            "INCOMPATIBLE_RECORD"
        );
        fs::write(&path, vec![b'x'; MAX_FILE as usize + 1]).unwrap();
        assert_eq!(
            code(store.get("alpha", &draft.draft_id)),
            "OVERSIZED_RECORD"
        );
        fs::remove_file(&path).unwrap();
        symlink(temp.path().join("outside"), &path).unwrap();
        assert_eq!(code(store.get("alpha", &draft.draft_id)), "UNTRUSTED_FILE");
        let foreign = DraftStore::new(temp.path().join("foreign"));
        symlink(&store.root, &foreign.root).unwrap();
        assert_eq!(code(foreign.preferred()), "UNTRUSTED_PATH");
    }

    #[test]
    fn interrupted_temporary_file_does_not_hide_saved_draft() {
        let temp = tempfile::tempdir().unwrap();
        let store = DraftStore::new(temp.path().join("app"));
        let draft = store.create(input("alpha")).unwrap();
        let dir = store.root.join("drafts/alpha");
        let temp_path = dir.join(format!(".{}.tmp", Uuid::new_v4()));
        fs::write(&temp_path, b"partial").unwrap();
        fs::set_permissions(&temp_path, fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(store.list("alpha").unwrap(), vec![draft]);
        assert!(temp_path.exists());
    }

    #[test]
    fn corrupt_preference_and_untrusted_permissions_are_not_overwritten() {
        let temp = tempfile::tempdir().unwrap();
        let store = DraftStore::new(temp.path().join("app"));
        store.set_preferred(Some("alpha".into())).unwrap();
        let preference = store.root.join("preferred-project.json");
        fs::write(&preference, b"{broken").unwrap();
        let before = fs::read(&preference).unwrap();
        assert_eq!(
            code(store.set_preferred(Some("beta".into()))),
            "INCOMPATIBLE_RECORD"
        );
        assert_eq!(fs::read(&preference).unwrap(), before);
        fs::set_permissions(&preference, fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(code(store.preferred()), "UNTRUSTED_FILE");
        fs::remove_file(&preference).unwrap();
        symlink(temp.path().join("other"), &preference).unwrap();
        assert_eq!(code(store.set_preferred(None)), "UNTRUSTED_FILE");
    }
}
fn atomic_write(path: &Path, value: &impl Serialize) -> Result<(), NativeError> {
    let bytes = serde_json::to_vec(value).map_err(|_| refusal("INCOMPATIBLE_RECORD"))?;
    if bytes.len() as u64 > MAX_FILE {
        return Err(refusal("OVERSIZED_RECORD"));
    }
    let parent = path.parent().ok_or_else(io_error)?;
    let temporary = parent.join(format!(".{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(NOFOLLOW)
            .open(&temporary)
            .map_err(|_| io_error())?;
        file.write_all(&bytes).map_err(|_| io_error())?;
        file.sync_all().map_err(|_| io_error())?;
        fs::rename(&temporary, path).map_err(|_| io_error())?;
        File::open(parent)
            .map_err(|_| io_error())?
            .sync_all()
            .map_err(|_| io_error())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
fn validate_text(title: &str, objective: &str, criteria: &str) -> Result<(), NativeError> {
    if title.trim().is_empty()
        || title.chars().count() > 120
        || objective.trim().is_empty()
        || objective.chars().count() > 4000
        || criteria.trim().is_empty()
        || criteria.chars().count() > 4000
        || title.contains('\0')
        || objective.contains('\0')
        || criteria.contains('\0')
    {
        return Err(refusal("INVALID_DRAFT"));
    }
    Ok(())
}
fn validate_id(id: &str) -> Result<(), NativeError> {
    if Uuid::parse_str(id).is_err() || id.len() != 36 {
        return Err(refusal("INVALID_DRAFT_ID"));
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Draft {
    pub schema_version: u8,
    pub draft_id: String,
    pub project_id: String,
    pub title: String,
    pub objective: String,
    pub verification_criteria: String,
    pub revision: u64,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DraftInput {
    pub project_id: String,
    pub title: String,
    pub objective: String,
    pub verification_criteria: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DraftUpdate {
    pub project_id: String,
    pub draft_id: String,
    pub expected_revision: u64,
    pub title: String,
    pub objective: String,
    pub verification_criteria: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Preference {
    schema_version: u8,
    project_id: Option<String>,
}

pub struct DraftStore {
    root: PathBuf,
}
impl DraftStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
    fn project_dir(&self, project_id: &str) -> Result<PathBuf, NativeError> {
        if !safe_project_id(project_id) {
            return Err(refusal("INVALID_PROJECT_ID"));
        }
        prepare_root(&self.root)?;
        let drafts = self.root.join("drafts");
        private_dir(&drafts)?;
        let project = drafts.join(project_id);
        private_dir(&project)?;
        Ok(project)
    }
    fn locked<T>(
        &self,
        dir: &Path,
        operation: impl FnOnce() -> Result<T, NativeError>,
    ) -> Result<T, NativeError> {
        let lock_path = dir.join(".lock");
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .mode(0o600)
            .custom_flags(NOFOLLOW)
            .open(&lock_path)
            .map_err(|_| io_error())?;
        let meta = file.metadata().map_err(|_| io_error())?;
        if !meta.is_file()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.nlink() != 1
            || meta.permissions().mode() & 0o777 != 0o600
        {
            return Err(refusal("UNTRUSTED_FILE"));
        }
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX) } != 0 {
            return Err(io_error());
        }
        operation()
    }
    fn path(dir: &Path, draft_id: &str) -> Result<PathBuf, NativeError> {
        validate_id(draft_id)?;
        Ok(dir.join(format!("{draft_id}.json")))
    }
    fn get_locked(dir: &Path, project_id: &str, draft_id: &str) -> Result<Draft, NativeError> {
        let draft: Draft = read_json(&Self::path(dir, draft_id)?)?;
        if draft.schema_version != 1
            || draft.project_id != project_id
            || draft.draft_id != draft_id
            || draft.revision == 0
            || draft.updated_at_ms < draft.created_at_ms
            || validate_text(&draft.title, &draft.objective, &draft.verification_criteria).is_err()
        {
            return Err(refusal("INCOMPATIBLE_RECORD"));
        }
        Ok(draft)
    }
    pub fn list(&self, project_id: &str) -> Result<Vec<Draft>, NativeError> {
        let dir = self.project_dir(project_id)?;
        self.locked(&dir, || {
            let mut items = Vec::new();
            for entry in fs::read_dir(&dir).map_err(|_| io_error())? {
                let entry = entry.map_err(|_| io_error())?;
                let name = entry
                    .file_name()
                    .into_string()
                    .map_err(|_| refusal("UNTRUSTED_FILE"))?;
                if name == ".lock" {
                    continue;
                }
                if name.starts_with('.') && name.ends_with(".tmp") {
                    validate_id(&name[1..name.len() - 4])?;
                    private_file(&entry.path())?;
                    continue;
                }
                if !name.ends_with(".json") {
                    return Err(refusal("UNTRUSTED_FILE"));
                }
                let id = &name[..name.len() - 5];
                items.push(Self::get_locked(&dir, project_id, id)?);
                if items.len() > MAX_DRAFTS {
                    return Err(refusal("DRAFT_LIMIT"));
                }
            }
            items.sort_by(|a, b| {
                b.updated_at_ms
                    .cmp(&a.updated_at_ms)
                    .then_with(|| a.draft_id.cmp(&b.draft_id))
            });
            Ok(items)
        })
    }
    pub fn get(&self, project_id: &str, draft_id: &str) -> Result<Draft, NativeError> {
        let dir = self.project_dir(project_id)?;
        self.locked(&dir, || Self::get_locked(&dir, project_id, draft_id))
    }
    pub fn create(&self, input: DraftInput) -> Result<Draft, NativeError> {
        validate_text(&input.title, &input.objective, &input.verification_criteria)?;
        let dir = self.project_dir(&input.project_id)?;
        self.locked(&dir, || {
            if fs::read_dir(&dir)
                .map_err(|_| io_error())?
                .filter_map(Result::ok)
                .filter(|e| e.file_name().to_string_lossy().ends_with(".json"))
                .count()
                >= MAX_DRAFTS
            {
                return Err(refusal("DRAFT_LIMIT"));
            }
            let stamp = now()?;
            let draft = Draft {
                schema_version: 1,
                draft_id: Uuid::new_v4().to_string(),
                project_id: input.project_id,
                title: input.title,
                objective: input.objective,
                verification_criteria: input.verification_criteria,
                revision: 1,
                created_at_ms: stamp,
                updated_at_ms: stamp,
            };
            let path = Self::path(&dir, &draft.draft_id)?;
            if present(&path)? {
                return Err(refusal("DRAFT_CONFLICT"));
            }
            atomic_write(&path, &draft)?;
            Ok(draft)
        })
    }
    pub fn update(&self, input: DraftUpdate) -> Result<Draft, NativeError> {
        validate_text(&input.title, &input.objective, &input.verification_criteria)?;
        let dir = self.project_dir(&input.project_id)?;
        self.locked(&dir, || {
            let mut draft = Self::get_locked(&dir, &input.project_id, &input.draft_id)?;
            if draft.revision != input.expected_revision {
                return Err(refusal("DRAFT_CONFLICT"));
            }
            draft.title = input.title;
            draft.objective = input.objective;
            draft.verification_criteria = input.verification_criteria;
            draft.revision = draft
                .revision
                .checked_add(1)
                .ok_or_else(|| refusal("DRAFT_CONFLICT"))?;
            draft.updated_at_ms = now()?.max(draft.created_at_ms);
            atomic_write(&Self::path(&dir, &draft.draft_id)?, &draft)?;
            Ok(draft)
        })
    }
    pub fn delete(
        &self,
        project_id: &str,
        draft_id: &str,
        expected_revision: u64,
    ) -> Result<(), NativeError> {
        let dir = self.project_dir(project_id)?;
        self.locked(&dir, || {
            let draft = Self::get_locked(&dir, project_id, draft_id)?;
            if draft.revision != expected_revision {
                return Err(refusal("DRAFT_CONFLICT"));
            }
            fs::remove_file(Self::path(&dir, draft_id)?).map_err(|_| io_error())?;
            File::open(&dir)
                .map_err(|_| io_error())?
                .sync_all()
                .map_err(|_| io_error())
        })
    }
    pub fn preferred(&self) -> Result<Option<String>, NativeError> {
        prepare_root(&self.root)?;
        self.locked(&self.root, || {
            let path = self.root.join("preferred-project.json");
            if !present(&path)? {
                return Ok(None);
            }
            let value: Preference = read_json(&path)?;
            if value.schema_version != 1
                || value
                    .project_id
                    .as_deref()
                    .is_some_and(|id| !safe_project_id(id))
            {
                return Err(refusal("INCOMPATIBLE_RECORD"));
            }
            Ok(value.project_id)
        })
    }
    pub fn set_preferred(&self, project_id: Option<String>) -> Result<(), NativeError> {
        if project_id.as_deref().is_some_and(|id| !safe_project_id(id)) {
            return Err(refusal("INVALID_PROJECT_ID"));
        }
        prepare_root(&self.root)?;
        self.locked(&self.root, || {
            let path = self.root.join("preferred-project.json");
            if present(&path)? {
                let prior: Preference = read_json(&path)?;
                if prior.schema_version != 1
                    || prior
                        .project_id
                        .as_deref()
                        .is_some_and(|id| !safe_project_id(id))
                {
                    return Err(refusal("INCOMPATIBLE_RECORD"));
                }
            }
            atomic_write(
                &path,
                &Preference {
                    schema_version: 1,
                    project_id,
                },
            )
        })
    }
}

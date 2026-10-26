//! Portable, bounded Project-scoped human workspace archive. No backend vault data.
use crate::{
    drafts::{self, Draft, DraftStore, NOFOLLOW},
    notes::{self, Note, NoteStore},
    safe_project_id, NativeError,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::AsRawFd,
        unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    },
    path::{Component, Path, PathBuf},
};
use uuid::Uuid;

const FORMAT: &str = "morgoth-personal-workspace";
pub const EXTENSION: &str = ".morgoth-workspace.json";
const MAX_ARCHIVE: u64 = 32 * 1024 * 1024;

fn err(code: &'static str) -> NativeError {
    NativeError {
        kind: "LOCAL_BACKUP".into(),
        code: Some(code.into()),
        status: None,
        message:
            "Sauvegarde indisponible ou incompatible ; aucune donnée existante n'a été remplacée."
                .into(),
    }
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn json<T: Serialize>(value: &T) -> Result<Vec<u8>, NativeError> {
    serde_json::to_vec(value).map_err(|_| err("INVALID_ARCHIVE"))
}
fn valid_digest(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub format: String,
    pub schema_version: u8,
    pub project_id: String,
    pub exported_at_ms: u64,
    pub source: String,
    pub notes_count: usize,
    pub drafts_count: usize,
    pub excludes_backend_knowledge: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry<T> {
    record: T,
    sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Payload {
    manifest: Manifest,
    notes: Vec<Entry<Note>>,
    drafts: Vec<Entry<Draft>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Archive {
    payload: Payload,
    sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BackupReceipt {
    pub project_id: String,
    pub schema_version: u8,
    pub exported_at_ms: u64,
    pub notes_count: usize,
    pub drafts_count: usize,
    pub sha256: String,
    pub recovery_required: bool,
}
fn receipt(archive: &Archive, recovery_required: bool) -> BackupReceipt {
    BackupReceipt {
        project_id: archive.payload.manifest.project_id.clone(),
        schema_version: 1,
        exported_at_ms: archive.payload.manifest.exported_at_ms,
        notes_count: archive.payload.notes.len(),
        drafts_count: archive.payload.drafts.len(),
        sha256: archive.sha256.clone(),
        recovery_required,
    }
}
fn make(project: &str, notes: &NoteStore, drafts: &DraftStore) -> Result<Archive, NativeError> {
    if !safe_project_id(project) || project == "default" {
        return Err(err("INVALID_PROJECT"));
    }
    let mut notes = notes.list(project)?;
    let mut drafts = drafts.list(project)?;
    notes.sort_by(|a, b| a.note_id.cmp(&b.note_id));
    drafts.sort_by(|a, b| a.draft_id.cmp(&b.draft_id));
    let notes = notes
        .into_iter()
        .map(|record| {
            notes::validate_restored(&record, project)?;
            Ok(Entry {
                sha256: hash(&json(&record)?),
                record,
            })
        })
        .collect::<Result<Vec<_>, NativeError>>()?;
    let drafts = drafts
        .into_iter()
        .map(|record| {
            drafts::validate_restored(&record, project)?;
            Ok(Entry {
                sha256: hash(&json(&record)?),
                record,
            })
        })
        .collect::<Result<Vec<_>, NativeError>>()?;
    let payload = Payload {
        manifest: Manifest {
            format: FORMAT.into(),
            schema_version: 1,
            project_id: project.into(),
            exported_at_ms: drafts::now()?,
            source: "HUMAN_LOCAL".into(),
            notes_count: notes.len(),
            drafts_count: drafts.len(),
            excludes_backend_knowledge: true,
        },
        notes,
        drafts,
    };
    let sha256 = hash(&json(&payload)?);
    Ok(Archive { payload, sha256 })
}
fn validate(archive: &Archive, project: &str) -> Result<(), NativeError> {
    let p = &archive.payload;
    if !safe_project_id(project)
        || project == "default"
        || p.manifest.format != FORMAT
        || p.manifest.schema_version != 1
        || p.manifest.project_id != project
        || p.manifest.exported_at_ms == 0
        || p.manifest.source != "HUMAN_LOCAL"
        || !p.manifest.excludes_backend_knowledge
        || p.manifest.notes_count != p.notes.len()
        || p.manifest.drafts_count != p.drafts.len()
        || p.notes.len() > 500
        || p.drafts.len() > 200
        || !valid_digest(&archive.sha256)
        || hash(&json(p)?) != archive.sha256
    {
        return Err(err("INVALID_ARCHIVE"));
    }
    let mut note_ids = HashSet::new();
    for entry in &p.notes {
        notes::validate_restored(&entry.record, project).map_err(|_| err("INVALID_ARCHIVE"))?;
        if !note_ids.insert(&entry.record.note_id)
            || !valid_digest(&entry.sha256)
            || hash(&json(&entry.record)?) != entry.sha256
        {
            return Err(err("INVALID_ARCHIVE"));
        }
    }
    let mut draft_ids = HashSet::new();
    for entry in &p.drafts {
        drafts::validate_restored(&entry.record, project).map_err(|_| err("INVALID_ARCHIVE"))?;
        if !draft_ids.insert(&entry.record.draft_id)
            || !valid_digest(&entry.sha256)
            || hash(&json(&entry.record)?) != entry.sha256
        {
            return Err(err("INVALID_ARCHIVE"));
        }
    }
    Ok(())
}
fn check_path(path: &Path, app_data: &Path) -> Result<(), NativeError> {
    if !path.is_absolute()
        || !path
            .components()
            .all(|c| matches!(c, Component::RootDir | Component::Normal(_)))
        || !path
            .file_name()
            .is_some_and(|n| n.to_string_lossy().ends_with(EXTENSION))
    {
        return Err(err("UNTRUSTED_PATH"));
    }
    let parent = path.parent().ok_or_else(|| err("UNTRUSTED_PATH"))?;
    for part in parent.ancestors() {
        let meta = fs::symlink_metadata(part).map_err(|_| err("DESTINATION_UNAVAILABLE"))?;
        if !meta.is_dir() || meta.is_symlink() {
            return Err(err("UNTRUSTED_PATH"));
        }
    }
    let canonical = fs::canonicalize(parent).map_err(|_| err("DESTINATION_UNAVAILABLE"))?;
    let app_data = fs::canonicalize(app_data).map_err(|_| err("DESTINATION_UNAVAILABLE"))?;
    if canonical.starts_with(app_data) {
        return Err(err("INSIDE_APP_DATA"));
    }
    Ok(())
}
fn read_archive(path: &Path, app_data: &Path, project: &str) -> Result<Archive, NativeError> {
    check_path(path, app_data)?;
    let meta = fs::symlink_metadata(path).map_err(|_| err("ARCHIVE_UNAVAILABLE"))?;
    if !meta.is_file() || meta.is_symlink() || meta.len() > MAX_ARCHIVE || meta.len() == 0 {
        return Err(err("INVALID_ARCHIVE"));
    }
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(NOFOLLOW)
        .open(path)
        .map_err(|_| err("ARCHIVE_UNAVAILABLE"))?;
    let opened = file.metadata().map_err(|_| err("ARCHIVE_UNAVAILABLE"))?;
    if !opened.is_file() || opened.ino() != meta.ino() || opened.len() != meta.len() {
        return Err(err("UNTRUSTED_PATH"));
    }
    let mut bytes = Vec::new();
    file.take(MAX_ARCHIVE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| err("ARCHIVE_UNAVAILABLE"))?;
    if bytes.len() as u64 > MAX_ARCHIVE {
        return Err(err("OVERSIZED_ARCHIVE"));
    }
    let archive: Archive = serde_json::from_slice(&bytes).map_err(|_| err("INVALID_ARCHIVE"))?;
    validate(&archive, project)?;
    Ok(archive)
}
fn publish_new(path: &Path, bytes: &[u8]) -> Result<(), NativeError> {
    let dir = path.parent().ok_or_else(|| err("UNTRUSTED_PATH"))?;
    if fs::symlink_metadata(path).is_ok() {
        return Err(err("DESTINATION_EXISTS"));
    }
    let temp = dir.join(format!(".morgoth-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut f = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(NOFOLLOW)
            .open(&temp)
            .map_err(|_| err("DESTINATION_UNAVAILABLE"))?;
        f.write_all(bytes)
            .map_err(|_| err("DESTINATION_UNAVAILABLE"))?;
        f.sync_all().map_err(|_| err("DESTINATION_UNAVAILABLE"))?;
        fs::hard_link(&temp, path).map_err(|_| err("DESTINATION_EXISTS_OR_UNAVAILABLE"))?;
        File::open(dir)
            .and_then(|d| d.sync_all())
            .map_err(|_| err("DESTINATION_UNAVAILABLE"))
    })();
    let _ = fs::remove_file(temp);
    result
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    schema_version: u8,
    project_id: String,
    archive_sha256: String,
}
pub struct BackupStore {
    pub notes: NoteStore,
    pub drafts: DraftStore,
    pub state_root: PathBuf,
    pub app_data: PathBuf,
}
impl BackupStore {
    fn exclusive(&self, project: &str) -> Result<File, NativeError> {
        drafts::prepare_root(&self.state_root)?;
        let path = self.state_root.join(format!("{project}.lock"));
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .mode(0o600)
            .custom_flags(NOFOLLOW)
            .open(&path)
            .map_err(|_| err("RECOVERY_BLOCKED"))?;
        let meta = file.metadata().map_err(|_| err("RECOVERY_BLOCKED"))?;
        if !meta.is_file()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.nlink() != 1
            || meta.permissions().mode() & 0o777 != 0o600
        {
            return Err(err("RECOVERY_BLOCKED"));
        }
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX) } != 0 {
            return Err(err("RECOVERY_BLOCKED"));
        }
        Ok(file)
    }
    fn journal(&self, project: &str) -> Result<PathBuf, NativeError> {
        if !safe_project_id(project) || project == "default" {
            return Err(err("INVALID_PROJECT"));
        }
        drafts::prepare_root(&self.state_root)?;
        Ok(self.state_root.join(format!("{project}.restore.json")))
    }
    pub fn counts(&self, project: &str) -> Result<(usize, usize), NativeError> {
        Ok((
            self.notes.list(project)?.len(),
            self.drafts.list(project)?.len(),
        ))
    }
    pub fn export(&self, project: &str, destination: &Path) -> Result<BackupReceipt, NativeError> {
        if !safe_project_id(project) || project == "default" {
            return Err(err("INVALID_PROJECT"));
        }
        let _lock = self.exclusive(project)?;
        if drafts::present(&self.journal(project)?)? {
            return Err(err("RECOVERY_BLOCKED"));
        }
        check_path(destination, &self.app_data)?;
        let archive = make(project, &self.notes, &self.drafts)?;
        let bytes = json(&archive)?;
        if bytes.len() as u64 > MAX_ARCHIVE {
            return Err(err("OVERSIZED_ARCHIVE"));
        }
        publish_new(destination, &bytes)?;
        Ok(receipt(&archive, false))
    }
    pub fn preview(&self, project: &str, source: &Path) -> Result<BackupReceipt, NativeError> {
        if !safe_project_id(project) || project == "default" {
            return Err(err("INVALID_PROJECT"));
        }
        let _lock = self.exclusive(project)?;
        let archive = read_archive(source, &self.app_data, project)?;
        let journal = self.journal(project)?;
        let recovery_required = if drafts::present(&journal)? {
            let file = drafts::private_file(&journal)?;
            if file.metadata().map_err(|_| err("RECOVERY_BLOCKED"))?.len() > 512 {
                return Err(err("RECOVERY_BLOCKED"));
            }
            let j: Journal = serde_json::from_reader(file).map_err(|_| err("RECOVERY_BLOCKED"))?;
            if j.schema_version != 1
                || j.project_id != project
                || j.archive_sha256 != archive.sha256
            {
                return Err(err("RECOVERY_BLOCKED"));
            }
            true
        } else {
            false
        };
        if !recovery_required && self.counts(project)? != (0, 0) {
            return Err(err("TARGET_NOT_EMPTY"));
        }
        if recovery_required {
            self.check_partial(&archive)?;
        }
        Ok(receipt(&archive, recovery_required))
    }
    fn check_partial(&self, archive: &Archive) -> Result<(), NativeError> {
        let project = &archive.payload.manifest.project_id;
        let notes = self.notes.list(project)?;
        let drafts = self.drafts.list(project)?;
        if notes
            .iter()
            .any(|n| !archive.payload.notes.iter().any(|e| e.record == *n))
            || drafts
                .iter()
                .any(|d| !archive.payload.drafts.iter().any(|e| e.record == *d))
        {
            return Err(err("RECOVERY_CONFLICT"));
        }
        Ok(())
    }
    pub fn restore(
        &self,
        project: &str,
        source: &Path,
        expected_digest: &str,
    ) -> Result<BackupReceipt, NativeError> {
        if !safe_project_id(project) || project == "default" {
            return Err(err("INVALID_PROJECT"));
        }
        let _lock = self.exclusive(project)?;
        let archive = read_archive(source, &self.app_data, project)?;
        if archive.sha256 != expected_digest {
            return Err(err("ARCHIVE_CHANGED"));
        }
        let journal = self.journal(project)?;
        let recovery = drafts::present(&journal)?;
        if recovery {
            let file = drafts::private_file(&journal)?;
            if file.metadata().map_err(|_| err("RECOVERY_BLOCKED"))?.len() > 512 {
                return Err(err("RECOVERY_BLOCKED"));
            }
            let j: Journal = serde_json::from_reader(file).map_err(|_| err("RECOVERY_BLOCKED"))?;
            if j.schema_version != 1
                || j.project_id != project
                || j.archive_sha256 != expected_digest
            {
                return Err(err("RECOVERY_BLOCKED"));
            }
            self.check_partial(&archive)?;
        } else {
            if self.counts(project)? != (0, 0) {
                return Err(err("TARGET_NOT_EMPTY"));
            }
            publish_new(
                &journal,
                &json(&Journal {
                    schema_version: 1,
                    project_id: project.into(),
                    archive_sha256: expected_digest.into(),
                })?,
            )?;
        }
        let existing_notes: HashSet<String> = self
            .notes
            .list(project)?
            .into_iter()
            .map(|n| n.note_id)
            .collect();
        let existing_drafts: HashSet<String> = self
            .drafts
            .list(project)?
            .into_iter()
            .map(|d| d.draft_id)
            .collect();
        for entry in &archive.payload.notes {
            if !existing_notes.contains(&entry.record.note_id) {
                self.notes.restore_record(&entry.record)?;
            }
        }
        for entry in &archive.payload.drafts {
            if !existing_drafts.contains(&entry.record.draft_id) {
                self.drafts.restore_record(&entry.record)?;
            }
        }
        self.check_partial(&archive)?;
        fs::remove_file(&journal).map_err(|_| err("RECOVERY_INCOMPLETE"))?;
        File::open(&self.state_root)
            .and_then(|d| d.sync_all())
            .map_err(|_| err("RECOVERY_INCOMPLETE"))?;
        Ok(receipt(&archive, recovery))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        drafts::{DraftInput, DraftUpdate},
        notes::{NoteInput, NoteUpdate},
    };
    use std::os::unix::fs::symlink;
    fn store(root: &Path) -> BackupStore {
        let data = root.join("application");
        BackupStore {
            notes: NoteStore::new(data.join("knowledge-v1")),
            drafts: DraftStore::new(data.join("mission-workspace-v1")),
            state_root: data.join("workspace-backup-v1"),
            app_data: data,
        }
    }
    fn code<T>(result: Result<T, NativeError>) -> String {
        result.err().unwrap().code.unwrap()
    }
    fn fixture(store: &BackupStore) -> (Vec<Note>, Vec<Draft>) {
        let first = store
            .notes
            .create(NoteInput {
                project_id: "alpha".into(),
                title: "Été à Lyon".into(),
                collection: "Journal".into(),
                markdown: "# Été\nÉléments spéciaux: < & \" œ".into(),
            })
            .unwrap();
        let second = store
            .notes
            .create(NoteInput {
                project_id: "alpha".into(),
                title: "Beta".into(),
                collection: "Recherche".into(),
                markdown: format!(
                    "Voir [[{}|Été]] et [[00000000-0000-4000-8000-000000000000|Lien brisé]].",
                    first.note_id
                ),
            })
            .unwrap();
        let third = store
            .notes
            .create(NoteInput {
                project_id: "alpha".into(),
                title: "Gamma".into(),
                collection: "Recherche".into(),
                markdown: "Sans lien".into(),
            })
            .unwrap();
        let third = store
            .notes
            .update(NoteUpdate {
                project_id: "alpha".into(),
                note_id: third.note_id,
                expected_revision: 1,
                title: "Gamma".into(),
                collection: "Recherche".into(),
                markdown: "Sans lien, révisée".into(),
            })
            .unwrap();
        let d1 = store
            .drafts
            .create(DraftInput {
                project_id: "alpha".into(),
                title: "Mission 1".into(),
                objective: "Résoudre l'objectif.".into(),
                verification_criteria: "Résultat vérifié.".into(),
            })
            .unwrap();
        let d2 = store
            .drafts
            .create(DraftInput {
                project_id: "alpha".into(),
                title: "Mission 2".into(),
                objective: "Vérifier les références.".into(),
                verification_criteria: "Deux sources.".into(),
            })
            .unwrap();
        let d2 = store
            .drafts
            .update(DraftUpdate {
                project_id: "alpha".into(),
                draft_id: d2.draft_id,
                expected_revision: 1,
                title: "Mission 2".into(),
                objective: "Vérifier les références révisées.".into(),
                verification_criteria: "Deux sources.".into(),
            })
            .unwrap();
        (vec![first, second, third], vec![d1, d2])
    }
    #[test]
    fn round_trip_fresh_install_preserves_records_and_links() {
        let temp = tempfile::tempdir().unwrap();
        let source = store(&temp.path().join("source"));
        let (notes, drafts) = fixture(&source);
        let path = temp.path().join(format!("portable{EXTENSION}"));
        let receipt = source.export("alpha", &path).unwrap();
        assert_eq!((receipt.notes_count, receipt.drafts_count), (3, 2));
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let target = store(&temp.path().join("new-machine"));
        assert_eq!(
            target.preview("alpha", &path).unwrap().sha256,
            receipt.sha256
        );
        target.restore("alpha", &path, &receipt.sha256).unwrap();
        let reopened = store(&temp.path().join("new-machine"));
        for note in &notes {
            assert_eq!(reopened.notes.get("alpha", &note.note_id).unwrap(), *note);
        }
        for draft in &drafts {
            assert_eq!(
                reopened.drafts.get("alpha", &draft.draft_id).unwrap(),
                *draft
            );
        }
        assert!(reopened.notes.get("beta", &notes[0].note_id).is_err());
        assert!(notes[1]
            .markdown
            .contains(&format!("[[{}|Été]]", notes[0].note_id)));
        assert_eq!(
            code(reopened.restore("alpha", &path, &receipt.sha256)),
            "TARGET_NOT_EMPTY"
        );
        assert_eq!(code(target.preview("beta", &path)), "INVALID_ARCHIVE");
    }
    #[test]
    fn malformed_hash_duplicate_version_and_path_refused_before_writes() {
        let temp = tempfile::tempdir().unwrap();
        let source = store(&temp.path().join("source"));
        fixture(&source);
        let original = temp.path().join(format!("original{EXTENSION}"));
        source.export("alpha", &original).unwrap();
        let target = store(&temp.path().join("target"));
        let raw: serde_json::Value = serde_json::from_slice(&fs::read(&original).unwrap()).unwrap();
        for (index, change) in ["version", "hash", "duplicate", "record", "truncated"]
            .iter()
            .enumerate()
        {
            let mut value = raw.clone();
            match *change {
                "version" => value["payload"]["manifest"]["schema_version"] = 2.into(),
                "hash" => value["sha256"] = "0".repeat(64).into(),
                "duplicate" => {
                    let duplicate = value["payload"]["notes"][0].clone();
                    value["payload"]["notes"]
                        .as_array_mut()
                        .unwrap()
                        .push(duplicate);
                }
                "record" => value["payload"]["notes"][0]["record"]["project_id"] = "beta".into(),
                _ => {}
            }
            let path = temp.path().join(format!("bad-{index}{EXTENSION}"));
            if *change == "truncated" {
                fs::write(&path, b"{").unwrap();
            } else {
                fs::write(&path, json(&value).unwrap()).unwrap();
            }
            assert_eq!(code(target.preview("alpha", &path)), "INVALID_ARCHIVE");
            assert_eq!(target.counts("alpha").unwrap(), (0, 0));
        }
        assert_eq!(
            code(source.export("alpha", &original)),
            "DESTINATION_EXISTS"
        );
        assert_eq!(
            code(target.preview("../escape", &original)),
            "INVALID_PROJECT"
        );
        let link = temp.path().join(format!("linked{EXTENSION}"));
        symlink(&original, &link).unwrap();
        assert_eq!(code(target.preview("alpha", &link)), "INVALID_ARCHIVE");
        let huge = temp.path().join(format!("huge{EXTENSION}"));
        let f = File::create(&huge).unwrap();
        f.set_len(MAX_ARCHIVE + 1).unwrap();
        assert_eq!(code(target.preview("alpha", &huge)), "INVALID_ARCHIVE");
        let inside = target.app_data.join(format!("inside{EXTENSION}"));
        fs::create_dir_all(&target.app_data).unwrap();
        assert_eq!(code(target.export("alpha", &inside)), "INSIDE_APP_DATA");
        let noncanonical_app_data = target.app_data.join("..").join("application");
        assert_eq!(
            code(check_path(&inside, &noncanonical_app_data)),
            "INSIDE_APP_DATA"
        );
        let parent_link = temp.path().join("directory-link");
        symlink(temp.path(), &parent_link).unwrap();
        assert_eq!(
            code(source.export("alpha", &parent_link.join(format!("unsafe{EXTENSION}")))),
            "UNTRUSTED_PATH"
        );
        let no_write = temp.path().join("read-only");
        fs::create_dir(&no_write).unwrap();
        fs::set_permissions(&no_write, fs::Permissions::from_mode(0o500)).unwrap();
        assert_eq!(
            code(source.export("alpha", &no_write.join(format!("blocked{EXTENSION}")))),
            "DESTINATION_UNAVAILABLE"
        );
        fs::set_permissions(&no_write, fs::Permissions::from_mode(0o700)).unwrap();
        let archive = read_archive(&original, &source.app_data, "alpha").unwrap();
        let duplicate_key = temp.path().join(format!("duplicate-key{EXTENSION}"));
        fs::write(
            &duplicate_key,
            format!(
                "{{\"payload\":{},\"sha256\":\"{}\",\"sha256\":\"{}\"}}",
                serde_json::to_string(&archive.payload).unwrap(),
                archive.sha256,
                archive.sha256
            ),
        )
        .unwrap();
        assert_eq!(
            code(target.preview("alpha", &duplicate_key)),
            "INVALID_ARCHIVE"
        );
    }
    #[test]
    fn record_digest_duplicate_id_and_existing_target_are_independent_refusals() {
        let temp = tempfile::tempdir().unwrap();
        let source = store(&temp.path().join("source"));
        fixture(&source);
        let original = temp.path().join(format!("original{EXTENSION}"));
        source.export("alpha", &original).unwrap();
        let target = store(&temp.path().join("target"));
        let mut invalid = read_archive(&original, &source.app_data, "alpha").unwrap();
        invalid.payload.notes[0].sha256 = "0".repeat(64);
        invalid.sha256 = hash(&json(&invalid.payload).unwrap());
        let bad_hash = temp.path().join(format!("bad-record{EXTENSION}"));
        fs::write(&bad_hash, json(&invalid).unwrap()).unwrap();
        assert_eq!(code(target.preview("alpha", &bad_hash)), "INVALID_ARCHIVE");
        let mut duplicate = read_archive(&original, &source.app_data, "alpha").unwrap();
        duplicate
            .payload
            .notes
            .push(duplicate.payload.notes[0].clone());
        duplicate.payload.manifest.notes_count += 1;
        duplicate.sha256 = hash(&json(&duplicate.payload).unwrap());
        let bad_id = temp.path().join(format!("duplicate-id{EXTENSION}"));
        fs::write(&bad_id, json(&duplicate).unwrap()).unwrap();
        assert_eq!(code(target.preview("alpha", &bad_id)), "INVALID_ARCHIVE");
        target
            .notes
            .create(NoteInput {
                project_id: "alpha".into(),
                title: "Existant".into(),
                collection: "Local".into(),
                markdown: "À conserver".into(),
            })
            .unwrap();
        assert_eq!(code(target.preview("alpha", &original)), "TARGET_NOT_EMPTY");
        assert_eq!(target.counts("alpha").unwrap(), (1, 0));
    }
    #[test]
    fn interrupted_restore_recovers_only_exact_same_archive() {
        let temp = tempfile::tempdir().unwrap();
        let source = store(&temp.path().join("source"));
        fixture(&source);
        let archive_path = temp.path().join(format!("portable{EXTENSION}"));
        let receipt = source.export("alpha", &archive_path).unwrap();
        let archive = read_archive(&archive_path, &source.app_data, "alpha").unwrap();
        let target = store(&temp.path().join("target"));
        let journal = target.journal("alpha").unwrap();
        publish_new(
            &journal,
            &json(&Journal {
                schema_version: 1,
                project_id: "alpha".into(),
                archive_sha256: receipt.sha256.clone(),
            })
            .unwrap(),
        )
        .unwrap();
        target
            .notes
            .restore_record(&archive.payload.notes[0].record)
            .unwrap();
        let incomplete = temp.path().join(format!("incomplete{EXTENSION}"));
        assert_eq!(
            code(target.export("alpha", &incomplete)),
            "RECOVERY_BLOCKED"
        );
        assert!(
            target
                .preview("alpha", &archive_path)
                .unwrap()
                .recovery_required
        );
        let other = "f".repeat(64);
        assert_eq!(
            code(target.restore("alpha", &archive_path, &other)),
            "ARCHIVE_CHANGED"
        );
        assert_eq!(target.counts("alpha").unwrap(), (1, 0));
        target
            .restore("alpha", &archive_path, &receipt.sha256)
            .unwrap();
        assert_eq!(target.counts("alpha").unwrap(), (3, 2));
        assert!(!drafts::present(&journal).unwrap());
    }
}

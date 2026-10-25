//! Project-scoped human Markdown notes. The WebView never supplies paths.
use crate::{
    drafts::{now, prepare_root, present, private_dir, private_file, NOFOLLOW},
    safe_project_id, NativeError,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::AsRawFd,
        unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    },
    path::{Path, PathBuf},
};
use uuid::Uuid;

const MAX_FILE: u64 = 40_960;
const MAX_NOTES: usize = 500;
const MAX_TITLE: usize = 160;
const MAX_BODY: usize = 32_768;
const MAX_COLLECTION: usize = 48;
const HEADER: &str = "<!-- morgoth-note-v1 ";

fn refusal(code: &'static str) -> NativeError {
    NativeError {
        kind: "LOCAL_NOTE".into(),
        code: Some(code.into()),
        status: None,
        message: "Note locale indisponible ou conflit d'édition.".into(),
    }
}
fn io_error() -> NativeError {
    refusal("STORAGE_UNAVAILABLE")
}
fn valid_id(id: &str) -> bool {
    Uuid::parse_str(id).is_ok_and(|value| value.to_string() == id)
}
fn valid_text(title: &str, body: &str, collection: &str) -> bool {
    !title.trim().is_empty()
        && title.chars().count() <= MAX_TITLE
        && !title.contains(['\0', '\n', '\r'])
        && body.len() <= MAX_BODY
        && !body.contains('\0')
        && !collection.trim().is_empty()
        && collection.chars().count() <= MAX_COLLECTION
        && collection
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Note {
    pub schema_version: u8,
    pub note_id: String,
    pub project_id: String,
    pub title: String,
    pub collection: String,
    pub markdown: String,
    pub revision: u64,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub provenance: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NoteInput {
    pub project_id: String,
    pub title: String,
    pub collection: String,
    pub markdown: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NoteUpdate {
    pub project_id: String,
    pub note_id: String,
    pub expected_revision: u64,
    pub title: String,
    pub collection: String,
    pub markdown: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Metadata {
    schema_version: u8,
    note_id: String,
    project_id: String,
    title: String,
    collection: String,
    revision: u64,
    created_at_ms: u64,
    updated_at_ms: u64,
    provenance: String,
}
impl From<&Note> for Metadata {
    fn from(note: &Note) -> Self {
        Self {
            schema_version: note.schema_version,
            note_id: note.note_id.clone(),
            project_id: note.project_id.clone(),
            title: note.title.clone(),
            collection: note.collection.clone(),
            revision: note.revision,
            created_at_ms: note.created_at_ms,
            updated_at_ms: note.updated_at_ms,
            provenance: note.provenance.clone(),
        }
    }
}

fn encode(note: &Note) -> Result<Vec<u8>, NativeError> {
    // Keep the metadata inside one Markdown HTML comment even when a title
    // contains the comment terminator. JSON decodes the escape transparently.
    let meta = serde_json::to_string(&Metadata::from(note))
        .map_err(|_| refusal("INCOMPATIBLE_RECORD"))?
        .replace("-->", "--\\u003e");
    let bytes = format!("{HEADER}{meta} -->\n{}", note.markdown).into_bytes();
    if bytes.len() as u64 > MAX_FILE {
        return Err(refusal("OVERSIZED_RECORD"));
    }
    Ok(bytes)
}
fn decode(bytes: &[u8], project: &str, id: &str) -> Result<Note, NativeError> {
    let text = std::str::from_utf8(bytes).map_err(|_| refusal("INCOMPATIBLE_RECORD"))?;
    let (line, body) = text
        .split_once('\n')
        .ok_or_else(|| refusal("INCOMPATIBLE_RECORD"))?;
    let json = line
        .strip_prefix(HEADER)
        .and_then(|line| line.strip_suffix(" -->"))
        .ok_or_else(|| refusal("INCOMPATIBLE_RECORD"))?;
    let meta: Metadata = serde_json::from_str(json).map_err(|_| refusal("INCOMPATIBLE_RECORD"))?;
    if meta.schema_version != 1
        || meta.note_id != id
        || meta.project_id != project
        || meta.revision == 0
        || meta.updated_at_ms < meta.created_at_ms
        || meta.provenance != "HUMAN_LOCAL"
        || !valid_text(&meta.title, body, &meta.collection)
    {
        return Err(refusal("INCOMPATIBLE_RECORD"));
    }
    Ok(Note {
        schema_version: 1,
        note_id: meta.note_id,
        project_id: meta.project_id,
        title: meta.title,
        collection: meta.collection,
        markdown: body.into(),
        revision: meta.revision,
        created_at_ms: meta.created_at_ms,
        updated_at_ms: meta.updated_at_ms,
        provenance: meta.provenance,
    })
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), NativeError> {
    let dir = path.parent().ok_or_else(io_error)?;
    let temp = dir.join(format!(".{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(NOFOLLOW)
            .open(&temp)
            .map_err(|_| io_error())?;
        file.write_all(bytes).map_err(|_| io_error())?;
        file.sync_all().map_err(|_| io_error())?;
        fs::rename(&temp, path).map_err(|_| io_error())?;
        File::open(dir)
            .map_err(|_| io_error())?
            .sync_all()
            .map_err(|_| io_error())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

pub struct NoteStore {
    root: PathBuf,
}
impl NoteStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
    fn dir(&self, project: &str) -> Result<PathBuf, NativeError> {
        if !safe_project_id(project) {
            return Err(refusal("INVALID_PROJECT_ID"));
        }
        prepare_root(&self.root)?;
        let notes = self.root.join("notes");
        private_dir(&notes)?;
        let dir = notes.join(project);
        private_dir(&dir)?;
        Ok(dir)
    }
    fn locked<T>(
        &self,
        dir: &Path,
        action: impl FnOnce() -> Result<T, NativeError>,
    ) -> Result<T, NativeError> {
        let path = dir.join(".lock");
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .mode(0o600)
            .custom_flags(NOFOLLOW)
            .open(path)
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
        action()
    }
    fn path(dir: &Path, id: &str) -> Result<PathBuf, NativeError> {
        if !valid_id(id) {
            return Err(refusal("INVALID_NOTE_ID"));
        }
        Ok(dir.join(format!("{id}.md")))
    }
    fn get_locked(dir: &Path, project: &str, id: &str) -> Result<Note, NativeError> {
        let file = private_file(&Self::path(dir, id)?)?;
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
        decode(&bytes, project, id)
    }
    pub fn list(&self, project: &str) -> Result<Vec<Note>, NativeError> {
        let dir = self.dir(project)?;
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
                    let id = &name[1..name.len() - 4];
                    if !valid_id(id) {
                        return Err(refusal("UNTRUSTED_FILE"));
                    }
                    private_file(&entry.path())?;
                    continue;
                }
                let id = name
                    .strip_suffix(".md")
                    .ok_or_else(|| refusal("UNTRUSTED_FILE"))?;
                items.push(Self::get_locked(&dir, project, id)?);
                if items.len() > MAX_NOTES {
                    return Err(refusal("NOTE_LIMIT"));
                }
            }
            items.sort_by(|a, b| {
                b.updated_at_ms
                    .cmp(&a.updated_at_ms)
                    .then_with(|| a.note_id.cmp(&b.note_id))
            });
            Ok(items)
        })
    }
    pub fn get(&self, project: &str, id: &str) -> Result<Note, NativeError> {
        let dir = self.dir(project)?;
        self.locked(&dir, || Self::get_locked(&dir, project, id))
    }
    pub fn create(&self, input: NoteInput) -> Result<Note, NativeError> {
        if !valid_text(&input.title, &input.markdown, &input.collection) {
            return Err(refusal("INVALID_NOTE"));
        }
        let dir = self.dir(&input.project_id)?;
        self.locked(&dir, || {
            let mut count = 0;
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
                    let id = &name[1..name.len() - 4];
                    if !valid_id(id) {
                        return Err(refusal("UNTRUSTED_FILE"));
                    }
                    private_file(&entry.path())?;
                    continue;
                }
                let id = name
                    .strip_suffix(".md")
                    .ok_or_else(|| refusal("UNTRUSTED_FILE"))?;
                Self::get_locked(&dir, &input.project_id, id)?;
                count += 1;
            }
            if count >= MAX_NOTES {
                return Err(refusal("NOTE_LIMIT"));
            }
            let stamp = now()?;
            let note = Note {
                schema_version: 1,
                note_id: Uuid::new_v4().to_string(),
                project_id: input.project_id,
                title: input.title,
                collection: input.collection,
                markdown: input.markdown,
                revision: 1,
                created_at_ms: stamp,
                updated_at_ms: stamp,
                provenance: "HUMAN_LOCAL".into(),
            };
            let path = Self::path(&dir, &note.note_id)?;
            if present(&path)? {
                return Err(refusal("NOTE_CONFLICT"));
            }
            atomic_write(&path, &encode(&note)?)?;
            Ok(note)
        })
    }
    pub fn update(&self, input: NoteUpdate) -> Result<Note, NativeError> {
        if !valid_text(&input.title, &input.markdown, &input.collection) {
            return Err(refusal("INVALID_NOTE"));
        }
        let dir = self.dir(&input.project_id)?;
        self.locked(&dir, || {
            let mut note = Self::get_locked(&dir, &input.project_id, &input.note_id)?;
            if note.revision != input.expected_revision {
                return Err(refusal("NOTE_CONFLICT"));
            }
            note.title = input.title;
            note.collection = input.collection;
            note.markdown = input.markdown;
            note.revision = note
                .revision
                .checked_add(1)
                .ok_or_else(|| refusal("NOTE_CONFLICT"))?;
            note.updated_at_ms = now()?.max(note.created_at_ms);
            atomic_write(&Self::path(&dir, &note.note_id)?, &encode(&note)?)?;
            Ok(note)
        })
    }
    pub fn delete(
        &self,
        project: &str,
        id: &str,
        expected_revision: u64,
    ) -> Result<(), NativeError> {
        let dir = self.dir(project)?;
        self.locked(&dir, || {
            let note = Self::get_locked(&dir, project, id)?;
            if note.revision != expected_revision {
                return Err(refusal("NOTE_CONFLICT"));
            }
            fs::remove_file(Self::path(&dir, id)?).map_err(|_| io_error())?;
            File::open(&dir)
                .map_err(|_| io_error())?
                .sync_all()
                .map_err(|_| io_error())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    fn input(project: &str) -> NoteInput {
        NoteInput {
            project_id: project.into(),
            title: "Note".into(),
            collection: "Recherche".into(),
            markdown: "# Titre\n\nLien [[missing]]".into(),
        }
    }
    fn code<T>(r: Result<T, NativeError>) -> String {
        r.err().unwrap().code.unwrap()
    }
    #[test]
    fn round_trip_revision_and_project_scope() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("app");
        let store = NoteStore::new(root.clone());
        let note = store.create(input("alpha")).unwrap();
        assert_eq!(store.list("alpha").unwrap(), vec![note.clone()]);
        assert!(store.list("beta").unwrap().is_empty());
        assert!(store.get("beta", &note.note_id).is_err());
        let path = root
            .join("notes/alpha")
            .join(format!("{}.md", note.note_id));
        assert!(fs::read_to_string(&path).unwrap().contains("# Titre"));
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        let updated = store
            .update(NoteUpdate {
                project_id: "alpha".into(),
                note_id: note.note_id.clone(),
                expected_revision: 1,
                title: "Autre".into(),
                collection: "Méthode".into(),
                markdown: "Texte".into(),
            })
            .unwrap();
        assert_eq!(updated.revision, 2);
        assert_eq!(
            code(store.delete("alpha", &note.note_id, 1)),
            "NOTE_CONFLICT"
        );
        assert_eq!(
            NoteStore::new(root).get("alpha", &note.note_id).unwrap(),
            updated
        );
        store.delete("alpha", &note.note_id, 2).unwrap();
        assert!(store.list("alpha").unwrap().is_empty());
    }
    #[test]
    fn refuses_corruption_symlinks_and_paths_without_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let store = NoteStore::new(dir.path().join("app"));
        assert_eq!(code(store.create(input("../escape"))), "INVALID_PROJECT_ID");
        assert_eq!(code(store.get("alpha", "../escape")), "INVALID_NOTE_ID");
        let note = store.create(input("alpha")).unwrap();
        let path = store
            .root
            .join("notes/alpha")
            .join(format!("{}.md", note.note_id));
        fs::write(&path, "broken").unwrap();
        let before = fs::read(&path).unwrap();
        assert_eq!(code(store.list("alpha")), "INCOMPATIBLE_RECORD");
        assert_eq!(code(store.create(input("alpha"))), "INCOMPATIBLE_RECORD");
        assert_eq!(
            code(store.update(NoteUpdate {
                project_id: "alpha".into(),
                note_id: note.note_id.clone(),
                expected_revision: 1,
                title: "X".into(),
                collection: "Y".into(),
                markdown: "Z".into()
            })),
            "INCOMPATIBLE_RECORD"
        );
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::write(&path, vec![b'x'; MAX_FILE as usize + 1]).unwrap();
        assert_eq!(code(store.get("alpha", &note.note_id)), "OVERSIZED_RECORD");
        fs::remove_file(&path).unwrap();
        symlink(dir.path().join("outside"), &path).unwrap();
        assert_eq!(code(store.get("alpha", &note.note_id)), "UNTRUSTED_FILE");
        assert_eq!(code(store.create(input("alpha"))), "UNTRUSTED_FILE");
    }
    #[test]
    fn escaped_header_and_interrupted_temp_are_safe() {
        let dir = tempfile::tempdir().unwrap();
        let store = NoteStore::new(dir.path().join("app"));
        let note = store
            .create(NoteInput {
                title: "a --> b".into(),
                ..input("alpha")
            })
            .unwrap();
        assert_eq!(store.get("alpha", &note.note_id).unwrap().title, "a --> b");
        let path = store
            .root
            .join("notes")
            .join("alpha")
            .join(format!("{}.md", note.note_id));
        let raw = fs::read_to_string(path).unwrap();
        assert_eq!(raw.matches("-->").count(), 1);
        let temp = store
            .root
            .join("notes/alpha")
            .join(format!(".{}.tmp", Uuid::new_v4()));
        fs::write(&temp, "partial").unwrap();
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(store.list("alpha").unwrap().len(), 1);
    }
}

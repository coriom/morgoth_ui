//! Explicit, bounded Markdown import into the existing personal note store.
//! Source paths originate only in a native dialog; the WebView receives metadata.
use crate::{
    drafts::{now, prepare_root, private_dir},
    notes::{validate_restored, Note, NoteStore},
    NativeError,
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    ffi::CString,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    },
    path::{Component, Path, PathBuf},
    time::{Duration, Instant},
};
use uuid::Uuid;

const MAX_INSPECTED: usize = 1000;
const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_BODY: usize = 32_768;
const MAX_DEPTH: usize = 6;
const MAX_PLAN: u64 = 10 * 1024 * 1024;

fn err(code: &'static str) -> NativeError {
    NativeError {
        kind: "LOCAL_IMPORT".into(),
        code: Some(code.into()),
        status: None,
        message: "Import Markdown indisponible ou incertain.".into(),
    }
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn safe_relative(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 240
        && value.split('/').all(|p| {
            !p.is_empty()
                && p != "."
                && p != ".."
                && !p.starts_with('.')
                && !p.chars().any(char::is_control)
        })
}
fn source_hash(provenance: &str) -> Option<&str> {
    provenance
        .strip_prefix("HUMAN_IMPORTED_V1:")?
        .split(':')
        .next()
        .filter(|s| s.len() == 64)
}
pub fn display_provenance(value: &str) -> Option<String> {
    let parts: Vec<_> = value
        .strip_prefix("HUMAN_IMPORTED_V1:")?
        .split(':')
        .collect();
    if parts.len() != 3 {
        return None;
    }
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[2])
        .ok()?;
    let relative = String::from_utf8(bytes).ok()?;
    safe_relative(&relative).then_some(relative)
}
fn provenance(hash: &str, stamp: u64, relative: &str) -> String {
    format!(
        "HUMAN_IMPORTED_V1:{hash}:{stamp}:{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(relative.as_bytes())
    )
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportEntry {
    pub name: String,
    pub title: String,
    pub outcome: String,
    pub warning: Option<String>,
    pub excerpt: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportPreview {
    pub token: String,
    pub project_id: String,
    pub inspected: usize,
    pub eligible: usize,
    pub rejected: usize,
    pub duplicate: usize,
    pub unresolved_links: usize,
    pub ambiguous_links: usize,
    pub estimated_bytes: usize,
    pub recovery: bool,
    pub entries: Vec<ImportEntry>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportPlan {
    pub preview: ImportPreview,
    pub notes: Vec<Note>,
}

// Each component is opened relative to a previously opened directory. No
// selected symlink, including a symlink in an ancestor, is followed.
fn open_selected(path: &Path, directory: bool) -> Result<File, NativeError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err(err("UNTRUSTED_SOURCE"));
    }
    let mut current = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW)
        .open("/")
        .map_err(|_| err("SOURCE_UNAVAILABLE"))?;
    let parts: Vec<_> = path
        .components()
        .filter_map(|c| {
            if let Component::Normal(s) = c {
                Some(s)
            } else {
                None
            }
        })
        .collect();
    if parts.is_empty() {
        return Err(err("UNTRUSTED_SOURCE"));
    }
    for (index, part) in parts.iter().enumerate() {
        let name = CString::new(part.as_bytes()).map_err(|_| err("UNTRUSTED_SOURCE"))?;
        let flags = libc::O_RDONLY
            | libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | if index + 1 < parts.len() || directory {
                libc::O_DIRECTORY
            } else {
                0
            };
        let fd = unsafe { libc::openat(current.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 {
            return Err(err("UNTRUSTED_SOURCE"));
        }
        current = unsafe { File::from_raw_fd(fd) };
    }
    let meta = current.metadata().map_err(|_| err("UNTRUSTED_SOURCE"))?;
    if !(if directory {
        meta.is_dir()
    } else {
        meta.is_file()
    }) {
        return Err(err("UNTRUSTED_SOURCE"));
    }
    Ok(current)
}
use std::os::unix::ffi::OsStrExt;
fn open_child(parent: &File, name: &std::ffi::OsStr, directory: bool) -> Result<File, NativeError> {
    let name = CString::new(name.as_bytes()).map_err(|_| err("UNTRUSTED_SOURCE"))?;
    let flags = libc::O_RDONLY
        | libc::O_CLOEXEC
        | libc::O_NOFOLLOW
        | if directory { libc::O_DIRECTORY } else { 0 };
    let fd = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), flags) };
    if fd < 0 {
        return Err(err("UNTRUSTED_SOURCE"));
    }
    let file = unsafe { File::from_raw_fd(fd) };
    let meta = file.metadata().map_err(|_| err("UNTRUSTED_SOURCE"))?;
    if !(if directory {
        meta.is_dir()
    } else {
        meta.is_file()
    }) {
        return Err(err("UNTRUSTED_SOURCE"));
    }
    Ok(file)
}

struct Candidate {
    relative: String,
    body: String,
    hash: String,
    id: String,
}
struct Scan {
    candidates: Vec<Candidate>,
    entries: Vec<ImportEntry>,
    inspected: usize,
    bytes: usize,
    seen: HashMap<String, String>,
    deadline: Instant,
}
impl Scan {
    fn rejected(&mut self, name: String, reason: &str) {
        self.entries.push(ImportEntry {
            name,
            title: String::new(),
            outcome: "REJECTED".into(),
            warning: Some(reason.into()),
            excerpt: None,
        });
    }
    fn file(
        &mut self,
        file: File,
        relative: String,
        existing: &HashMap<String, String>,
    ) -> Result<(), NativeError> {
        if self.inspected > MAX_INSPECTED || Instant::now() > self.deadline {
            return Err(err("IMPORT_LIMIT"));
        }
        if !safe_relative(&relative) {
            self.rejected(relative, "Nom ou chemin relatif non admissible");
            return Ok(());
        }
        let ext = Path::new(&relative)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown") {
            self.rejected(relative, "Type de fichier non pris en charge");
            return Ok(());
        }
        let len = file
            .metadata()
            .map_err(|_| err("SOURCE_UNAVAILABLE"))?
            .len();
        if len > MAX_BODY as u64 {
            self.rejected(relative, "Document supérieur à 32 KiB");
            return Ok(());
        }
        if self.bytes.saturating_add(len as usize) > MAX_BYTES {
            return Err(err("IMPORT_LIMIT"));
        }
        let mut bytes = Vec::new();
        file.take(MAX_BODY as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| err("SOURCE_UNAVAILABLE"))?;
        if Instant::now() > self.deadline {
            return Err(err("IMPORT_LIMIT"));
        }
        if bytes.len() > MAX_BODY {
            self.rejected(relative, "Document supérieur à 32 KiB");
            return Ok(());
        }
        self.bytes += bytes.len();
        let Ok(body) = String::from_utf8(bytes.clone()) else {
            self.rejected(relative, "Encodage UTF-8 invalide");
            return Ok(());
        };
        if body.contains('\0') {
            self.rejected(relative, "Contenu invalide");
            return Ok(());
        }
        let title = Path::new(&relative)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_owned();
        if title.trim().is_empty() || title.chars().count() > 160 || title.contains(['\n', '\r']) {
            self.rejected(relative, "Titre incompatible");
            return Ok(());
        }
        let hash = digest(&bytes);
        if existing.get(&relative).is_some_and(|old| old == &hash)
            || self.seen.get(&relative).is_some_and(|old| old == &hash)
        {
            self.entries.push(ImportEntry {
                name: relative,
                title,
                outcome: "DUPLICATE".into(),
                warning: Some("Même document déjà importé".into()),
                excerpt: None,
            });
            return Ok(());
        }
        if existing.contains_key(&relative) || self.seen.contains_key(&relative) {
            self.rejected(
                relative,
                "Nom déjà importé avec un autre contenu ; aucune note remplacée",
            );
            return Ok(());
        }
        self.seen.insert(relative.clone(), hash.clone());
        self.entries.push(ImportEntry {
            name: relative.clone(),
            title,
            outcome: "ELIGIBLE".into(),
            warning: None,
            excerpt: Some(body.chars().take(160).collect()),
        });
        self.candidates.push(Candidate {
            relative,
            body,
            hash,
            id: Uuid::new_v4().to_string(),
        });
        Ok(())
    }
    fn directory(
        &mut self,
        dir: File,
        prefix: &str,
        depth: usize,
        existing: &HashMap<String, String>,
    ) -> Result<(), NativeError> {
        if depth > MAX_DEPTH || Instant::now() > self.deadline {
            return Err(err("IMPORT_LIMIT"));
        }
        let proc_path = format!("/proc/self/fd/{}", dir.as_raw_fd());
        let mut entries = Vec::new();
        for entry in fs::read_dir(proc_path).map_err(|_| err("SOURCE_UNAVAILABLE"))? {
            if entries.len() + self.inspected >= MAX_INSPECTED || Instant::now() > self.deadline {
                return Err(err("IMPORT_LIMIT"));
            }
            entries.push(entry.map_err(|_| err("SOURCE_UNAVAILABLE"))?);
        }
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            if Instant::now() > self.deadline {
                return Err(err("IMPORT_LIMIT"));
            }
            self.inspected += 1;
            if self.inspected > MAX_INSPECTED {
                return Err(err("IMPORT_LIMIT"));
            }
            let name = entry.file_name();
            let Some(name_text) = name.to_str() else {
                self.rejected("Nom non UTF-8".into(), "Nom invalide");
                continue;
            };
            let relative = if prefix.is_empty() {
                name_text.to_owned()
            } else {
                format!("{prefix}/{name_text}")
            };
            if !safe_relative(&relative) {
                self.rejected(relative, "Entrée cachée ou chemin non admissible");
                continue;
            }
            let kind = entry.file_type().map_err(|_| err("SOURCE_UNAVAILABLE"))?;
            if kind.is_symlink() {
                self.rejected(relative, "Lien symbolique refusé");
                continue;
            }
            if kind.is_dir() {
                let child = open_child(&dir, &name, true)?;
                self.directory(child, &relative, depth + 1, existing)?;
            } else if kind.is_file() {
                let child = open_child(&dir, &name, false)?;
                self.file(child, relative, existing)?;
            } else {
                self.rejected(relative, "Type de fichier non pris en charge");
            }
        }
        Ok(())
    }
}

fn convert_links(
    body: &str,
    origin: &str,
    paths: &HashMap<String, Vec<String>>,
    titles: &HashMap<String, Vec<String>>,
    known: &HashSet<String>,
) -> (String, usize, usize) {
    let mut out = String::new();
    let mut rest = body;
    let mut unresolved = 0;
    let mut ambiguous = 0;
    while let Some(start) = rest.find("[[") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find("]]") else {
            out.push_str(&rest[start..]);
            return (out, unresolved, ambiguous);
        };
        let token = &after[..end];
        let original = &rest[start..start + end + 4];
        let embed = out.ends_with('!');
        let (target, label) = token.split_once('|').unwrap_or((token, ""));
        let target = target.trim();
        let label = label.trim();
        let lower = target.to_lowercase();
        let key = lower
            .strip_suffix(".markdown")
            .or_else(|| lower.strip_suffix(".md"))
            .unwrap_or(&lower);
        let local = Path::new(origin)
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .map(|p| format!("{}/{}", p.to_string_lossy().to_lowercase(), key));
        let matches = if target.contains('/') {
            paths.get(key)
        } else {
            local
                .as_ref()
                .and_then(|p| paths.get(p))
                .or_else(|| titles.get(key))
        };
        if embed || target.contains("..") || label.chars().count() > 100 || target.is_empty() {
            unresolved += 1;
            out.push_str(original);
        } else if Uuid::parse_str(target).is_ok() {
            if !known.contains(target) {
                unresolved += 1;
            }
            out.push_str(original);
        } else if let Some(ids) = matches {
            if ids.len() == 1 {
                let display = if label.is_empty() {
                    target.rsplit('/').next().unwrap_or(target)
                } else {
                    label
                };
                if display.chars().count() > 100 {
                    unresolved += 1;
                    out.push_str(original);
                } else {
                    out.push_str(&format!("[[{}|{}]]", ids[0], display));
                }
            } else {
                ambiguous += 1;
                out.push_str(original);
            }
        } else {
            unresolved += 1;
            out.push_str(original);
        }
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    (out, unresolved, ambiguous)
}

pub fn prepare(
    project: &str,
    paths: &[PathBuf],
    directory: bool,
    store: &NoteStore,
) -> Result<ImportPlan, NativeError> {
    if paths.is_empty() || paths.len() > MAX_INSPECTED || (directory && paths.len() != 1) {
        return Err(err("INVALID_SELECTION"));
    }
    let current = store.list(project)?;
    let existing: HashMap<String, String> = current
        .iter()
        .filter_map(|n| {
            Some((
                display_provenance(&n.provenance)?,
                source_hash(&n.provenance)?.to_owned(),
            ))
        })
        .collect();
    let mut scan = Scan {
        candidates: Vec::new(),
        entries: Vec::new(),
        inspected: 0,
        bytes: 0,
        seen: HashMap::new(),
        deadline: Instant::now() + Duration::from_secs(10),
    };
    if directory {
        scan.directory(open_selected(&paths[0], true)?, "", 0, &existing)?;
    } else {
        for path in paths {
            scan.inspected += 1;
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or_else(|| err("INVALID_SELECTION"))?
                .to_owned();
            scan.file(open_selected(path, false)?, name, &existing)?;
        }
    }
    if current.len() + scan.candidates.len() > 500 {
        return Err(err("NOTE_LIMIT"));
    }
    let mut paths_by_name: HashMap<String, Vec<String>> = HashMap::new();
    let mut titles: HashMap<String, Vec<String>> = HashMap::new();
    for candidate in &scan.candidates {
        let stem = Path::new(&candidate.relative)
            .with_extension("")
            .to_string_lossy()
            .to_lowercase();
        let title = Path::new(&candidate.relative)
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .to_lowercase();
        paths_by_name
            .entry(stem)
            .or_default()
            .push(candidate.id.clone());
        titles.entry(title).or_default().push(candidate.id.clone());
    }
    let known: HashSet<String> = current
        .iter()
        .map(|n| n.note_id.clone())
        .chain(scan.candidates.iter().map(|c| c.id.clone()))
        .collect();
    let stamp = now()?;
    let mut unresolved = 0;
    let mut ambiguous = 0;
    let mut notes = Vec::new();
    for candidate in scan.candidates {
        let (markdown, u, a) = convert_links(
            &candidate.body,
            &candidate.relative,
            &paths_by_name,
            &titles,
            &known,
        );
        unresolved += u;
        ambiguous += a;
        if markdown.len() > MAX_BODY {
            return Err(err("CONVERTED_NOTE_OVERSIZED"));
        }
        let title = Path::new(&candidate.relative)
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let collection = candidate
            .relative
            .split('/')
            .next()
            .filter(|_| candidate.relative.contains('/'))
            .unwrap_or("Importées");
        let collection = if collection.chars().count() <= 48
            && collection
                .chars()
                .all(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        {
            collection
        } else {
            "Importées"
        };
        let note = Note {
            schema_version: 1,
            note_id: candidate.id,
            project_id: project.into(),
            title,
            collection: collection.into(),
            markdown,
            revision: 1,
            created_at_ms: stamp,
            updated_at_ms: stamp,
            provenance: provenance(&candidate.hash, stamp, &candidate.relative),
        };
        validate_restored(&note, project)?;
        notes.push(note);
    }
    let duplicate = scan
        .entries
        .iter()
        .filter(|e| e.outcome == "DUPLICATE")
        .count();
    let rejected = scan
        .entries
        .iter()
        .filter(|e| e.outcome == "REJECTED")
        .count();
    let estimated_bytes: usize = notes.iter().map(|n| n.markdown.len()).sum();
    if estimated_bytes > MAX_BYTES {
        return Err(err("IMPORT_LIMIT"));
    }
    let preview = ImportPreview {
        token: Uuid::new_v4().to_string(),
        project_id: project.into(),
        inspected: scan.inspected,
        eligible: notes.len(),
        rejected,
        duplicate,
        unresolved_links: unresolved,
        ambiguous_links: ambiguous,
        estimated_bytes,
        recovery: false,
        entries: scan.entries,
    };
    Ok(ImportPlan { preview, notes })
}

pub struct ImportStore {
    pub notes: NoteStore,
    pub state_root: PathBuf,
}
impl ImportStore {
    fn clear_owned_temps(&self, project: &str) -> Result<(), NativeError> {
        let prefix = format!(".{project}.");
        let mut seen = 0;
        let mut removed = false;
        for entry in fs::read_dir(&self.state_root).map_err(|_| err("IMPORT_UNCERTAIN"))? {
            seen += 1;
            if seen > MAX_INSPECTED {
                return Err(err("IMPORT_UNCERTAIN"));
            }
            let entry = entry.map_err(|_| err("IMPORT_UNCERTAIN"))?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                return Err(err("IMPORT_UNCERTAIN"));
            };
            let Some(id) = name
                .strip_prefix(&prefix)
                .and_then(|n| n.strip_suffix(".tmp"))
            else {
                continue;
            };
            if Uuid::parse_str(id).is_err() {
                return Err(err("IMPORT_UNCERTAIN"));
            }
            let meta = fs::symlink_metadata(entry.path()).map_err(|_| err("IMPORT_UNCERTAIN"))?;
            if !meta.is_file()
                || meta.file_type().is_symlink()
                || meta.uid() != unsafe { libc::geteuid() }
                || meta.nlink() != 1
                || meta.permissions().mode() & 0o777 != 0o600
                || meta.len() > MAX_PLAN
            {
                return Err(err("IMPORT_UNCERTAIN"));
            }
            fs::remove_file(entry.path()).map_err(|_| err("IMPORT_UNCERTAIN"))?;
            removed = true;
        }
        if removed {
            File::open(&self.state_root)
                .and_then(|d| d.sync_all())
                .map_err(|_| err("IMPORT_UNCERTAIN"))?;
        }
        Ok(())
    }
    fn exclusive(&self, project: &str) -> Result<File, NativeError> {
        self.journal_path(project)?;
        let path = self.state_root.join(format!("{project}.lock"));
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(path)
            .map_err(|_| err("IMPORT_UNCERTAIN"))?;
        let meta = file.metadata().map_err(|_| err("IMPORT_UNCERTAIN"))?;
        if !meta.is_file()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.nlink() != 1
            || meta.permissions().mode() & 0o777 != 0o600
        {
            return Err(err("IMPORT_UNCERTAIN"));
        }
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            return Err(err("IMPORT_IN_PROGRESS"));
        }
        Ok(file)
    }
    fn journal_path(&self, project: &str) -> Result<PathBuf, NativeError> {
        if !crate::safe_project_id(project) {
            return Err(err("INVALID_PROJECT"));
        }
        prepare_root(&self.state_root)?;
        private_dir(&self.state_root)?;
        Ok(self.state_root.join(format!("{project}.json")))
    }
    pub fn recovery(&self, project: &str) -> Result<Option<ImportPlan>, NativeError> {
        let path = self.journal_path(project)?;
        let meta = match fs::symlink_metadata(&path) {
            Ok(meta) => meta,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(err("IMPORT_UNCERTAIN")),
        };
        if !meta.is_file()
            || meta.file_type().is_symlink()
            || meta.len() > MAX_PLAN
            || meta.permissions().mode() & 0o777 != 0o600
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.nlink() != 1
        {
            return Err(err("IMPORT_UNCERTAIN"));
        }
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&path)
            .map_err(|_| err("IMPORT_UNCERTAIN"))?;
        let opened = file.metadata().map_err(|_| err("IMPORT_UNCERTAIN"))?;
        if opened.dev() != meta.dev() || opened.ino() != meta.ino() || opened.len() != meta.len() {
            return Err(err("IMPORT_UNCERTAIN"));
        }
        let mut bytes = Vec::new();
        file.take(MAX_PLAN + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| err("IMPORT_UNCERTAIN"))?;
        let plan: ImportPlan =
            serde_json::from_slice(&bytes).map_err(|_| err("IMPORT_UNCERTAIN"))?;
        let mut ids = HashSet::new();
        if plan.preview.project_id != project
            || Uuid::parse_str(&plan.preview.token).is_err()
            || plan.preview.eligible != plan.notes.len()
            || plan.notes.len() > 500
            || plan
                .notes
                .iter()
                .any(|n| !ids.insert(&n.note_id) || validate_restored(n, project).is_err())
        {
            return Err(err("IMPORT_UNCERTAIN"));
        }
        let current = self.notes.list(project)?;
        let indexed: HashMap<_, _> = current.iter().map(|n| (&n.note_id, n)).collect();
        if plan
            .notes
            .iter()
            .any(|n| indexed.get(&n.note_id).is_some_and(|v| *v != n))
        {
            return Err(err("IMPORT_UNCERTAIN"));
        }
        let mut recovered = plan;
        recovered.preview.recovery = true;
        Ok(Some(recovered))
    }
    pub fn apply(&self, plan: &ImportPlan) -> Result<usize, NativeError> {
        if plan.preview.eligible != plan.notes.len() || plan.notes.is_empty() {
            return Err(err("INVALID_PLAN"));
        }
        let mut ids = HashSet::new();
        if Uuid::parse_str(&plan.preview.token).is_err()
            || plan.notes.iter().any(|n| {
                !ids.insert(&n.note_id) || validate_restored(n, &plan.preview.project_id).is_err()
            })
        {
            return Err(err("INVALID_PLAN"));
        }
        let _lock = self.exclusive(&plan.preview.project_id)?;
        self.clear_owned_temps(&plan.preview.project_id)?;
        let path = self.journal_path(&plan.preview.project_id)?;
        let journal_absent = match fs::symlink_metadata(&path) {
            Ok(_) => false,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
            Err(_) => return Err(err("IMPORT_UNCERTAIN")),
        };
        if journal_absent {
            let current = self.notes.list(&plan.preview.project_id)?;
            let current_ids: HashSet<_> = current.iter().map(|n| &n.note_id).collect();
            let current_sources: HashSet<_> = current
                .iter()
                .filter_map(|n| display_provenance(&n.provenance))
                .collect();
            if current.len() + plan.notes.len() > 500
                || plan.notes.iter().any(|n| {
                    current_ids.contains(&n.note_id)
                        || display_provenance(&n.provenance)
                            .is_some_and(|name| current_sources.contains(&name))
                })
            {
                return Err(err("IMPORT_CONFLICT"));
            }
            let bytes = serde_json::to_vec(plan).map_err(|_| err("INVALID_PLAN"))?;
            if bytes.len() as u64 > MAX_PLAN {
                return Err(err("IMPORT_LIMIT"));
            }
            let temp = self.state_root.join(format!(
                ".{}.{}.tmp",
                plan.preview.project_id,
                Uuid::new_v4()
            ));
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .custom_flags(libc::O_NOFOLLOW)
                .open(&temp)
                .map_err(|_| err("IMPORT_UNCERTAIN"))?;
            file.write_all(&bytes)
                .and_then(|_| file.sync_all())
                .map_err(|_| err("IMPORT_UNCERTAIN"))?;
            fs::hard_link(&temp, &path).map_err(|_| err("IMPORT_UNCERTAIN"))?;
            File::open(&self.state_root)
                .and_then(|d| d.sync_all())
                .map_err(|_| err("IMPORT_UNCERTAIN"))?;
            fs::remove_file(&temp).map_err(|_| err("IMPORT_UNCERTAIN"))?;
        } else {
            let recovered = self
                .recovery(&plan.preview.project_id)?
                .ok_or_else(|| err("IMPORT_UNCERTAIN"))?;
            if recovered.preview.token != plan.preview.token || recovered.notes != plan.notes {
                return Err(err("IMPORT_UNCERTAIN"));
            }
        }
        let current = self.notes.list(&plan.preview.project_id)?;
        let indexed: HashMap<_, _> = current.iter().map(|n| (&n.note_id, n)).collect();
        if current.len()
            + plan
                .notes
                .iter()
                .filter(|n| !indexed.contains_key(&n.note_id))
                .count()
            > 500
        {
            return Err(err("NOTE_LIMIT"));
        }
        let mut added = 0;
        for note in &plan.notes {
            if let Some(existing) = indexed.get(&note.note_id) {
                if *existing != note {
                    return Err(err("IMPORT_UNCERTAIN"));
                }
                continue;
            }
            self.notes.restore_record(note)?;
            added += 1;
        }
        fs::remove_file(&path).map_err(|_| err("IMPORT_UNCERTAIN"))?;
        File::open(&self.state_root)
            .and_then(|d| d.sync_all())
            .map_err(|_| err("IMPORT_UNCERTAIN"))?;
        Ok(added)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{backup::BackupStore, drafts::DraftStore};
    use std::os::unix::fs::symlink;
    fn fixture() -> (tempfile::TempDir, ImportStore, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::create_dir(source.join("a")).unwrap();
        fs::create_dir(source.join("b")).unwrap();
        fs::write(
            source.join("a/Alpha.md"),
            "# α\n[[b/Beta|Bêta]] [[Missing]] [[Shared]] [[Alpha]]\n[web](https://example.invalid)",
        )
        .unwrap();
        fs::write(source.join("b/Beta.md"), "[[a/Alpha]] [[Shared]]").unwrap();
        fs::write(source.join("a/Shared.md"), "A").unwrap();
        fs::write(source.join("b/Shared.md"), "B").unwrap();
        fs::write(
            source.join("Root.md"),
            "[[Shared]] [[Alpha]] ![[attachment.png]]",
        )
        .unwrap();
        fs::write(source.join("Duplicated.md"), "A").unwrap();
        fs::write(source.join("unicode-é.md"), "Bonjour 世界").unwrap();
        fs::write(source.join("large.md"), vec![b'x'; MAX_BODY + 1]).unwrap();
        fs::write(temp.path().join("outside.md"), "Synthetic outside source").unwrap();
        symlink(temp.path().join("outside.md"), source.join("escape.md")).unwrap();
        let store = ImportStore {
            notes: NoteStore::new(temp.path().join("app/knowledge-v1")),
            state_root: temp.path().join("app/note-import-v1"),
        };
        (temp, store, source)
    }
    #[test]
    fn project_import_links_duplicates_and_recovery() {
        let (_temp, store, source) = fixture();
        let plan = prepare("alpha", std::slice::from_ref(&source), true, &store.notes).unwrap();
        assert_eq!(plan.preview.eligible, 7);
        assert_eq!(plan.preview.duplicate, 0);
        assert_eq!(plan.preview.rejected, 2);
        assert!(plan.preview.unresolved_links >= 1);
        assert!(plan.preview.ambiguous_links >= 1);
        let a = plan.notes.iter().find(|n| n.title == "Alpha").unwrap();
        let b = plan.notes.iter().find(|n| n.title == "Beta").unwrap();
        let shared = plan
            .notes
            .iter()
            .find(|n| n.title == "Shared" && n.collection == "a")
            .unwrap();
        let duplicate_content = plan.notes.iter().find(|n| n.title == "Duplicated").unwrap();
        assert_eq!(shared.markdown, duplicate_content.markdown);
        assert_ne!(shared.note_id, duplicate_content.note_id);
        assert!(plan
            .notes
            .iter()
            .find(|n| n.title == "Root")
            .unwrap()
            .markdown
            .contains("[[Shared]]"));
        assert!(a.markdown.contains(&format!("[[{}|Bêta]]", b.note_id)));
        assert!(a.markdown.contains(&format!("[[{}|Alpha]]", a.note_id)));
        assert!(b.markdown.contains(&format!("[[{}|Alpha]]", a.note_id)));
        assert_eq!(store.apply(&plan).unwrap(), 7);
        assert_eq!(store.notes.list("alpha").unwrap().len(), 7);
        assert!(store.notes.list("beta").unwrap().is_empty());
        assert_eq!(
            prepare("alpha", std::slice::from_ref(&source), true, &store.notes)
                .unwrap()
                .preview
                .eligible,
            0
        );
        assert!(store.recovery("alpha").unwrap().is_none());
        let note = store.notes.get("alpha", &a.note_id).unwrap();
        assert_eq!(
            display_provenance(&note.provenance).as_deref(),
            Some("a/Alpha.md")
        );
        assert!(store.notes.get("beta", &a.note_id).is_err());
    }
    #[test]
    fn repeated_selection_is_duplicate_and_changed_source_never_overwrites() {
        let (_temp, store, source) = fixture();
        let path = source.join("unicode-é.md");
        let original = fs::read(&path).unwrap();
        let plan = prepare("alpha", &[path.clone(), path.clone()], false, &store.notes).unwrap();
        assert_eq!(plan.preview.eligible, 1);
        assert_eq!(plan.preview.duplicate, 1);
        store.apply(&plan).unwrap();
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(
            prepare("alpha", std::slice::from_ref(&path), false, &store.notes)
                .unwrap()
                .preview
                .duplicate,
            1
        );
        fs::write(&path, "Contenu modifié").unwrap();
        assert_eq!(
            prepare("alpha", std::slice::from_ref(&path), false, &store.notes)
                .unwrap()
                .preview
                .rejected,
            1
        );
        assert_eq!(
            store.notes.list("alpha").unwrap()[0].markdown,
            "Bonjour 世界"
        );
    }
    #[test]
    fn partial_journal_is_recoverable_without_overwrite() {
        let (_temp, store, source) = fixture();
        let plan = prepare("alpha", &[source], true, &store.notes).unwrap();
        let journal = store.journal_path("alpha").unwrap();
        let mut f = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&journal)
            .unwrap();
        f.write_all(&serde_json::to_vec(&plan).unwrap()).unwrap();
        f.sync_all().unwrap();
        store.notes.restore_record(&plan.notes[0]).unwrap();
        let recovery = store.recovery("alpha").unwrap().unwrap();
        assert!(recovery.preview.recovery);
        assert_eq!(store.apply(&recovery).unwrap(), plan.notes.len() - 1);
        assert_eq!(store.notes.list("alpha").unwrap().len(), plan.notes.len());
        assert!(store.apply(&plan).is_err());
    }
    #[test]
    fn symlinks_oversize_invalid_utf8_and_wrong_project_refuse() {
        let (_temp, store, source) = fixture();
        assert!(prepare("alpha", &[source.join("escape.md")], false, &store.notes).is_err());
        symlink(&source, source.parent().unwrap().join("linked-source")).unwrap();
        assert!(prepare(
            "alpha",
            &[source.parent().unwrap().join("linked-source/a/Alpha.md")],
            false,
            &store.notes
        )
        .is_err());
        let plan = prepare("alpha", &[source.join("large.md")], false, &store.notes).unwrap();
        assert_eq!(plan.preview.rejected, 1);
        fs::write(source.join("bad.md"), [0xff, 0xfe]).unwrap();
        assert_eq!(
            prepare("alpha", &[source.join("bad.md")], false, &store.notes)
                .unwrap()
                .preview
                .rejected,
            1
        );
        let plan = prepare("alpha", &[source.join("unicode-é.md")], false, &store.notes).unwrap();
        let mut wrong = plan.clone();
        wrong.notes[0].project_id = "beta".into();
        assert!(store.apply(&wrong).is_err());
        assert_eq!(store.notes.list("alpha").unwrap().len(), 0);
    }
    #[test]
    fn malformed_or_symlinked_journal_refuses_without_importing() {
        let (_temp, store, source) = fixture();
        let journal = store.journal_path("alpha").unwrap();
        fs::write(&journal, b"{").unwrap();
        fs::set_permissions(&journal, fs::Permissions::from_mode(0o600)).unwrap();
        assert!(store.recovery("alpha").is_err());
        assert!(store.notes.list("alpha").unwrap().is_empty());
        fs::remove_file(&journal).unwrap();
        symlink(source.join("a/Alpha.md"), &journal).unwrap();
        assert!(store.recovery("alpha").is_err());
        assert!(store.notes.list("alpha").unwrap().is_empty());
    }
    #[test]
    fn interrupted_private_staging_file_is_cleaned_before_publication() {
        let (_temp, store, source) = fixture();
        let plan = prepare("alpha", &[source], true, &store.notes).unwrap();
        store.journal_path("alpha").unwrap();
        let orphan = store
            .state_root
            .join(format!(".alpha.{}.tmp", Uuid::new_v4()));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&orphan)
            .unwrap();
        file.write_all(b"incomplete private journal").unwrap();
        file.sync_all().unwrap();
        assert_eq!(store.apply(&plan).unwrap(), plan.notes.len());
        assert!(!orphan.exists());
        assert!(store.recovery("alpha").unwrap().is_none());
    }
    #[test]
    fn duplicate_confirmation_does_not_publish_twice() {
        let (temp, store, source) = fixture();
        let plan = prepare("alpha", &[source], true, &store.notes).unwrap();
        let other = ImportStore {
            notes: NoteStore::new(temp.path().join("app/knowledge-v1")),
            state_root: temp.path().join("app/note-import-v1"),
        };
        let second_plan = plan.clone();
        let first = std::thread::spawn(move || store.apply(&plan));
        let second = std::thread::spawn(move || other.apply(&second_plan));
        let outcomes = [first.join().unwrap(), second.join().unwrap()];
        assert_eq!(outcomes.iter().filter(|x| x.is_ok()).count(), 1);
    }
    #[test]
    fn imported_notes_survive_d8_archive_without_format_change() {
        let (temp, store, source) = fixture();
        let plan = prepare("alpha", &[source], true, &store.notes).unwrap();
        store.apply(&plan).unwrap();
        let data = temp.path().join("app");
        let from = BackupStore {
            notes: NoteStore::new(data.join("knowledge-v1")),
            drafts: DraftStore::new(data.join("mission-workspace-v1")),
            state_root: data.join("workspace-backup-v1"),
            app_data: data,
        };
        let archive = temp.path().join("portable.morgoth-workspace.json");
        let receipt = from.export("alpha", &archive).unwrap();
        assert_eq!(receipt.schema_version, 1);
        let target = temp.path().join("fresh");
        let to = BackupStore {
            notes: NoteStore::new(target.join("knowledge-v1")),
            drafts: DraftStore::new(target.join("mission-workspace-v1")),
            state_root: target.join("workspace-backup-v1"),
            app_data: target,
        };
        assert_eq!(to.preview("alpha", &archive).unwrap().notes_count, 7);
        to.restore("alpha", &archive, &receipt.sha256).unwrap();
        assert_eq!(
            from.notes.list("alpha").unwrap(),
            to.notes.list("alpha").unwrap()
        );
        assert!(to.notes.list("beta").unwrap().is_empty());
    }
}

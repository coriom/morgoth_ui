//! Explicit VS Code workspace connector over a same-user private Unix socket.
use crate::connector_gateway::ConnectorView;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::Digest;
use std::{
    fs,
    io::{Read, Write},
    os::unix::{
        fs::{FileTypeExt, MetadataExt, PermissionsExt},
        net::UnixStream,
    },
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const MAX_LINE: usize = 16384;
const TIMEOUT: Duration = Duration::from_secs(5);
const LIFE: Duration = Duration::from_secs(600);

#[derive(Clone, Debug, Serialize)]
pub struct VsCodeView {
    pub status: &'static str,
    pub workspace: Option<String>,
    pub workspace_hash: Option<String>,
    pub host: Option<String>,
    pub expires_in_seconds: Option<u64>,
    pub last_verified_ms: Option<u64>,
    pub last_verified_action: Option<&'static str>,
}
struct Session {
    stream: UnixStream,
    socket_path: PathBuf,
    secret: String,
    workspace_hash: String,
    workspace: String,
    host: String,
    expiry: Instant,
    next_id: u64,
}
#[derive(Default)]
struct State {
    session: Option<Session>,
    revoked: bool,
    last_verified_ms: Option<u64>,
    last_verified_action: Option<&'static str>,
}
#[derive(Default)]
pub struct VsCodeGateway(Mutex<State>);

fn socket_path() -> Result<PathBuf, &'static str> {
    let root = if let Ok(value) = std::env::var("MORGOTH_D15_SOCKET_DIR") {
        PathBuf::from(value)
    } else {
        PathBuf::from(std::env::var("HOME").map_err(|_| "VSCODE_SOCKET_UNAVAILABLE")?)
            .join(".local/state/morgoth/vscode")
    };
    if !root.is_absolute()
        || root
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("VSCODE_SOCKET_UNTRUSTED");
    }
    for parent in root.ancestors() {
        if fs::symlink_metadata(parent)
            .map_err(|_| "VSCODE_SOCKET_UNAVAILABLE")?
            .file_type()
            .is_symlink()
        {
            return Err("VSCODE_SOCKET_UNTRUSTED");
        }
    }
    let meta = fs::symlink_metadata(&root).map_err(|_| "VSCODE_SOCKET_UNAVAILABLE")?;
    if !meta.is_dir()
        || meta.file_type().is_symlink()
        || meta.uid() != unsafe { libc::geteuid() }
        || meta.permissions().mode() & 0o077 != 0
    {
        return Err("VSCODE_SOCKET_UNTRUSTED");
    }
    let path = root.join("bridge.sock");
    validate_socket(&path)?;
    Ok(path)
}
fn validate_socket(path: &std::path::Path) -> Result<(), &'static str> {
    let meta = fs::symlink_metadata(path).map_err(|_| "VSCODE_SOCKET_UNAVAILABLE")?;
    if !meta.file_type().is_socket()
        || meta.uid() != unsafe { libc::geteuid() }
        || meta.permissions().mode() & 0o077 != 0
    {
        return Err("VSCODE_SOCKET_UNTRUSTED");
    }
    Ok(())
}
fn verify_peer(stream: &UnixStream) -> Result<(), &'static str> {
    let mut credentials = libc::ucred {
        pid: 0,
        uid: 0,
        gid: 0,
    };
    let mut size = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    let result = unsafe {
        libc::getsockopt(
            std::os::fd::AsRawFd::as_raw_fd(stream),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&raw mut credentials).cast(),
            &raw mut size,
        )
    };
    if result != 0
        || size as usize != std::mem::size_of::<libc::ucred>()
        || credentials.uid != unsafe { libc::geteuid() }
        || credentials.pid <= 1
    {
        return Err("VSCODE_PEER_REFUSED");
    }
    Ok(())
}
fn exchange(
    stream: &mut UnixStream,
    id: u64,
    operation: &str,
    extra: Value,
) -> Result<Value, &'static str> {
    let mut request = json!({"v":1,"id":id,"op":operation});
    if let Some(map) = extra.as_object() {
        for (key, value) in map {
            request[key] = value.clone();
        }
    }
    let line = request.to_string();
    if line.len() > MAX_LINE {
        return Err("VSCODE_REQUEST_INVALID");
    }
    stream
        .write_all(line.as_bytes())
        .and_then(|_| stream.write_all(b"\n"))
        .map_err(|_| "VSCODE_TRANSPORT_FAILED")?;
    let mut bytes = Vec::new();
    while bytes.len() <= MAX_LINE {
        let mut byte = [0_u8; 1];
        stream.read_exact(&mut byte).map_err(|error| {
            if error.kind() == std::io::ErrorKind::TimedOut
                || error.kind() == std::io::ErrorKind::WouldBlock
            {
                "VSCODE_TIMEOUT"
            } else {
                "VSCODE_TRANSPORT_FAILED"
            }
        })?;
        if byte[0] == b'\n' {
            break;
        }
        bytes.push(byte[0]);
    }
    if bytes.len() > MAX_LINE {
        return Err("VSCODE_RESPONSE_TOO_LARGE");
    }
    let reply: Value = serde_json::from_slice(&bytes).map_err(|_| "VSCODE_PROTOCOL_INVALID")?;
    if reply["v"] != 1 || reply["id"] != id {
        return Err("VSCODE_PROTOCOL_INVALID");
    }
    match reply["status"].as_str() {
        Some("OK") => Ok(reply["data"].clone()),
        Some("ERROR") => Err(match reply["data"]["code"].as_str() {
            Some("WORKSPACE_CHANGED") => "VSCODE_WORKSPACE_CHANGED",
            Some("DOCUMENT_REFUSED") => "VSCODE_DOCUMENT_REFUSED",
            Some("SELECTION_TOO_LARGE") => "VSCODE_SELECTION_TOO_LARGE",
            Some("AUTHORIZATION_REQUIRED") => "VSCODE_AUTHORIZATION_REQUIRED",
            Some("PAIR_REFUSED") => "VSCODE_PAIR_REFUSED",
            _ => "VSCODE_OPERATION_REFUSED",
        }),
        _ => Err("VSCODE_PROTOCOL_INVALID"),
    }
}
impl VsCodeGateway {
    pub fn view(&self) -> VsCodeView {
        let available = socket_path().is_ok();
        let Ok(mut state) = self.0.lock() else {
            return VsCodeView {
                status: "UNAVAILABLE",
                workspace: None,
                workspace_hash: None,
                host: None,
                expires_in_seconds: None,
                last_verified_ms: None,
                last_verified_action: None,
            };
        };
        if state
            .session
            .as_ref()
            .is_some_and(|session| session.expiry <= Instant::now())
        {
            state.session = None;
            state.revoked = true;
        }
        if state
            .session
            .as_ref()
            .is_some_and(|session| validate_socket(&session.socket_path).is_err())
        {
            state.session = None;
            state.revoked = true;
        }
        let session = state.session.as_ref();
        VsCodeView {
            status: if session.is_some() {
                "AUTHORIZED"
            } else if state.revoked {
                "REVOKED"
            } else if available {
                "AVAILABLE"
            } else {
                "UNAVAILABLE"
            },
            workspace: session.map(|value| value.workspace.clone()),
            workspace_hash: session.map(|value| value.workspace_hash.clone()),
            host: session.map(|value| value.host.clone()),
            expires_in_seconds: session.map(|value| {
                value
                    .expiry
                    .saturating_duration_since(Instant::now())
                    .as_secs()
            }),
            last_verified_ms: state.last_verified_ms,
            last_verified_action: state.last_verified_action,
        }
    }
    pub fn catalog(&self) -> ConnectorView {
        let view = self.view();
        ConnectorView {
            id: "vscode-workspace",
            name: "Visual Studio Code",
            kind: "vscode-extension-uds",
            target: "Un espace VS Code approuvé",
            operation: "metadata; selection; scratch",
            scope: "Un espace fiable, une fenêtre, une sélection bornée",
            risk: "EXPLICIT_EDITOR_ACTION",
            permission: "PAIR; METADATA; SELECTED_TEXT; SCRATCH",
            status: view.status,
            expires_in_seconds: view.expires_in_seconds,
            last_verified_ms: view.last_verified_ms,
        }
    }
    pub fn pair(&self, code: &str) -> Result<VsCodeView, &'static str> {
        if code.len() != 32
            || !code
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err("VSCODE_PAIR_REFUSED");
        }
        let extension_sha = std::env::var("MORGOTH_D15_EXTENSION_SHA256")
            .map_err(|_| "VSCODE_EXTENSION_UNTRUSTED")?;
        let protocol_sha = std::env::var("MORGOTH_D15_PROTOCOL_SHA256")
            .map_err(|_| "VSCODE_EXTENSION_UNTRUSTED")?;
        self.pair_at(code, socket_path()?, &extension_sha, &protocol_sha)
    }
    fn pair_at(
        &self,
        code: &str,
        path: PathBuf,
        extension_sha: &str,
        protocol_sha: &str,
    ) -> Result<VsCodeView, &'static str> {
        if code.len() != 32
            || !code
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err("VSCODE_PAIR_REFUSED");
        }
        if [extension_sha, protocol_sha].iter().any(|hash| {
            hash.len() != 64
                || !hash
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        }) {
            return Err("VSCODE_EXTENSION_UNTRUSTED");
        }
        let mut state = self.0.lock().map_err(|_| "VSCODE_UNAVAILABLE")?;
        if state.session.is_some() {
            return Err("VSCODE_SESSION_EXISTS");
        }
        let mut stream = UnixStream::connect(&path).map_err(|_| "VSCODE_TRANSPORT_FAILED")?;
        stream
            .set_read_timeout(Some(TIMEOUT))
            .map_err(|_| "VSCODE_TRANSPORT_FAILED")?;
        stream
            .set_write_timeout(Some(TIMEOUT))
            .map_err(|_| "VSCODE_TRANSPORT_FAILED")?;
        verify_peer(&stream)?;
        let data = exchange(&mut stream, 1, "pair", json!({"code":code}))?;
        let secret = data["session"].as_str().ok_or("VSCODE_PROTOCOL_INVALID")?;
        let hash = data["workspace_hash"]
            .as_str()
            .ok_or("VSCODE_PROTOCOL_INVALID")?;
        let workspace = data["workspace"]
            .as_str()
            .ok_or("VSCODE_PROTOCOL_INVALID")?;
        let host = data["host"].as_str().ok_or("VSCODE_PROTOCOL_INVALID")?;
        if data["extension"] != "coriom.morgoth-vscode-connector"
            || data["version"] != "0.2.0"
            || data["extension_sha256"] != extension_sha
            || data["extension_protocol_sha256"] != protocol_sha
            || data["trusted"] != true
            || data["folders"] != 1
            || data["expires_in_seconds"] != 600
            || secret.len() != 32
            || !secret.bytes().all(|byte| byte.is_ascii_hexdigit())
            || hash.len() != 64
            || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            || workspace.is_empty()
            || workspace.len() > 384
            || !["wsl", "linux-local"].contains(&host)
        {
            return Err("VSCODE_PROTOCOL_INVALID");
        }
        state.session = Some(Session {
            stream,
            socket_path: path,
            secret: secret.to_owned(),
            workspace_hash: hash.to_owned(),
            workspace: workspace.to_owned(),
            host: host.to_owned(),
            expiry: Instant::now() + LIFE,
            next_id: 1,
        });
        state.revoked = false;
        drop(state);
        Ok(self.view())
    }
    pub fn call(&self, op: &'static str) -> Result<Value, &'static str> {
        if !["metadata", "selection", "scratch"].contains(&op) {
            return Err("VSCODE_OPERATION_REFUSED");
        }
        let mut state = self.0.lock().map_err(|_| "VSCODE_UNAVAILABLE")?;
        let session = state
            .session
            .as_mut()
            .ok_or("VSCODE_AUTHORIZATION_REQUIRED")?;
        if session.expiry <= Instant::now() {
            state.session = None;
            state.revoked = true;
            return Err("VSCODE_AUTHORIZATION_EXPIRED");
        }
        session.next_id += 1;
        let result = exchange(
            &mut session.stream,
            session.next_id,
            op,
            json!({"session":session.secret}),
        );
        match result {
            Ok(value) => {
                if value["workspace_hash"] != session.workspace_hash && op != "scratch" {
                    state.session = None;
                    state.revoked = true;
                    return Err("VSCODE_WORKSPACE_CHANGED");
                }
                if op == "selection"
                    && value["selected_text"]
                        .as_str()
                        .is_none_or(|text| text.len() > 1024)
                {
                    state.session = None;
                    state.revoked = true;
                    return Err("VSCODE_PROTOCOL_INVALID");
                }
                if op == "scratch"
                    && (value["operation"] != "open_scratch"
                        || value["status"] != "VERIFIED"
                        || value["text"] != "Morgoth D15 integration verified."
                        || value["unsaved"] != true)
                {
                    state.session = None;
                    state.revoked = true;
                    return Err("VSCODE_PROTOCOL_INVALID");
                }
                state.last_verified_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .ok()
                    .map(|time| time.as_millis() as u64);
                state.last_verified_action = Some(op);
                Ok(value)
            }
            Err(error) => {
                state.session = None;
                state.revoked = true;
                Err(error)
            }
        }
    }
    /// Send only an approved Markdown brief to the already paired workspace.
    pub fn call_brief(
        &self,
        content: &str,
        digest: &str,
        expected_workspace: &str,
    ) -> Result<(), &'static str> {
        if content.is_empty()
            || content.len() > 12_000
            || format!("{:x}", sha2::Sha256::digest(content.as_bytes())) != digest
        {
            return Err("VSCODE_REQUEST_INVALID");
        }
        let mut state = self.0.lock().map_err(|_| "VSCODE_UNAVAILABLE")?;
        let session = state
            .session
            .as_mut()
            .ok_or("VSCODE_AUTHORIZATION_REQUIRED")?;
        if session.expiry <= Instant::now() {
            state.session = None;
            state.revoked = true;
            return Err("VSCODE_AUTHORIZATION_EXPIRED");
        }
        if session.workspace_hash != expected_workspace {
            return Err("VSCODE_WORKSPACE_CHANGED");
        }
        session.next_id += 1;
        let result = exchange(
            &mut session.stream,
            session.next_id,
            "brief_scratch",
            json!({"session":session.secret,"content":content,"digest":digest}),
        );
        match result {
            Ok(value)
                if value["operation"] == "open_brief_scratch"
                    && value["status"] == "VERIFIED"
                    && value["digest"] == digest
                    && value["bytes"] == content.len()
                    && value["workspace_hash"] == expected_workspace
                    && value["unsaved"] == true =>
            {
                state.last_verified_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .ok()
                    .map(|v| v.as_millis() as u64);
                state.last_verified_action = Some("brief_scratch");
                Ok(())
            }
            Ok(_) => {
                state.session = None;
                state.revoked = true;
                Err("VSCODE_PROTOCOL_INVALID")
            }
            Err(code) => {
                state.session = None;
                state.revoked = true;
                Err(code)
            }
        }
    }
    pub fn disconnect(&self) -> Result<(), &'static str> {
        let mut state = self.0.lock().map_err(|_| "VSCODE_UNAVAILABLE")?;
        if let Some(mut session) = state.session.take() {
            session.next_id += 1;
            let _ = exchange(
                &mut session.stream,
                session.next_id,
                "disconnect",
                json!({"session":session.secret}),
            );
        }
        state.revoked = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader},
        os::unix::net::UnixListener,
    };
    #[test]
    fn no_session_refuses_actions() {
        let gateway = VsCodeGateway::default();
        assert_eq!(
            gateway.call("selection").unwrap_err(),
            "VSCODE_AUTHORIZATION_REQUIRED"
        );
        assert_eq!(gateway.pair("bad").unwrap_err(), "VSCODE_PAIR_REFUSED");
    }
    #[test]
    fn private_socket_pair_metadata_and_revocation() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("bridge.sock");
        let listener = UnixListener::bind(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        validate_socket(&path).unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            for (id, op) in [
                (1, "pair"),
                (2, "metadata"),
                (3, "selection"),
                (4, "scratch"),
                (5, "brief_scratch"),
                (6, "disconnect"),
            ] {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let request: Value = serde_json::from_str(&line).unwrap();
                assert_eq!(request["v"], 1);
                assert_eq!(request["op"], op);
                let data = match op {
                    "pair" => {
                        json!({"extension":"coriom.morgoth-vscode-connector","version":"0.2.0","extension_sha256":"d".repeat(64),"extension_protocol_sha256":"e".repeat(64),"host":"wsl","workspace":"synthetic","workspace_hash":"a".repeat(64),"trusted":true,"folders":1,"session":"b".repeat(32),"expires_in_seconds":600})
                    }
                    "metadata" => {
                        json!({"workspace_hash":"a".repeat(64),"editor":{"document":"sample.md","version":1}})
                    }
                    "selection" => {
                        json!({"workspace_hash":"a".repeat(64),"selected_text":"Synthetic"})
                    }
                    "scratch" => {
                        json!({"operation":"open_scratch","status":"VERIFIED","text":"Morgoth D15 integration verified.","unsaved":true})
                    }
                    "brief_scratch" => {
                        assert_eq!(request["content"], "# Synthetic brief");
                        json!({"operation":"open_brief_scratch","status":"VERIFIED","digest":request["digest"],"bytes":17,"workspace_hash":"a".repeat(64),"unsaved":true})
                    }
                    _ => json!({"revoked":true}),
                };
                stream
                    .write_all(
                        json!({"v":1,"id":id,"status":"OK","data":data})
                            .to_string()
                            .as_bytes(),
                    )
                    .unwrap();
                stream.write_all(b"\n").unwrap();
            }
        });
        let gateway = VsCodeGateway::default();
        assert_eq!(
            gateway
                .pair_at(&"c".repeat(32), path, &"d".repeat(64), &"e".repeat(64))
                .unwrap()
                .status,
            "AUTHORIZED"
        );
        assert_eq!(
            gateway.call("metadata").unwrap()["editor"]["document"],
            "sample.md"
        );
        assert_eq!(
            gateway.call("selection").unwrap()["selected_text"],
            "Synthetic"
        );
        assert_eq!(gateway.call("scratch").unwrap()["status"], "VERIFIED");
        let digest = format!("{:x}", sha2::Sha256::digest(b"# Synthetic brief"));
        assert_eq!(
            gateway
                .call_brief("# Synthetic brief", &digest, &"b".repeat(64))
                .unwrap_err(),
            "VSCODE_WORKSPACE_CHANGED"
        );
        gateway
            .call_brief("# Synthetic brief", &digest, &"a".repeat(64))
            .unwrap();
        gateway.disconnect().unwrap();
        assert_eq!(
            gateway.call("metadata").unwrap_err(),
            "VSCODE_AUTHORIZATION_REQUIRED"
        );
        server.join().unwrap();
    }
    #[test]
    fn unsafe_socket_file_refused() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("bridge.sock");
        fs::write(&path, b"not a socket").unwrap();
        assert_eq!(
            validate_socket(&path).unwrap_err(),
            "VSCODE_SOCKET_UNTRUSTED"
        );
    }
    #[test]
    #[ignore = "requires an isolated real VS Code Extension Development Host and test-owned pairing code"]
    fn real_vscode_extension_host() {
        let code = std::env::var("MORGOTH_D15_TEST_PAIR_CODE").unwrap();
        let gateway = VsCodeGateway::default();
        assert_eq!(gateway.pair(&code).unwrap().status, "AUTHORIZED");
        assert_eq!(
            gateway.call("metadata").unwrap()["editor"]["document"],
            "sample.md"
        );
        assert_eq!(
            gateway.call("selection").unwrap()["selected_text"],
            "Synthetic"
        );
        let scratch = gateway.call("scratch").unwrap();
        assert_eq!(scratch["text"], "Morgoth D15 integration verified.");
        gateway.disconnect().unwrap();
        assert_eq!(
            gateway.call("metadata").unwrap_err(),
            "VSCODE_AUTHORIZATION_REQUIRED"
        );
    }
    #[tokio::test]
    #[ignore = "requires public GitHub, isolated installed VSIX and real Linux VS Code host"]
    async fn real_d17_cross_application_host() {
        use crate::{
            drafts::DraftStore, github_gateway::GithubGateway, workflow_runner::WorkflowRunner,
        };
        let code = std::env::var("MORGOTH_D15_TEST_PAIR_CODE").unwrap();
        let vscode = VsCodeGateway::default();
        assert_eq!(vscode.pair(&code).unwrap().status, "AUTHORIZED");
        let github = GithubGateway::new();
        github.select("microsoft/vscode".into()).await.unwrap();
        github
            .authorize("microsoft/vscode", false, None)
            .await
            .unwrap();
        let items = github.read("issues", None, None).await.unwrap();
        let number = items["items"].as_array().unwrap().first().unwrap()["number"]
            .as_u64()
            .unwrap() as u32;
        let temp = tempfile::tempdir().unwrap();
        let drafts = DraftStore::new(temp.path().join("app/mission-workspace-v1"));
        let runner = WorkflowRunner::new(temp.path().join("app/workflow-receipts-v1"));
        let preview = runner
            .prepare(&github, "fixture", "issue", number)
            .await
            .unwrap();
        let receipt = runner
            .confirm(
                &github,
                &drafts,
                &preview.workflow_id,
                "fixture",
                preview.proposed,
            )
            .await
            .unwrap();
        let outgoing = runner
            .handoff_preview(&drafts, &vscode, "fixture", &receipt.workflow_id)
            .unwrap();
        assert!(outgoing.markdown.starts_with("# GitHub · microsoft/vscode"));
        let done = runner
            .handoff(
                &drafts,
                &vscode,
                "fixture",
                &receipt.workflow_id,
                &outgoing.sha256,
                &outgoing.workspace_hash,
            )
            .await
            .unwrap();
        assert_eq!(done.state, "COMPLETED");
        assert_eq!(done.handoff_state, "VERIFIED");
        vscode.disconnect().unwrap();
        assert_eq!(
            vscode.call("metadata").unwrap_err(),
            "VSCODE_AUTHORIZATION_REQUIRED"
        );
        println!(
            "D17_REAL_CROSS_APP_PASS repo_id={} issue={} draft_id={} handoff=VERIFIED",
            receipt.source_repository_id, number, receipt.draft_id
        );
    }
}

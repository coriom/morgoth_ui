//! D14: one explicitly approved Playwright session, restricted to its owned local fixture.
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    os::unix::fs::{MetadataExt, PermissionsExt},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant},
};

const ADAPTER: &[u8] = include_bytes!("../../browser/adapter.mjs");
const LIFE: Duration = Duration::from_secs(600);
const WAIT: Duration = Duration::from_secs(15);
const MAX_REPLY: usize = 8192;

#[derive(Clone, Serialize)]
pub struct BrowserView {
    pub status: &'static str,
    pub origin: Option<String>,
    pub url: Option<String>,
    pub expires_in_seconds: Option<u64>,
}

struct Peer {
    child: Child,
    input: ChildStdin,
    replies: mpsc::Receiver<String>,
    next_id: u64,
}
impl Peer {
    fn exchange(&mut self, op: &str, extra: Value) -> Result<Value, &'static str> {
        self.next_id += 1;
        let mut request = json!({"v":1,"id":self.next_id,"op":op});
        if let Some(map) = extra.as_object() {
            for (key, value) in map {
                request[key] = value.clone();
            }
        }
        let encoded = request.to_string();
        if encoded.len() > 4096 {
            return Err("BROWSER_REQUEST_INVALID");
        }
        self.input
            .write_all(encoded.as_bytes())
            .and_then(|_| self.input.write_all(b"\n"))
            .map_err(|_| "BROWSER_TRANSPORT_FAILED")?;
        let line = self
            .replies
            .recv_timeout(WAIT)
            .map_err(|_| "BROWSER_TIMEOUT")?;
        if line.len() > MAX_REPLY {
            return Err("BROWSER_RESPONSE_TOO_LARGE");
        }
        let value: Value = serde_json::from_str(&line).map_err(|_| "BROWSER_PROTOCOL_INVALID")?;
        if value["v"] != 1 || value["id"] != self.next_id {
            return Err("BROWSER_PROTOCOL_INVALID");
        }
        match value["status"].as_str() {
            Some("OK") => Ok(value["data"].clone()),
            Some("ERROR") => Err(match value["data"]["code"].as_str() {
                Some("START_FAILED") => "BROWSER_START_FAILED",
                Some("STALE_ELEMENT") => "BROWSER_STALE_ELEMENT",
                Some("SESSION_REQUIRED") => "BROWSER_SESSION_REQUIRED",
                Some("URL_REFUSED") => "BROWSER_URL_REFUSED",
                Some("ACTION_SCOPE_REFUSED") => "BROWSER_ACTION_SCOPE_REFUSED",
                _ => "BROWSER_OPERATION_FAILED",
            }),
            _ => Err("BROWSER_PROTOCOL_INVALID"),
        }
    }
}
impl Drop for Peer {
    fn drop(&mut self) {
        self.next_id += 1;
        let request = json!({"v":1,"id":self.next_id,"op":"disconnect"}).to_string();
        if self
            .input
            .write_all(request.as_bytes())
            .and_then(|_| self.input.write_all(b"\n"))
            .is_ok()
        {
            let _ = self.replies.recv_timeout(Duration::from_secs(2));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Default)]
struct State {
    peer: Option<Peer>,
    expiry: Option<Instant>,
    origin: Option<String>,
    url: Option<String>,
    revoked: bool,
}
#[derive(Default)]
pub struct BrowserGateway(Mutex<State>);

fn safe_file(path: &Path) -> Result<(), &'static str> {
    let meta = fs::symlink_metadata(path).map_err(|_| "BROWSER_RUNTIME_UNAVAILABLE")?;
    if !meta.is_file()
        || meta.file_type().is_symlink()
        || meta.uid() != unsafe { libc::geteuid() }
        || meta.permissions().mode() & 0o022 != 0
    {
        return Err("BROWSER_RUNTIME_UNTRUSTED");
    }
    Ok(())
}
fn paths() -> Result<(PathBuf, PathBuf, PathBuf), &'static str> {
    let node = PathBuf::from(
        std::env::var("MORGOTH_DESKTOP_BROWSER_NODE").map_err(|_| "BROWSER_RUNTIME_UNAVAILABLE")?,
    );
    let cache = PathBuf::from(
        std::env::var("MORGOTH_DESKTOP_BROWSER_CACHE")
            .map_err(|_| "BROWSER_RUNTIME_UNAVAILABLE")?,
    );
    let script = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("BROWSER_RUNTIME_UNAVAILABLE")?
        .join("browser/adapter.mjs");
    if !node.is_absolute() || !cache.is_absolute() || !script.is_absolute() {
        return Err("BROWSER_RUNTIME_UNTRUSTED");
    }
    safe_file(&node)?;
    safe_file(&script)?;
    if !cache.is_dir()
        || cache
            .symlink_metadata()
            .map_err(|_| "BROWSER_RUNTIME_UNAVAILABLE")?
            .file_type()
            .is_symlink()
    {
        return Err("BROWSER_RUNTIME_UNTRUSTED");
    }
    safe_file(&cache.join("chromium-1248/chrome-linux64/chrome"))?;
    let package = script
        .parent()
        .ok_or("BROWSER_RUNTIME_UNAVAILABLE")?
        .parent()
        .ok_or("BROWSER_RUNTIME_UNAVAILABLE")?
        .join("node_modules/playwright/package.json");
    safe_file(&package)?;
    let metadata: Value =
        serde_json::from_slice(&fs::read(&package).map_err(|_| "BROWSER_RUNTIME_UNAVAILABLE")?)
            .map_err(|_| "BROWSER_RUNTIME_UNTRUSTED")?;
    if metadata["version"] != "1.64.1" {
        return Err("BROWSER_RUNTIME_UNTRUSTED");
    }
    let bytes = fs::read(&script).map_err(|_| "BROWSER_RUNTIME_UNAVAILABLE")?;
    if Sha256::digest(bytes).as_slice() != Sha256::digest(ADAPTER).as_slice() {
        return Err("BROWSER_ADAPTER_MISMATCH");
    }
    Ok((node, cache, script))
}
impl BrowserGateway {
    pub fn view(&self) -> BrowserView {
        let available = paths().is_ok();
        let Ok(mut state) = self.0.lock() else {
            return BrowserView {
                status: "UNAVAILABLE",
                origin: None,
                url: None,
                expires_in_seconds: None,
            };
        };
        if state.expiry.is_some_and(|t| t <= Instant::now()) {
            state.peer = None;
            state.expiry = None;
            state.origin = None;
            state.url = None;
        }
        let remaining = state
            .expiry
            .and_then(|t| t.checked_duration_since(Instant::now()));
        BrowserView {
            status: if remaining.is_some() && state.peer.is_some() {
                "AUTHORIZED"
            } else if state.revoked {
                "REVOKED"
            } else if available {
                "AVAILABLE"
            } else {
                "UNAVAILABLE"
            },
            origin: state.origin.clone(),
            url: state.url.clone(),
            expires_in_seconds: remaining.map(|t| t.as_secs()),
        }
    }
    pub fn start(&self) -> Result<BrowserView, &'static str> {
        let (node, cache, script) = paths()?;
        let mut state = self.0.lock().map_err(|_| "BROWSER_UNAVAILABLE")?;
        if state.expiry.is_some_and(|t| t <= Instant::now()) {
            state.peer = None;
            state.expiry = None;
        }
        if state.peer.is_some() {
            return Err("BROWSER_SESSION_EXISTS");
        }
        let mut child = Command::new(node)
            .arg(script)
            .env_clear()
            .env("PLAYWRIGHT_BROWSERS_PATH", cache)
            .env("HOME", std::env::var("HOME").unwrap_or_default())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "BROWSER_RUNTIME_UNAVAILABLE")?;
        let input = child.stdin.take().ok_or("BROWSER_TRANSPORT_FAILED")?;
        let output = child.stdout.take().ok_or("BROWSER_TRANSPORT_FAILED")?;
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                match line {
                    Ok(line) if line.len() <= MAX_REPLY => {
                        if tx.send(line).is_err() {
                            break;
                        }
                    }
                    _ => break,
                }
            }
        });
        let mut peer = Peer {
            child,
            input,
            replies: rx,
            next_id: 0,
        };
        let result = peer.exchange("start", json!({}))?;
        let origin = result["origin"]
            .as_str()
            .ok_or("BROWSER_PROTOCOL_INVALID")?;
        if !origin.starts_with("http://127.0.0.1:") || origin.len() > 32 {
            return Err("BROWSER_PROTOCOL_INVALID");
        }
        state.url = result["url"].as_str().map(str::to_owned);
        state.origin = Some(origin.to_string());
        state.expiry = Some(Instant::now() + LIFE);
        state.revoked = false;
        state.peer = Some(peer);
        drop(state);
        Ok(self.view())
    }
    pub fn operation(&self, op: &str, extra: Value) -> Result<Value, &'static str> {
        let mut state = self.0.lock().map_err(|_| "BROWSER_UNAVAILABLE")?;
        if state.expiry.is_none_or(|t| t <= Instant::now()) {
            state.peer = None;
            return Err("BROWSER_AUTHORIZATION_REQUIRED");
        }
        let peer = state.peer.as_mut().ok_or("BROWSER_SESSION_REQUIRED")?;
        let result = match peer.exchange(op, extra) {
            Ok(v) => v,
            Err(e) => {
                state.peer = None;
                state.expiry = None;
                return Err(e);
            }
        };
        if let Some(url) = result["url"].as_str() {
            state.url = Some(url.to_string());
        }
        Ok(result)
    }
    pub fn disconnect(&self) -> Result<(), &'static str> {
        let mut state = self.0.lock().map_err(|_| "BROWSER_UNAVAILABLE")?;
        state.peer = None;
        state.expiry = None;
        state.origin = None;
        state.url = None;
        state.revoked = true;
        Ok(())
    }
    pub fn expire_due(&self) {
        if let Ok(mut state) = self.0.lock() {
            if state.expiry.is_some_and(|t| t <= Instant::now()) {
                state.peer = None;
                state.expiry = None;
                state.origin = None;
                state.url = None;
                state.revoked = true;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn absent_session_refuses_operations_and_disconnect_revokes() {
        let gateway = BrowserGateway::default();
        assert_eq!(
            gateway.operation("inspect", json!({})).unwrap_err(),
            "BROWSER_AUTHORIZATION_REQUIRED"
        );
        gateway.disconnect().unwrap();
        assert_eq!(gateway.view().status, "REVOKED");
    }
    #[test]
    #[ignore = "run with trusted D14 Node and Playwright cache paths in an authorized local browser environment"]
    fn real_gateway_fixture_smoke() {
        let gateway = BrowserGateway::default();
        let session = gateway.start().unwrap();
        assert_eq!(session.status, "AUTHORIZED");
        let first = gateway.operation("inspect", json!({})).unwrap();
        assert_eq!(first["title"], "Atelier D14");
        let field = first["elements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["kind"] == "textbox")
            .unwrap()["ref"]
            .as_str()
            .unwrap();
        let filled = gateway
            .operation("fill", json!({"ref":field,"value":"D14-CHECK"}))
            .unwrap();
        let button = filled["elements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["kind"] == "button")
            .unwrap()["ref"]
            .as_str()
            .unwrap();
        let clicked = gateway
            .operation("click", json!({"ref":button,"value":""}))
            .unwrap();
        assert_eq!(clicked["state"], "D14-CHECK");
        gateway.disconnect().unwrap();
        assert_eq!(
            gateway.operation("inspect", json!({})).unwrap_err(),
            "BROWSER_AUTHORIZATION_REQUIRED"
        );
    }
}

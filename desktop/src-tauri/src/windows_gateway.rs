//! Fixed Windows test-app connector. UI text never selects a command or target.
use crate::connector_gateway::ConnectorView;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    os::unix::fs::{MetadataExt, PermissionsExt},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const DEADLINE: Duration = Duration::from_secs(5);
const GRANT_LIFETIME: Duration = Duration::from_secs(600);
const MAX_REPLY: u64 = 8192;
const SOURCE_SHA: Option<&str> = option_env!("MORGOTH_D13_SOURCE_SHA");
const TARGET_HASH_LEN: usize = 64;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct WindowsBuildReceipt {
    format: u8,
    source_sha: String,
    companion_sha256: String,
    target_sha256: String,
}

fn safe_regular(path: &Path, max_size: u64) -> Result<(), &'static str> {
    let meta = fs::symlink_metadata(path).map_err(|_| "WINDOWS_COMPANION_UNAVAILABLE")?;
    if !meta.is_file()
        || meta.file_type().is_symlink()
        || meta.uid() != unsafe { libc::geteuid() }
        || meta.permissions().mode() & 0o022 != 0
        || meta.len() == 0
        || meta.len() > max_size
    {
        return Err("WINDOWS_ARTIFACT_UNTRUSTED");
    }
    Ok(())
}

fn hex_hash(path: &Path) -> Result<String, &'static str> {
    let mut file = File::open(path).map_err(|_| "WINDOWS_COMPANION_UNAVAILABLE")?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "WINDOWS_COMPANION_UNAVAILABLE")?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn valid_hex(value: &str) -> bool {
    value.len() == TARGET_HASH_LEN
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

trait HostTransport: Send + Sync {
    fn target_hash(&self) -> Result<String, &'static str>;
    fn request(&self, payload: Value) -> Result<Value, &'static str>;
}

struct RealHost;
impl RealHost {
    fn directory() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("desktop parent")
            .join("windows/target")
    }
    fn checked(&self) -> Result<(PathBuf, WindowsBuildReceipt), &'static str> {
        let source_sha = SOURCE_SHA.ok_or("WINDOWS_COMPANION_UNAVAILABLE")?;
        let dir = Self::directory();
        let dir_meta = fs::symlink_metadata(&dir).map_err(|_| "WINDOWS_COMPANION_UNAVAILABLE")?;
        if !dir_meta.is_dir()
            || dir_meta.file_type().is_symlink()
            || dir_meta.uid() != unsafe { libc::geteuid() }
            || dir_meta.permissions().mode() & 0o077 != 0
        {
            return Err("WINDOWS_ARTIFACT_UNTRUSTED");
        }
        let receipt_path = dir.join("d13-windows-receipt.json");
        let companion = dir.join("morgoth-d13-companion.exe");
        let target = dir.join("morgoth-d13-test-target.exe");
        safe_regular(&receipt_path, 1024)?;
        safe_regular(&companion, 8 * 1024 * 1024)?;
        safe_regular(&target, 8 * 1024 * 1024)?;
        let receipt: WindowsBuildReceipt = serde_json::from_slice(
            &fs::read(&receipt_path).map_err(|_| "WINDOWS_COMPANION_UNAVAILABLE")?,
        )
        .map_err(|_| "WINDOWS_ARTIFACT_UNTRUSTED")?;
        if receipt.format != 1
            || receipt.source_sha != source_sha
            || !valid_hex(&receipt.companion_sha256)
            || !valid_hex(&receipt.target_sha256)
            || hex_hash(&companion)? != receipt.companion_sha256
            || hex_hash(&target)? != receipt.target_sha256
        {
            return Err("WINDOWS_ARTIFACT_UNTRUSTED");
        }
        Ok((companion, receipt))
    }
}
impl HostTransport for RealHost {
    fn target_hash(&self) -> Result<String, &'static str> {
        Ok(self.checked()?.1.target_sha256)
    }
    fn request(&self, payload: Value) -> Result<Value, &'static str> {
        let (companion, _) = self.checked()?;
        let interop = std::env::var_os("WSL_INTEROP")
            .filter(|value| !value.is_empty())
            .ok_or("WINDOWS_INTEROP_UNAVAILABLE")?;
        let encoded = serde_json::to_vec(&payload).map_err(|_| "WINDOWS_PROTOCOL_INVALID")?;
        if encoded.len() > 4096 {
            return Err("WINDOWS_PROTOCOL_INVALID");
        }
        let started = Instant::now();
        let mut child = Command::new(companion)
            .env_clear()
            .env("WSL_INTEROP", interop)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "WINDOWS_INTEROP_UNAVAILABLE")?;
        let mut input = child.stdin.take().ok_or("WINDOWS_INTEROP_UNAVAILABLE")?;
        let written = input
            .write_all(&encoded)
            .and_then(|_| input.write_all(b"\n"))
            .is_ok();
        drop(input);
        if !written {
            let _ = child.kill();
            let _ = child.wait();
            return Err("WINDOWS_TRANSPORT_FAILED");
        }
        let stdout = child.stdout.take().ok_or("WINDOWS_TRANSPORT_FAILED")?;
        let (tx, rx) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let read = stdout.take(MAX_REPLY + 1).read_to_end(&mut bytes);
            let _ = tx.send((read, bytes));
        });
        let received = rx.recv_timeout(DEADLINE);
        if received.is_err() {
            let _ = child.kill();
        }
        let exit = loop {
            match child.try_wait().map_err(|_| "WINDOWS_TRANSPORT_FAILED")? {
                Some(exit) => break exit,
                None if started.elapsed() >= DEADLINE => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = reader.join();
                    return Err("WINDOWS_TIMEOUT");
                }
                None => std::thread::sleep(Duration::from_millis(10)),
            }
        };
        let _ = reader.join();
        let (read, bytes) = received.map_err(|_| "WINDOWS_TIMEOUT")?;
        read.map_err(|_| "WINDOWS_TRANSPORT_FAILED")?;
        if bytes.len() as u64 > MAX_REPLY {
            return Err("WINDOWS_RESPONSE_TOO_LARGE");
        }
        let response: Value =
            serde_json::from_slice(&bytes).map_err(|_| "WINDOWS_PROTOCOL_INVALID")?;
        if response["v"] != 1
            || !matches!(response["status"].as_str(), Some("OK" | "ERROR"))
            || (response["status"] == "OK") != exit.success()
        {
            return Err("WINDOWS_PROTOCOL_INVALID");
        }
        if response["status"] == "ERROR" {
            return Err(host_code(response["code"].as_str().unwrap_or("")));
        }
        if response["op"] != payload["op"] {
            return Err("WINDOWS_PROTOCOL_INVALID");
        }
        Ok(response["data"].clone())
    }
}

fn host_code(code: &str) -> &'static str {
    match code {
        "TARGET_UNAVAILABLE" => "TARGET_UNAVAILABLE",
        "TARGET_AMBIGUOUS" => "TARGET_AMBIGUOUS",
        "TARGET_IDENTITY_MISMATCH" => "TARGET_IDENTITY_MISMATCH",
        "TARGET_UNTRUSTED" => "TARGET_UNTRUSTED",
        "TARGET_ELEVATED" => "TARGET_ELEVATED",
        "TARGET_USER_MISMATCH" => "TARGET_USER_MISMATCH",
        "TARGET_SESSION_MISMATCH" => "TARGET_SESSION_MISMATCH",
        "WINDOW_INVALID" => "WINDOW_INVALID",
        "UIA_UNAVAILABLE" => "UIA_UNAVAILABLE",
        "CONTROL_UNAVAILABLE" => "CONTROL_UNAVAILABLE",
        "PATTERN_UNSUPPORTED" => "PATTERN_UNSUPPORTED",
        "READBACK_UNCHANGED" => "READBACK_UNCHANGED",
        _ => "WINDOWS_OPERATION_FAILED",
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct TargetIdentity {
    pid: String,
    started: String,
    hwnd: String,
    exe_sha256: String,
    session: String,
}
impl TargetIdentity {
    fn payload(&self, op: &str) -> Value {
        json!({"v":1,"op":op,"pid":self.pid,"started":self.started,
            "hwnd":self.hwnd,"exe_sha256":self.exe_sha256})
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct WindowsTargetView {
    pub app: &'static str,
    pub process_id: String,
    pub session_id: String,
    pub operation: &'static str,
}
#[derive(Clone, Debug, Serialize)]
pub struct WindowsControlView {
    pub automation_id: String,
    pub control_type: String,
    pub name: String,
    pub enabled: bool,
    pub invoke: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct WindowsInspection {
    pub state: String,
    pub controls: Vec<WindowsControlView>,
}
#[derive(Clone, Debug, Serialize)]
pub struct WindowsActionReceipt {
    pub action: &'static str,
    pub before: String,
    pub after: String,
    pub verified: bool,
}

#[derive(Default)]
struct WindowsState {
    target: Option<TargetIdentity>,
    expires: Option<Instant>,
    inspected: bool,
    revoked: bool,
    last_verified_ms: Option<u64>,
}
pub struct WindowsGateway {
    host: Box<dyn HostTransport>,
    state: Mutex<WindowsState>,
}
impl Default for WindowsGateway {
    fn default() -> Self {
        Self {
            host: Box::new(RealHost),
            state: Mutex::new(WindowsState::default()),
        }
    }
}
impl WindowsGateway {
    pub fn view(&self) -> ConnectorView {
        let available = self.host.target_hash().is_ok();
        let state = self.state.lock();
        let (status, expiry, last_verified) = match state {
            Ok(ref state) => {
                let remaining = state
                    .expires
                    .and_then(|until| until.checked_duration_since(Instant::now()));
                let status = if !available {
                    "UNAVAILABLE"
                } else if remaining.is_some() {
                    "AUTHORIZED"
                } else if state.revoked {
                    "REVOKED"
                } else if state.target.is_some() {
                    "DISCOVERED"
                } else {
                    "AVAILABLE"
                };
                (
                    status,
                    remaining.map(|value| value.as_secs()),
                    state.last_verified_ms,
                )
            }
            Err(_) => ("UNAVAILABLE", None, None),
        };
        ConnectorView {
            id: "windows-uia",
            name: "Application Windows de test",
            kind: "windows-uia",
            target: "Fenêtre WinForms D13 dédiée",
            operation: "inspect_test_window; toggle_test_state",
            scope: "Un processus et une fenêtre de test ; aucune autre application",
            risk: "EXPLICIT_TEST_ACTION",
            permission: "INSPECT_TEST_WINDOW; TOGGLE_TEST_STATE",
            status,
            expires_in_seconds: expiry,
            last_verified_ms: last_verified,
        }
    }
    pub fn detect(&self) -> Result<WindowsTargetView, &'static str> {
        let expected = self.host.target_hash()?;
        let mut state = self.state.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        state.target = None;
        state.expires = None;
        state.inspected = false;
        let host = self.host.request(json!({"v":1,"op":"host_status"}))?;
        if host["identity"] != "morgoth-d13-windows-companion"
            || host["version"] != 1
            || host["uia"] != true
        {
            return Err("WINDOWS_PROTOCOL_INVALID");
        }
        let discovered = self
            .host
            .request(json!({"v":1,"op":"discover_test_target"}))?;
        let identity = parse_target(&discovered, &expected)?;
        state.target = Some(identity.clone());
        state.expires = None;
        state.revoked = false;
        Ok(WindowsTargetView {
            app: "Morgoth D13 Test Target",
            process_id: identity.pid,
            session_id: identity.session,
            operation: "toggle_test_state",
        })
    }
    pub fn authorize_inspection(&self) -> Result<(), &'static str> {
        let mut state = self.state.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        state.expires = None;
        state.inspected = false;
        let target = state.target.clone().ok_or("TARGET_UNAVAILABLE")?;
        let current = self
            .host
            .request(json!({"v":1,"op":"discover_test_target"}))?;
        if parse_target(&current, &target.exe_sha256)? != target {
            return Err("TARGET_IDENTITY_MISMATCH");
        }
        state.expires = Some(Instant::now() + GRANT_LIFETIME);
        Ok(())
    }
    pub fn inspect(&self) -> Result<WindowsInspection, &'static str> {
        let mut state = self.state.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        let target = authorized(&state)?.clone();
        let data = self.host.request(target.payload("inspect_target"))?;
        let inspection = parse_inspection(&data)?;
        state.inspected = true;
        state.last_verified_ms = now_ms();
        Ok(inspection)
    }
    pub fn invoke(&self) -> Result<WindowsActionReceipt, &'static str> {
        let mut state = self.state.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        if !state.inspected {
            return Err("INSPECTION_REQUIRED");
        }
        let target = authorized(&state)?.clone();
        let mut payload = target.payload("invoke_test_action");
        payload["action"] = json!("toggle_test_state");
        let data = self.host.request(payload)?;
        let before = state_value(&data["before"])?;
        let after = state_value(&data["after"])?;
        if data["action"] != "toggle_test_state" || data["verified"] != true || before == after {
            return Err("WINDOWS_PROTOCOL_INVALID");
        }
        state.last_verified_ms = now_ms();
        Ok(WindowsActionReceipt {
            action: "toggle_test_state",
            before,
            after,
            verified: true,
        })
    }
    pub fn disconnect(&self) -> Result<(), &'static str> {
        let mut state = self.state.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        state.target = None;
        state.expires = None;
        state.inspected = false;
        state.revoked = true;
        Ok(())
    }
}
fn now_ms() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|time| time.as_millis() as u64)
}
fn authorized(state: &WindowsState) -> Result<&TargetIdentity, &'static str> {
    if state.revoked || state.expires.is_none_or(|until| until <= Instant::now()) {
        return Err("AUTHORIZATION_REQUIRED");
    }
    state.target.as_ref().ok_or("TARGET_UNAVAILABLE")
}
fn numeric_string(value: &Value) -> Result<String, &'static str> {
    let text = value.as_str().ok_or("WINDOWS_PROTOCOL_INVALID")?;
    if text.is_empty()
        || text.len() > 20
        || text.bytes().all(|byte| byte == b'0')
        || !text.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err("WINDOWS_PROTOCOL_INVALID");
    }
    Ok(text.to_owned())
}
fn parse_target(value: &Value, expected_hash: &str) -> Result<TargetIdentity, &'static str> {
    if value["app"] != "Morgoth D13 Test Target"
        || value["operation"] != "toggle_test_state"
        || value["exe_sha256"] != expected_hash
        || !valid_hex(expected_hash)
    {
        return Err("TARGET_UNTRUSTED");
    }
    Ok(TargetIdentity {
        pid: numeric_string(&value["pid"])?,
        started: numeric_string(&value["started"])?,
        hwnd: numeric_string(&value["hwnd"])?,
        session: numeric_string(&value["session"])?,
        exe_sha256: expected_hash.to_owned(),
    })
}
fn state_value(value: &Value) -> Result<String, &'static str> {
    match value.as_str() {
        Some("ACTIVE") => Ok("ACTIVE".into()),
        Some("INACTIVE") => Ok("INACTIVE".into()),
        _ => Err("WINDOWS_PROTOCOL_INVALID"),
    }
}
fn parse_inspection(data: &Value) -> Result<WindowsInspection, &'static str> {
    let state = state_value(&data["state"])?;
    let controls = data["controls"]
        .as_array()
        .ok_or("WINDOWS_PROTOCOL_INVALID")?;
    if controls.len() != 2 {
        return Err("WINDOWS_PROTOCOL_INVALID");
    }
    let mut result = Vec::with_capacity(2);
    for (index, control) in controls.iter().enumerate() {
        let (id, kind, allowed) = if index == 0 {
            (
                "D13State",
                "Text",
                ["État : actif", "État : inactif"].as_slice(),
            )
        } else {
            ("D13Toggle", "Button", ["Basculer le test"].as_slice())
        };
        let name = control["name"].as_str().ok_or("WINDOWS_PROTOCOL_INVALID")?;
        if control["automation_id"] != id
            || control["control_type"] != kind
            || !allowed.contains(&name)
            || control["password"] != false
            || !control["enabled"].is_boolean()
            || !control["invoke"].is_boolean()
            || (index == 0 && control["invoke"] != false)
        {
            return Err("WINDOWS_PROTOCOL_INVALID");
        }
        result.push(WindowsControlView {
            automation_id: id.to_owned(),
            control_type: kind.to_owned(),
            name: name.to_owned(),
            enabled: control["enabled"] == true,
            invoke: control["invoke"] == true,
        });
    }
    if (state == "ACTIVE" && result[0].name != "État : actif")
        || (state == "INACTIVE" && result[0].name != "État : inactif")
    {
        return Err("WINDOWS_PROTOCOL_INVALID");
    }
    Ok(WindowsInspection {
        state,
        controls: result,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    struct MockHost {
        calls: AtomicUsize,
        fail: Option<&'static str>,
    }
    impl HostTransport for MockHost {
        fn target_hash(&self) -> Result<String, &'static str> {
            Ok("a".repeat(64))
        }
        fn request(&self, payload: Value) -> Result<Value, &'static str> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if let Some(code) = self.fail {
                return Err(code);
            }
            match payload["op"].as_str() {
                Some("host_status") => {
                    Ok(json!({"version":1,"identity":"morgoth-d13-windows-companion","uia":true}))
                }
                Some("discover_test_target") => Ok(
                    json!({"app":"Morgoth D13 Test Target","pid":"10","started":"100",
                    "hwnd":"20","exe_sha256":"a".repeat(64),"session":"1","operation":"toggle_test_state"}),
                ),
                Some("inspect_target") => Ok(json!({"state":"INACTIVE","controls":[
                    {"automation_id":"D13State","control_type":"Text","name":"État : inactif","enabled":true,"invoke":false,"password":false},
                    {"automation_id":"D13Toggle","control_type":"Button","name":"Basculer le test","enabled":true,"invoke":true,"password":false}]})),
                Some("invoke_test_action") => Ok(
                    json!({"action":"toggle_test_state","before":"INACTIVE","after":"ACTIVE","verified":true}),
                ),
                _ => Err("WINDOWS_PROTOCOL_INVALID"),
            }
        }
    }
    fn gateway() -> WindowsGateway {
        WindowsGateway {
            host: Box::new(MockHost {
                calls: AtomicUsize::new(0),
                fail: None,
            }),
            state: Mutex::new(WindowsState::default()),
        }
    }
    #[test]
    fn discover_never_authorizes_inspection_or_action() {
        let gateway = gateway();
        assert_eq!(gateway.view().status, "AVAILABLE");
        gateway.detect().unwrap();
        assert_eq!(gateway.view().status, "DISCOVERED");
        assert!(gateway.inspect().is_err());
        assert!(gateway.invoke().is_err());
    }
    #[test]
    fn inspection_and_action_are_separate_and_revocable() {
        let gateway = gateway();
        gateway.detect().unwrap();
        gateway.authorize_inspection().unwrap();
        assert_eq!(gateway.invoke().unwrap_err(), "INSPECTION_REQUIRED");
        assert_eq!(gateway.inspect().unwrap().state, "INACTIVE");
        assert_eq!(gateway.invoke().unwrap().after, "ACTIVE");
        gateway.detect().unwrap();
        assert!(
            gateway.inspect().is_err(),
            "a fresh detection must clear the prior grant"
        );
        gateway.authorize_inspection().unwrap();
        gateway.disconnect().unwrap();
        assert_eq!(gateway.view().status, "REVOKED");
        assert!(gateway.inspect().is_err());
        assert!(gateway.invoke().is_err());
    }
    #[test]
    fn expiry_and_identity_mismatch_refuse() {
        let gateway = gateway();
        gateway.detect().unwrap();
        gateway.authorize_inspection().unwrap();
        gateway.state.lock().unwrap().expires = Some(Instant::now() - Duration::from_secs(1));
        assert!(gateway.inspect().is_err());
        let mut state = gateway.state.lock().unwrap();
        state.target.as_mut().unwrap().hwnd = "999".into();
        drop(state);
        assert_eq!(
            gateway.authorize_inspection().unwrap_err(),
            "TARGET_IDENTITY_MISMATCH"
        );
    }
    #[test]
    fn unavailable_host_and_malformed_result_refuse() {
        let gateway = WindowsGateway {
            host: Box::new(MockHost {
                calls: AtomicUsize::new(0),
                fail: Some("WINDOWS_INTEROP_UNAVAILABLE"),
            }),
            state: Mutex::new(WindowsState::default()),
        };
        assert_eq!(gateway.detect().unwrap_err(), "WINDOWS_INTEROP_UNAVAILABLE");
        assert_eq!(host_code("SECRET FROM HOST"), "WINDOWS_OPERATION_FAILED");
        assert!(parse_inspection(&json!({"state":"ACTIVE","controls":[]})).is_err());
        let identity = json!({"app":"Morgoth D13 Test Target","pid":"10","started":"100",
            "hwnd":"20","exe_sha256":"a".repeat(64),"session":"1","operation":"toggle_test_state"});
        assert!(parse_target(&identity, &"b".repeat(64)).is_err());
        let mut stale = identity.clone();
        stale["hwnd"] = json!("0");
        assert!(parse_target(&stale, &"a".repeat(64)).is_err());
        let sensitive = json!({"state":"INACTIVE","controls":[
            {"automation_id":"D13State","control_type":"Text","name":"État : inactif","enabled":true,"invoke":false,"password":true},
            {"automation_id":"D13Toggle","control_type":"Button","name":"Basculer le test","enabled":true,"invoke":true,"password":false}]});
        assert!(parse_inspection(&sensitive).is_err());
        assert_eq!(host_code("TARGET_ELEVATED"), "TARGET_ELEVATED");
        assert_eq!(host_code("TARGET_USER_MISMATCH"), "TARGET_USER_MISMATCH");
        for code in ["WINDOWS_TIMEOUT", "WINDOWS_TRANSPORT_FAILED"] {
            let gateway = WindowsGateway {
                host: Box::new(MockHost {
                    calls: AtomicUsize::new(0),
                    fail: Some(code),
                }),
                state: Mutex::new(WindowsState::default()),
            };
            assert_eq!(gateway.detect().unwrap_err(), code);
        }
    }
    #[test]
    fn companion_artifact_refuses_symlinks_oversize_and_unsafe_permissions() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("companion.exe");
        fs::write(&file, b"test").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(safe_regular(&file, 100).is_ok());
        assert!(safe_regular(&file, 2).is_err());
        let link = root.path().join("alias.exe");
        symlink(&file, &link).unwrap();
        assert!(safe_regular(&link, 100).is_err());
        fs::set_permissions(&file, fs::Permissions::from_mode(0o722)).unwrap();
        assert!(safe_regular(&file, 100).is_err());
    }
}

//! Session-only connector gateway. The first connector is a fixed, synthetic MCP stdio peer.
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    io::{BufRead, Read, Write},
    process::{Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const PROTOCOL: &str = "2025-11-25";
const MAX_REPLY: u64 = 8192;
const DEADLINE: Duration = Duration::from_secs(3);
const SESSION: Duration = Duration::from_secs(600);

#[derive(Clone, Debug, Serialize)]
pub struct ConnectorView {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: &'static str,
    pub target: &'static str,
    pub operation: &'static str,
    pub scope: &'static str,
    pub risk: &'static str,
    pub permission: &'static str,
    pub status: &'static str,
    pub expires_in_seconds: Option<u64>,
    pub last_verified_ms: Option<u64>,
}

#[derive(Default)]
struct GrantState {
    expiry: Option<Instant>,
    revoked: bool,
    last_verified_ms: Option<u64>,
}
pub struct Gateway(Mutex<GrantState>);
impl Default for Gateway {
    fn default() -> Self {
        Self(Mutex::new(GrantState::default()))
    }
}
impl Gateway {
    pub fn catalog(&self) -> Result<Vec<ConnectorView>, &'static str> {
        let guard = self.0.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        let expiry = guard
            .expiry
            .and_then(|until| until.checked_duration_since(Instant::now()));
        Ok(vec![
            ConnectorView {
                id: "local-mcp-fixture",
                name: "MCP local de démonstration",
                kind: "mcp-stdio",
                target: "Serveur synthétique intégré",
                operation: "read_snapshot",
                scope: "Données de test fixes ; lecture seule",
                risk: "LOW_READ_ONLY",
                permission: "INSPECT_SYNTHETIC_FIXTURE",
                status: if expiry.is_some() {
                    "AUTHORIZED"
                } else if guard.revoked {
                    "REVOKED"
                } else {
                    "DISCONNECTED"
                },
                expires_in_seconds: expiry.map(|left| left.as_secs()),
                last_verified_ms: guard.last_verified_ms,
            },
            ConnectorView {
                id: "windows-uia",
                name: "Applications Windows",
                kind: "windows-companion",
                target: "Hôte Windows",
                operation: "none",
                scope: "Aucun accès dans D12",
                risk: "UNQUALIFIED",
                permission: "NONE",
                status: "UNAVAILABLE",
                expires_in_seconds: None,
                last_verified_ms: None,
            },
            ConnectorView {
                id: "browser-test",
                name: "Navigateur contrôlé",
                kind: "browser",
                target: "Profil jetable futur",
                operation: "none",
                scope: "Aucun accès dans D12",
                risk: "UNQUALIFIED",
                permission: "NONE",
                status: "UNAVAILABLE",
                expires_in_seconds: None,
                last_verified_ms: None,
            },
        ])
    }
    pub fn connect(&self, consent: &str) -> Result<(), &'static str> {
        if consent != "CONNECT LOCAL FIXTURE" {
            return Err("CONSENT_REQUIRED");
        }
        let mut guard = self.0.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        // Discover the peer before granting authority. Its own metadata never defines grants.
        exchange(false)?;
        guard.expiry = Some(Instant::now() + SESSION);
        guard.revoked = false;
        Ok(())
    }
    pub fn disconnect(&self) -> Result<(), &'static str> {
        let mut guard = self.0.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        guard.expiry = None;
        guard.revoked = true;
        Ok(())
    }
    pub fn test(&self) -> Result<ConnectorResult, &'static str> {
        let mut guard = self.0.lock().map_err(|_| "GATEWAY_UNAVAILABLE")?;
        if guard.expiry.is_none_or(|until| until <= Instant::now()) {
            return Err("AUTHORIZATION_REQUIRED");
        }
        let result = exchange(true)?.ok_or("MCP_PROTOCOL_INVALID")?;
        guard.last_verified_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .map(|value| value.as_millis() as u64);
        Ok(result)
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ConnectorResult {
    pub connector_id: &'static str,
    pub operation: &'static str,
    pub status: &'static str,
    pub fixture_items: u8,
}

fn exchange(call: bool) -> Result<Option<ConnectorResult>, &'static str> {
    let exe = std::env::current_exe().map_err(|_| "CONNECTOR_UNAVAILABLE")?;
    let mut child = Command::new(exe)
        .arg("--d12-mcp-fixture")
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "CONNECTOR_UNAVAILABLE")?;
    let request = [
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":PROTOCOL,"capabilities":{},"clientInfo":{"name":"morgoth-desktop","version":"0.1.0"}}}).to_string(),
        json!({"jsonrpc":"2.0","method":"notifications/initialized"}).to_string(),
        json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}).to_string(),
    ];
    let mut lines = request.to_vec();
    if call {
        lines.push(json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_snapshot","arguments":{}}}).to_string());
    }
    let written = child
        .stdin
        .take()
        .ok_or("CONNECTOR_UNAVAILABLE")?
        .write_all(format!("{}\n", lines.join("\n")).as_bytes())
        .is_ok();
    if !written {
        let _ = child.kill();
        let _ = child.wait();
        return Err("MCP_TRANSPORT_FAILED");
    }
    let stdout = child.stdout.take().ok_or("CONNECTOR_UNAVAILABLE")?;
    let (tx, rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take(MAX_REPLY + 1).read_to_end(&mut bytes);
        let _ = tx.send((result, bytes));
    });
    let received = rx.recv_timeout(DEADLINE);
    if received.is_err() {
        let _ = child.kill();
    }
    let _ = child.wait();
    let _ = reader.join();
    let (read, bytes) = received.map_err(|_| "MCP_TIMEOUT")?;
    read.map_err(|_| "MCP_TRANSPORT_FAILED")?;
    if bytes.len() as u64 > MAX_REPLY {
        return Err("MCP_RESPONSE_TOO_LARGE");
    }
    let values: Vec<Value> = bytes
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice(line).map_err(|_| "MCP_PROTOCOL_INVALID"))
        .collect::<Result<_, _>>()?;
    if values.len() != if call { 3 } else { 2 }
        || values[0]["id"] != 1
        || values[0]["result"]["protocolVersion"] != PROTOCOL
        || values[0]["result"]["serverInfo"]["name"] != "morgoth-fixture"
        || values[1]["id"] != 2
        || values[1]["result"]["tools"]
            .as_array()
            .is_none_or(|tools| tools.len() != 1)
        || values[1]["result"]["tools"][0]["name"] != "read_snapshot"
        || values[1]["result"]["tools"][0]["inputSchema"]["type"] != "object"
    {
        return Err("MCP_PROTOCOL_INVALID");
    }
    if !call {
        return Ok(None);
    }
    if values[2]["id"] != 3
        || values[2]["result"]["isError"] != false
        || values[2]["result"]["structuredContent"]["status"] != "ready"
        || values[2]["result"]["structuredContent"]["items"] != 2
    {
        return Err("MCP_PROTOCOL_INVALID");
    }
    Ok(Some(ConnectorResult {
        connector_id: "local-mcp-fixture",
        operation: "read_snapshot",
        status: "SUCCEEDED",
        fixture_items: 2,
    }))
}

/// Fixed private stdio peer for transport qualification. It reads no host data.
pub fn fixture_stdio_main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines().take(4) {
        let Ok(line) = line else { break };
        if line.len() > 4096 {
            break;
        }
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            break;
        };
        let response = match value["method"].as_str() {
            Some("initialize") => Some(
                json!({"jsonrpc":"2.0","id":value["id"],"result":{"protocolVersion":PROTOCOL,"capabilities":{"tools":{}},"serverInfo":{"name":"morgoth-fixture","version":"1"}}}),
            ),
            Some("notifications/initialized") => None,
            Some("tools/list") => Some(
                json!({"jsonrpc":"2.0","id":value["id"],"result":{"tools":[{"name":"read_snapshot","description":"Fixed synthetic read-only fixture","inputSchema":{"type":"object","properties":{},"additionalProperties":false}}]}}),
            ),
            Some("tools/call")
                if value["params"]["name"] == "read_snapshot"
                    && value["params"]["arguments"] == json!({}) =>
            {
                Some(
                    json!({"jsonrpc":"2.0","id":value["id"],"result":{"content":[{"type":"text","text":"Synthetic fixture ready"}],"structuredContent":{"status":"ready","items":2},"isError":false}}),
                )
            }
            _ => break,
        };
        if let Some(response) = response {
            if writeln!(stdout, "{response}").is_err() {
                break;
            }
            let _ = stdout.flush();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grant_and_revocation_are_fail_closed() {
        let gateway = Gateway::default();
        assert_eq!(gateway.catalog().unwrap()[0].status, "DISCONNECTED");
        assert_eq!(gateway.test().unwrap_err(), "AUTHORIZATION_REQUIRED");
        assert_eq!(
            gateway.connect("CONNECT LOCAL FIXTUR").unwrap_err(),
            "CONSENT_REQUIRED"
        );
        gateway.disconnect().unwrap();
    }
    #[test]
    fn expired_grant_is_not_usable() {
        let gateway = Gateway(Mutex::new(GrantState {
            expiry: Some(Instant::now() - Duration::from_secs(1)),
            ..GrantState::default()
        }));
        assert_eq!(gateway.catalog().unwrap()[0].status, "DISCONNECTED");
        assert_eq!(gateway.test().unwrap_err(), "AUTHORIZATION_REQUIRED");
    }
    #[test]
    fn revoked_grant_is_not_usable_even_before_original_expiry() {
        let gateway = Gateway(Mutex::new(GrantState {
            expiry: Some(Instant::now() + Duration::from_secs(30)),
            ..GrantState::default()
        }));
        assert_eq!(gateway.catalog().unwrap()[0].status, "AUTHORIZED");
        gateway.disconnect().unwrap();
        assert_eq!(gateway.catalog().unwrap()[0].status, "REVOKED");
        assert_eq!(gateway.test().unwrap_err(), "AUTHORIZATION_REQUIRED");
    }
}

//! Native-only, non-generative Ollama observation. No URL or model comes from JS.
use futures_util::StreamExt;
use reqwest::header;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    io::Read,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MAX_BODY: usize = 32_768;
const MAX_MODELS: usize = 64;
const DEFAULT_PORT: u16 = 11434;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct InstalledModel {
    pub id: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LoadedModel {
    pub id: String,
    pub size_bytes: u64,
    pub ollama_reported_vram_bytes: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ResourceRead {
    pub linux_mem_available_bytes: Option<u64>,
    pub linux_swap_total_bytes: Option<u64>,
    pub linux_swap_used_bytes: Option<u64>,
    pub cgroup_memory_limit_bytes: Option<u64>,
    pub cgroup_memory_current_bytes: Option<u64>,
    pub cgroup_memory_headroom_bytes: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct OllamaStatusRead {
    pub source: String,
    pub observed_at_ms: u64,
    pub service_state: String,
    pub installed_state: String,
    pub loaded_state: String,
    pub failure_class: Option<String>,
    pub configured_model: Option<String>,
    pub installed: Vec<InstalledModel>,
    pub loaded: Vec<LoadedModel>,
    pub resources: ResourceRead,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope<T> {
    models: Vec<T>,
}

// Official Ollama fields are typed; metadata we do not display is discarded.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct TagEntry {
    name: String,
    model: String,
    size: u64,
    #[serde(default)]
    modified_at: Option<String>,
    #[serde(default)]
    digest: Option<String>,
    #[serde(default)]
    details: Option<serde::de::IgnoredAny>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ResidentEntry {
    name: String,
    model: String,
    size: u64,
    #[serde(default)]
    size_vram: Option<u64>,
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(default)]
    expires_at: Option<String>,
    #[serde(default)]
    digest: Option<String>,
    #[serde(default)]
    details: Option<serde::de::IgnoredAny>,
}

fn model_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b':' | b'/'))
}

fn installed(bytes: &[u8]) -> Result<Vec<InstalledModel>, &'static str> {
    let envelope: Envelope<TagEntry> =
        serde_json::from_slice(bytes).map_err(|_| "INCOMPATIBLE_RESPONSE")?;
    if envelope.models.len() > MAX_MODELS {
        return Err("INCOMPATIBLE_RESPONSE");
    }
    let mut seen = HashSet::new();
    let mut models = Vec::with_capacity(envelope.models.len());
    for item in envelope.models {
        let _ = (&item.modified_at, &item.digest, &item.details);
        if !model_id(&item.name) || !model_id(&item.model) || !seen.insert(item.name.clone()) {
            return Err("INCOMPATIBLE_RESPONSE");
        }
        models.push(InstalledModel {
            id: item.name,
            size_bytes: item.size,
        });
    }
    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

fn loaded(bytes: &[u8]) -> Result<Vec<LoadedModel>, &'static str> {
    let envelope: Envelope<ResidentEntry> =
        serde_json::from_slice(bytes).map_err(|_| "INCOMPATIBLE_RESPONSE")?;
    if envelope.models.len() > MAX_MODELS {
        return Err("INCOMPATIBLE_RESPONSE");
    }
    let mut seen = HashSet::new();
    let mut models = Vec::with_capacity(envelope.models.len());
    for item in envelope.models {
        let _ = (
            &item.context_length,
            &item.expires_at,
            &item.digest,
            &item.details,
        );
        if !model_id(&item.name) || !model_id(&item.model) || !seen.insert(item.name.clone()) {
            return Err("INCOMPATIBLE_RESPONSE");
        }
        models.push(LoadedModel {
            id: item.name,
            size_bytes: item.size,
            ollama_reported_vram_bytes: item.size_vram,
        });
    }
    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

fn fixed_file(path: &str, max: u64) -> Option<String> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(max + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > max {
        return None;
    }
    String::from_utf8(bytes).ok()
}

fn meminfo_kib(text: &str, key: &str) -> Option<u64> {
    text.lines().find_map(|line| {
        let (name, rest) = line.split_once(':')?;
        if name != key {
            return None;
        }
        let mut parts = rest.split_whitespace();
        let value = parts.next()?.parse::<u64>().ok()?;
        if parts.next()? != "kB" || parts.next().is_some() {
            return None;
        }
        value.checked_mul(1024)
    })
}

fn cgroup_bytes(path: &str) -> Option<u64> {
    let text = fixed_file(path, 64)?;
    let value = text.trim();
    if value == "max" {
        return None;
    }
    value.parse().ok()
}

pub fn resource_read() -> ResourceRead {
    let info = fixed_file("/proc/meminfo", 4096);
    let read = |key| info.as_deref().and_then(|text| meminfo_kib(text, key));
    let swap_total = read("SwapTotal");
    let swap_free = read("SwapFree");
    let limit = cgroup_bytes("/sys/fs/cgroup/memory.max");
    let current = cgroup_bytes("/sys/fs/cgroup/memory.current");
    ResourceRead {
        linux_mem_available_bytes: read("MemAvailable"),
        linux_swap_total_bytes: swap_total,
        linux_swap_used_bytes: swap_total
            .zip(swap_free)
            .and_then(|(total, free)| total.checked_sub(free)),
        cgroup_memory_limit_bytes: limit,
        cgroup_memory_current_bytes: current,
        cgroup_memory_headroom_bytes: limit
            .zip(current)
            .and_then(|(max, used)| max.checked_sub(used)),
    }
}

fn failure(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "TIMEOUT"
    } else if error.is_connect() {
        "CONNECT"
    } else {
        "TRANSPORT"
    }
}

pub struct OllamaReader {
    client: reqwest::Client,
    port: u16,
    configured_model: Option<String>,
}

impl OllamaReader {
    /// Literal loopback and fixed paths only; a port is the sole destination setting.
    pub fn new(port: u16, configured_model: Option<String>) -> Result<Self, &'static str> {
        if port == 0 || configured_model.as_deref().is_some_and(|id| !model_id(id)) {
            return Err("CONFIG_REJECTED");
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(1))
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| "CONFIG_REJECTED")?;
        Ok(Self {
            client,
            port,
            configured_model,
        })
    }

    /// Native-only environment; no WebView-configured URL or model selection.
    pub fn from_environment() -> Result<Self, &'static str> {
        let port = match std::env::var("MORGOTH_DESKTOP_OLLAMA_PORT") {
            Ok(raw) => raw.parse::<u16>().map_err(|_| "CONFIG_REJECTED")?,
            Err(std::env::VarError::NotPresent) => DEFAULT_PORT,
            Err(_) => return Err("CONFIG_REJECTED"),
        };
        let model = std::env::var("MORGOTH_DESKTOP_OLLAMA_MODEL").ok();
        Self::new(port, model)
    }

    async fn get(&self, path: &'static str) -> Result<Vec<u8>, &'static str> {
        let url = format!("http://127.0.0.1:{}{path}", self.port);
        let response = self
            .client
            .get(url)
            .header(header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| failure(&e))?;
        if response.status().is_redirection() {
            return Err("REDIRECT_REJECTED");
        }
        if response.status() != reqwest::StatusCode::OK {
            return Err("HTTP_STATUS");
        }
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !content_type
            .split(';')
            .next()
            .is_some_and(|v| v.trim().eq_ignore_ascii_case("application/json"))
        {
            return Err("INCOMPATIBLE_RESPONSE");
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_BODY as u64)
        {
            return Err("OVERSIZED_RESPONSE");
        }
        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| failure(&e))?;
            if bytes.len() + chunk.len() > MAX_BODY {
                return Err("OVERSIZED_RESPONSE");
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }

    /// Perform at most two sequential GET requests, with no retry or generation.
    pub async fn read(&self) -> OllamaStatusRead {
        let mut status = OllamaStatusRead {
            source: "OLLAMA_LOOPBACK_GET_V1".into(),
            observed_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            service_state: "UNAVAILABLE".into(),
            installed_state: "UNAVAILABLE".into(),
            loaded_state: "UNAVAILABLE".into(),
            failure_class: None,
            configured_model: None,
            installed: Vec::new(),
            loaded: Vec::new(),
            resources: resource_read(),
        };
        let tags = match self
            .get("/api/tags")
            .await
            .and_then(|bytes| installed(&bytes))
        {
            Ok(models) => models,
            Err(code) => {
                status.failure_class = Some(code.into());
                return status;
            }
        };
        status.service_state = "REACHABLE".into();
        status.installed_state = "OBSERVED".into();
        status.configured_model = self
            .configured_model
            .as_ref()
            .filter(|id| tags.iter().any(|item| &item.id == *id))
            .cloned();
        status.installed = tags;
        match self.get("/api/ps").await.and_then(|bytes| loaded(&bytes)) {
            Ok(models) => {
                status.loaded_state = "OBSERVED".into();
                status.loaded = models;
            }
            Err(code) => status.failure_class = Some(code.into()),
        }
        status
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parsers_are_typed_bounded_and_redacted() {
        let tags = br#"{"models":[{"name":"a:1","model":"a:1","size":42,"digest":"secret","details":{"family":"secret"}}]}"#;
        assert_eq!(
            installed(tags).unwrap(),
            vec![InstalledModel {
                id: "a:1".into(),
                size_bytes: 42
            }]
        );
        assert!(installed(br#"{"models":[{"name":"a:1","model":"a:1","size":"42"}]}"#).is_err());
        assert!(installed(br#"{"models":[],"extra":"untrusted"}"#).is_err());
        assert!(
            installed(br#"{"models":[{"name":"secret input\n","model":"x","size":1}]}"#).is_err()
        );
        assert!(installed(
            br#"{"models":[{"name":"x","model":"x","size":1},{"name":"x","model":"x","size":1}]}"#
        )
        .is_err());
        let ps = br#"{"models":[{"name":"a:1","model":"a:1","size":43,"size_vram":17,"context_length":4096}]}"#;
        assert_eq!(loaded(ps).unwrap()[0].ollama_reported_vram_bytes, Some(17));
        assert!(
            loaded(br#"{"models":[{"name":"x","model":"x","size":2,"size_vram":-1}]}"#).is_err()
        );
        assert!(OllamaReader::new(0, None).is_err());
        assert!(OllamaReader::new(11434, Some("private string".into())).is_err());
    }
    #[test]
    fn resource_parsing_preserves_unknowns() {
        assert_eq!(
            meminfo_kib("MemAvailable: 123 kB\n", "MemAvailable"),
            Some(125_952)
        );
        assert_eq!(meminfo_kib("SwapTotal: nope kB\n", "SwapTotal"), None);
        assert_eq!(meminfo_kib("SwapTotal: 2 MB\n", "SwapTotal"), None);
        let resources = resource_read();
        assert_eq!(
            resources.cgroup_memory_headroom_bytes,
            resources
                .cgroup_memory_limit_bytes
                .zip(resources.cgroup_memory_current_bytes)
                .and_then(|(limit, current)| limit.checked_sub(current))
        );
    }
}

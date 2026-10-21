# Desktop D3 integration and authority matrix

D3 extends the D2 native candidate at `bb6b89282fb228e48865f2078438125ac214746c`. The supervisor still pins backend `5fc01cc6f465ff021cac7735d44245ca6e79e87b`; Project historical reads remain limited to opt-in disposable `morgoth_test`. No backend endpoint, schema, authorization or production setting changes. The WebView has twelve fixed read-only IPC commands, including one argument-free Ollama status read. It has no general HTTP, SQL, shell or model-generation capability.

| UI | Field | Evidence | Refresh and failure |
|---|---|---|---|
| Models / Ollama | Reachability | Native valid `/api/tags` response | Manual only. Unreachable or malformed is unavailable, not zero installed. |
| Models / Ollama | Installed names and sizes | Ollama `/api/tags`, typed/redacted | Manual only; up to 64 IDs, 32 KiB body, safe bounded names. |
| Models / Ollama | Resident names, sizes, reported VRAM | Ollama `/api/ps`, typed/redacted | Manual only; empty observed list differs from unavailable. No GPU utilization claim. |
| Models / Ollama | Last read time | Native system clock at request start | Displayed as observed timestamp; no historical series or auto polling. |
| Models / Ollama | Configured label | Optional native environment | Configured observation identity, not current CHAT model or experimental qualification. |
| Models / resources | Linux available memory and swap | Fixed `/proc/meminfo` read | Same manual request; malformed/missing remains unknown. |
| Models / resources | Cgroup memory limit, current and headroom | Fixed cgroup v2 files | Unknown when absent or unlimited; no host/guest conflation. |
| Models / resources | GPU placement/utilization | No approved measurement | Always unknown. |
| Overview | Resident count | Last successful manual Models read | Unread/unavailable is not represented as zero. |
| Missions, Capabilities, Security, Projects | D2 data | Existing authenticated native/Project transport | Unchanged Project scoping, cache keys, pagination and fixture-only approval semantics. |

Only the explicit `Lire l’état local` or a user click of the global refresh while on Models triggers the new native read. React Query retries, refetch-on-focus and polling remain disabled. Local model reads are independent of Management availability; they do not start Management, research or Ollama inference. An unloaded model does not make the service unavailable.

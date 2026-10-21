# Desktop D3 local-model observation contract

The sole new WebView command is `ollama_status_read`, permitted only in the main Tauri window. It accepts **no arguments**. Native Rust reads an optional numeric `MORGOTH_DESKTOP_OLLAMA_PORT` (default `11434`) and an optional bounded `MORGOTH_DESKTOP_OLLAMA_MODEL` label. The label is projected only when it exactly matches an observed installed model. Neither setting selects, loads or changes a model. An invalid port or label fails closed. The native destination is always literal `http://127.0.0.1:<port>`; there is no hostname resolution or frontend-supplied URL.

One manual read issues at most two sequential GETs: [`/api/tags`](https://docs.ollama.com/api/tags) for installed models and [`/api/ps`](https://docs.ollama.com/api/ps) for models Ollama currently reports as running. The reqwest client has no proxy inheritance, redirects or cookie store; connect timeout is 1 second, request timeout 3 seconds, and each JSON body is capped at 32 KiB. No credential header is added. No automatic retries, polling, warming, generation or model lifecycle request exists. The old CHAT/research transport is untouched.

The Rust DTO exposes only bounded model identifiers, reported size, optional Ollama-reported `size_vram`, a native read timestamp, fixed status/failure codes and fixed procfs/cgroup resource fields. Raw `details`, digest, HTTP bodies, error text and model output are discarded. The WebView independently rejects unknown fields, invalid identifiers, unsafe numbers, duplicate IDs and contradictory observed/unavailable states. An empty `/api/ps` list means **observed no resident models**; an unavailable `/api/ps` means residency is **unknown**. Installation, residency, a native-only configured label, selection for an experiment and task qualification are distinct facts. D3 observes only the first three, and the configured label is not the global CHAT selection.

| Displayed fact | Read source | Meaning and limit |
|---|---|---|
| Service and installed list | Manual native `GET /api/tags` | A valid response establishes local service reachability and its reported installed names; no inference readiness claim. |
| Resident list and reported VRAM | Manual native `GET /api/ps` | Reported loaded models and allocation; `size_vram` does not prove GPU placement, utilization or exclusive physical VRAM. |
| Configured label | Optional native process environment | Declarative observation label only; unknown absent that variable; never a model-selection control. |
| Available memory, swap | Bounded reads of fixed `/proc/meminfo` keys | Linux guest values at native read time; not Windows host capacity, Ollama RSS or free GPU VRAM. |
| Cgroup limit/current/headroom | Bounded reads of fixed cgroup v2 memory files | Known only when both finite limit and current usage parse; `max`, missing and malformed remain unknown. |
| CPU/GPU placement and GPU utilization | No approved source | Explicitly unknown; no shell, GPU utility or inference probe is run. |
| Qualification results | No D3 read source | Not inferred from installation, loaded state or a successful GET. |

The status DTO can be complete, partial or unavailable. If `/api/tags` fails, no `/api/ps` request follows. If tags succeeds and ps fails, installed metadata remains observed while residency is unknown. Failure classes are fixed (`CONNECT`, `TIMEOUT`, `TRANSPORT`, `HTTP_STATUS`, `REDIRECT_REJECTED`, `INCOMPATIBLE_RESPONSE`, `OVERSIZED_RESPONSE`) and carry no raw response. The UI hides a previous result when a later manual read fails validation.

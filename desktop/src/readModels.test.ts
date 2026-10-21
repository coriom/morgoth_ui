import { describe, expect, it } from "vitest";
import { readCapabilityPage, readManagementStatus, readMissionPage, readOllamaStatus, readProjectList, readResearchProfiles, readResearchStatus, readRuntimeStatus } from "./readModels";

describe("read model boundary", () => {
  it("rejects unsupported status and runtime values", () => {
    expect(() => readManagementStatus({ api_version: "2", management_available: true })).toThrow("INVALID_READ_MODEL");
    expect(() => readRuntimeStatus({ state: "PRODUCTION_READY", diagnostic: null })).toThrow("INVALID_READ_MODEL");
  });
  it("rejects malformed and duplicate Project catalog entries", () => {
    const p = { id: "a", name: "A", domain: "test", legacy: false, configuration_valid: true, runtime_checked: false };
    expect(() => readProjectList({ projects: [p, p], configuration_valid: true, runtime_checked: false })).toThrow("INVALID_READ_MODEL");
    expect(() => readProjectList({ projects: [{ ...p, configuration_valid: "yes" }], configuration_valid: true, runtime_checked: false })).toThrow("INVALID_READ_MODEL");
    expect(() => readProjectList({ projects: [{ ...p, vault_dir: "/private" }], configuration_valid: true, runtime_checked: false })).toThrow("INVALID_READ_MODEL");
  });
  it("accepts only bounded local-model metadata and honest unknown resources", () => {
    const status = { source: "OLLAMA_LOOPBACK_GET_V1", observed_at_ms: 1_700_000_000_000,
      service_state: "REACHABLE", installed_state: "OBSERVED", loaded_state: "OBSERVED", failure_class: null,
      configured_model: null, installed: [{ id: "model:1", size_bytes: 4096 }], loaded: [],
      resources: { linux_mem_available_bytes: null, linux_swap_total_bytes: null, linux_swap_used_bytes: null,
        cgroup_memory_limit_bytes: null, cgroup_memory_current_bytes: null, cgroup_memory_headroom_bytes: null } };
    expect(readOllamaStatus(status).loaded).toEqual([]);
    expect(() => readOllamaStatus({ ...status, installed: [{ id: "model:1", size_bytes: 1, digest: "private" }] })).toThrow("INVALID_READ_MODEL");
    expect(() => readOllamaStatus({ ...status, loaded_state: "UNAVAILABLE", failure_class: null })).toThrow("INVALID_READ_MODEL");
    expect(() => readOllamaStatus({ ...status, installed: [{ id: "bad\nname", size_bytes: 1 }] })).toThrow("INVALID_READ_MODEL");
    expect(() => readOllamaStatus({ ...status, resources: { ...status.resources, linux_mem_available_bytes: Number.MAX_SAFE_INTEGER + 1 } })).toThrow("INVALID_READ_MODEL");
  });
  it("rejects cross-Project and private fields in historical mission and capability pages", () => {
    const mission = { mission_id: "00000000-0000-0000-0000-000000000001", project_id: "a", objective: "Synthetic task",
      state: "PENDING_HUMAN_APPROVAL", revision: 1, stages: ["MISSION_RECEIVED"], capability_gaps: [], failure_codes: [],
      resume_eligible: true, receipt_count: 0, created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
      evidence_kind: "HISTORICAL_CHECKPOINT" };
    const page = { project_id: "a", missions: [mission], next_offset: null, source: "DISPOSABLE_POSTGRESQL" };
    expect(readMissionPage(page, "a").missions).toHaveLength(1);
    expect(() => readMissionPage(page, "b")).toThrow("INVALID_READ_MODEL");
    expect(() => readMissionPage({ ...page, missions: [{ ...mission, checkpoint: { secret: "x" } }] }, "a")).toThrow("INVALID_READ_MODEL");
    const cap = { project_id: "a", capability_id: "synthetic_read", version: "1", documentation_digest: "a".repeat(64),
      state: "PENDING_APPROVAL", validation_state: "PASSED", approval_kind: "NONE_RECORDED", source_identity: "fixture:local",
      updated_at: "2026-10-21T00:00:00Z", source: "DISPOSABLE_POSTGRESQL" };
    expect(readCapabilityPage({ project_id: "a", capabilities: [cap], next_offset: null, source: "DISPOSABLE_POSTGRESQL" }, "a").capabilities).toHaveLength(1);
    expect(() => readCapabilityPage({ project_id: "a", capabilities: [{ ...cap, invocation_contract: { token: "x" } }], next_offset: null, source: "DISPOSABLE_POSTGRESQL" }, "a")).toThrow("INVALID_READ_MODEL");
  });
  it("rejects malformed research and profile facts", () => {
    expect(() => readResearchStatus({ state: "RUNNING", project_id: "a", runtime: { profile: "codex", profile_status: "MAGIC" } })).toThrow("INVALID_READ_MODEL");
    expect(() => readResearchProfiles({ current: "codex", recommended: null, profiles: [], codex: { installed: true, authenticated: true, sandbox_available: true, sandbox_qualified: true, workloads_ready: "yes" } })).toThrow("INVALID_READ_MODEL");
  });
});

import { describe, expect, it } from "vitest";
import { readManagementStatus, readProjectList, readResearchProfiles, readResearchStatus, readRuntimeStatus } from "./readModels";

describe("read model boundary", () => {
  it("rejects unsupported status and runtime values", () => {
    expect(() => readManagementStatus({ api_version: "2", management_available: true })).toThrow("INVALID_READ_MODEL");
    expect(() => readRuntimeStatus({ state: "PRODUCTION_READY", diagnostic: null })).toThrow("INVALID_READ_MODEL");
  });
  it("rejects malformed and duplicate Project catalog entries", () => {
    const p = { id: "a", name: "A", domain: "test", postgres_schema: "a", legacy: false, configuration_valid: true, runtime_checked: false };
    expect(() => readProjectList({ projects: [p, p], configuration_valid: true, runtime_checked: false })).toThrow("INVALID_READ_MODEL");
    expect(() => readProjectList({ projects: [{ ...p, configuration_valid: "yes" }], configuration_valid: true, runtime_checked: false })).toThrow("INVALID_READ_MODEL");
  });
  it("rejects malformed research and profile facts", () => {
    expect(() => readResearchStatus({ state: "RUNNING", project_id: "a", runtime: { profile: "codex", profile_status: "MAGIC" } })).toThrow("INVALID_READ_MODEL");
    expect(() => readResearchProfiles({ current: "codex", recommended: null, profiles: [], codex: { installed: true, authenticated: true, sandbox_available: true, sandbox_qualified: true, workloads_ready: "yes" } })).toThrow("INVALID_READ_MODEL");
  });
});

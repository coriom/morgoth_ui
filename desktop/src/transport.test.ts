import { beforeEach, describe, expect, it, vi } from "vitest";
import { nativeManagement, nativeResearch, nativeOllama } from "./transport";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async (_command: string, _args?: unknown) => ({})) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
beforeEach(() => invoke.mockClear());

describe("D2 fixed native read transport", () => {
  it("uses only fixed management and Project evidence reads", async () => {
    await nativeManagement.runtimeStatus();
    await nativeManagement.status();
    await nativeManagement.domains();
    await nativeManagement.projects();
    await nativeManagement.project("research_a");
    await nativeManagement.validation("research_a");
    await nativeManagement.missions("research_a", 0);
    await nativeManagement.mission("research_a", "00000000-0000-0000-0000-000000000001");
    await nativeManagement.capabilities("research_a", 0);
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([
      "management_runtime_status", "management_status", "list_domains", "list_projects", "get_project", "validate_project",
      "list_mission_reads", "get_mission_read", "list_capability_reads",
    ]);
    expect(invoke.mock.calls[4]?.[1]).toEqual({ projectId: "research_a" });
    expect(invoke.mock.calls[5]?.[1]).toEqual({ projectId: "research_a" });
    expect(Object.keys(nativeManagement)).toEqual(["runtimeStatus", "status", "domains", "projects", "project", "validation", "missions", "mission", "capabilities"]);
  });
  it("uses only two research reads", async () => {
    await nativeResearch.status();
    await nativeResearch.profiles();
    expect(invoke.mock.calls.map((call) => call[0])).toEqual(["research_engine_status", "research_profiles"]);
    expect(Object.keys(nativeResearch)).toEqual(["status", "profiles"]);
  });
  it("uses one argument-free local-model read command", async () => {
    await nativeOllama.status();
    expect(invoke.mock.calls).toEqual([["ollama_status_read"]]);
    expect(Object.keys(nativeOllama)).toEqual(["status"]);
  });
});

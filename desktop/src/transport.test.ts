import { beforeEach, describe, expect, it, vi } from "vitest";
import { nativeManagement, nativeResearch } from "./transport";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async (_command: string, _args?: unknown) => ({})) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
beforeEach(() => invoke.mockClear());

describe("D1 fixed native read transport", () => {
  it("uses only six fixed management reads", async () => {
    await nativeManagement.runtimeStatus();
    await nativeManagement.status();
    await nativeManagement.domains();
    await nativeManagement.projects();
    await nativeManagement.project("research_a");
    await nativeManagement.validation("research_a");
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([
      "management_runtime_status", "management_status", "list_domains", "list_projects", "get_project", "validate_project",
    ]);
    expect(invoke.mock.calls[4]?.[1]).toEqual({ projectId: "research_a" });
    expect(invoke.mock.calls[5]?.[1]).toEqual({ projectId: "research_a" });
    expect(Object.keys(nativeManagement)).toEqual(["runtimeStatus", "status", "domains", "projects", "project", "validation"]);
  });
  it("uses only two research reads", async () => {
    await nativeResearch.status();
    await nativeResearch.profiles();
    expect(invoke.mock.calls.map((call) => call[0])).toEqual(["research_engine_status", "research_profiles"]);
    expect(Object.keys(nativeResearch)).toEqual(["status", "profiles"]);
  });
});

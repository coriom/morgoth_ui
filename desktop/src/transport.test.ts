import { beforeEach, describe, expect, it, vi } from "vitest";
import { nativeManagement, nativeResearch } from "./transport";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async (_command: string, _args?: unknown) => ({})) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
beforeEach(() => invoke.mockClear());

describe("fixed native transport", () => {
  it("uses only the seven explicit Tauri commands", async () => {
    await nativeManagement.runtimeStatus();
    await nativeManagement.status();
    await nativeManagement.domains();
    await nativeManagement.projects();
    await nativeManagement.project("research_a");
    await nativeManagement.validation("research_a");
    await nativeManagement.create({ id: "research_a", name: "A", domain: "crypto" });
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([
      "management_runtime_status", "management_status", "list_domains", "list_projects", "get_project", "validate_project", "create_project",
    ]);
    expect(invoke.mock.calls[4]?.[1]).toEqual({ projectId: "research_a" });
    expect(invoke.mock.calls[6]?.[1]).toEqual({ input: { id: "research_a", name: "A", domain: "crypto" } });
  });
  it("uses only six explicit research commands and two identifiers", async () => {
    await nativeResearch.status();
    await nativeResearch.initialize("research_a");
    await nativeResearch.profiles();
    await nativeResearch.selectProfile("codex");
    await nativeResearch.start();
    await nativeResearch.stop();
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([
      "research_engine_status", "initialize_research_engine", "research_profiles",
      "select_research_profile", "start_research", "stop_research_engine",
    ]);
    expect(invoke.mock.calls[1]?.[1]).toEqual({ projectId: "research_a" });
    expect(invoke.mock.calls[3]?.[1]).toEqual({ profileId: "codex" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { nativeManagement } from "./transport";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async (_command: string, _args?: unknown) => ({})) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
beforeEach(() => invoke.mockClear());

describe("fixed native transport", () => {
  it("uses only the six explicit Tauri commands", async () => {
    await nativeManagement.status();
    await nativeManagement.domains();
    await nativeManagement.projects();
    await nativeManagement.project("research_a");
    await nativeManagement.validation("research_a");
    await nativeManagement.create({ id: "research_a", name: "A", domain: "crypto" });
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([
      "management_status", "list_domains", "list_projects", "get_project", "validate_project", "create_project",
    ]);
    expect(invoke.mock.calls[3]?.[1]).toEqual({ projectId: "research_a" });
    expect(invoke.mock.calls[5]?.[1]).toEqual({ input: { id: "research_a", name: "A", domain: "crypto" } });
  });
});

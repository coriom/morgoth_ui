import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { nativeDrafts, readDraft, readDraftList, readPreferred } from "./drafts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

const base = { schema_version: 1, draft_id: "00000000-0000-4000-8000-000000000001", project_id: "alpha",
  title: "Brief", objective: "Find an answer", verification_criteria: "Result is visible",
  revision: 1, created_at_ms: 10, updated_at_ms: 10 };

describe("local draft IPC decoding", () => {
  it("accepts one bounded Project-scoped record", () => {
    expect(readDraft(base, "alpha")).toEqual(base);
    expect(readDraftList([base], "alpha")).toHaveLength(1);
    expect(readPreferred("alpha")).toBe("alpha");
    expect(readPreferred(null)).toBeNull();
  });
  it("rejects foreign, malformed, duplicate and overlarge native responses", () => {
    expect(() => readDraft(base, "beta")).toThrow();
    expect(() => readDraft({ ...base, objective: "", secret: "hidden" }, "alpha")).toThrow();
    expect(() => readDraft({ ...base, revision: -1 }, "alpha")).toThrow();
    expect(() => readDraftList([base, base], "alpha")).toThrow();
    expect(() => readDraftList([base], "../alpha")).toThrow();
    expect(() => readPreferred("../../outside")).toThrow();
  });
  it("exposes fixed native commands without caller-controlled paths or destinations", async () => {
    await nativeDrafts.setPreferred("alpha");
    expect(invoke).toHaveBeenLastCalledWith("preferred_project_set", { projectId: "alpha" });
    await nativeDrafts.list("alpha");
    expect(invoke).toHaveBeenLastCalledWith("local_drafts_list", { projectId: "alpha" });
    await nativeDrafts.delete("alpha", base.draft_id, 1);
    expect(invoke).toHaveBeenLastCalledWith("local_draft_delete", { projectId: "alpha", draftId: base.draft_id, expectedRevision: 1 });
  });
});

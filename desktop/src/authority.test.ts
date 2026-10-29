import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("Tauri D5 authority declaration", () => {
  it("binds fixed read and local-document commands to one local window", () => {
    const config = read("../src-tauri/tauri.conf.json");
    const capability = read("../src-tauri/capabilities/main.json");
    expect(config.app.windows).toEqual([]);
    expect(config.app.security.capabilities).toEqual(["main"]);
    expect(capability.windows).toEqual(["main"]);
    expect(capability.remote).toBeUndefined();
    expect(capability.permissions).toEqual([
      "allow-management-runtime-status",
      "allow-management-status", "allow-list-domains", "allow-list-projects", "allow-create-project",
      "allow-get-project", "allow-validate-project",
      "allow-list-mission-reads", "allow-get-mission-read", "allow-list-capability-reads", "allow-list-knowledge-reads", "allow-get-knowledge-read",
      "allow-research-engine-status", "allow-research-profiles", "allow-ollama-status-read",
      "allow-preferred-project-read", "allow-preferred-project-set", "allow-text-size-read", "allow-text-size-set",
      "allow-connector-catalog", "allow-connector-connect", "allow-connector-test", "allow-connector-disconnect", "allow-local-drafts-list",
      "allow-local-draft-get", "allow-local-draft-create", "allow-local-draft-update", "allow-local-draft-delete",
      "allow-local-notes-list", "allow-local-note-get", "allow-local-note-create", "allow-local-note-update", "allow-local-note-delete", "allow-local-note-export",
      "allow-local-notes-import-preview", "allow-local-notes-import-apply",
      "allow-workspace-backup-counts", "allow-workspace-backup-export", "allow-workspace-restore-preview", "allow-workspace-restore-apply",
      "allow-list-structured-theses", "allow-get-structured-thesis", "allow-list-structured-contradictions", "allow-get-structured-contradiction",
    ]);
    expect(config.app.security.csp).toContain("frame-src 'none'");
    expect(config.app.security.csp).not.toContain("http://127.0.0.1");
    expect(config.app.security.devCsp).toContain("http://127.0.0.1:5173");
    const native = readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");
    const registered = native.match(/\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1];
    expect(registered?.replace(/\s/g, "").split(",").filter(Boolean)).toEqual([
      "connector_catalog", "connector_connect", "connector_test", "connector_disconnect",
      "management_runtime_status", "management_status", "list_domains", "list_projects", "create_project",
      "get_project", "validate_project", "list_mission_reads", "get_mission_read", "list_capability_reads", "list_knowledge_reads", "get_knowledge_read", "list_structured_theses", "get_structured_thesis", "list_structured_contradictions", "get_structured_contradiction", "research_engine_status", "research_profiles", "ollama_status_read",
      "preferred_project_read", "preferred_project_set", "text_size_read", "text_size_set", "local_drafts_list", "local_draft_get",
      "local_draft_create", "local_draft_update", "local_draft_delete",
      "local_notes_list", "local_note_get", "local_note_create", "local_note_update", "local_note_delete", "local_note_export",
      "local_notes_import_preview", "local_notes_import_apply",
      "workspace_backup_counts", "workspace_backup_export", "workspace_restore_preview", "workspace_restore_apply",
    ]);
    expect(registered).not.toMatch(/initialize_research_engine|start_research|stop_research_engine|select_research_profile/);
    expect(registered).not.toMatch(/connector_(execute|modify|write|shell|filesystem|browser|windows)/);
  });
});

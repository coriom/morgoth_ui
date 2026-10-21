import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("Tauri D3 authority declaration", () => {
  it("binds only twelve read commands to one local window", () => {
    const config = read("../src-tauri/tauri.conf.json");
    const capability = read("../src-tauri/capabilities/main.json");
    expect(config.app.windows).toEqual([]);
    expect(config.app.security.capabilities).toEqual(["main"]);
    expect(capability.windows).toEqual(["main"]);
    expect(capability.remote).toBeUndefined();
    expect(capability.permissions).toEqual([
      "allow-management-runtime-status",
      "allow-management-status", "allow-list-domains", "allow-list-projects",
      "allow-get-project", "allow-validate-project",
      "allow-list-mission-reads", "allow-get-mission-read", "allow-list-capability-reads",
      "allow-research-engine-status", "allow-research-profiles", "allow-ollama-status-read",
    ]);
    expect(config.app.security.csp).toContain("frame-src 'none'");
    expect(config.app.security.csp).not.toContain("http://127.0.0.1");
    expect(config.app.security.devCsp).toContain("http://127.0.0.1:5173");
    const native = readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");
    const registered = native.match(/\.invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1];
    expect(registered?.replace(/\s/g, "").split(",").filter(Boolean)).toEqual([
      "management_runtime_status", "management_status", "list_domains", "list_projects",
      "get_project", "validate_project", "list_mission_reads", "get_mission_read", "list_capability_reads", "research_engine_status", "research_profiles", "ollama_status_read",
    ]);
    expect(registered).not.toMatch(/create_project|initialize_research_engine|start_research|stop_research_engine|select_research_profile/);
  });
});

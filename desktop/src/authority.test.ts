import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

describe("Tauri V1 authority declaration", () => {
  it("binds only six generated commands to one local window", () => {
    const config = read("../src-tauri/tauri.conf.json");
    const capability = read("../src-tauri/capabilities/main.json");
    expect(config.app.windows).toEqual([]);
    expect(config.app.security.capabilities).toEqual(["main"]);
    expect(capability.windows).toEqual(["main"]);
    expect(capability.remote).toBeUndefined();
    expect(capability.permissions).toEqual([
      "allow-management-status", "allow-list-domains", "allow-list-projects",
      "allow-get-project", "allow-validate-project", "allow-create-project",
    ]);
    expect(config.app.security.csp).toContain("frame-src 'none'");
    expect(config.app.security.csp).not.toContain("http://127.0.0.1");
    expect(config.app.security.devCsp).toContain("http://127.0.0.1:5173");
  });
});

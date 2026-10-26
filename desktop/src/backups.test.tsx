import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BackupWorkspace } from "./BackupWorkspace";
import { readCounts, readPreview, readReceipt, type BackupTransport } from "./backups";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const digest = "a".repeat(64);
const receipt = { project_id: "alpha", schema_version: 1, exported_at_ms: 1000, notes_count: 3, drafts_count: 2, sha256: digest, recovery_required: false };
const token = "00000000-0000-4000-8000-000000000001";
function transport(): BackupTransport {
  return { counts: vi.fn(async () => [0, 0]), export: vi.fn(async () => receipt),
    preview: vi.fn(async () => ({ receipt, token })), restore: vi.fn(async () => receipt) };
}
describe("D8 local backup UI boundary", () => {
  it("rejects malformed, cross-Project and oversized native results", () => {
    expect(readCounts([3, 2])).toEqual([3, 2]);
    expect(() => readCounts([501, 2])).toThrow();
    expect(() => readReceipt(receipt, "beta")).toThrow();
    expect(() => readReceipt({ ...receipt, path: "/secret" }, "alpha")).toThrow();
    expect(() => readPreview({ receipt, token, raw_archive: "private" }, "alpha")).toThrow();
  });
  it("requires verified Project and a preview before calling native confirmation", async () => {
    const api = transport(); const restored = vi.fn();
    const view = render(<BackupWorkspace projectId="alpha" verified={false} transport={api} onRestored={restored}/>);
    expect(screen.getByText(/non vérifié par Management/)).toBeTruthy();
    expect(api.counts).not.toHaveBeenCalled();
    view.rerender(<BackupWorkspace projectId="alpha" verified transport={api} onRestored={restored}/>);
    expect(await screen.findByText("0 notes · 0 briefs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Choisir une sauvegarde/ }));
    expect(await screen.findByText(/Confirmer la restauration/)).toBeTruthy();
    expect(api.restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restaurer dans alpha" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith("alpha", token));
    expect(restored).toHaveBeenCalledOnce();
  });
  it("keeps native confirmation refusal free of a success claim", async () => {
    const api = transport(); api.restore = vi.fn(async () => null);
    const restored = vi.fn();
    render(<BackupWorkspace projectId="alpha" verified transport={api} onRestored={restored}/>);
    await screen.findByText("0 notes · 0 briefs");
    fireEvent.click(screen.getByRole("button", { name: /Choisir une sauvegarde/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Restaurer dans alpha" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledOnce());
    expect(restored).not.toHaveBeenCalled();
    expect(screen.queryByText(/Restauration terminée/)).toBeNull();
  });
  it("clears pending restore when Project changes", async () => {
    const api = transport();
    const view = render(<BackupWorkspace projectId="alpha" verified transport={api} onRestored={()=>{}}/>);
    await screen.findByText("0 notes · 0 briefs");
    fireEvent.click(screen.getByRole("button", { name: /Choisir une sauvegarde/ }));
    await screen.findByText(/Confirmer la restauration/);
    view.rerender(<BackupWorkspace projectId="beta" verified={false} transport={api} onRestored={()=>{}}/>);
    await waitFor(() => expect(screen.queryByText(/Confirmer la restauration/)).toBeNull());
    expect(api.restore).not.toHaveBeenCalled();
  });
});

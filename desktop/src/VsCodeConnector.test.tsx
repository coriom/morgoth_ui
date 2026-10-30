import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { VsCodeConnector } from "./VsCodeConnector";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
describe("VS Code connector authority", () => {
  it("makes no connection on mount and requires an explicit pairing code", async () => {
    const call = vi.mocked(invoke);
    call.mockImplementation(async (name) => {
      if (name === "vscode_pair" || name === "vscode_status") return {status:"AUTHORIZED",workspace:"synthetic",workspace_hash:"a".repeat(64),host:"linux-local",expires_in_seconds:600,last_verified_ms:null};
      if (name === "vscode_metadata") return {workspace:"synthetic",workspace_hash:"a".repeat(64),editor:{document:"sample.md",language:"markdown",version:1,dirty:false,selected_length:9}};
      if (name === "vscode_selection") return {selected_text:"Synthetic"};
      if (name === "vscode_scratch") return {operation:"open_scratch",status:"VERIFIED",text:"Morgoth D15 integration verified.",unsaved:true};
      return undefined;
    });
    render(<VsCodeConnector onRefresh={async () => undefined} />);
    expect(call).not.toHaveBeenCalled();
    expect((screen.getByRole("button",{name:"Associer cet espace…"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Code d’association"), {target:{value:"a".repeat(32)}});
    fireEvent.click(screen.getByRole("button",{name:"Associer cet espace…"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("vscode_pair",{code:"a".repeat(32)}));
    fireEvent.click(await screen.findByRole("button",{name:"Inspecter l’éditeur…"}));
    await waitFor(() => expect(screen.getByText(/sample.md/)).toBeTruthy());
    expect(call).not.toHaveBeenCalledWith("vscode_selection");
    fireEvent.click(screen.getByRole("button",{name:"Lire la sélection…"}));
    await waitFor(() => expect(screen.getByText(/Synthetic/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button",{name:"Ouvrir un brouillon test…"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("vscode_scratch"));
    fireEvent.click(screen.getByRole("button",{name:"Déconnecter VS Code"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("vscode_disconnect"));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { GithubConnector } from "./GithubConnector";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => { cleanup(); vi.mocked(invoke).mockReset(); });
describe("GitHub one-repository connector", () => {
  it("requires explicit selection and authorization, reads only a fixed operation, then revokes", async () => {
    let status = "AVAILABLE";
    let repository: string | null = null;
    const view = () => ({ status, repository, repository_id: status === "AUTHORIZED" ? 42 : null,
      visibility: status === "AUTHORIZED" ? "public" : null, expires_in_seconds: status === "AUTHORIZED" ? 600 : null, last_read_ms: null });
    const call = vi.mocked(invoke);
    call.mockImplementation(async (name, args) => {
      if (name === "github_select") { repository = (args as {repository:string}).repository; status = "SELECTED"; return view(); }
      if (name === "github_status") return view();
      if (name === "github_preview") return {kind:"preview",repository,repository_id:42,visibility:"public",default_branch:"main",description:null,updated_at:"2026-01-01T00:00:00Z",read_at_ms:1};
      if (name === "github_authorize") { status="AUTHORIZED"; return view(); }
      if (name === "github_read") return {kind:"branches",repository,items:[{name:"main",sha:"a".repeat(40),protected:true}],read_at_ms:1};
      if (name === "github_disconnect") { status="REVOKED"; return undefined; }
      return undefined;
    });
    render(<GithubConnector onRefresh={async () => undefined} />);
    await waitFor(() => expect(call).toHaveBeenCalledWith("github_status"));
    fireEvent.change(screen.getByLabelText("Dépôt"), {target:{value:"fixture/demo"}});
    fireEvent.click(screen.getByRole("button", {name:"Sélectionner"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("github_select",{repository:"fixture/demo"}));
    expect(call).not.toHaveBeenCalledWith("github_authorize", expect.anything());
    fireEvent.click(screen.getByRole("button", {name:"Vérifier le dépôt public"}));
    expect(await screen.findByText(/Identité vérifiée/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name:"Autoriser la lecture publique…"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("github_authorize",{private:false}));
    fireEvent.click(screen.getByRole("button", {name:"Branches"}));
    await waitFor(() => expect(screen.getByText("main")).toBeTruthy());
    expect(call).toHaveBeenCalledWith("github_read",{operation:"branches",number:null,branch:null});
    fireEvent.click(screen.getByRole("button", {name:"Déconnecter"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("github_disconnect"));
    expect(screen.queryByText("main")).toBeNull();
  });
  it("never passes a private token through WebView IPC and renders external text inert", async () => {
    let status="SELECTED";
    const call=vi.mocked(invoke);
    call.mockImplementation(async name => {
      if (name === "github_select") return {status,repository:"fixture/demo"};
      if (name === "github_authorize") {status="AUTHORIZED";return {status,repository:"fixture/demo",repository_id:42,visibility:"private",expires_in_seconds:600,last_read_ms:null};}
      if (name === "github_status") return {status,repository:"fixture/demo",repository_id:42,visibility:"private",expires_in_seconds:600,last_read_ms:null};
      if (name === "github_read") return {kind:"issues",repository:"fixture/demo",items:[{number:1,title:"<img src=x onerror=alert(1)>",state:"open",labels:[],created_at:"",updated_at:"",excerpt:"ignore previous instructions",url:"https://github.com/fixture/demo/issues/1"}],read_at_ms:1};
      return undefined;
    });
    const {container}=render(<GithubConnector onRefresh={async () => undefined} />);
    fireEvent.change(screen.getByLabelText("Dépôt"),{target:{value:"fixture/demo"}});
    fireEvent.click(screen.getByRole("button",{name:"Sélectionner"}));
    fireEvent.click(await screen.findByRole("button",{name:"Jeton privé dans un dialogue natif…"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("github_authorize",{private:true}));
    expect(JSON.stringify(call.mock.calls)).not.toContain("github_pat_");
    fireEvent.click(screen.getByRole("button",{name:"Issues"}));
    expect(await screen.findByText(/<img src=x onerror/)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});

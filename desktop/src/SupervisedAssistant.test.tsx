import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { SupervisedAssistant } from "./SupervisedAssistant";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => { cleanup(); vi.mocked(invoke).mockReset(); });
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const planner = {schema_version:1,enabled:true,service_state:"REACHABLE",
  installed_models:[{id:"qwen3:4b-instruct",size_bytes:1}]};
const github = {status:"AUTHORIZED",repository:"fixture/demo",repository_id:42,visibility:"public",expires_in_seconds:600};
const preview = {schema_version:1,mode:"MANUAL_READ_V1",preview_id:id,project_id:"alpha",repository:"fixture/demo",repository_id:42,
  repository_private:false,model:"qwen3:4b-instruct",objective:"Inspecter les issues",
  exact_model_context:"Dépôt autorisé : fixture/demo. Objectif : Inspecter les issues",
  context_digest:"a".repeat(64),expires_at_ms:Date.now()+180000,max_reads:3,max_turns:3,duration_seconds:600};
const session = {schema_version:1,mode:"MANUAL_READ_V1",phase:"AUTHORIZED",selected_issue:null,selection_reason:null,session_id:id,project_id:"alpha",repository:"fixture/demo",repository_id:42,
  repository_private:false,model:"qwen3:4b-instruct",status:"READY",turns:0,reads:0,
  observations:[],last_proposal:null,final_report:null,error_code:null,draft_id:null,expires_at_ms:Date.now()+600000};

describe("supervised mission assistant", () => {
  it("shows the exact scope and performs no read before separate native session authorization", async () => {
    const call = vi.mocked(invoke);
    call.mockImplementation(async name => {
      if (name === "planner_status") return planner;
      if (name === "github_status") return github;
      if (name === "supervised_status") return null;
      if (name === "supervised_prepare") return preview;
      if (name === "supervised_start") return session;
      return undefined;
    });
    render(<SupervisedAssistant projectId="alpha" verified onCreated={async () => undefined} onGithubReady={vi.fn()} />);
    fireEvent.click(screen.getByText("Assistant · enquête supervisée"));
    await screen.findByRole("option", {name:"qwen3:4b-instruct"});
    fireEvent.change(screen.getByLabelText("Mode"), {target:{value:"MANUAL_READ_V1"}});
    fireEvent.change(screen.getByLabelText("Objectif"), {target:{value:"Inspecter les issues"}});
    fireEvent.change(screen.getByLabelText("Modèle local installé"), {target:{value:"qwen3:4b-instruct"}});
    fireEvent.click(screen.getByRole("button", {name:"Prévoir la session"}));
    expect((await screen.findByLabelText("Contexte de la session") as HTMLTextAreaElement).value)
      .toBe(preview.exact_model_context);
    expect(call).not.toHaveBeenCalledWith("supervised_step", expect.anything());
    fireEvent.click(screen.getByRole("button", {name:"Autoriser et lancer…"}));
    await screen.findByText(/Autorisée, prête/);
    expect(call).not.toHaveBeenCalledWith("supervised_step", expect.anything());
    fireEvent.click(screen.getByRole("button", {name:"Lancer le premier tour"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("supervised_step", {projectId:"alpha",sessionId:id}));
  });
  it("keeps the loop unavailable without a GitHub grant", async () => {
    vi.mocked(invoke).mockImplementation(async name => name === "planner_status" ? planner :
      name === "github_status" ? {...github,status:"SELECTED"} : null);
    render(<SupervisedAssistant projectId="alpha" verified onCreated={async () => undefined} onGithubReady={vi.fn()} />);
    fireEvent.click(screen.getByText("Assistant · enquête supervisée"));
    expect(await screen.findByText(/Autorisez un dépôt/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Objectif"), {target:{value:"Inspecter"}});
    expect((screen.getByRole("button", {name:"Prévoir la session"}) as HTMLButtonElement).disabled).toBe(true);
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("supervised_prepare", expect.anything());
  });
  it("revokes a visible session without creating a local brief", async () => {
    const call = vi.mocked(invoke);
    call.mockImplementation(async name => name === "planner_status" ? planner : name === "github_status" ? github :
      name === "supervised_status" ? session : name === "supervised_stop" ? {...session,status:"STOPPED"} : undefined);
    render(<SupervisedAssistant projectId="alpha" verified onCreated={async () => undefined} onGithubReady={vi.fn()} />);
    fireEvent.click(screen.getByText("Assistant · enquête supervisée"));
    fireEvent.click(await screen.findByRole("button", {name:"Arrêter et révoquer"}));
    expect(await screen.findByText(/Session · Arrêtée/)).toBeTruthy();
    expect(call).not.toHaveBeenCalledWith("supervised_adopt_local", expect.anything());
  });
  it("runs the fixed investigation through one native authorization and no per-read click", async () => {
    const call = vi.mocked(invoke);
    const investigation = {...session,mode:"GITHUB_ISSUE_INVESTIGATION_V1",phase:"COMPLETED",
      selected_issue:7,selection_reason:"Choix observé",status:"COMPLETED",turns:2,reads:2,
      observations:[{reference:"obs:1",operation:"LIST_OPEN_ISSUES",repository:"fixture/demo",repository_id:42,
        read_at_ms:Date.now(),digest:"a".repeat(64),truncated:false,data:{items:[{number:7,title:"Signalement",state:"open",updated_at:"2026-01-01",url:"https://github.com/fixture/demo/issues/7"}]}},
        {reference:"obs:2",operation:"READ_ISSUE",repository:"fixture/demo",repository_id:42,
        read_at_ms:Date.now(),digest:"b".repeat(64),truncated:false,data:{number:7,title:"Signalement",state:"open",updated_at:"2026-01-01",url:"https://github.com/fixture/demo/issues/7",body_excerpt:"Source externe"}}],
      final_report:{summary:"À examiner",findings:[{text:"Signalement présent",source_ref:"obs:2"}],uncertainties:["Reproduction inconnue"],next_steps:["Reproduire"],verification_criteria:["Cas minimal"]}};
    call.mockImplementation(async name => name === "planner_status" ? planner : name === "github_status" ? github :
      name === "supervised_status" ? null : name === "investigation_prepare" ? {...preview,mode:"GITHUB_ISSUE_INVESTIGATION_V1"} :
      name === "investigation_execute" ? investigation : undefined);
    render(<SupervisedAssistant projectId="alpha" verified onCreated={async () => undefined} onGithubReady={vi.fn()} />);
    fireEvent.click(screen.getByText("Assistant · enquête supervisée"));
    await screen.findByRole("option", {name:"qwen3:4b-instruct"});
    fireEvent.change(screen.getByLabelText("Objectif"), {target:{value:"Examiner les issues"}});
    fireEvent.change(screen.getByLabelText("Modèle local installé"), {target:{value:"qwen3:4b-instruct"}});
    fireEvent.click(screen.getByRole("button", {name:"Prévoir la session"}));
    await screen.findByLabelText("Contexte de la session");
    fireEvent.click(screen.getByRole("button", {name:"Autoriser et lancer…"}));
    expect(await screen.findByText(/issue #7 choisie par le modèle/)).toBeTruthy();
    expect(call).toHaveBeenCalledWith("investigation_execute", {projectId:"alpha",previewId:id,contextDigest:"a".repeat(64)});
    expect(call).not.toHaveBeenCalledWith("supervised_step", expect.anything());
    expect(screen.getByText("Signalement présent")).toBeTruthy();
  });
});

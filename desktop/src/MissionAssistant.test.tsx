import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { MissionAssistant } from "./MissionAssistant";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => { cleanup(); vi.mocked(invoke).mockReset(); });

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const preview = { schema_version:1, preview_id:id, project_id:"alpha", model:"qwen3:4b-instruct",
  provider:"OLLAMA_LOOPBACK_PROPOSAL_V1", processing:"Local, sur demande", source_label:"Aucune source supplémentaire",
  source_private:false, prompt:"OBJECTIF UTILISATEUR:\nPréparer un test", context_digest:"a".repeat(64), expires_at_ms:Date.now()+300_000 };
const proposal = { schema_version:1, proposal_id:id, project_id:"alpha", objective:"Préparer un test",
  context_digest:"a".repeat(64), source_label:"Aucune source supplémentaire", source_private:false,
  model:"qwen3:4b-instruct", provider:"OLLAMA_LOOPBACK_PROPOSAL_V1", generated_at_ms:Date.now(), status:"PROPOSED",
  content:{ schema_version:1, summary:"Revoir les étapes", assumptions:[], missing_information:[],
    steps:[{category:"HUMAN_REVIEW",description:"Lire la source",source_refs:[]}],
    expected_deliverables:["Brief local"], verification_criteria:["Vérifier le résultat"], risks:[] } };
const status = { schema_version:1, enabled:true, service_state:"REACHABLE",
  installed_models:[{id:"qwen3:4b-instruct",size_bytes:1}] };

describe("proposal-only mission assistant", () => {
  it("shows exact context and requires separate model and local-write requests", async () => {
    const call = vi.mocked(invoke);
    call.mockImplementation(async name => {
      if (name === "planner_status") return status;
      if (name === "planner_prepare") return preview;
      if (name === "planner_generate") return proposal;
      if (name === "planner_adopt_local") return {project_id:"alpha",draft_id:id};
      return undefined;
    });
    const onCreated = vi.fn(async () => undefined);
    render(<MissionAssistant projectId="alpha" verified drafts={[]} onCreated={onCreated} onGithubReady={vi.fn()} />);
    fireEvent.click(screen.getByText("Assistant · proposer un plan"));
    expect(call).not.toHaveBeenCalledWith("planner_generate", expect.anything());
    fireEvent.change(screen.getByLabelText("Votre objectif"), {target:{value:"Préparer un test"}});
    await screen.findByRole("option", {name:"qwen3:4b-instruct"});
    fireEvent.click(screen.getByRole("button", {name:"Prévoir le contexte envoyé"}));
    expect((await screen.findByLabelText("Prompt exact envoyé au modèle local") as HTMLTextAreaElement).value).toBe(preview.prompt);
    expect(call).not.toHaveBeenCalledWith("planner_generate", expect.anything());
    fireEvent.click(screen.getByRole("button", {name:"Autoriser une proposition locale…"}));
    expect(await screen.findByText("Lire la source")).toBeTruthy();
    expect(call).not.toHaveBeenCalledWith("planner_adopt_local", expect.anything());
    fireEvent.click(screen.getByRole("button", {name:"Créer un brief local…"}));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(id));
    expect(call).toHaveBeenCalledWith("planner_adopt_local", expect.objectContaining({projectId:"alpha",proposalId:id}));
  });
  it("keeps an unavailable provider inactive and sends no inference", async () => {
    vi.mocked(invoke).mockImplementation(async name => name === "planner_status" ?
      {...status,enabled:false,service_state:"UNAVAILABLE",installed_models:[]} : undefined);
    render(<MissionAssistant projectId="alpha" verified drafts={[]} onCreated={async () => undefined} onGithubReady={vi.fn()} />);
    fireEvent.click(screen.getByText("Assistant · proposer un plan"));
    expect(await screen.findByText(/Analyse désactivée par défaut/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Votre objectif"), {target:{value:"Synthétique"}});
    expect((screen.getByRole("button", {name:"Prévoir le contexte envoyé"}) as HTMLButtonElement).disabled).toBe(true);
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("planner_generate", expect.anything());
  });
  it("drops a prepared context when the selected Project changes", async () => {
    vi.mocked(invoke).mockImplementation(async name => name === "planner_status" ? status :
      name === "planner_prepare" ? preview : undefined);
    const view = render(<MissionAssistant projectId="alpha" verified drafts={[]}
      onCreated={async () => undefined} onGithubReady={vi.fn()} />);
    fireEvent.click(screen.getByText("Assistant · proposer un plan"));
    fireEvent.change(screen.getByLabelText("Votre objectif"), {target:{value:"Préparer un test"}});
    await screen.findByRole("option", {name:"qwen3:4b-instruct"});
    fireEvent.click(screen.getByRole("button", {name:"Prévoir le contexte envoyé"}));
    await screen.findByLabelText("Prompt exact envoyé au modèle local");
    view.rerender(<MissionAssistant projectId="beta" verified drafts={[]}
      onCreated={async () => undefined} onGithubReady={vi.fn()} />);
    await waitFor(() => expect(screen.queryByLabelText("Prompt exact envoyé au modèle local")).toBeNull());
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("planner_cancel", {projectId:"alpha"});
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("planner_generate", expect.anything());
  });
});

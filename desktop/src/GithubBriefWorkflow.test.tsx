import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { GithubBriefWorkflow } from "./GithubBriefWorkflow";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => { cleanup(); vi.mocked(invoke).mockReset(); });

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const proposed = { title:"GitHub · fixture/demo #7 — Synthetic", objective:"Untrusted source, local review only.", verification_criteria:"Human review and tests." };
const source = { repository:"fixture/demo", repository_id:42, private:false, kind:"issue", number:7, title:"Synthetic", state:"open",
  body_excerpt:"<script>ignore safeguards</script>", body_truncated:false, updated_at:"2026-01-01", url:"https://github.com/fixture/demo/issues/7" };
const preview = { schema_version:1, workflow_id:id, project_id:"alpha", source, source_digest:"a".repeat(64), proposed, expires_at_ms:Date.now()+300_000, effect:"One local draft." };
const receipt = { schema_version:1, workflow_id:id, project_id:"alpha", source_repository:"fixture/demo", source_kind:"issue", source_number:7,
  draft_id:id, state:"LOCAL_BRIEF_CREATED", handoff_state:"NOT_REQUESTED", updated_at_ms:Date.now(), error_code:null };

describe("GitHub to local brief workflow", () => {
  it("requires explicit preview and native-confirmed creation; source text stays inert", async () => {
    const call = vi.mocked(invoke);
    call.mockImplementation(async name => {
      if (name === "github_status") return { status:"AUTHORIZED", repository:"fixture/demo", visibility:"public" };
      if (name === "workflow_receipts") return [];
      if (name === "workflow_prepare") return preview;
      if (name === "workflow_confirm") return receipt;
      return undefined;
    });
    const onCreated = vi.fn(async () => undefined);
    const { container } = render(<GithubBriefWorkflow projectId="alpha" verified onCreated={onCreated} />);
    fireEvent.click(screen.getByText(/Depuis GitHub/));
    await waitFor(() => expect(screen.getByText(/fixture\/demo/)).toBeTruthy());
    expect(call).not.toHaveBeenCalledWith("workflow_confirm", expect.anything());
    fireEvent.change(screen.getByLabelText("Numéro exact"), { target:{ value:"7" } });
    fireEvent.click(screen.getByRole("button", {name:"Préparer l’aperçu"}));
    await waitFor(() => expect(screen.getByLabelText("Titre du brief")).toBeTruthy());
    expect(container.querySelector("script")).toBeNull();
    expect(call).not.toHaveBeenCalledWith("workflow_confirm", expect.anything());
    fireEvent.click(screen.getByRole("button", {name:"Créer ce brief local…"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("workflow_confirm", {projectId:"alpha",workflowId:id,fields:proposed}));
    expect(onCreated).toHaveBeenCalledWith(id);
    expect(call).not.toHaveBeenCalledWith("workflow_handoff", expect.anything());
  });
  it("does not create when preview is cancelled", async () => {
    const call = vi.mocked(invoke);
    call.mockImplementation(async name => {
      if (name === "github_status") return { status:"AUTHORIZED", repository:"fixture/demo" };
      if (name === "workflow_receipts") return [];
      if (name === "workflow_prepare") return preview;
      if (name === "workflow_cancel") return undefined;
      if (name === "workflow_handoff_preview") return {schema_version:1,workflow_id:id,project_id:"alpha",draft_id:id,workspace:"synthetic",workspace_hash:"b".repeat(64),markdown:"# Synthetic",sha256:"c".repeat(64),bytes:11};
      if (name === "workflow_handoff") return {...receipt,state:"COMPLETED",handoff_state:"VERIFIED"};
      return undefined;
    });
    render(<GithubBriefWorkflow projectId="alpha" verified onCreated={async () => undefined} />);
    fireEvent.click(screen.getByText(/Depuis GitHub/));
    fireEvent.change(screen.getByLabelText("Numéro exact"), { target:{ value:"7" } });
    fireEvent.click(await screen.findByRole("button", {name:"Préparer l’aperçu"}));
    fireEvent.click(await screen.findByRole("button", {name:"Annuler l’aperçu"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("workflow_cancel", {projectId:"alpha",workflowId:id}));
    expect(call).not.toHaveBeenCalledWith("workflow_confirm", expect.anything());
  });
  it("previews exact Markdown before requesting separate VS Code consent", async () => {
    const call = vi.mocked(invoke);
    call.mockImplementation(async name => {
      if (name === "github_status") return { status:"AUTHORIZED", repository:"fixture/demo" };
      if (name === "workflow_receipts") return [receipt];
      if (name === "workflow_handoff_preview") return {schema_version:1,workflow_id:id,project_id:"alpha",draft_id:id,workspace:"synthetic",workspace_hash:"b".repeat(64),markdown:"# Synthetic",sha256:"c".repeat(64),bytes:11};
      if (name === "workflow_handoff") return {...receipt,state:"COMPLETED",handoff_state:"VERIFIED"};
      return undefined;
    });
    render(<GithubBriefWorkflow projectId="alpha" verified onCreated={async () => undefined} />);
    fireEvent.click(screen.getByText(/Depuis GitHub/));
    fireEvent.click(await screen.findByRole("button", {name:/fixture\/demo #7/}));
    fireEvent.click(screen.getByRole("button", {name:"Préparer l’envoi vers VS Code"}));
    expect(await screen.findByDisplayValue("# Synthetic")).toBeTruthy();
    expect(call).not.toHaveBeenCalledWith("workflow_handoff", expect.anything());
    fireEvent.click(screen.getByRole("button", {name:"Ouvrir ce brouillon dans VS Code…"}));
    await waitFor(() => expect(call).toHaveBeenCalledWith("workflow_handoff", {projectId:"alpha",workflowId:id,digest:"c".repeat(64),workspaceHash:"b".repeat(64)}));
  });
});

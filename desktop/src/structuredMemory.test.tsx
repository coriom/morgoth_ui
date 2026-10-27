import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StructuredMemory } from "./StructuredMemory";
import { readThesisPage } from "./structuredMemory";
import type { ManagementTransport, StructuredThesis, StructuredContradiction } from "./transport";

afterEach(cleanup);
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
const c = "00000000-0000-4000-8000-000000000003";
const now = "2026-10-27T00:00:00+00:00";
const thesis = (id: string, project="alpha", status: StructuredThesis["status"]="active"): StructuredThesis => ({
  schema_version:1,project_id:project,thesis_id:id,subject:id===a?"Sujet Alpha":"Sujet Beta",claim:"Affirmation enregistrée",
  confidence:"medium",status,created_at:now,code_version:"fixture",objective_id:null,
  quarantine_reason:status==="quarantined"?"à revoir":null,superseded_by:status==="superseded"?a:null,
  evidence_sources:[{source:"get_news"}],evidence_count:2,evidence_omitted:true,source:"PROJECT_STRUCTURED_POSTGRESQL",
});
const contradiction: StructuredContradiction = {schema_version:1,project_id:"alpha",contradiction_id:c,
  subject_group:"Sujet partagé",thesis_id_a:a,thesis_id_b:b,detected_at:now,resolution:null,source:"PROJECT_STRUCTURED_POSTGRESQL"};
function mock(): ManagementTransport {
  return {structuredTheses:vi.fn(async (id) => ({schema_version:1,project_id:id,source:"PROJECT_STRUCTURED_POSTGRESQL",read_at:now,
    theses:id==="alpha"?[thesis(a),thesis(b,"alpha","quarantined")]:[],next_offset:null})),
  structuredThesis:vi.fn(async (id, identity) => thesis(identity,id)),
  structuredContradictions:vi.fn(async (id) => ({schema_version:1,project_id:id,source:"PROJECT_STRUCTURED_POSTGRESQL",read_at:now,
    contradictions:id==="alpha"?[contradiction]:[],next_offset:null})),
  structuredContradiction:vi.fn(async () => contradiction)} as unknown as ManagementTransport;
}
function view(api: ManagementTransport, project="alpha", verified=true) {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  return render(<QueryClientProvider client={client}><StructuredMemory key={project} projectId={project} verified={verified} transport={api}/></QueryClientProvider>);
}
describe("D9 structured memory",()=>{
  it("rejects a foreign or malformed native page before rendering",()=>{
    const valid={schema_version:1,project_id:"beta",source:"PROJECT_STRUCTURED_POSTGRESQL",read_at:now,theses:[thesis(a,"beta")],next_offset:null};
    expect(()=>readThesisPage(valid,"alpha",0)).toThrow();
    expect(()=>readThesisPage({...valid,project_id:"alpha",theses:[{...thesis(a),claim:"x".repeat(2049)}]},"alpha",0)).toThrow();
    expect(()=>readThesisPage({...valid,project_id:"alpha",theses:[{...thesis(a),raw_prompt:"secret"}]},"alpha",0)).toThrow();
  });
  it("keeps unavailable, empty and Project scopes separate",async()=>{
    const api=mock();
    const app=view(api);
    expect(await screen.findByText("Sujet Alpha")).toBeTruthy();
    app.unmount();
    view(api,"beta");
    expect(await screen.findByText("Aucune thèse enregistrée")).toBeTruthy();
    expect(screen.queryByText("Sujet Alpha")).toBeNull();
    expect(api.structuredTheses).toHaveBeenCalledWith("beta",0,"","","");
  });
  it("shows recorded contradiction and graph relationships without generation",async()=>{
    const api=mock(); view(api);
    fireEvent.click(await screen.findByRole("button",{name:/Sujet Alpha/}));
    expect(await screen.findByText("Affirmation enregistrée")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/Sujet partagé/}));
    expect(await screen.findByText(/Aucune résolution enregistrée/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Relations"}));
    expect(screen.getByLabelText("Navigation textuelle des relations")).toBeTruthy();
    expect(screen.getByLabelText("Graphe des relations enregistrées").querySelectorAll("line.graph-edge")).toHaveLength(2);
  });
  it("does not query unverified Projects and does not turn failure into an empty corpus",async()=>{
    const api=mock(); view(api,"alpha",false);
    expect(screen.getByText("Project non vérifié")).toBeTruthy();
    expect(api.structuredTheses).not.toHaveBeenCalled();
    cleanup();
    api.structuredTheses=vi.fn(async()=>{throw new Error("SOURCE_NOT_AUTHORIZED");});
    view(api);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Aucune thèse enregistrée")).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BackendKnowledge } from "./BackendKnowledge";
import { readKnowledgeCorpus, readKnowledgeDocument, readKnowledgePage } from "./backendKnowledge";
import type { KnowledgeDocument, KnowledgePage, ManagementTransport } from "./transport";

afterEach(cleanup);
const ids = ["a".repeat(64),"b".repeat(64)];
const item = (id:number, project="alpha"): KnowledgeDocument => ({document_id:ids[id], project_id:project,
  title:id===0?"Index":"Sujet", recorded_at:"2026-10-26T00:00:00+00:00",
  links:id===0?[{label:"Sujet",target_id:ids[1]},{label:"Absent",target_id:null}]:[],
  source:"PROJECT_MARKDOWN_VAULT",content:null});
const page = (project="alpha"): KnowledgePage => ({schema_version:1,project_id:project,source:"PROJECT_MARKDOWN_VAULT",
  read_at:"2026-10-26T01:00:00+00:00",documents:[item(0,project),item(1,project)],next_offset:null});
function transport(): ManagementTransport {
  return {knowledge:vi.fn(async id=>page(id)),knowledgeDocument:vi.fn(async (id,documentId)=>({
    ...item(ids.indexOf(documentId),id),content:documentId===ids[0]?"# Index\n\n[[topic|Sujet]] [[missing|Absent]]":"# Sujet\n\nContenu persisté"
  }))} as unknown as ManagementTransport;
}
function mount(projectId:string|null,verified:boolean,api:ManagementTransport) {
  const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  return render(<QueryClientProvider client={client}><BackendKnowledge projectId={projectId} verified={verified} transport={api} openRequest={null}/></QueryClientProvider>);
}
describe("D6 Project vault projection",()=>{
  it("rejects cross-Project, malformed and oversized native data",()=>{
    expect(readKnowledgePage(page(),"alpha",0).documents).toHaveLength(2);
    expect(()=>readKnowledgePage(page("beta"),"alpha",0)).toThrow();
    expect(()=>readKnowledgePage({...page(),next_offset:0},"alpha",0)).toThrow();
    expect(()=>readKnowledgeDocument({...item(0),content:"x".repeat(16385)},"alpha")).toThrow();
    expect(()=>readKnowledgeDocument({...item(0),project_id:"beta",content:"ok"},"alpha")).toThrow();
  });
  it("reads a bounded Project corpus and rejects repeated pages",async()=>{
    const api=transport();
    expect((await readKnowledgeCorpus(api,"alpha")).documents).toHaveLength(2);
    const bad={...api,knowledge:vi.fn(async()=>({...page(),next_offset:1}))};
    await expect(readKnowledgeCorpus(bad,"alpha")).rejects.toThrow();
  });
  it("separates unavailable, empty, read-only document, graph and broken link",async()=>{
    const api=transport();
    const view=mount("alpha",true,api);
    await screen.findByText("Index");
    fireEvent.click(screen.getByRole("button",{name:/Index/}));
    await screen.findByText(/lien absent/);
    expect(screen.queryByRole("button",{name:/Modifier|Supprimer|Exécuter/})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Graphe"}));
    expect(screen.getByRole("group",{name:"Relations Wikilink réellement enregistrées"})).toBeTruthy();
    view.unmount();
    const offline=transport();
    mount("alpha",false,offline);
    expect(screen.getByText("Source non vérifiée")).toBeTruthy();
    expect(offline.knowledge).not.toHaveBeenCalled();
  });
  it("does not render old data as empty when a read fails",async()=>{
    const api={...transport(),knowledge:vi.fn(async()=>{throw new Error("CONNECT");})};
    mount("alpha",true,api);
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("indisponible"));
    expect(screen.queryByText("Coffre vide")).toBeNull();
  });
});

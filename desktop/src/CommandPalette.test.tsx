import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPalette } from "./CommandPalette";
import type { NoteTransport, LocalNote } from "./notes";
import type { DraftTransport } from "./drafts";

afterEach(()=>{cleanup();vi.restoreAllMocks();});
const id="00000000-0000-4000-8000-000000000001";
const note: LocalNote={schema_version:1,note_id:id,project_id:"alpha",title:"Carnet",collection:"Général",markdown:"Observation du télescope",revision:1,created_at_ms:1,updated_at_ms:1,provenance:"HUMAN_LOCAL"};
function mount(projectId: string) {
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const notes={list:vi.fn(async(project:string)=>project==="alpha"?[note]:[])} as unknown as NoteTransport;
  const drafts={list:vi.fn(async(project:string)=>project==="alpha"?[{schema_version:1,draft_id:id,project_id:project,title:"Recherche",objective:"Vérifier les constellations",verification_criteria:"Source datée",revision:1,created_at_ms:1,updated_at_ms:1}]:[])} as unknown as DraftTransport;
  const openNote=vi.fn();
  const view=render(<QueryClientProvider client={client}><CommandPalette projectId={projectId} projects={[{id:"alpha",name:"Alpha"},{id:"beta",name:"Beta"}]} drafts={drafts} notes={notes}
    navigate={()=>{}} chooseProject={()=>{}} openDraft={()=>{}} openNote={openNote} newDraft={()=>{}} newNote={()=>{}}/></QueryClientProvider>);
  return {view,openNote};
}
describe("bounded local palette search",()=>{
  it("searches note bodies and draft criteria with source labels",async()=>{
    mount("alpha");fireEvent.click(screen.getByRole("button",{name:/Rechercher/}));
    fireEvent.change(screen.getByLabelText(/Rechercher un espace/),{target:{value:"télescope"}});
    expect(await screen.findByRole("option",{name:/Carnet/})).toBeTruthy();
    expect(screen.queryByRole("option",{name:/RechercheBrief/})).toBeNull();
    fireEvent.change(screen.getByLabelText(/Rechercher un espace/),{target:{value:"constellations"}});
    expect(await screen.findByRole("option",{name:/Recherche/})).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Source des résultats"),{target:{value:"notes"}});
    await waitFor(()=>expect(screen.queryByRole("option",{name:/Recherche/})).toBeNull());
  });
  it("does not show foreign local records after Project change",async()=>{
    const first=mount("alpha");fireEvent.click(screen.getByRole("button",{name:/Rechercher/}));
    await screen.findByRole("option",{name:/Carnet/});first.view.unmount();
    mount("beta");fireEvent.click(screen.getByRole("button",{name:/Rechercher/}));
    await waitFor(()=>expect(screen.queryByRole("option",{name:/Carnet/})).toBeNull());
  });
});

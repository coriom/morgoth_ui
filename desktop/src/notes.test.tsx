import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KnowledgeWorkspace } from "./KnowledgeWorkspace";
import { MarkdownPreview } from "./MarkdownPreview";
import { KnowledgeGraph } from "./KnowledgeGraph";
import type { ManagementTransport } from "./transport";
import { backlinksTo, filterNotes, linksFrom, readNote, readNoteList, type LocalNote, type NoteInput, type NoteTransport } from "./notes";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function memoryNotes(): NoteTransport {
  const records = new Map<string, LocalNote>(); let sequence = 1;
  const get = async (project: string, noteId: string) => { const note=records.get(noteId);
    if (!note || note.project_id!==project) throw new Error("NOT_FOUND"); return note; };
  return {
    list: vi.fn(async project => [...records.values()].filter(note=>note.project_id===project)), get: vi.fn(get),
    create: vi.fn(async (input: NoteInput) => { const note: LocalNote={...input,schema_version:1,note_id:id(sequence++),revision:1,
      created_at_ms:100,updated_at_ms:100,provenance:"HUMAN_LOCAL"}; records.set(note.note_id,note); return note; }),
    update: vi.fn(async input => { const old=await get(input.project_id,input.note_id);if(old.revision!==input.expected_revision)throw new Error("CONFLICT");
      const note={...old,title:input.title,collection:input.collection,markdown:input.markdown,revision:old.revision+1,updated_at_ms:old.updated_at_ms+1};records.set(note.note_id,note);return note; }),
    delete: vi.fn(async (project,noteId,revision) => {const old=await get(project,noteId);if(old.revision!==revision)throw new Error("CONFLICT");records.delete(noteId);}),
  };
}
function mount(store: NoteTransport, project="alpha") {
  const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  return render(<QueryClientProvider client={client}><KnowledgeWorkspace projectId={project} verified={false} transport={store}
    management={{knowledge:async()=>{throw new Error("unavailable");},knowledgeDocument:async()=>{throw new Error("unavailable");}} as unknown as ManagementTransport}
    onDirtyChange={()=>{}} createSignal={0} openNoteRequest={null} openBackendRequest={null} refreshSignal={0}/></QueryClientProvider>);
}
describe("local note contract and workspace", () => {
  it("rejects foreign, oversized, duplicate and malformed native records", () => {
    const note: LocalNote={schema_version:1,note_id:id(1),project_id:"alpha",title:"A",collection:"Général",
      markdown:"# A",revision:1,created_at_ms:1,updated_at_ms:1,provenance:"HUMAN_LOCAL"};
    expect(readNote(note,"alpha")).toEqual(note);
    expect(()=>readNote(note,"beta")).toThrow();
    expect(()=>readNote({...note,private_path:"/secret"},"alpha")).toThrow();
    expect(()=>readNote({...note,markdown:"x".repeat(32769)},"alpha")).toThrow();
    expect(()=>readNoteList([note,note],"alpha")).toThrow();
  });
  it("derives real links, backlinks and search from the same scoped notes", () => {
    const a: LocalNote={schema_version:1,note_id:id(1),project_id:"alpha",title:"Source",collection:"Méthode",
      markdown:`Voir [[${id(2)}|Cible]] et [[${id(9)}|Perdu]]`,revision:1,created_at_ms:1,updated_at_ms:1,provenance:"HUMAN_LOCAL"};
    const b={...a,note_id:id(2),title:"Cible",markdown:"Texte de vérification"};
    expect(linksFrom(a.markdown).map(link=>link.target)).toEqual([id(2),id(9)]);
    expect(backlinksTo([a,b],id(2))).toEqual([a]);
    expect(filterNotes([a,b],"vérification","all")).toEqual([b]);
    expect(filterNotes([a,b],"source","Méthode")).toEqual([a]);
  });
  it("renders Markdown as escaped text and marks broken links", () => {
    const result=render(<MarkdownPreview markdown={`# Titre\n\n<script>window.bad=true</script> [[${id(9)}|Manquant]]`} notes={[]} onOpen={()=>{}}/>);
    expect(result.container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>window.bad=true<\/script>/)).toBeTruthy();
    expect(screen.getByText(/Manquant · lien absent/)).toBeTruthy();
  });
  it("draws only recorded relationships and retains a keyboard list", () => {
    const source: LocalNote={schema_version:1,note_id:id(1),project_id:"alpha",title:"Source",collection:"Général",
      markdown:`[[${id(2)}|Cible]] [[${id(9)}|Absente]]`,revision:1,created_at_ms:1,updated_at_ms:1,provenance:"HUMAN_LOCAL"};
    const target={...source,note_id:id(2),title:"Cible",markdown:""};
    const selected=vi.fn(); const opened=vi.fn();
    const result=render(<KnowledgeGraph notes={[source,target]} selectedId={source.note_id} onSelect={selected} onOpen={opened}/>);
    expect(result.container.querySelectorAll("line.graph-edge")).toHaveLength(1);
    expect(screen.getByText(/lien\(s\) vers des notes absentes/)).toBeTruthy();
    fireEvent.click(within(screen.getByLabelText("Navigation textuelle dans le graphe")).getByRole("button",{name:"Cible"}));
    expect(selected).toHaveBeenCalledWith(target.note_id);
    fireEvent.click(screen.getByRole("button",{name:/Ouvrir la note/}));
    expect(opened).toHaveBeenCalledWith(source.note_id);
  });
  it("creates, edits, links, reloads and isolates human notes", async () => {
    const store=memoryNotes();
    const first=mount(store);
    fireEvent.click(screen.getByRole("button",{name:/Nouvelle note/}));
    fireEvent.change(screen.getByLabelText("Titre"),{target:{value:"Première note"}});
    fireEvent.change(screen.getByLabelText(/Markdown ·/),{target:{value:"# Une idée"}});
    fireEvent.click(screen.getByRole("button",{name:"Enregistrer la note"}));
    expect(await screen.findByRole("heading",{name:"Première note"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Modifier"}));
    fireEvent.change(screen.getByLabelText(/Markdown ·/),{target:{value:"# Une idée modifiée"}});
    fireEvent.click(screen.getByRole("button",{name:"Enregistrer la note"}));
    expect(await screen.findByRole("heading",{name:"Une idée modifiée"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/Nouvelle note/}));
    fireEvent.change(screen.getByLabelText("Titre"),{target:{value:"Seconde note"}});
    fireEvent.change(screen.getByLabelText(/Markdown ·/),{target:{value:"Lien en cours"}});
    fireEvent.change(screen.getByLabelText("Insérer un lien vers"),{target:{value:id(1)}});
    fireEvent.click(screen.getByRole("button",{name:"Insérer"}));
    fireEvent.click(screen.getByRole("button",{name:"Enregistrer la note"}));
    await waitFor(()=>expect(screen.getByText("Première note",{selector:"button.wiki-link"})).toBeTruthy());
    first.unmount();
    mount(store);
    expect(await screen.findByRole("button",{name:/Seconde note/})).toBeTruthy();
    expect((await store.list("alpha") as LocalNote[]).length).toBe(2);
    cleanup();
    mount(store,"beta");
    expect(await screen.findByText("Aucune note personnelle dans ce Project.")).toBeTruthy();
    expect(screen.queryByText("Seconde note")).toBeNull();
  });
  it("requires confirmation and revision for deletion", async () => {
    const store=memoryNotes(); const note=await store.create({project_id:"alpha",title:"À supprimer",collection:"Général",markdown:"Texte"}) as LocalNote;
    mount(store);
    fireEvent.click(await screen.findByRole("button",{name:/À supprimer/}));
    await screen.findByRole("button",{name:"Supprimer…"});
    vi.spyOn(window,"confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button",{name:"Supprimer…"}));
    expect((await store.list("alpha") as LocalNote[]).length).toBe(1);
    vi.spyOn(window,"confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button",{name:"Supprimer…"}));
    await waitFor(async()=>expect((await store.list("alpha") as LocalNote[]).length).toBe(0));
    expect(note.note_id).toBe(id(1));
  });
});

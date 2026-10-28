import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { readDraftList, type DraftTransport } from "./drafts";
import { readNoteList, type NoteTransport } from "./notes";
import { readKnowledgePage } from "./backendKnowledge";
import { readThesisPage } from "./structuredMemory";
import type { ManagementTransport } from "./transport";

type Destination = "home" | "missions" | "knowledge" | "projects" | "settings";
export function CommandPalette({ projectId, verified = false, management, projects, drafts, notes, navigate, chooseProject, openDraft, openNote, openBackend, openStructured, newDraft, newNote }: {
  projectId: string | null; verified?: boolean; management?: Pick<ManagementTransport,"knowledge"|"structuredTheses">;
  projects: readonly { id: string; name: string }[]; drafts: DraftTransport; notes: NoteTransport;
  navigate: (view: Destination) => void; chooseProject: (id: string) => void;
  openDraft: (id: string) => void; openNote: (id: string) => void; openBackend?: (id: string) => void; openStructured?: (id: string) => void; newDraft: () => void; newNote: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const launch = useRef<HTMLButtonElement>(null);
  const draftList = useQuery({ queryKey: ["d4", "drafts", projectId], queryFn: async () => readDraftList(await drafts.list(projectId!), projectId!), enabled: open && !!projectId });
  const noteList = useQuery({ queryKey: ["d5", "notes", projectId], queryFn: async () => readNoteList(await notes.list(projectId!), projectId!), enabled: open && !!projectId });
  const knowledge = useQuery({ queryKey:["d6","palette-knowledge",projectId,submitted],
    queryFn:async()=>readKnowledgePage(await management!.knowledge(projectId!,0,submitted),projectId!,0),
    enabled:open && verified && !!management && !!openBackend && !!projectId && submitted.trim().length>=2 && submitted.length<=80 && ["all","vault"].includes(sourceFilter),
    retry:false,refetchOnWindowFocus:false });
  const structured = useQuery({queryKey:["d9","palette-structured",projectId,submitted],
    queryFn:async()=>readThesisPage(await management!.structuredTheses(projectId!,0,submitted,"",""),projectId!,0),
    enabled:open&&verified&&!!management&&!!openStructured&&!!projectId&&submitted.trim().length>=2&&submitted.length<=80&&["all","memory"].includes(sourceFilter),
    retry:false,refetchOnWindowFocus:false});
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(value => !value); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  useEffect(() => { if (open) { setQuery(""); setSubmitted(""); setSourceFilter("all"); setActive(0); input.current?.focus(); } else launch.current?.focus(); }, [open]);
  useEffect(() => { const timer=window.setTimeout(()=>setSubmitted(query.trim().slice(0,80)),350); return ()=>window.clearTimeout(timer); },[query]);
  const entries = useMemo(() => [
    ...(["home", "missions", "knowledge", "projects", "settings"] as const).map((id) => ({ key: `nav-${id}`, label: ({home:"Accueil",missions:"Missions",knowledge:"Connaissances",projects:"Projets",settings:"Réglages"})[id], kind: "Navigation", run: () => navigate(id) })),
    ...(projectId ? [{ key: "create-draft", label: "Nouveau brief local", kind: "Action locale", run: newDraft },
      { key: "create-note", label: "Nouvelle note personnelle", kind: "Action locale", run: newNote }] : []),
    ...(draftList.isSuccess ? draftList.data.map(draft => ({ key: `draft-${draft.draft_id}`, label: draft.title, kind: "Brief non soumis", text: `${draft.title}\n${draft.objective}\n${draft.verification_criteria}`, source:"drafts", run: () => openDraft(draft.draft_id) })) : []),
    ...(noteList.isSuccess ? noteList.data.map(note => ({ key: `note-${note.note_id}`, label: note.title, kind: `Note personnelle · ${note.collection}`, text: `${note.title}\n${note.markdown}`, source:"notes", run: () => openNote(note.note_id) })) : []),
    ...(verified && knowledge.isSuccess && openBackend ? knowledge.data.documents.map(doc=>({key:`vault-${doc.document_id}`,label:doc.title,kind:"Coffre Markdown · lecture seule",source:"vault",run:()=>openBackend(doc.document_id)})) : []),
    ...(verified && structured.isSuccess && openStructured ? structured.data.theses.map(item=>({key:`thesis-${item.thesis_id}`,label:item.subject,kind:"Mémoire structurée · lecture seule",source:"memory",run:()=>openStructured(item.thesis_id)})) : []),
    ...projects.map(project => ({ key: `project-${project.id}`, label: project.name, kind: "Project du catalogue", run: () => chooseProject(project.id) })),
  ], [projectId, verified, draftList.isSuccess, draftList.data, noteList.isSuccess, noteList.data, knowledge.isSuccess, knowledge.data, structured.isSuccess, structured.data, projects, navigate, chooseProject, openDraft, openNote, openBackend, openStructured, newDraft, newNote]);
  const stableQuery = submitted===query.trim().slice(0,80);
  const shown = entries.filter(entry => {
    if (sourceFilter!=="all" && ("source" in entry ? entry.source!==sourceFilter : !(sourceFilter==="projects" && entry.key.startsWith("project-")))) return false;
    const document = "source" in entry;
    if (document && !stableQuery) return false;
    if (document && (entry.source==="vault" || entry.source==="memory")) return true;
    const haystack = document && "text" in entry && typeof entry.text === "string" ? entry.text : entry.label;
    return haystack.toLocaleLowerCase().includes((document?submitted:query).toLocaleLowerCase());
  }).slice(0,20);
  const select = (index: number) => { const item = shown[index]; if (!item) return; setOpen(false); item.run(); };
  return <><button ref={launch} type="button" className="palette-launch" aria-keyshortcuts="Control+K Meta+K" onClick={() => setOpen(true)}>⌕ <span>Rechercher</span><kbd>⌘ K</kbd></button>
    {open && <div className="palette-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Recherche et navigation" onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        if (event.target instanceof HTMLSelectElement && ["ArrowDown","ArrowUp","Enter"].includes(event.key)) return;
        if (event.key === "ArrowDown") { event.preventDefault(); setActive(value => shown.length ? Math.min(shown.length - 1, value + 1) : 0); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActive(value => Math.max(0, value - 1)); }
        if (event.key === "Enter") { event.preventDefault();
          if (!stableQuery && !shown[active]) { setSubmitted(query.trim().slice(0,80)); return; }
          select(active); }
        if (event.key === "Tab") {
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input,select,button:not([disabled])"));
          const first = focusable[0]; const last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}><label htmlFor="command-search" className="sr-only">Rechercher un espace, une note, un brief ou un Project</label>
        <input ref={input} id="command-search" type="search" value={query} maxLength={80} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="Rechercher dans cet espace…" />
        <label className="sr-only" htmlFor="palette-source">Source des résultats</label><select id="palette-source" value={sourceFilter} onChange={event=>{setSourceFilter(event.target.value);setActive(0);}}><option value="all">Toutes les sources</option><option value="notes">Notes personnelles</option><option value="drafts">Briefs locaux</option><option value="vault">Coffre Morgoth</option><option value="memory">Mémoire structurée</option><option value="projects">Projects</option></select>
        <div className="palette-results" role="listbox" aria-label="Résultats">{shown.map((entry,index) => <button key={entry.key} role="option" aria-selected={active === index} type="button" onMouseEnter={() => setActive(index)} onClick={() => select(index)}><strong>{entry.label}</strong><small>{entry.kind}</small></button>)}
          {!shown.length && <p>{["vault","memory"].includes(sourceFilter) && !verified ? "Source backend non vérifiée pour ce Project." : "Aucun résultat dans les sources disponibles."}</p>}
          {(draftList.isError || noteList.isError || knowledge.isError || structured.isError) && <p role="alert">Une source est indisponible ; les résultats peuvent être incomplets.</p>}</div>
        <p className="palette-foot">Entrée pour rechercher ou ouvrir · Échap pour fermer · aucune commande agent</p>
      </div></div>}
  </>;
}

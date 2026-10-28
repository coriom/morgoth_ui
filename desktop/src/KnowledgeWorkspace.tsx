import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MarkdownPreview } from "./MarkdownPreview";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { BackendKnowledge } from "./BackendKnowledge";
import { StructuredMemory } from "./StructuredMemory";
import type { ManagementTransport } from "./transport";
import { backlinksTo, filterNotes, importSourceName, linksFrom, readImportPreview, readNote, readNoteList, type ImportPreview, type LocalNote, type NoteTransport } from "./notes";

const stamp = (value: number) => new Date(value).toLocaleString("fr-FR");

/** Personal notes and the read-only Project vault remain distinct. */
export function KnowledgeWorkspace({ projectId, verified, transport, management, onDirtyChange, createSignal, openNoteRequest, openBackendRequest, openStructuredRequest, refreshSignal }: {
  projectId: string | null; verified: boolean; transport: NoteTransport; onDirtyChange: (value: boolean) => void;
  management: ManagementTransport; createSignal: number; openNoteRequest: {id:string;seq:number} | null;
  openBackendRequest: {id:string;seq:number} | null; openStructuredRequest?: {id:string;seq:number} | null; refreshSignal: number;
}) {
  const cache = useQueryClient();
  const [mode, setMode] = useState<"notes" | "graph">("notes");
  const [source, setSource] = useState<"personal"|"morgoth"|"structured">("personal");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LocalNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [collection, setCollection] = useState("Général");
  const [filter, setFilter] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importReceipt, setImportReceipt] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const seenCreate = useRef(0);
  const seenOpen = useRef(0);
  const seenBackendOpen = useRef(0);
  const seenRefresh = useRef(refreshSignal);
  const list = useQuery({ queryKey: ["d5", "notes", projectId],
    queryFn: async () => readNoteList(await transport.list(projectId!), projectId!),
    enabled: projectId !== null, retry: false, refetchOnWindowFocus: false });
  const notes = list.isSuccess ? list.data : [];
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!dirty) return; const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [dirty]);
  useEffect(() => { if (seenRefresh.current === refreshSignal) return; seenRefresh.current = refreshSignal;
    if (projectId) void cache.invalidateQueries({ queryKey: ["d5", "notes", projectId] }); }, [refreshSignal, projectId, cache]);
  const guard = () => !dirty || window.confirm("Modifications de note non enregistrées. Les abandonner ?");
  const discardForBackend = () => { setDirty(false); setCreating(false); setEditing(false);
    setTitle(current?.title ?? ""); setMarkdown(current?.markdown ?? ""); setCollection(current?.collection ?? "Général"); };
  const reset = (note: LocalNote | null) => {
    setCurrent(note); setSelectedId(note?.note_id ?? null); setCreating(note === null); setEditing(note === null);
    setTitle(note?.title ?? ""); setMarkdown(note?.markdown ?? ""); setCollection(note?.collection ?? "Général");
    setDirty(false); setError(null); setExportPath(null); setMode("notes");
  };
  const create = () => { if (!projectId || !guard()) return; reset(null); window.setTimeout(() => titleRef.current?.focus(), 0); };
  useEffect(() => { if (createSignal === seenCreate.current) return; seenCreate.current = createSignal;
    setSource("personal"); reset(null); window.setTimeout(() => titleRef.current?.focus(), 0);
    // The application shell has already confirmed leaving unsaved work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal]);
  useEffect(() => { if (!openNoteRequest || openNoteRequest.seq === seenOpen.current) return;
    const note = notes.find(item => item.note_id === openNoteRequest.id);
    if (!note) return;
    seenOpen.current = openNoteRequest.seq; setSource("personal"); reset(note);
    // Selection is guarded at the application boundary as well.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNoteRequest?.seq, list.dataUpdatedAt]);
  useEffect(() => { if (!openBackendRequest || openBackendRequest.seq === seenBackendOpen.current) return;
    seenBackendOpen.current = openBackendRequest.seq; discardForBackend(); setSource("morgoth");
  }, [openBackendRequest?.seq]);
  useEffect(() => { if (openStructuredRequest) { discardForBackend(); setSource("structured"); }
    // Parent guards unsaved edits before publishing this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStructuredRequest?.seq]);
  const open = async (id: string) => {
    if (!projectId || !guard()) return;
    setBusy(true); setError(null);
    try { reset(readNote(await transport.get(projectId, id), projectId)); }
    catch { setError("Note indisponible, hors Project ou incompatible. Aucun texte n’a été remplacé."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!projectId || !title.trim() || [...title].length > 160 || markdown.length > 32768 || !collection.trim() || [...collection].length > 48) {
      setError("Titre, collection ou contenu invalide. Le texte reste dans l’éditeur."); return;
    }
    setBusy(true); setError(null);
    try { const input = { project_id: projectId, title, collection, markdown };
      const saved = readNote(current ? await transport.update({ ...input, note_id: current.note_id, expected_revision: current.revision })
        : await transport.create(input), projectId);
      reset(saved); await cache.invalidateQueries({ queryKey: ["d5", "notes", projectId] });
    } catch { setError("Enregistrement refusé ou conflit de révision. Votre texte reste dans l’éditeur."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!current || !projectId || !guard() || !window.confirm(`Supprimer définitivement la note « ${current.title} » ?`)) return;
    setBusy(true); setError(null);
    try { await transport.delete(projectId, current.note_id, current.revision); setCurrent(null); setSelectedId(null); setEditing(false); setDirty(false);
      await cache.invalidateQueries({ queryKey: ["d5", "notes", projectId] }); }
    catch { setError("Suppression refusée ou conflit de révision. La note reste affichée."); }
    finally { setBusy(false); }
  };
  const exportNote = async () => {
    if (!current || !projectId || dirty) return;
    setBusy(true); setError(null); setExportPath(null);
    try {
      const path = await transport.exportMarkdown(projectId, current.note_id);
      if (typeof path !== "string" || !path.startsWith("/") || path.length > 4096 || !path.endsWith(".md") || /[\r\n\0]/.test(path)) throw new Error("INVALID_EXPORT");
      setExportPath(path);
    } catch { setError("Export non confirmé ou déjà présent. Vérifiez le dossier indiqué dans la documentation ; la note originale reste intacte."); }
    finally { setBusy(false); }
  };
  const previewImport = async (directory: boolean) => {
    if (!projectId || !verified || !transport.importPreview || !guard()) return;
    setBusy(true); setError(null); setImportReceipt(null);
    try { const raw=await transport.importPreview(projectId,directory); setImportPreview(raw===null?null:readImportPreview(raw,projectId)); }
    catch { setError("Examen de l’import refusé. Aucune nouvelle publication n’est confirmée ; vérifiez vos notes si un import antérieur a été interrompu."); }
    finally { setBusy(false); }
  };
  const applyImport = async () => {
    if (!projectId || !verified || !transport.importApply || !importPreview || !window.confirm(`Importer ${importPreview.eligible} note(s) dans ${projectId} ? Les fichiers d’origine restent inchangés.`)) return;
    setBusy(true); setError(null);
    try { const count=await transport.importApply(projectId,importPreview.token);
      if (typeof count!=="number" || !Number.isSafeInteger(count) || count<0 || count>importPreview.eligible) throw new Error("INVALID_IMPORT_RECEIPT");
      setImportPreview(null); setImportReceipt(`${count} note(s) ajoutée(s) au Project ${projectId}.`);
      await cache.invalidateQueries({queryKey:["d5","notes",projectId]});
    } catch { setImportPreview(null); setError("Import non confirmé ou interrompu. Relancez l’examen pour vérifier une reprise éventuelle ; ne répétez pas l’import à l’aveugle."); }
    finally {setBusy(false);}
  };
  const shown = filterNotes(notes, filter, collectionFilter);
  const collections = [...new Set(notes.map(note => note.collection))].sort((a,b) => a.localeCompare(b));
  const outgoing = current ? linksFrom(current.markdown) : [];
  const backlinks = current ? backlinksTo(notes, current.note_id) : [];
  if (!projectId) return <section className="quiet-empty"><h2>Aucun Project sélectionné</h2><p>Choisissez un Project pour ouvrir vos notes locales.</p></section>;
  return <div className="knowledge-page">
    <header className="page-heading"><div><p className="breadcrumb">{verified ? "Project vérifié" : "Project mémorisé · non vérifié"} / Connaissances</p><h1>Connaissances</h1><p>{source === "personal" ? "Des notes personnelles, des liens explicites." : "Documents du Project, lus sans inférence et sans modification."}</p></div>
      {source === "personal" && <div className="segmented" role="group" aria-label="Mode des connaissances"><button type="button" aria-pressed={mode === "notes"} onClick={() => setMode("notes")}>Notes</button>
        <button type="button" aria-pressed={mode === "graph"} onClick={() => { if (guard()) setMode("graph"); }}>Graphe</button></div>}</header>
    <div className="knowledge-source-switch" role="group" aria-label="Source de connaissance"><button type="button" aria-pressed={source === "personal"} onClick={()=>setSource("personal")}>Notes personnelles</button><button type="button" aria-pressed={source === "morgoth"} onClick={()=>{if(guard()){discardForBackend();setSource("morgoth");}}}>Coffre Morgoth</button><button type="button" aria-pressed={source === "structured"} onClick={()=>{if(guard()){discardForBackend();setSource("structured");}}}>Mémoire structurée</button></div>
    {source === "morgoth" ? <BackendKnowledge projectId={projectId} verified={verified} transport={management} openRequest={openBackendRequest} onPersonal={() => setSource("personal")} /> : source === "structured" ? <StructuredMemory key={projectId} projectId={projectId} verified={verified} transport={management} openRequest={openStructuredRequest} /> : <>
    {error && <p role="alert" className="notice warn">{error}</p>}
    {importReceipt && <p role="status" className="notice">{importReceipt}</p>}
    {importPreview && <section className="import-review" aria-label="Examen de l’import Markdown"><h2>Importer des notes</h2>
      <p>Destination : Project {projectId}. {importPreview.recovery ? "Import interrompu : reprise contrôlée des enregistrements validés." : "Fichiers sélectionnés par vous ; les originaux resteront inchangés."}</p>
      <p>{importPreview.inspected} entrées examinées · {importPreview.eligible} admissibles · {importPreview.duplicate} doublons · {importPreview.rejected} refusées · {importPreview.estimated_bytes} octets lus.</p>
      {(importPreview.unresolved_links>0 || importPreview.ambiguous_links>0) && <p role="status">{importPreview.unresolved_links} liens non résolus · {importPreview.ambiguous_links} liens ambigus. Ils restent visibles sans lien inventé.</p>}
      <ul>{importPreview.entries.map((entry,index)=><li key={`${entry.name}-${index}`}><strong>{entry.name}</strong> · {entry.outcome === "ELIGIBLE" ? "admissible" : entry.outcome === "DUPLICATE" ? "doublon" : "refusé"}{entry.warning && ` · ${entry.warning}`}{entry.excerpt && <small> · {entry.excerpt}</small>}</li>)}</ul>
      <div className="editor-actions"><button type="button" disabled={busy || !importPreview.eligible} onClick={()=>void applyImport()}>Confirmer l’import</button><button type="button" disabled={busy} onClick={()=>setImportPreview(null)}>Annuler</button></div>
    </section>}
    {mode === "graph" ? list.isPending ? <p className="skeleton">Lecture des notes du Project…</p> : list.isError ? <p role="alert">Graphe indisponible : les notes locales n’ont pas pu être lues.</p> : <KnowledgeGraph notes={notes} selectedId={selectedId} onSelect={id => setSelectedId(id)} onOpen={id => void open(id)} />
      : <div className="knowledge-columns"><aside className="knowledge-list" aria-label="Collections et notes">
        <div className="list-actions"><button type="button" onClick={create} disabled={busy}>＋ Nouvelle note</button>{verified && transport.importPreview && <><button type="button" disabled={busy} onClick={()=>void previewImport(false)}>Importer fichiers…</button><button type="button" disabled={busy} onClick={()=>void previewImport(true)}>Importer dossier…</button></>}</div>
        <label htmlFor="note-search">Rechercher titre et contenu</label><input id="note-search" type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Rechercher…" />
        <div className="list-caption">Collections</div><button type="button" className={collectionFilter === "all" ? "list-filter selected" : "list-filter"} onClick={() => setCollectionFilter("all")}>Toutes les notes <span>{notes.length}</span></button>
        {collections.map(name => <button key={name} type="button" className={collectionFilter === name ? "list-filter selected" : "list-filter"} onClick={() => setCollectionFilter(name)}>{name}<span>{notes.filter(note => note.collection === name).length}</span></button>)}
        <div className="list-caption">Notes</div>
        {list.isPending && <p className="skeleton">Lecture locale…</p>}
        {list.isError && <p role="alert">Notes locales indisponibles ; aucun ensemble vide n’est supposé.</p>}
        {list.isSuccess && !notes.length && <p className="quiet">Aucune note personnelle dans ce Project.</p>}
        {list.isSuccess && notes.length > 0 && !shown.length && <p className="quiet">Aucune note correspondante.</p>}
        {shown.map(note => <button key={note.note_id} type="button" className={selectedId === note.note_id ? "document-row selected" : "document-row"} onClick={() => void open(note.note_id)}>
          <strong>{note.title}</strong><small>{note.collection} · {stamp(note.updated_at_ms)}</small></button>)}
      </aside><article className="note-document" aria-label="Note sélectionnée">
        {creating || current ? <>
          <div className="document-meta"><span>{current && importSourceName(current) ? `Import personnel · ${importSourceName(current)}` : "Note personnelle locale"} · {editing || creating ? "édition" : "lecture"}</span><span>{current ? `Modifiée ${stamp(current.updated_at_ms)}` : "Non enregistrée"}</span></div>
          {editing || creating ? <form onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
          }}><label htmlFor="note-title">Titre</label><input ref={titleRef} id="note-title" className="document-title-input" value={title} maxLength={160} required onChange={event => { setTitle(event.target.value); setDirty(true); }} />
            <label htmlFor="note-collection">Collection</label><input id="note-collection" value={collection} maxLength={48} required onChange={event => { setCollection(event.target.value); setDirty(true); }} />
            <label htmlFor="note-markdown">Markdown · 32 KiB maximum</label><textarea id="note-markdown" rows={15} value={markdown} maxLength={32768} onChange={event => { setMarkdown(event.target.value); setDirty(true); }} placeholder="Écrivez ici. Utilisez [[identifiant|titre]] pour relier une note." />
            {notes.filter(note => note.note_id !== current?.note_id).length > 0 && <div className="link-insert"><label htmlFor="link-target">Insérer un lien vers</label><select id="link-target" defaultValue=""><option value="">Choisir une note…</option>{notes.filter(note => note.note_id !== current?.note_id).map(note => <option key={note.note_id} value={note.note_id}>{note.title}</option>)}</select>
              <button type="button" onClick={() => { const select = document.getElementById("link-target") as HTMLSelectElement; const target = notes.find(note => note.note_id === select.value);
                if (target) { setMarkdown(value => `${value}${value.endsWith("\n") || !value ? "" : "\n"}[[${target.note_id}|${target.title}]]`); setDirty(true); } }}>Insérer</button></div>}
            <div className="editor-actions"><button type="submit" disabled={busy}>Enregistrer la note</button><button type="button" disabled={busy} onClick={() => {
              if (!guard()) return; if (current) reset(current); else { setCreating(false); setEditing(false); setDirty(false); }
            }}>Annuler</button>{dirty && <span role="status">Modifications non enregistrées</span>}</div>
          </form> : <><h2>{current!.title}</h2><p className="source-stamp">Collection : {current!.collection} · créée {stamp(current!.created_at_ms)} · révision {current!.revision}</p>
            <MarkdownPreview markdown={current!.markdown} notes={notes} onOpen={id => void open(id)} />
            <div className="editor-actions"><button type="button" onClick={() => setEditing(true)}>Modifier</button><button type="button" disabled={busy} onClick={() => void exportNote()}>Exporter Markdown</button><button type="button" onClick={() => void remove()}>Supprimer…</button></div>
            {exportPath && <p role="status" className="source-stamp">Copie Markdown privée créée : <code>{exportPath}</code></p>}</>}
        </> : <div className="quiet-empty"><h2>Une page pour vos idées</h2><p>Créez une note locale ou choisissez-en une. Aucun contenu n’est généré par un modèle.</p></div>}
      </article><aside className="note-relations" aria-label="Relations de la note">
        <h3>Liens sortants</h3>{outgoing.length ? outgoing.map(link => {
          const target = notes.find(note => note.note_id === link.target);
          return target ? <button key={link.target} type="button" onClick={() => void open(target.note_id)}>{target.title}</button>
            : <span key={link.target} className="broken-link">{link.label} · note absente</span>;
        }) : <p>Aucun lien.</p>}
        <h3>Rétroliens</h3>{backlinks.length ? backlinks.map(note => <button key={note.note_id} type="button" onClick={() => void open(note.note_id)}>{note.title}</button>) : <p>Aucun rétroliens.</p>}
        <p className="source-stamp">Source : fichiers Markdown personnels locaux, Project {projectId}.</p>
      </aside></div>}
    </>}
  </div>;
}

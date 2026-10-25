import { useQuery } from "@tanstack/react-query";
import { readDraftList, type DraftTransport } from "./drafts";
import { readNoteList, type NoteTransport } from "./notes";

const stamp = (value: number) => new Date(value).toLocaleDateString("fr-FR");
export function Home({ projectId, projectName, verified, drafts, notes, onOpenDraft, onNewDraft, onOpenNote, onNewNote, onProjects }: {
  projectId: string | null; projectName: string | null; verified: boolean; drafts: DraftTransport; notes: NoteTransport;
  onOpenDraft: (id: string) => void; onNewDraft: () => void; onOpenNote: (id: string) => void; onNewNote: () => void; onProjects: () => void;
}) {
  const draftList = useQuery({ queryKey: ["d4", "drafts", projectId], queryFn: async () => readDraftList(await drafts.list(projectId!), projectId!), enabled: !!projectId });
  const noteList = useQuery({ queryKey: ["d5", "notes", projectId], queryFn: async () => readNoteList(await notes.list(projectId!), projectId!), enabled: !!projectId });
  const recent = [
    ...(draftList.isSuccess ? draftList.data.map(draft => ({ id: draft.draft_id, kind: "draft" as const, title: draft.title, updated: draft.updated_at_ms })) : []),
    ...(noteList.isSuccess ? noteList.data.map(note => ({ id: note.note_id, kind: "note" as const, title: note.title, updated: note.updated_at_ms })) : []),
  ].sort((a,b) => b.updated-a.updated).slice(0,6);
  return <div className="home-page"><header className="home-heading"><p className="breadcrumb">Espace personnel / Accueil</p><h1>Un endroit pour penser clairement.</h1><p>Reprenez un travail en cours ou commencez quelque chose de nouveau.</p></header>
    <div className="home-grid"><div><div className="section-heading"><h2>Reprendre</h2><span>Contenu local · {projectId ? projectName ?? projectId : "aucun Project"}</span></div>
      {!projectId && <p className="quiet">Sélectionnez un Project pour retrouver ses briefs et ses notes.</p>}
      {(draftList.isPending || noteList.isPending) && projectId && <p className="skeleton">Lecture des travaux locaux…</p>}
      {(draftList.isError || noteList.isError) && <p role="alert">Une source locale est indisponible. Aucun travail n’est présumé absent.</p>}
      {projectId && draftList.isSuccess && noteList.isSuccess && !recent.length && <p className="quiet">Aucun travail local enregistré dans ce Project.</p>}
      {recent.map(item => <button key={`${item.kind}-${item.id}`} className="recent-row" onClick={() => item.kind === "draft" ? onOpenDraft(item.id) : onOpenNote(item.id)}>
        <span aria-hidden="true">{item.kind === "draft" ? "≡" : "▤"}</span><span><strong>{item.title}</strong><small>{item.kind === "draft" ? "Brief non soumis" : "Note personnelle"} · {stamp(item.updated)}</small></span><span aria-hidden="true">↗</span></button>)}
      <div className="section-heading start"><h2>Commencer</h2></div><div className="home-actions"><button onClick={onNewDraft} disabled={!projectId}><strong>＋ Nouveau brief</strong><small>Préparer une mission, sans l’envoyer</small></button>
        <button onClick={onNewNote} disabled={!projectId}><strong>＋ Nouvelle note</strong><small>Écrire et relier vos idées localement</small></button></div></div>
      <aside className="home-context"><p className="overline">Votre espace</p><h2>{projectName ?? projectId ?? "Aucun Project"}</h2><p>{projectId ? verified ? "Identité confirmée par le catalogue Management courant." : "Identité mémorisée localement ; Management ne la vérifie pas actuellement." : "Choisissez un périmètre pour commencer."}</p>
        <button className="text-link" onClick={onProjects}>Voir les Projects →</button><hr /><p className="overline">Activité</p><p>Aucun flux d’activité Project-scopé n’est fourni. Aucun événement n’est inventé.</p></aside></div>
  </div>;
}

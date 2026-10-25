import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ManagementTransport } from "./transport";
import { readMission, readMissionPage } from "./readModels";
import type { DraftTransport, LocalDraft } from "./drafts";
import { readDraft, readDraftList } from "./drafts";

const stamp = (value: number) => new Date(value).toLocaleString("fr-FR");
const clean = (value: string, limit: number) => value.trim().length > 0 && [...value].length <= limit && !value.includes("\0");

/** Local briefs and historical backend checkpoints remain separate evidence classes. */
export function MissionWorkspace({ projectId, verified, connected, transport, drafts, onDirtyChange, refreshSignal, request }:
  { projectId: string | null; verified: boolean; connected: boolean; transport: ManagementTransport;
    drafts: DraftTransport; onDirtyChange: (dirty: boolean) => void; refreshSignal: number;
    request?: { kind: "create" | "open"; id?: string; seq: number } | null }) {
  const cache = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const [current, setCurrent] = useState<LocalDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [criteria, setCriteria] = useState("");
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const lastRefresh = useRef(refreshSignal);
  const seenRequest = useRef(0);
  const list = useQuery({ queryKey: ["d4", "drafts", projectId],
    queryFn: async () => readDraftList(await drafts.list(projectId!), projectId!), enabled: projectId !== null,
    retry: false, refetchOnWindowFocus: false });
  const history = useQuery({ queryKey: ["d2", "missions", projectId, offset],
    queryFn: async () => readMissionPage(await transport.missions(projectId!, offset), projectId!),
    enabled: projectId !== null && connected && verified, retry: false, refetchOnWindowFocus: false });
  const detail = useQuery({ queryKey: ["d2", "mission", projectId, selectedMission],
    queryFn: async () => readMission(await transport.mission(projectId!, selectedMission!), projectId!),
    enabled: projectId !== null && connected && verified && selectedMission !== null,
    retry: false, refetchOnWindowFocus: false });

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    if (refreshSignal === lastRefresh.current) return;
    lastRefresh.current = refreshSignal;
    if (projectId) { void cache.invalidateQueries({ queryKey: ["d4", "drafts", projectId] });
      void cache.invalidateQueries({ queryKey: ["d2", "missions", projectId] });
      if (selectedMission) void cache.invalidateQueries({ queryKey: ["d2", "mission", projectId, selectedMission] }); }
  }, [refreshSignal, projectId, selectedMission, cache]);
  const guard = () => !dirty || window.confirm("Modifications non enregistrées. Les abandonner ?");
  const reset = (draft: LocalDraft | null) => {
    setCurrent(draft); setCreating(draft === null); setSelectedMission(null);
    setTitle(draft?.title ?? ""); setObjective(draft?.objective ?? "");
    setCriteria(draft?.verification_criteria ?? ""); setDirty(false); setError(null);
  };
  const newDraft = (approved = false) => { if (!approved && !guard()) return; reset(null); window.setTimeout(() => titleRef.current?.focus(), 0); };
  const openDraft = async (draftId: string, approved = false) => {
    if (!projectId || (!approved && !guard())) return;
    setBusy(true); setError(null);
    try { reset(readDraft(await drafts.get(projectId, draftId), projectId)); }
    catch { setError("Brouillon indisponible ou incompatible. Aucune modification appliquée."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!projectId || !clean(title, 120) || !clean(objective, 4000) || !clean(criteria, 4000)) {
      setError("Saisissez un titre, un objectif et des critères de vérification dans les limites indiquées."); return;
    }
    setBusy(true); setError(null);
    try {
      const input = { project_id: projectId, title, objective, verification_criteria: criteria };
      const saved = readDraft(current ? await drafts.update({ ...input, draft_id: current.draft_id,
        expected_revision: current.revision }) : await drafts.create(input), projectId);
      reset(saved);
      await cache.invalidateQueries({ queryKey: ["d4", "drafts", projectId] });
    } catch { setError("Enregistrement refusé ou conflit de révision. Votre texte reste dans l’éditeur."); }
    finally { setBusy(false); }
  };
  const duplicate = async () => {
    if (!current || !projectId || !guard()) return;
    setBusy(true); setError(null);
    try {
      const copied = readDraft(await drafts.create({ project_id: projectId,
        title: `Copie · ${current.title}`.slice(0, 120), objective: current.objective,
        verification_criteria: current.verification_criteria }), projectId);
      reset(copied); await cache.invalidateQueries({ queryKey: ["d4", "drafts", projectId] });
    } catch { setError("Duplication locale impossible."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!current || !projectId || !guard()
      || !window.confirm(`Supprimer définitivement le brouillon « ${current.title} » ?`)) return;
    setBusy(true); setError(null);
    try {
      await drafts.delete(projectId, current.draft_id, current.revision);
      setCurrent(null); setCreating(false); setDirty(false);
      await cache.invalidateQueries({ queryKey: ["d4", "drafts", projectId] });
    } catch { setError("Suppression refusée ou conflit de révision. Le brouillon reste affiché."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!request || request.seq === seenRequest.current) return;
    seenRequest.current = request.seq;
    if (request.kind === "create") newDraft(true);
    else if (request.id) void openDraft(request.id, true);
    // A foreground Home/palette request is consumed once per mounted workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.seq]);
  const shownDrafts = list.isSuccess ? list.data.filter((item) =>
    `${item.title} ${item.objective}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) : [];
  const shownHistory = history.isSuccess ? history.data.missions.filter((item) =>
    item.objective.toLocaleLowerCase().includes(search.toLocaleLowerCase())) : [];

  if (!projectId) return <section className="panel"><h2>Aucun Project sélectionné</h2>
    <p>Choisissez un Project dans le sélecteur global pour retrouver vos briefs locaux.</p></section>;
  return <div className="mission-page">
    <div className="mission-workspace">
      <aside className="panel mission-index" aria-label="Liste des missions et brouillons">
        <div className="panel-heading"><h2>Vos briefs</h2><button type="button" onClick={() => newDraft()}>＋ Nouveau brief</button></div>
        {!verified && <p className="read-stamp">Identité du Project mémorisée localement, non vérifiée par Management.</p>}
        <label htmlFor="mission-search">Rechercher dans les éléments chargés</label>
        <input id="mission-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <h3>Brouillons locaux · non soumis</h3>
        {list.isPending && <p className="skeleton">Lecture locale…</p>}
        {list.isError && <p role="alert">Brouillons indisponibles. Aucun enregistrement n’est présumé absent.</p>}
        {list.isSuccess && <p className="read-stamp">Lecture locale : {stamp(list.dataUpdatedAt)}</p>}
        {list.isSuccess && list.data.length === 0 && <p>Aucun brouillon pour ce Project.</p>}
        {shownDrafts.length > 0 && <ul className="mission-list">{shownDrafts.map((item) => <li key={item.draft_id}>
          <button type="button" aria-current={current?.draft_id === item.draft_id ? "true" : undefined}
            onClick={() => void openDraft(item.draft_id)}><strong>{item.title}</strong><small>Local · modifié {stamp(item.updated_at_ms)}</small></button>
        </li>)}</ul>}
        <h3>Checkpoints historiques · registre de test</h3>
        {!connected || !verified ? <p>Source backend non vérifiée. L’historique est indisponible.</p> : <>
          {history.isPending && <p className="skeleton">Lecture des checkpoints…</p>}
          {history.isError && <p role="alert">Registre temporairement indisponible ou incompatible.</p>}
          {history.isSuccess && <p className="read-stamp">Dernière lecture réussie : {stamp(history.dataUpdatedAt)}</p>}
          {history.isSuccess && history.data.missions.length === 0 && <p>Page valide et vide.</p>}
          {shownHistory.length > 0 && <ul className="mission-list">{shownHistory.map((item) => <li key={item.mission_id}>
            <button type="button" onClick={() => { if (guard()) { setCurrent(null); setCreating(false); setDirty(false); setSelectedMission(item.mission_id); } }}>
              <strong>{item.objective}</strong><small>{item.state} · {stamp(Date.parse(item.updated_at))}</small></button>
          </li>)}</ul>}
          {history.isSuccess && <div className="pager"><button type="button" disabled={offset === 0}
            onClick={() => { setOffset(Math.max(0, offset - 10)); setSelectedMission(null); }}>Précédent</button>
            <span>Page {Math.floor(offset / 10) + 1}</span><button type="button" disabled={history.data.next_offset === null}
              onClick={() => { setOffset(history.data.next_offset!); setSelectedMission(null); }}>Suivant</button></div>}
        </>}
      </aside>
      <section className="panel mission-editor" aria-label="Détail de mission">
        {error && <p className="notice warn" role="alert">{error}</p>}
        {(creating || current) ? <>
          <p className="eyebrow">BROUILLON LOCAL · JAMAIS SOUMIS</p><h2>{current ? "Modifier le brief" : "Nouveau brief"}</h2>
          <p>Ce texte est enregistré sur cet appareil. Aucun agent, modèle ou service backend ne le reçoit.</p>
          <form onSubmit={(event) => { event.preventDefault(); void save(); }} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
          }}>
            <label htmlFor="draft-title">Titre · 120 caractères maximum</label>
            <input ref={titleRef} id="draft-title" value={title} maxLength={120} required
              onChange={(event) => { setTitle(event.target.value); setDirty(true); }} />
            <label htmlFor="draft-objective">Objectif · 4 000 caractères maximum</label>
            <textarea id="draft-objective" rows={9} maxLength={4000} required value={objective}
              onChange={(event) => { setObjective(event.target.value); setDirty(true); }} />
            <label htmlFor="draft-criteria">Critères de vérification · 4 000 caractères maximum</label>
            <textarea id="draft-criteria" rows={6} maxLength={4000} required value={criteria}
              onChange={(event) => { setCriteria(event.target.value); setDirty(true); }} />
            {current && <p className="read-stamp">Créé {stamp(current.created_at_ms)} · modifié {stamp(current.updated_at_ms)} · révision {current.revision}</p>}
            <div className="editor-actions"><button type="submit" disabled={busy}>Enregistrer localement</button>
              <button type="button" disabled={busy} onClick={() => { if (guard()) { if (current) reset(current); else { setCreating(false); setDirty(false); } } }}>Annuler</button>
              {current && <><button type="button" disabled={busy} onClick={() => void duplicate()}>Dupliquer la version enregistrée</button>
                <button type="button" disabled={busy} onClick={() => void remove()}>Supprimer…</button></>}
              {dirty && <span role="status">Modifications non enregistrées</span>}
            </div>
          </form>
        </> : selectedMission ? <>
          <p className="eyebrow">CHECKPOINT HISTORIQUE · MORGOTH_TEST</p><h2>Détail enregistré</h2>
          {detail.isPending && <p className="skeleton">Lecture du détail…</p>}
          {detail.isError && <p role="alert">Détail supprimé, hors Project ou indisponible.</p>}
          {detail.isSuccess && detail.data.project_id === projectId && <dl className="fact-list">
            <div className="fact"><dt>Objectif</dt><dd>{detail.data.objective}</dd></div>
            <div className="fact"><dt>Dernier checkpoint, pas état live</dt><dd>{detail.data.state}</dd></div>
            <div className="fact"><dt>Étapes enregistrées</dt><dd>{detail.data.stages.join(" → ")}</dd></div>
            <div className="fact"><dt>Gaps de capacité</dt><dd>{detail.data.capability_gaps.join(", ") || "Aucun enregistré"}</dd></div>
            <div className="fact"><dt>Échecs / refus</dt><dd>{detail.data.failure_codes.join(", ") || "Aucun enregistré"}</dd></div>
            <div className="fact"><dt>Reçus locaux</dt><dd>{detail.data.receipt_count} · contenu non exposé</dd></div>
            <div className="fact"><dt>Créé / modifié</dt><dd>{new Date(detail.data.created_at).toLocaleString("fr-FR")} / {new Date(detail.data.updated_at).toLocaleString("fr-FR")}</dd></div>
          </dl>}
        </> : <div className="empty-evidence"><h2>Préparez un brief ou ouvrez un checkpoint</h2>
          <p>Les brouillons sont modifiables et locaux. Les checkpoints sont historiques et en lecture seule.</p></div>}
      </section>
    </div>
  </div>;
}

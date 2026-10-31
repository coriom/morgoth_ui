import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BriefFields, GithubWorkflowPreview, GithubWorkflowTransfer } from "./GithubBriefWorkflow";

type PlannerStatus = { schema_version: 1; enabled: boolean; service_state: string;
  installed_models: { id: string; size_bytes: number }[] };
type GithubStatus = { status: string; repository: string | null; repository_id: number | null;
  visibility: string | null; expires_in_seconds: number | null };
type Preview = { schema_version: 1; preview_id: string; project_id: string; repository: string;
  repository_id: number; repository_private: boolean; model: string; objective: string;
  exact_model_context: string; context_digest: string; expires_at_ms: number;
  max_reads: number; max_turns: number; duration_seconds: number };
type Finding = { text: string; source_ref: string };
type Observation = { reference: string; operation: string; repository: string; repository_id: number;
  read_at_ms: number; digest: string; truncated: boolean; data: {
    items?: { number: number; title: string; state: string; updated_at: string; url: string }[];
    number?: number; title?: string; state?: string; updated_at?: string; url?: string; body_excerpt?: string;
    default_branch?: string; head_sha?: string;
  } };
type Session = { schema_version: 1; session_id: string; project_id: string; repository: string;
  repository_id: number; repository_private: boolean; model: string; status: string;
  turns: number; reads: number; observations: Observation[]; last_proposal: string | null;
  final_report: { summary: string; findings: Finding[]; uncertainties: string[];
    next_steps: string[]; verification_criteria: string[] } | null;
  error_code: string | null; draft_id: string | null; expires_at_ms: number };
type Receipt = { schema_version: 1; session_id: string; project_id: string; repository: string;
  status: string; attempted_operations: string[]; observation_digests: string[];
  draft_id: string | null; updated_at_ms: number };

const labels: Record<string, string> = {
  READY: "Autorisée, prête", RUNNING: "En cours", PAUSED: "Observation vérifiée · poursuivre ou arrêter",
  COMPLETED: "Analyse terminée · aucune écriture", STOPPED: "Arrêtée", FAILED: "Échec sans relance",
  EXPIRED: "Expirée", GITHUB_AUTH_REQUIRED: "Autorisez d’abord un seul dépôt GitHub dans Réglages → Connexions.",
  MODEL_UNAVAILABLE: "Modèle local indisponible ou non choisi.", SESSION_BUSY: "Une session supervisée est déjà active.",
  ACTION_REFUSED: "L’action proposée sort du périmètre autorisé. Session arrêtée.",
  SOURCE_REFERENCE_INVALID: "Le modèle a cité une preuve inconnue. Rapport refusé.",
  GITHUB_GRANT_CHANGED: "L’autorisation GitHub a changé. Session arrêtée.",
  GITHUB_READ_FAILED: "Lecture GitHub refusée ou indisponible. Aucun résultat inventé.",
  BUDGET_EXCEEDED: "Budget de la session atteint. Aucun autre appel exécuté.",
  MODEL_RESPONSE_INVALID: "Réponse du modèle incompatible. Aucun appel exécuté.",
  SESSION_STOPPED: "Session arrêtée. Aucun autre appel autorisé."
};
function message(error: unknown): string {
  const value = error as { code?: unknown; kind?: unknown } | null;
  const code = typeof value?.code === "string" ? value.code : typeof value?.kind === "string" ? value.kind : "";
  return labels[code] ?? (code && /^[A-Z_]{2,64}$/.test(code) ? `Opération refusée (${code}).` : "Opération indisponible. Aucun appel supplémentaire.");
}
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const list = (values: string[]) => values.length ? <ul>{values.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p>Aucun élément déclaré.</p>;

/** One user-driven model turn at a time; Rust owns every grant and tool call. */
export function SupervisedAssistant({ projectId, verified, onCreated, onGithubReady }:
  { projectId: string; verified: boolean; onCreated: (draftId: string) => Promise<void>;
    onGithubReady: (transfer: GithubWorkflowTransfer) => void }) {
  const [planner, setPlanner] = useState<PlannerStatus | null>(null);
  const [github, setGithub] = useState<GithubStatus | null>(null);
  const [model, setModel] = useState("");
  const [objective, setObjective] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [fields, setFields] = useState<BriefFields | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const refresh = async () => {
    const [p, g] = await Promise.all([
      invoke<PlannerStatus>("planner_status"), invoke<GithubStatus>("github_status")]);
    if (p.schema_version !== 1) throw Error("INVALID_STATUS");
    setPlanner(p); setGithub(g);
    setModel(current => p.installed_models.some(item => item.id === current) ? current : "");
  };
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    setPreview(null); setSession(null); setFields(null); setError(null); setResult(null);
    void Promise.all([invoke<PlannerStatus>("planner_status"), invoke<GithubStatus>("github_status"),
      invoke<Session | null>("supervised_status", { projectId })]).then(([p, g, s]) => {
      if (live) { setPlanner(p); setGithub(g); setSession(s); setModel(""); }
    }).catch(() => { if (live) setError("État de connexion indisponible."); });
    void invoke<Receipt[]>("supervised_receipts", { projectId }).then(values => {
      if (live && Array.isArray(values)) setReceipts(values.slice(0, 3));
    }).catch(() => undefined);
    return () => { live = false; void invoke("supervised_stop", { projectId }).catch(() => undefined); };
  }, [projectId, expanded]);
  const prepare = async () => {
    if (busy || !verified || !model || !objective.trim()) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const p = await invoke<Preview>("supervised_prepare", { projectId, model, objective });
      if (p.schema_version !== 1 || p.project_id !== projectId || !uuid(p.preview_id) || p.context_digest.length !== 64) throw Error("INVALID_PREVIEW");
      setPreview(p); setSession(null); setFields(null);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const start = async () => {
    if (!preview || busy) return;
    setBusy(true); setError(null);
    try {
      const s = await invoke<Session>("supervised_start", { projectId, previewId: preview.preview_id,
        contextDigest: preview.context_digest });
      if (s.schema_version !== 1 || s.project_id !== projectId || !uuid(s.session_id)) throw Error("INVALID_SESSION");
      setSession(s); setPreview(null);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const step = async () => {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try {
      const s = await invoke<Session>("supervised_step", { projectId, sessionId: session.session_id });
      if (s.schema_version !== 1 || s.session_id !== session.session_id || s.project_id !== projectId) throw Error("INVALID_SESSION");
      setSession(s);
    } catch (cause) {
      setError(message(cause));
      void invoke<Session | null>("supervised_status", { projectId }).then(setSession).catch(() => undefined);
    } finally { setBusy(false); }
  };
  const stop = async () => {
    if (!session) { setPreview(null); return; }
    try { setSession(await invoke<Session>("supervised_stop", { projectId })); setError(null); }
    catch (cause) { setError(message(cause)); }
  };
  const prepareBrief = async () => {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try { setFields(await invoke<BriefFields>("supervised_brief_preview", { projectId, sessionId: session.session_id })); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const adopt = async () => {
    if (!session || !fields || busy) return;
    if (!fields.title.trim() || !fields.objective.trim() || !fields.verification_criteria.trim()) {
      setError("Complétez les trois champs du brief."); return;
    }
    setBusy(true); setError(null);
    try {
      const issueObserved = session.observations.some(item => item.operation === "READ_ISSUE");
      if (issueObserved) {
        const workflow = await invoke<GithubWorkflowPreview>("supervised_handoff_github", { projectId, sessionId: session.session_id });
        if (workflow.schema_version !== 1 || workflow.project_id !== projectId || !uuid(workflow.workflow_id)) throw Error("INVALID_WORKFLOW");
        onGithubReady({ preview: workflow, fields, nonce: Date.now() });
        setResult("Issue relue. Vérifiez l’aperçu D17 et approuvez séparément le brief.");
      } else {
        const draft = await invoke<{ draft_id: string; project_id: string }>("supervised_adopt_local", {
          projectId, sessionId: session.session_id, fields });
        if (draft.project_id !== projectId || draft.draft_id !== session.session_id) throw Error("INVALID_DRAFT");
        await onCreated(draft.draft_id);
        setResult("Brief local enregistré, non soumis.");
      }
      setFields(null);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  return <details className="planner-assistant supervised-assistant" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>Assistant · exécution supervisée</summary>
    <p>Le modèle propose une lecture GitHub. Rust contrôle le dépôt, l’action et la preuve avant tout nouvel appel.</p>
    {!verified && <p role="status">Choisissez un Project géré et vérifié.</p>}
    {github?.status !== "AUTHORIZED" && <p role="status">Autorisez un dépôt dans Réglages → Connexions et applications → GitHub.</p>}
    {planner && (!planner.enabled ? <p>Capacité locale désactivée pour cette session.</p>
      : planner.service_state !== "REACHABLE" ? <p>Ollama local indisponible.</p> : null)}
    <div className="planner-fields">
      <p>Project {projectId} · GitHub : {github?.repository ?? "non connecté"} {github?.repository_id ? `(#${github.repository_id})` : ""}</p>
      <label htmlFor="supervised-objective">Objectif</label>
      <textarea id="supervised-objective" rows={3} maxLength={1200} value={objective}
        onChange={event => { setObjective(event.target.value); setPreview(null); }} />
      <label htmlFor="supervised-model">Modèle local installé</label>
      <select id="supervised-model" value={model} onChange={event => { setModel(event.target.value); setPreview(null); }}>
        <option value="">Choisir un modèle</option>
        {planner?.installed_models.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
      </select>
      <div className="editor-actions"><button type="button" onClick={() => void refresh().catch(cause => setError(message(cause)))}>Actualiser</button>
        <button type="button" disabled={busy || !verified || !planner?.enabled || planner.service_state !== "REACHABLE" ||
          github?.status !== "AUTHORIZED" || !model || !objective.trim() || !!session && ["READY", "RUNNING", "PAUSED"].includes(session.status)}
          onClick={() => void prepare()}>Prévoir la session</button></div>
    </div>
    {error && <p role="alert" className="notice warn">{error}</p>}
    {result && <p role="status">{result}</p>}
    {preview && <section className="workflow-preview" aria-label="Périmètre de la session supervisée">
      <h3>Autorisation avant lecture</h3>
      <p>{preview.repository} · {preview.repository_private ? "Dépôt privé" : "Dépôt public"} · {preview.model}</p>
      <p>Au plus {preview.max_reads} lectures GitHub, {preview.max_turns} tours de modèle, {preview.duration_seconds / 60} minutes. Aucune écriture.</p>
      {preview.repository_private && <p className="notice warn">Des extraits privés peuvent être transmis au modèle local après votre accord.</p>}
      <label htmlFor="supervised-context">Contexte exact du premier tour</label>
      <textarea id="supervised-context" readOnly rows={8} value={preview.exact_model_context} />
      <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void start()}>Autoriser la session…</button>
        <button type="button" onClick={() => setPreview(null)}>Annuler</button></div>
    </section>}
    {session && <section className="workflow-preview" aria-label="Exécution supervisée">
      <h3>Session · {labels[session.status] ?? session.status}</h3>
      <p>{session.repository} · {session.reads}/3 lectures · {session.turns}/3 tours · modèle {session.model}</p>
      {session.last_proposal && <p><strong>Proposition du modèle :</strong> {session.last_proposal}</p>}
      {session.observations.map(item => <section key={item.reference} className="supervised-observation">
        <h4>{item.reference} · {item.operation} · lecture vérifiée</h4>
        <p>Dépôt {item.repository} #{item.repository_id} · {new Date(item.read_at_ms).toLocaleString("fr-FR")} · empreinte {item.digest.slice(0, 12)}…{item.truncated ? " · projection tronquée" : ""}</p>
        {item.operation === "REPOSITORY_OVERVIEW" ?
          <p>Branche {item.data.default_branch} · HEAD {item.data.head_sha?.slice(0, 12)}… · mis à jour {item.data.updated_at}</p>
          : item.data.items ? <ul>{item.data.items.map(issue => <li key={issue.number}>#{issue.number} · {issue.title} ({issue.state})</li>)}</ul>
            : <><p>#{item.data.number} · {item.data.title} ({item.data.state})</p><p>{item.data.body_excerpt}</p></>}
      </section>)}
      {session.final_report && <section><h4>Interprétation du modèle · à vérifier</h4>
        <p>{session.final_report.summary}</p>
        <h4>Constats et preuves</h4><ul>{session.final_report.findings.map((finding, index) =>
          <li key={index}>{finding.text} <small>({finding.source_ref})</small></li>)}</ul>
        <h4>Incertitudes</h4>{list(session.final_report.uncertainties)}
        <h4>Étapes suggérées</h4>{list(session.final_report.next_steps)}
        <h4>Vérification humaine</h4>{list(session.final_report.verification_criteria)}</section>}
      <div className="editor-actions">
        {(["READY", "PAUSED"].includes(session.status)) && <button type="button" disabled={busy || session.turns >= 3}
          onClick={() => void step()}>{busy ? "Analyse en cours…" : session.turns === 0 ? "Lancer le premier tour" : "Poursuivre un tour"}</button>}
        {(["READY", "RUNNING", "PAUSED"].includes(session.status)) && <button type="button" onClick={() => void stop()}>Arrêter et révoquer</button>}
        {session.status === "COMPLETED" && <button type="button" onClick={() => void prepareBrief()}>Préparer un brief local</button>}
      </div>
      {session.error_code && <p role="alert">Échec : {labels[session.error_code] ?? session.error_code}</p>}
    </section>}
    {fields && session && <section className="workflow-preview" aria-label="Brief local à approuver">
      <h3>Brief à examiner · écriture distincte</h3>
      <label htmlFor="supervised-title">Titre</label><input id="supervised-title" maxLength={120} value={fields.title}
        onChange={event => setFields({ ...fields, title: event.target.value })} />
      <label htmlFor="supervised-brief">Objectif</label><textarea id="supervised-brief" rows={6} maxLength={4000} value={fields.objective}
        onChange={event => setFields({ ...fields, objective: event.target.value })} />
      <label htmlFor="supervised-criteria">Critères de vérification</label><textarea id="supervised-criteria" rows={4} maxLength={4000} value={fields.verification_criteria}
        onChange={event => setFields({ ...fields, verification_criteria: event.target.value })} />
      <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void adopt()}>
        {session.observations.some(o => o.operation === "READ_ISSUE") ? "Revalider dans D17…" : "Créer le brief local…"}</button>
        <button type="button" onClick={() => setFields(null)}>Annuler</button></div>
    </section>}
    {receipts.length > 0 && <section className="workflow-preview" aria-label="Sessions précédentes">
      <h3>Sessions précédentes</h3><p>Après redémarrage, aucune session ne reprend automatiquement.</p>
      <ul>{receipts.map(item => <li key={item.session_id}>{item.repository} · {item.status} ·
        {item.attempted_operations.length} lecture(s) tentée(s) · {item.observation_digests.length} vérifiée(s)
        {item.draft_id ? ` · brief ${item.draft_id.slice(0, 8)}…` : ""}</li>)}</ul>
    </section>}
  </details>;
}

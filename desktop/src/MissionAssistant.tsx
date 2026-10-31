import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LocalDraft } from "./drafts";
import type { BriefFields, GithubWorkflowPreview, GithubWorkflowTransfer } from "./GithubBriefWorkflow";

type Model = { id: string; size_bytes: number };
type PlannerStatus = { schema_version: 1; enabled: boolean; service_state: string; installed_models: Model[] };
type Context = { kind: "none" } | { kind: "draft"; draft_id: string } |
  { kind: "github"; item_kind: "issue" | "pull"; number: number };
type Preview = { schema_version: 1; preview_id: string; project_id: string; model: string; provider: string;
  processing: string; source_label: string; source_private: boolean; prompt: string; context_digest: string; expires_at_ms: number };
type Step = { category: string; description: string; source_refs: string[] };
type PlanContent = { schema_version: 1; summary: string; assumptions: string[]; missing_information: string[];
  steps: Step[]; expected_deliverables: string[]; verification_criteria: string[]; risks: string[] };
type Proposal = { schema_version: 1; proposal_id: string; project_id: string; objective: string; context_digest: string;
  source_label: string; source_private: boolean; model: string; provider: string; generated_at_ms: number;
  status: "PROPOSED"; content: PlanContent };

const messages: Record<string, string> = {
  PLANNER_DISABLED: "L’analyse locale est désactivée par la configuration native.",
  MODEL_UNAVAILABLE: "Ollama est indisponible. Le workflow GitHub déterministe reste accessible.",
  MODEL_NOT_INSTALLED: "Ce modèle n’est plus installé. Actualisez la liste.",
  INSUFFICIENT_MEMORY: "Mémoire insuffisante pour ce modèle et sa marge de sécurité.",
  PREVIEW_EXPIRED: "L’aperçu a expiré. Préparez de nouveau le contexte.",
  SOURCE_CHANGED: "La source ou son autorisation a changé. Préparez un nouvel aperçu.",
  PROPOSAL_INVALID: "La réponse du modèle ne respecte pas le contrat. Aucun brief créé.",
  PROVIDER_UNAVAILABLE: "Le modèle local ne répond pas. Aucun brief créé.",
  PROVIDER_RESPONSE_INVALID: "La réponse du modèle est incomplète ou incompatible.",
  CANCELLED: "Analyse annulée. Aucun brief créé.",
  PLANNER_CONSENT_REFUSED: "Analyse ou création annulée.",
  WORKFLOW_PROJECT_CHANGED: "Le Project a changé. Reprenez depuis le nouveau Project.",
  GITHUB_AUTH_REQUIRED: "Autorisez d’abord le dépôt dans Réglages → Connexions et applications.",
  PROPOSAL_EXPIRED: "La proposition a expiré. Une nouvelle analyse est nécessaire.",
};
function message(error: unknown): string {
  const value = error && typeof error === "object" ? error as { code?: unknown } : {};
  return messages[typeof value.code === "string" ? value.code : ""] ??
    "Opération refusée ou résultat incertain. Aucune action autonome n’a été lancée.";
}
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const clipped = (value: string, count: number) => [...value].slice(0, count).join("");
function fieldsFrom(proposal: Proposal): BriefFields {
  const plan = proposal.content;
  return {
    title: clipped(proposal.objective.trim().replace(/\s+/g, " "), 120),
    objective: clipped(proposal.objective.trim() + "\n\nProposition du modèle (" + proposal.model +
      "), à revoir :\n" + plan.summary + "\n\nÉtapes suggérées :\n" +
      plan.steps.map((step, i) => String(i + 1) + ". " + step.description).join("\n"), 4000),
    verification_criteria: clipped(plan.verification_criteria.map(item => "- " + item).join("\n"), 4000),
  };
}
function validProposal(value: Proposal, projectId: string, preview: Preview): boolean {
  return value.schema_version === 1 && value.project_id === projectId && uuid(value.proposal_id)
    && value.context_digest === preview.context_digest && value.model === preview.model
    && value.status === "PROPOSED" && value.content.schema_version === 1
    && value.content.steps.length > 0 && value.content.steps.length <= 8;
}
function list(items: string[], empty: string) {
  return items.length ? <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>{empty}</p>;
}

/** Model output is only a proposal; native commands own source reads, grants and writes. */
export function MissionAssistant({ projectId, verified, drafts, onCreated, onGithubReady }: {
  projectId: string; verified: boolean; drafts: LocalDraft[];
  onCreated: (id: string) => Promise<void>; onGithubReady: (transfer: GithubWorkflowTransfer) => void;
}) {
  const [status, setStatus] = useState<PlannerStatus | null>(null);
  const [objective, setObjective] = useState("");
  const [model, setModel] = useState("");
  const [sourceKind, setSourceKind] = useState<"none" | "draft" | "github">("none");
  const [draftId, setDraftId] = useState("");
  const [githubKind, setGithubKind] = useState<"issue" | "pull">("issue");
  const [number, setNumber] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [fields, setFields] = useState<BriefFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const refresh = async () => {
    const value = await invoke<PlannerStatus>("planner_status");
    if (value.schema_version !== 1 || !Array.isArray(value.installed_models)) throw Error("INVALID_PLANNER_STATUS");
    setStatus(value);
    setModel(current => value.installed_models.some(item => item.id === current) ? current : value.installed_models[0]?.id ?? "");
  };
  useEffect(() => {
    let live = true;
    setPreview(null); setProposal(null); setFields(null); setResult(null); setError(null);
    void invoke<PlannerStatus>("planner_status").then(value => {
      if (live && value.schema_version === 1) { setStatus(value); setModel(value.installed_models[0]?.id ?? ""); }
    }).catch(() => { if (live) setError("État local Ollama indisponible."); });
    return () => { live = false; void invoke("planner_cancel", { projectId }).catch(() => undefined); };
  }, [projectId]);
  const prepare = async () => {
    if (busy || !verified || !model || !objective.trim()) return;
    let context: Context = { kind: "none" };
    if (sourceKind === "draft") {
      if (!draftId) { setError("Sélectionnez un brief local précis."); return; }
      context = { kind: "draft", draft_id: draftId };
    }
    if (sourceKind === "github") {
      if (!/^[1-9][0-9]{0,6}$/.test(number)) { setError("Saisissez un numéro GitHub positif."); return; }
      context = { kind: "github", item_kind: githubKind, number: Number(number) };
    }
    setBusy(true); setError(null); setResult(null);
    try {
      const value = await invoke<Preview>("planner_prepare", { projectId, objective, context, model });
      if (value.schema_version !== 1 || value.project_id !== projectId || !uuid(value.preview_id) ||
        value.context_digest.length !== 64) throw Error("INVALID_PLANNER_PREVIEW");
      setPreview(value); setProposal(null); setFields(null);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    if (!preview || busy) return;
    setBusy(true); setError(null);
    try {
      const value = await invoke<Proposal>("planner_generate", { projectId, previewId: preview.preview_id,
        contextDigest: preview.context_digest });
      if (!validProposal(value, projectId, preview)) throw Error("INVALID_PLANNER_PROPOSAL");
      setProposal(value); setFields(fieldsFrom(value)); setPreview(null);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    try { await invoke("planner_cancel", { projectId }); }
    catch (cause) { setError(message(cause)); }
    setPreview(null); setProposal(null); setFields(null); setBusy(false);
  };
  const adopt = async () => {
    if (!proposal || !fields || busy) return;
    if (!fields.title.trim() || !fields.objective.trim() || !fields.verification_criteria.trim()) {
      setError("Complétez les trois champs du brief."); return;
    }
    setBusy(true); setError(null);
    try {
      if (sourceKind === "github") {
        const workflow = await invoke<GithubWorkflowPreview>("planner_handoff_github", { projectId,
          proposalId: proposal.proposal_id });
        if (workflow.schema_version !== 1 || workflow.project_id !== projectId || !uuid(workflow.workflow_id))
          throw Error("INVALID_WORKFLOW_PREVIEW");
        const objectiveWithSource = clipped(workflow.proposed.objective + "\n\nPlan du modèle, à revoir :\n" +
          fields.objective, 4000);
        onGithubReady({ preview: workflow, fields: { ...fields, objective: objectiveWithSource }, nonce: Date.now() });
        setResult("Source revalidée. Relisez et confirmez le brief dans le workflow GitHub D17 ci-dessous.");
      } else {
        const draft = await invoke<LocalDraft>("planner_adopt_local", { projectId, proposalId: proposal.proposal_id, fields });
        if (draft.project_id !== projectId || draft.draft_id !== proposal.proposal_id) throw Error("INVALID_DRAFT");
        await onCreated(draft.draft_id);
        setResult("Brief enregistré localement et non soumis.");
      }
      setProposal(null); setFields(null);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  return <details className="planner-assistant" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Assistant · proposer un plan</summary>
    <p>Une proposition locale à revoir par vous. Le modèle n’a accès à aucun connecteur et ne crée aucun brief.</p>
    {!verified && <p role="status">Sélectionnez un Project géré et vérifié pour demander une proposition.</p>}
    {status && (!status.enabled ? <p>Analyse désactivée par défaut. L’opérateur peut activer le chemin Ollama local pour cette session.</p>
      : status.service_state !== "REACHABLE" ? <p>Ollama local indisponible. Le workflow GitHub reste utilisable.</p>
        : status.installed_models.length === 0 ? <p>Aucun modèle local installé observé. Aucun téléchargement automatique.</p> : null)}
    <div className="planner-fields">
      <label htmlFor="planner-objective">Votre objectif</label>
      <textarea id="planner-objective" rows={4} maxLength={2000} value={objective}
        onChange={event => { setObjective(event.target.value); setPreview(null); setProposal(null); }}
        placeholder="Décrivez le travail à préparer…" />
      <label htmlFor="planner-source">Contexte facultatif · un seul élément choisi</label>
      <select id="planner-source" value={sourceKind} onChange={event => { setSourceKind(event.target.value as typeof sourceKind); setPreview(null); setProposal(null); }}>
        <option value="none">Aucun contexte supplémentaire</option><option value="draft">Brief local existant</option>
        <option value="github">Issue ou PR GitHub autorisée</option>
      </select>
      {sourceKind === "draft" && <><label htmlFor="planner-draft">Brief précis</label>
        <select id="planner-draft" value={draftId} onChange={event => setDraftId(event.target.value)}>
          <option value="">Choisir un brief</option>{drafts.map(item => <option key={item.draft_id} value={item.draft_id}>{item.title}</option>)}
        </select></>}
      {sourceKind === "github" && <div className="editor-actions"><label htmlFor="planner-github-kind">Élément GitHub</label>
        <select id="planner-github-kind" value={githubKind} onChange={event => setGithubKind(event.target.value as typeof githubKind)}>
          <option value="issue">Issue</option><option value="pull">Pull request</option></select>
        <label htmlFor="planner-github-number">Numéro exact</label>
        <input id="planner-github-number" inputMode="numeric" value={number} onChange={event => setNumber(event.target.value)} /></div>}
      <label htmlFor="planner-model">Modèle local installé</label>
      <select id="planner-model" value={model} onChange={event => { setModel(event.target.value); setPreview(null); setProposal(null); }}>
        {status?.installed_models.length ? status.installed_models.map(item =>
          <option key={item.id} value={item.id}>{item.id}</option>) : <option value="">Aucun modèle observé</option>}
      </select>
      <div className="editor-actions"><button type="button" onClick={() => void refresh().catch(cause => setError(message(cause)))}>Actualiser les modèles</button>
        <button type="button" disabled={!verified || !status?.enabled || status.service_state !== "REACHABLE" ||
          !model || busy || !objective.trim()} onClick={() => void prepare()}>Prévoir le contexte envoyé</button></div>
    </div>
    {open && error && <p className="notice warn" role="alert">{error}</p>}
    {result && <p role="status">{result}</p>}
    {preview && <section className="workflow-preview" aria-label="Contexte exact soumis au modèle">
      <h3>Avant analyse</h3><p>Project {projectId} · {preview.model} · {preview.processing} · source : {preview.source_label}</p>
      {preview.source_private && <p className="notice warn">Contenu privé sélectionné : transmission au modèle local après votre accord.</p>}
      <p>La réponse sera une proposition sans action. Contexte exact envoyé :</p>
      <textarea readOnly rows={11} value={preview.prompt} aria-label="Prompt exact envoyé au modèle local" />
      <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void generate()}>
        {busy ? "Analyse en cours…" : "Autoriser une proposition locale…"}</button>
        <button type="button" onClick={() => void cancel()}>Annuler</button></div>
    </section>}
    {proposal && fields && <section className="workflow-preview" aria-label="Plan proposé par le modèle">
      <h3>Plan proposé · à examiner</h3><p>Modèle local {proposal.model} · {new Date(proposal.generated_at_ms).toLocaleString("fr-FR")}
        · Project {projectId} · {proposal.source_label}</p>
      <p>Ce plan n’atteste d’aucun travail terminé et ne donne aucune permission.</p>
      <h4>Résumé</h4><p>{proposal.content.summary}</p>
      <h4>Étapes suggérées</h4><ol>{proposal.content.steps.map((step, i) => <li key={i}>{step.description}
        <small> ({step.category}{step.source_refs.length ? " · " + step.source_refs.join(", ") : ""})</small></li>)}</ol>
      <h4>Hypothèses</h4>{list(proposal.content.assumptions, "Aucune déclarée.")}
      <h4>Informations manquantes</h4>{list(proposal.content.missing_information, "Aucune déclarée.")}
      <h4>Livrables attendus</h4>{list(proposal.content.expected_deliverables, "Aucun déclaré.")}
      <h4>Risques et limites</h4>{list(proposal.content.risks, "Aucun déclaré.")}
      <p>Modifiez le brief proposé si nécessaire. Une confirmation native sera exigée avant l’écriture.</p>
      <label htmlFor="planner-title">Titre du brief</label>
      <input id="planner-title" maxLength={120} value={fields.title} onChange={event => setFields({...fields, title:event.target.value})} />
      <label htmlFor="planner-brief">Objectif du brief</label>
      <textarea id="planner-brief" rows={6} maxLength={4000} value={fields.objective}
        onChange={event => setFields({...fields, objective:event.target.value})} />
      <label htmlFor="planner-criteria">Critères de vérification à confirmer</label>
      <textarea id="planner-criteria" rows={4} maxLength={4000} value={fields.verification_criteria}
        onChange={event => setFields({...fields, verification_criteria:event.target.value})} />
      <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void adopt()}>
        {sourceKind === "github" ? "Continuer avec le workflow GitHub…" : "Créer un brief local…"}</button>
        <button type="button" onClick={() => void cancel()}>Rejeter la proposition</button></div>
    </section>}
  </details>;
}

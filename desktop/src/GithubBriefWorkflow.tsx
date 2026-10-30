import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Source = { repository: string; repository_id: number; private: boolean; kind: "issue" | "pull"; number: number;
  title: string; state: string; body_excerpt: string; body_truncated: boolean; updated_at: string; url: string };
type Fields = { title: string; objective: string; verification_criteria: string };
type Preview = { schema_version: 1; workflow_id: string; project_id: string; source: Source; source_digest: string;
  proposed: Fields; expires_at_ms: number; effect: string };
type Receipt = { schema_version: 1; workflow_id: string; project_id: string; source_repository: string;
  source_kind: string; source_number: number; draft_id: string; state: string; handoff_state: string;
  updated_at_ms: number; error_code: string | null };
type Handoff = { schema_version: 1; workflow_id: string; project_id: string; draft_id: string;
  workspace: string; workspace_hash: string; markdown: string; sha256: string; bytes: number };
type GithubStatus = { status: string; repository: string | null; visibility: string | null };

const messages: Record<string, string> = {
  GITHUB_AUTH_REQUIRED: "Connectez d’abord un seul dépôt dans Réglages → Connexions et applications.",
  GITHUB_SESSION_EXPIRED: "La lecture GitHub a expiré. Autorisez de nouveau le dépôt.",
  GITHUB_ITEM_TYPE_CHANGED: "Ce numéro correspond à une pull request. Choisissez le bon type.",
  GITHUB_NOT_FOUND: "L’élément n’est plus accessible dans ce dépôt.",
  SOURCE_CHANGED: "La source GitHub ou la session a changé. Préparez un nouvel aperçu.",
  PREVIEW_EXPIRED: "Cet aperçu a expiré. Relisez la source avant de créer un brief.",
  WORKFLOW_PROJECT_CHANGED: "Le Project courant a changé. Aucun brief n’a été créé.",
  WORKFLOW_CONSENT_REFUSED: "Action annulée. Le brief reste inchangé.",
  WORKFLOW_ALREADY_ATTEMPTED: "Ce workflow a déjà été tenté. Consultez son reçu avant toute autre action.",
  VSCODE_UNAVAILABLE: "Associez un espace VS Code fiable avant de préparer le transfert.",
  VSCODE_AUTHORIZATION_REQUIRED: "La connexion VS Code n’est plus autorisée.",
  HANDOFF_CHANGED: "Le contenu ou l’espace VS Code a changé. Préparez un nouveau transfert.",
  WORKFLOW_HANDOFF_CHANGED: "Le contenu ou l’espace VS Code a changé. Préparez un nouveau transfert.",
};
function failure(error: unknown): string {
  const value = error && typeof error === "object" ? error as {kind?: unknown; code?: unknown} : {};
  const key = typeof value.code === "string" ? value.code : typeof value.kind === "string" ? value.kind : "";
  return messages[key] ?? "Workflow refusé ou résultat incertain. Consultez les reçus avant de réessayer.";
}
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function validPreview(value: Preview, project: string): boolean { return value.schema_version === 1 && uuid(value.workflow_id) && value.project_id === project &&
  value.source.repository.length > 0 && Number.isSafeInteger(value.source.number) && value.source.number > 0 &&
  value.source_digest.length === 64 && value.proposed.title.length > 0 && value.proposed.objective.length > 0; }

/** One fixed recipe; external source text is displayed as inert text, never an instruction. */
export function GithubBriefWorkflow({ projectId, verified, onCreated }: { projectId: string; verified: boolean; onCreated: (draftId: string) => Promise<void> }) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [kind, setKind] = useState<"issue" | "pull">("issue");
  const [number, setNumber] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fields, setFields] = useState<Fields | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    setStatus(await invoke<GithubStatus>("github_status"));
    const values = await invoke<Receipt[]>("workflow_receipts", {projectId});
    if (!Array.isArray(values) || values.length > 200 || values.some(item => item.project_id !== projectId || !uuid(item.workflow_id))) throw Error("INVALID_RECEIPTS");
    setReceipts(values);
  };
  useEffect(() => { let live = true; void invoke<GithubStatus>("github_status").then(value => { if (live) setStatus(value); }).catch(() => undefined);
    if (verified) void invoke<Receipt[]>("workflow_receipts", {projectId}).then(value => { if (live && Array.isArray(value) && value.every(item => item.project_id === projectId)) setReceipts(value); }).catch(() => undefined);
    return () => { live = false; }; }, [projectId, verified]);
  const act = async (operation: "prepare" | "confirm" | "cancel" | "handoff_preview" | "handoff") => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (operation === "prepare") {
        const value = await invoke<Preview>("workflow_prepare", {projectId, kind, number: Number(number)});
        if (!validPreview(value, projectId)) throw Error("INVALID_PREVIEW");
        setPreview(value); setFields(value.proposed); setReceipt(null); setHandoff(null);
      } else if (operation === "confirm" && preview && fields) {
        const value = await invoke<Receipt>("workflow_confirm", {projectId, workflowId:preview.workflow_id, fields});
        if (value.project_id !== projectId || value.draft_id !== preview.workflow_id || value.state !== "LOCAL_BRIEF_CREATED") throw Error("INVALID_RECEIPT");
        setReceipt(value); setPreview(null); setHandoff(null); await onCreated(value.draft_id); await refresh();
      } else if (operation === "cancel" && preview) {
        await invoke("workflow_cancel", {projectId, workflowId:preview.workflow_id}); setPreview(null); setFields(null); await refresh();
      } else if (operation === "handoff_preview" && receipt) {
        const value = await invoke<Handoff>("workflow_handoff_preview", {projectId, workflowId:receipt.workflow_id});
        if (value.project_id !== projectId || value.draft_id !== receipt.draft_id || value.sha256.length !== 64) throw Error("INVALID_HANDOFF");
        setHandoff(value);
      } else if (operation === "handoff" && receipt && handoff) {
        const value = await invoke<Receipt>("workflow_handoff", {projectId, workflowId:receipt.workflow_id, digest:handoff.sha256, workspaceHash:handoff.workspace_hash});
        if (value.project_id !== projectId || value.draft_id !== receipt.draft_id) throw Error("INVALID_RECEIPT");
        setReceipt(value); setHandoff(null); await refresh();
      }
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  };
  return <details className="github-workflow" onToggle={event => { if (event.currentTarget.open) void refresh().catch(() => undefined); }}>
    <summary>Depuis GitHub · créer un brief local</summary>
    <p>Une issue ou PR autorisée devient un brouillon non soumis. Aucun modèle et aucune écriture GitHub.</p>
    {!verified && <p role="status">Project géré non vérifié : préparation indisponible.</p>}
    <p className="read-stamp">Dépôt courant : {status?.status === "AUTHORIZED" ? status.repository : "aucune lecture autorisée"}. Autorisez-le dans Réglages → Connexions et applications.</p>
    <div className="editor-actions"><label htmlFor="workflow-kind">Source</label><select id="workflow-kind" value={kind} onChange={event => setKind(event.target.value as "issue" | "pull")}><option value="issue">Issue</option><option value="pull">Pull request</option></select>
      <label htmlFor="workflow-number">Numéro exact</label><input id="workflow-number" inputMode="numeric" value={number} onChange={event => setNumber(event.target.value)} placeholder="123" />
      <button type="button" disabled={busy || !verified || status?.status !== "AUTHORIZED" || !/^[1-9][0-9]{0,6}$/.test(number)} onClick={() => void act("prepare")}>Préparer l’aperçu</button></div>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {preview && fields && <section className="workflow-preview" aria-label="Aperçu du brief GitHub">
      <h3>Aperçu · {preview.source.repository} #{preview.source.number}</h3>
      <p>Source {preview.source.kind === "issue" ? "issue" : "PR"} · ID dépôt {preview.source.repository_id} · {preview.source.private ? "privé" : "public"} · état {preview.source.state} · mise à jour {preview.source.updated_at}</p>
      <p>URL source : {preview.source.url}</p><p>{preview.source.body_truncated ? "Description externe tronquée à un extrait borné." : "Description externe bornée."}</p>
      <p>Destination : Project <strong>{projectId}</strong>. {preview.effect}</p>
      {preview.source.private && <p className="notice warn">Source privée : ce texte sera copié localement et inclus dans les sauvegardes D8 non chiffrées.</p>}
      <label htmlFor="workflow-title">Titre du brief</label><input ref={titleRef} id="workflow-title" maxLength={120} value={fields.title} onChange={event => setFields({...fields,title:event.target.value})} />
      <label htmlFor="workflow-objective">Objectif et description de la source non fiable</label><textarea id="workflow-objective" rows={8} maxLength={4000} value={fields.objective} onChange={event => setFields({...fields,objective:event.target.value})} />
      <label htmlFor="workflow-criteria">Critères proposés par Morgoth, à revoir</label><textarea id="workflow-criteria" rows={5} maxLength={4000} value={fields.verification_criteria} onChange={event => setFields({...fields,verification_criteria:event.target.value})} />
      <div className="editor-actions"><button type="button" disabled={busy || !fields.title.trim() || !fields.objective.trim() || !fields.verification_criteria.trim()} onClick={() => void act("confirm")}>Créer ce brief local…</button>
        <button type="button" disabled={busy} onClick={() => void act("cancel")}>Annuler l’aperçu</button></div>
    </section>}
    {receipt && <section aria-label="Résultat du workflow"><p role="status">Brief local #{receipt.draft_id.slice(0,8)} · {receipt.state} · transfert VS Code : {receipt.handoff_state}.</p>
      <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void onCreated(receipt.draft_id)}>Ouvrir le brief dans Missions</button>
        {(["LOCAL_BRIEF_CREATED","PARTIAL"].includes(receipt.state)) && <button type="button" disabled={busy} onClick={() => void act("handoff_preview")}>Préparer l’envoi vers VS Code</button>}</div></section>}
    {handoff && <section className="workflow-preview" aria-label="Aperçu exact du transfert VS Code"><h3>Transfert séparé vers VS Code</h3>
      <p>Espace associé : {handoff.workspace} · {handoff.bytes} octets · document Markdown non enregistré. Aucun fichier existant ne sera modifié.</p>
      <label htmlFor="workflow-handoff-text">Contenu exact envoyé après confirmation native</label><textarea id="workflow-handoff-text" readOnly rows={9} value={handoff.markdown} />
      <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void act("handoff")}>Ouvrir ce brouillon dans VS Code…</button><button type="button" onClick={() => setHandoff(null)}>Annuler le transfert</button></div></section>}
    {receipts.length > 0 && <div><h3>Reçus locaux</h3><ul className="mission-list">{receipts.slice(0,8).map(item => <li key={item.workflow_id}><button type="button" onClick={() => { setReceipt(item); setHandoff(null); }}><strong>{item.source_repository} #{item.source_number}</strong><small>{item.state} · {new Date(item.updated_at_ms).toLocaleString("fr-FR")}</small></button></li>)}</ul></div>}
  </details>;
}

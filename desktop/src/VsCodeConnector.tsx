import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface VsCodeState { status: "UNAVAILABLE" | "AVAILABLE" | "AUTHORIZED" | "REVOKED"; workspace: string | null; workspace_hash: string | null; host: string | null; expires_in_seconds: number | null; last_verified_ms: number | null; last_verified_action: string | null }
interface Editor { document: string; language: string; version: number; dirty: boolean; selected_length: number }
interface Metadata { workspace: string; workspace_hash: string; editor: Editor | null; selected_text?: string }
interface Scratch { operation: "open_scratch"; status: "VERIFIED"; text: string; unsaved: boolean }
const failure: Record<string, string> = {
  VSCODE_SOCKET_UNAVAILABLE: "L’extension VS Code n’attend pas de connexion dans cet environnement Linux/WSL.",
  VSCODE_SOCKET_UNTRUSTED: "Le socket VS Code n’a pas les permissions attendues.",
  VSCODE_PAIR_REFUSED: "Code d’association refusé ou expiré. Relancez la commande dans VS Code.",
  VSCODE_WORKSPACE_CHANGED: "L’espace VS Code a changé ; la connexion est révoquée.",
  VSCODE_DOCUMENT_REFUSED: "Ce document ne fait pas partie de l’espace ou du type autorisé.",
  VSCODE_SELECTION_TOO_LARGE: "La sélection dépasse 1 Kio ; réduisez-la dans VS Code.",
  VSCODE_AUTHORIZATION_REQUIRED: "Connexion VS Code révoquée ou expirée.",
  CONSENT_REFUSED: "Opération annulée ; aucun contenu supplémentaire n’a été lu.",
};
function safeFailure(error: unknown): string {
  const kind = typeof error === "object" && error !== null && "kind" in error && typeof error.kind === "string" ? error.kind : "";
  return failure[kind] ?? "VS Code n’a pas confirmé cette opération. Aucun autre espace n’a été consulté.";
}
export function VsCodeConnector({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<VsCodeState | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [scratch, setScratch] = useState<Scratch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => { setState(await invoke<VsCodeState>("vscode_status")); await onRefresh(); };
  const act = async (operation: "pair" | "metadata" | "selection" | "scratch" | "disconnect") => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (operation === "pair") { setState(await invoke<VsCodeState>("vscode_pair", { code })); setCode(""); }
      else if (operation === "metadata") setMetadata(await invoke<Metadata>("vscode_metadata"));
      else if (operation === "selection") setSelection((await invoke<Metadata>("vscode_selection")).selected_text ?? "");
      else if (operation === "scratch") setScratch(await invoke<Scratch>("vscode_scratch"));
      else { await invoke("vscode_disconnect"); setMetadata(null); setSelection(null); setScratch(null); }
      await refresh();
    } catch (cause) { setError(safeFailure(cause)); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  };
  const connected = state?.status === "AUTHORIZED";
  return <section aria-label="Visual Studio Code"><div className="panel-heading"><h3>Visual Studio Code</h3><span>{connected ? "Connecté" : state?.status === "REVOKED" ? "Révoqué" : state?.status === "AVAILABLE" ? "Prêt à associer" : "Non connecté"}</span></div>
    <p>Extension Morgoth utilisant l’API officielle de VS Code · un seul espace de travail fiable, approuvé pour dix minutes. Aucune lecture automatique.</p>
    <p className="read-stamp">Dans VS Code, ouvrez l’espace voulu puis lancez « Morgoth: Connect Workspace ». Saisissez ici le code affiché. L’extension doit fonctionner dans l’hôte Linux/WSL.</p>
    <div className="editor-actions">
      <button type="button" onClick={() => void refresh().catch(() => setError("État VS Code indisponible."))} disabled={busy}>Actualiser</button>
      {!connected && <><label htmlFor="vscode-pair-code">Code d’association</label><input id="vscode-pair-code" autoComplete="off" spellCheck={false} value={code} maxLength={32} onChange={event => setCode(event.target.value.trim().toLowerCase())} aria-describedby="vscode-pair-help" /><button type="button" disabled={busy || !/^[a-f0-9]{32}$/.test(code)} onClick={() => void act("pair")}>Associer cet espace…</button></>}
      {connected && <><button type="button" disabled={busy} onClick={() => void act("metadata")}>Inspecter l’éditeur…</button><button type="button" disabled={busy} onClick={() => void act("selection")}>Lire la sélection…</button><button type="button" disabled={busy} onClick={() => void act("scratch")}>Ouvrir un brouillon test…</button><button type="button" disabled={busy} onClick={() => void act("disconnect")}>Déconnecter VS Code</button></>}
    </div>
    <p id="vscode-pair-help" className="read-stamp">L’installation du CLI « code » ne suffit pas : le statut connecté exige l’association réelle de l’extension.</p>
    {state?.workspace && connected && <p>Espace approuvé : <strong>{state.workspace}</strong> · hôte {state.host} · expiration dans {Math.ceil((state.expires_in_seconds ?? 0) / 60)} min.</p>}
    {state?.last_verified_action && <p className="read-stamp">Dernière opération confirmée : {state.last_verified_action} · {state.last_verified_ms ? new Date(state.last_verified_ms).toLocaleString("fr-FR") : "heure indisponible"}.</p>}
    {metadata && connected && <p>Éditeur : {metadata.editor ? `${metadata.editor.document} · ${metadata.editor.language} · version ${metadata.editor.version}${metadata.editor.dirty ? " · non enregistré" : ""} · sélection ${metadata.editor.selected_length} caractères au plus` : "aucun document admissible actif"}.</p>}
    {selection !== null && connected && <p role="status">Sélection autorisée : <span className="connector-selected-text">{selection || "vide"}</span></p>}
    {scratch && connected && <p role="status">Brouillon non enregistré {scratch.status === "VERIFIED" && scratch.unsaved ? "ouvert et relu" : "non confirmé"} : {scratch.text}</p>}
    {error && <p role="alert" className="notice warn">{error}</p>}
  </section>;
}

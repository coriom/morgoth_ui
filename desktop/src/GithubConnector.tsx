import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GithubView { status: "AVAILABLE" | "SELECTED" | "AUTHORIZED" | "REVOKED" | "UNAVAILABLE";
  repository: string | null; repository_id: number | null; visibility: "public" | "private" | null;
  expires_in_seconds: number | null; last_read_ms: number | null }
interface Preview { kind: "preview"; repository: string; repository_id: number; visibility: "public"; default_branch: string; description: string | null; updated_at: string; read_at_ms: number }
interface Overview { kind: "overview"; repository: string; repository_id: number; visibility: string; description: string | null; default_branch: string; head_sha: string; updated_at: string; url: string; read_at_ms: number }
interface Branch { name: string; sha: string; protected: boolean }
interface Commit { sha: string; title: string; author: string | null; date: string; url: string }
interface Issue { number: number; title: string; state: string; labels: string[]; created_at: string; updated_at: string; excerpt: string; url: string }
interface Pull { number: number; title: string; state: string; base: string; head: string; author: string | null; updated_at: string; draft: boolean; url: string }
interface PullFile { path: string; status: string; additions: number; deletions: number }
type Result = Overview | { kind: "branches"; repository: string; items: Branch[]; read_at_ms: number }
  | { kind: "commits"; repository: string; branch: string; items: Commit[]; read_at_ms: number }
  | { kind: "issues"; repository: string; items: Issue[]; read_at_ms: number }
  | { kind: "pulls"; repository: string; items: Pull[]; read_at_ms: number }
  | { kind: "pull_files"; repository: string; number: number; items: PullFile[]; read_at_ms: number };
const messages: Record<string, string> = {
  GITHUB_REPOSITORY_INVALID: "Saisissez un dépôt canonique au format propriétaire/nom.",
  GITHUB_NOT_FOUND_OR_PRIVATE: "Dépôt public introuvable, ou dépôt privé nécessitant un jeton.",
  GITHUB_NOT_FOUND: "Ce jeton ne donne pas accès au dépôt sélectionné, ou le dépôt n’existe plus.",
  GITHUB_AUTH_INVALID: "Jeton refusé. Vérifiez sa validité et sa portée GitHub.",
  GITHUB_AUTH_REQUIRED: "Autorisez ce dépôt avant de lire ses données.",
  GITHUB_PERMISSION_DENIED: "Permissions GitHub insuffisantes pour cette lecture.",
  GITHUB_RATE_LIMIT: "Limite de l’API GitHub atteinte. Réessayez plus tard.",
  GITHUB_NETWORK_UNAVAILABLE: "GitHub ne répond pas. Votre espace local reste disponible.",
  GITHUB_IDENTITY_CHANGED: "L’identité du dépôt a changé : vérifiez-la avant une nouvelle autorisation.",
  GITHUB_RESPONSE_INVALID: "Réponse GitHub incompatible ou non admissible.",
  GITHUB_RESPONSE_TOO_LARGE: "Réponse GitHub trop volumineuse pour cette lecture bornée.",
  CONSENT_REFUSED: "Autorisation annulée. Aucune session GitHub n’a été ouverte.",
};
function safeError(error: unknown): string {
  const kind = typeof error === "object" && error !== null && "kind" in error && typeof error.kind === "string" ? error.kind : "";
  return messages[kind] ?? "Lecture GitHub refusée ou indisponible. Aucun autre dépôt n’a été consulté.";
}
function date(ms: number): string { return new Date(ms).toLocaleString("fr-FR"); }

export function GithubConnector({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [input, setInput] = useState("");
  const [view, setView] = useState<GithubView | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void invoke<GithubView>("github_status").then(value => {
      if (active) setView(value);
    }).catch(() => {
      if (active) setError("Connecteur GitHub indisponible.");
    });
    return () => { active = false; };
  }, []);
  const refresh = async () => { setView(await invoke<GithubView>("github_status")); await onRefresh(); };
  const action = async (kind: "select" | "preview" | "public" | "private" | "disconnect" | "overview" | "branches" | "commits" | "issues" | "pulls" | "pull_files") => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (kind === "select") { setView(await invoke<GithubView>("github_select", { repository: input.trim() })); setPreview(null); setResult(null); }
      else if (kind === "preview") setPreview(await invoke<Preview>("github_preview"));
      else if (kind === "public" || kind === "private") { setView(await invoke<GithubView>("github_authorize", { private: kind === "private" })); setResult(null); }
      else if (kind === "disconnect") { await invoke("github_disconnect"); setPreview(null); setResult(null); }
      else setResult(await invoke<Result>("github_read", { operation: kind, number: kind === "pull_files" ? Number(number) : null, branch: null }));
      await refresh();
    } catch (cause) { setError(safeError(cause)); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  };
  const connected = view?.status === "AUTHORIZED";
  return <section aria-label="GitHub" className="github-connector">
    <div className="panel-heading"><h3>GitHub</h3><span>{connected ? "Lecture autorisée" : view?.status === "SELECTED" ? "Dépôt sélectionné" : view?.status === "REVOKED" ? "Révoqué" : "Non connecté"}</span></div>
    <p>Un seul dépôt choisi · API GitHub officielle · lecture seule pendant dix minutes. Aucun accès à votre compte entier.</p>
    <div className="editor-actions"><label htmlFor="github-repository">Dépôt</label><input id="github-repository" placeholder="propriétaire/dépôt" spellCheck={false} autoComplete="off" value={input} maxLength={140} onChange={event => setInput(event.target.value)} /><button type="button" disabled={busy || !input.trim()} onClick={() => void action("select")}>Sélectionner</button></div>
    {view?.repository && <p className="read-stamp">Portée actuelle : <strong>{view.repository}</strong>{view.repository_id ? ` · ID ${view.repository_id}` : ""}{view.visibility ? ` · ${view.visibility === "private" ? "privé" : "public"}` : ""}{connected ? ` · expire dans ${Math.ceil((view.expires_in_seconds ?? 0) / 60)} min` : ""}.</p>}
    {view?.repository && !connected && <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void action("preview")}>Vérifier le dépôt public</button><button type="button" disabled={busy} onClick={() => void action("public")}>Autoriser la lecture publique…</button><button type="button" disabled={busy} onClick={() => void action("private")}>Jeton privé dans un dialogue natif…</button></div>}
    {preview && <p role="status">Identité vérifiée : {preview.repository} · ID {preview.repository_id} · branche {preview.default_branch} · lu le {date(preview.read_at_ms)}. La vérification n’autorise aucune lecture de session.</p>}
    {connected && <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void action("overview")}>Vue générale</button><button type="button" disabled={busy} onClick={() => void action("branches")}>Branches</button><button type="button" disabled={busy} onClick={() => void action("commits")}>Commits</button><button type="button" disabled={busy} onClick={() => void action("issues")}>Issues</button><button type="button" disabled={busy} onClick={() => void action("pulls")}>Pull requests</button><button type="button" disabled={busy} onClick={() => void action("disconnect")}>Déconnecter</button></div>}
    {connected && <div className="editor-actions"><label htmlFor="github-pr-number">Fichiers d’une PR</label><input id="github-pr-number" inputMode="numeric" value={number} onChange={event => setNumber(event.target.value)} placeholder="N°" /><button type="button" disabled={busy || !/^[1-9][0-9]{0,6}$/.test(number)} onClick={() => void action("pull_files")}>Voir les fichiers</button></div>}
    {error && <p role="alert" className="notice warn">{error}</p>}
    {result && <div className="github-result"><p className="read-stamp">Source : API GitHub · {result.repository} · lecture {date(result.read_at_ms)}.</p>
      {result.kind === "overview" ? <><h4>{result.repository}</h4><p>{result.description ?? "Aucune description."}</p><p>Branche par défaut : {result.default_branch} · HEAD {result.head_sha.slice(0, 12)} · mise à jour {result.updated_at}.</p></> :
        result.items.length === 0 ? <p>Aucun résultat dans cette page bornée.</p> : <ul className="github-list">{result.kind === "branches" ? result.items.map(item => <li key={item.name}><strong>{item.name}</strong><span>{item.sha.slice(0, 12)}{item.protected ? " · protégée" : ""}</span></li>) : result.kind === "commits" ? result.items.map(item => <li key={item.sha}><strong>{item.title}</strong><span>{item.sha.slice(0, 12)} · {item.author ?? "auteur indisponible"} · {item.date}</span></li>) : result.kind === "issues" ? result.items.map(item => <li key={item.number}><strong>#{item.number} · {item.title}</strong><span>{item.state} · {item.labels.join(", ")}</span><p>{item.excerpt}</p></li>) : result.kind === "pulls" ? result.items.map(item => <li key={item.number}><strong>#{item.number} · {item.title}</strong><span>{item.state}{item.draft ? " · brouillon" : ""} · {item.base} ← {item.head} · {item.author ?? "auteur indisponible"}</span></li>) : result.items.map(item => <li key={item.path}><strong>{item.path}</strong><span>{item.status} · +{item.additions} / −{item.deletions}</span></li>)}</ul>}
    </div>}
  </section>;
}

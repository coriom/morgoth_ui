import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { VsCodeConnector } from "./VsCodeConnector";
import { GithubConnector } from "./GithubConnector";

export interface ConnectorView { id: string; name: string; kind: string; target: string;
  operation: string; scope: string; risk: string; permission: string;
  status: "DISCONNECTED" | "AVAILABLE" | "DISCOVERED" | "AUTHORIZED" | "REVOKED" | "UNAVAILABLE";
  expires_in_seconds: number | null; last_verified_ms: number | null }
export interface ConnectorResult { connector_id: string; operation: string; status: string; fixture_items: number }
export interface WindowsTarget { app: string; process_id: string; session_id: string; operation: string }
export interface WindowsInspection { state: "ACTIVE" | "INACTIVE"; controls: Array<{ automation_id: string; control_type: string; name: string; enabled: boolean; invoke: boolean }> }
export interface WindowsActionReceipt { action: "toggle_test_state"; before: "ACTIVE" | "INACTIVE"; after: "ACTIVE" | "INACTIVE"; verified: boolean }
export interface BrowserPage { url: string; origin: string; title: string; text: string; state: string | null; headings: string[]; elements: Array<{ ref: string; kind: string; name: string }> }
export interface BrowserSession { status: string; origin: string | null; url: string | null; expires_in_seconds: number | null }
export interface ConnectorTransport { catalog(): Promise<ConnectorView[]>; connect(consent: string): Promise<void>;
  test(): Promise<ConnectorResult>; disconnect(): Promise<void>;
  windowsDetect(): Promise<WindowsTarget>; windowsAuthorize(): Promise<void>; windowsInspect(): Promise<WindowsInspection>;
  windowsInvoke(): Promise<WindowsActionReceipt>; windowsDisconnect(): Promise<void>;
  browserStart?(): Promise<BrowserSession>; browserStatus?(): Promise<BrowserSession>; browserNavigate?(path: string): Promise<unknown>;
  browserInspect?(): Promise<BrowserPage>; browserFill?(elementRef: string): Promise<BrowserPage>;
  browserClick?(elementRef: string): Promise<BrowserPage>; browserDisconnect?(): Promise<void> }
export const nativeConnectors: ConnectorTransport = {
  catalog: () => invoke("connector_catalog"), connect: consent => invoke("connector_connect", { consent }),
  test: () => invoke("connector_test"), disconnect: () => invoke("connector_disconnect"),
  windowsDetect: () => invoke("windows_detect"), windowsAuthorize: () => invoke("windows_authorize"),
  windowsInspect: () => invoke("windows_inspect"), windowsInvoke: () => invoke("windows_invoke"),
  windowsDisconnect: () => invoke("windows_disconnect"),
  browserStart: () => invoke("browser_start"), browserStatus: () => invoke("browser_status"),
  browserNavigate: path => invoke("browser_navigate", { path }), browserInspect: () => invoke("browser_inspect"),
  browserFill: elementRef => invoke("browser_fill", { elementRef }), browserClick: elementRef => invoke("browser_click", { elementRef }),
  browserDisconnect: () => invoke("browser_disconnect"),
};

const windowsFailureMessages: Record<string, string> = {
  WINDOWS_INTEROP_UNAVAILABLE: "Interop Windows indisponible dans cette session WSL.",
  WINDOWS_COMPANION_UNAVAILABLE: "Compagnon Windows absent pour cette version.",
  WINDOWS_ARTIFACT_UNTRUSTED: "Identité du compagnon Windows non vérifiée.",
  WINDOWS_TIMEOUT: "Le compagnon Windows n’a pas répondu dans le délai prévu.",
  WINDOWS_TRANSPORT_FAILED: "Transport vers le compagnon Windows interrompu.",
  WINDOWS_PROTOCOL_INVALID: "Réponse du compagnon Windows incompatible.",
  TARGET_UNAVAILABLE: "Fenêtre Windows de test introuvable.",
  TARGET_AMBIGUOUS: "Plusieurs fenêtres de test sont ouvertes ; fermez les doublons.",
  TARGET_IDENTITY_MISMATCH: "La fenêtre de test a changé ; relancez la détection.",
  CONSENT_REFUSED: "Inspection annulée ; aucune lecture Windows autorisée.",
  ACTION_CONSENT_REFUSED: "Action annulée ; aucun changement Windows effectué.",
};

function windowsFailure(error: unknown): string {
  const kind = typeof error === "object" && error !== null && "kind" in error && typeof error.kind === "string" ? error.kind : "";
  return windowsFailureMessages[kind] ?? "Connexion Windows refusée ou indisponible. Aucune autre fenêtre n’a été inspectée.";
}

/** Only fixed operations are rendered; MCP metadata never creates permissions. */
export function ConnectionsWorkspace({ transport = nativeConnectors }: { transport?: ConnectorTransport }) {
  const [catalog, setCatalog] = useState<ConnectorView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectorResult | null>(null);
  const [target, setTarget] = useState<WindowsTarget | null>(null);
  const [inspection, setInspection] = useState<WindowsInspection | null>(null);
  const [action, setAction] = useState<WindowsActionReceipt | null>(null);
  const [browserSession, setBrowserSession] = useState<BrowserSession | null>(null);
  const [browserPage, setBrowserPage] = useState<BrowserPage | null>(null);
  const refresh = async () => { try { setCatalog(await transport.catalog()); setError(null); }
    catch { setError("Catalogue local indisponible. Aucun connecteur n’est présumé accessible."); } };
  useEffect(() => { void refresh(); /* No background discovery. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);
  const act = async (kind: "connect" | "test" | "disconnect") => {
    if (busy) return;
    setBusy(true); setError(null); setResult(null);
    try {
      if (kind === "connect") await transport.connect("CONNECT LOCAL FIXTURE");
      else if (kind === "disconnect") await transport.disconnect();
      else setResult(await transport.test());
      await refresh();
    } catch { setError("Opération refusée ou connecteur indisponible. Aucune action supplémentaire n’a été lancée."); }
    finally { setBusy(false); }
  };
  const item = catalog?.find(value => value.id === "local-mcp-fixture");
  const windows = catalog?.find(value => value.id === "windows-uia");
  const browser = catalog?.find(value => value.id === "browser-test");
  const actBrowser = async (kind: "start" | "inspect" | "second" | "first" | "fill" | "click" | "disconnect", ref?: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (kind === "start") { setBrowserSession(await transport.browserStart!()); setBrowserPage(await transport.browserInspect!()); }
      else if (kind === "disconnect") { await transport.browserDisconnect!(); setBrowserSession(null); setBrowserPage(null); }
      else if (kind === "second" || kind === "first") { await transport.browserNavigate!(kind === "second" ? "/second" : "/"); setBrowserPage(await transport.browserInspect!()); }
      else if (kind === "fill") setBrowserPage(await transport.browserFill!(ref!));
      else if (kind === "click") setBrowserPage(await transport.browserClick!(ref!));
      else setBrowserPage(await transport.browserInspect!());
      await refresh();
    } catch { setError("Navigateur local indisponible ou opération refusée. Aucun autre site n’a été autorisé."); }
    finally { setBusy(false); }
  };
  const actWindows = async (kind: "detect" | "authorize" | "inspect" | "invoke" | "disconnect") => {
    if (busy) return;
    setBusy(true); setError(null); setAction(null);
    try {
      if (kind === "detect") { setTarget(await transport.windowsDetect()); setInspection(null); }
      else if (kind === "authorize") { await transport.windowsAuthorize(); setInspection(await transport.windowsInspect()); }
      else if (kind === "inspect") setInspection(await transport.windowsInspect());
      else if (kind === "invoke") { const receipt = await transport.windowsInvoke(); setAction(receipt); setInspection(await transport.windowsInspect()); }
      else { await transport.windowsDisconnect(); setTarget(null); setInspection(null); }
      await refresh();
    } catch (cause) { setError(windowsFailure(cause)); }
    finally { setBusy(false); }
  };
  return <div className="settings-index connector-workspace">
    <p>Les connexions sont locales, explicites et séparées de l’exécution autonome. Découvrir une application ne l’autorise pas.</p>
    {catalog === null && !error && <p className="skeleton">Lecture du catalogue local…</p>}
    {error && <p role="alert" className="notice warn">{error}</p>}
    {item && <section aria-label={item.name}><div className="panel-heading"><h3>{item.name}</h3><span>{item.status === "AUTHORIZED" ? "Autorisé pour cette session" : item.status === "REVOKED" ? "Révoqué" : "Non connecté"}</span></div>
      <p>Transport MCP privé · {item.target}. Une seule opération : <strong>lecture d’un état synthétique fixe</strong>.</p>
      <p className="read-stamp">Portée : {item.scope}. Durée maximale : 10 minutes. Aucun accès Windows, navigateur ou compte personnel.</p>
      {item.last_verified_ms !== null && <p className="read-stamp">Dernier test local réussi : {new Date(item.last_verified_ms).toLocaleString("fr-FR")}</p>}
      <div className="editor-actions">{item.status === "AUTHORIZED" ? <><button type="button" disabled={busy} onClick={() => void act("test")}>Tester la lecture</button><button type="button" disabled={busy} onClick={() => void act("disconnect")}>Déconnecter</button></>
        : <button type="button" disabled={busy} onClick={() => void act("connect")}>Autoriser ce test local</button>}</div>
      {result && <p role="status">Test réussi : {result.fixture_items} éléments synthétiques. Aucune donnée personnelle lue.</p>}
    </section>}
    <section aria-label="Application Windows de test"><div className="panel-heading"><h3>Application Windows de test</h3><span>{windows?.status === "AUTHORIZED" ? "Inspection autorisée" : windows?.status === "DISCOVERED" ? "Détectée · autorisation requise" : windows?.status === "AVAILABLE" ? "Compagnon installé" : windows?.status === "REVOKED" ? "Révoquée" : "Indisponible"}</span></div>
      <p>Une seule fenêtre WinForms D13 dédiée. Inspection de deux contrôles et bascule réversible de son état ; aucune autre application Windows n’est accessible.</p>
      {windows && windows.status !== "UNAVAILABLE" && <>
        {target && <p className="read-stamp">Cible : {target.app} · processus {target.process_id} · session {target.session_id}.</p>}
        {windows.last_verified_ms !== null && <p className="read-stamp">Dernière opération vérifiée : {new Date(windows.last_verified_ms).toLocaleString("fr-FR")}</p>}
        <div className="editor-actions">
          {windows.status !== "AUTHORIZED" && <button type="button" disabled={busy} onClick={() => void actWindows("detect")}>Détecter la fenêtre test</button>}
          {windows.status === "DISCOVERED" && <button type="button" disabled={busy} onClick={() => void actWindows("authorize")}>Autoriser l’inspection</button>}
          {windows.status === "AUTHORIZED" && <><button type="button" disabled={busy} onClick={() => void actWindows("inspect")}>Relire les contrôles</button><button type="button" disabled={busy} onClick={() => void actWindows("invoke")}>Basculer l’état test…</button></>}
          {(windows.status === "AUTHORIZED" || windows.status === "DISCOVERED") && <button type="button" disabled={busy} onClick={() => void actWindows("disconnect")}>Déconnecter Windows</button>}
        </div>
        {inspection && <p role="status">Contrôles UI Automation : {inspection.controls.map(control => control.name).join(" · ")}. État {inspection.state === "ACTIVE" ? "actif" : "inactif"}.</p>}
        {action && <p role="status">Action vérifiée : {action.before} → {action.after}. La cible a été relue.</p>}
      </>}
      {windows?.status === "UNAVAILABLE" && <p className="read-stamp">Construisez et scellez le compagnon Windows pour cette version ; le Desktop reste utilisable sans lui.</p>}
    </section>
    <section aria-label="Navigateur isolé"><div className="panel-heading"><h3>Navigateur isolé</h3><span>{browser?.status === "AUTHORIZED" ? "Session autorisée" : browser?.status === "AVAILABLE" ? "Disponible" : browser?.status === "REVOKED" ? "Révoqué" : "Indisponible"}</span></div>
      <p>Chromium jetable · un atelier local de test. Aucun profil personnel, compte ou site public n’est accessible.</p>
      {browserSession?.origin && <p className="read-stamp">Origine autorisée : {browserSession.origin} · session de dix minutes.</p>}
      {browser?.status === "AVAILABLE" || browser?.status === "REVOKED" ? <button type="button" disabled={busy || !transport.browserStart} onClick={() => void actBrowser("start")}>Ouvrir une session de test…</button> : null}
      {browser?.status === "AUTHORIZED" && <div className="editor-actions"><button type="button" disabled={busy} onClick={() => void actBrowser("inspect")}>Relire la page</button><button type="button" disabled={busy} onClick={() => void actBrowser("second")}>Page suivante</button><button type="button" disabled={busy} onClick={() => void actBrowser("first")}>Première page</button><button type="button" disabled={busy} onClick={() => void actBrowser("disconnect")}>Déconnecter le navigateur</button></div>}
      {browserPage && <div className="connector-browser-result"><h4>{browserPage.title}</h4><p className="read-stamp">{browserPage.url}</p><p>{browserPage.text}</p><ul>{browserPage.elements.map(element => <li key={element.ref}>{element.kind} · {element.name} {browser?.status === "AUTHORIZED" && element.kind === "textbox" && <button type="button" disabled={busy} onClick={() => void actBrowser("fill", element.ref)}>Saisir le code test…</button>}{browser?.status === "AUTHORIZED" && element.kind === "button" && <button type="button" disabled={busy} onClick={() => void actBrowser("click", element.ref)}>Activer ce bouton…</button>}</li>)}</ul></div>}
      {browser?.status === "UNAVAILABLE" && <p className="read-stamp">Playwright et Chromium doivent être disponibles localement ; Morgoth reste utilisable sans navigateur.</p>}
    </section>
    <VsCodeConnector onRefresh={refresh} />
    <GithubConnector onRefresh={refresh} />
    <section><h3>Autres applications</h3><p>Les comptes API et les profils personnels du navigateur ne sont pas connectés. La découverte d’une catégorie ne donne aucun droit d’action.</p></section>
  </div>;
}

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ConnectorView { id: string; name: string; kind: string; target: string;
  operation: string; scope: string; risk: string; permission: string;
  status: "DISCONNECTED" | "AUTHORIZED" | "REVOKED" | "UNAVAILABLE";
  expires_in_seconds: number | null; last_verified_ms: number | null }
export interface ConnectorResult { connector_id: string; operation: string; status: string; fixture_items: number }
export interface ConnectorTransport { catalog(): Promise<ConnectorView[]>; connect(consent: string): Promise<void>;
  test(): Promise<ConnectorResult>; disconnect(): Promise<void> }
export const nativeConnectors: ConnectorTransport = {
  catalog: () => invoke("connector_catalog"), connect: consent => invoke("connector_connect", { consent }),
  test: () => invoke("connector_test"), disconnect: () => invoke("connector_disconnect"),
};

/** Only fixed operations are rendered; MCP metadata never creates permissions. */
export function ConnectionsWorkspace({ transport = nativeConnectors }: { transport?: ConnectorTransport }) {
  const [catalog, setCatalog] = useState<ConnectorView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectorResult | null>(null);
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
    <section><h3>Autres applications</h3>{catalog?.filter(value => value.id !== "local-mcp-fixture").map(value =>
      <p key={value.id}><strong>{value.name}</strong> · Indisponible — {value.scope}</p>)}
      <p>Windows UI Automation exige un compagnon Windows distinct et explicitement démarré. Aucun accès aux fenêtres Windows n’est actif. Le navigateur et les comptes API ne sont pas connectés dans cette version.</p></section>
  </div>;
}

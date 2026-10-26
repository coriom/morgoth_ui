import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { readDomainList, readProjectCreation } from "./readModels";
import { managementError, type ManagementTransport, type ProjectCreation } from "./transport";

const validId = (value: string) => /^[a-z][a-z0-9_]{0,62}$/.test(value) && value !== "default";

/** Explicit configuration creation; an uncertain POST is never retried here. */
export function ProjectCreationForm({ transport, connected, onCreated }: {
  transport: ManagementTransport; connected: boolean;
  onCreated: (result: ProjectCreation) => Promise<boolean>;
}) {
  const domains = useQuery({ queryKey: ["d7", "installed-domains"],
    queryFn: async () => readDomainList(await transport.domains()), enabled: connected });
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const eligible = domains.data?.domains.filter(item => item.configuration_valid) ?? [];
  const chosen = domain || eligible[0]?.id || "";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || uncertain || !connected || !validId(id) || !name.trim() || name.length > 128
      || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      || !eligible.some(item => item.id === chosen)) return;
    if (!window.confirm(`Créer le Project « ${name.trim()} » (${id}) dans le domaine ${chosen} ? Aucune mission ni moteur ne sera démarré.`)) return;
    setBusy(true); setResult("");
    try {
      const input = { id, name: name.trim(), domain: chosen };
      const created = readProjectCreation(await transport.createProject(input), input);
      setUncertain(true); // A second POST cannot follow this response in the same form.
      const verified = await onCreated(created);
      setResult(verified
        ? "Project créé et confirmé dans le catalogue. Sélectionnez-le dans la liste ou le sélecteur global. Configuration durable ; aucun moteur ni stockage agent démarré."
        : "Création confirmée, mais la relecture du catalogue est indisponible. Actualisez le catalogue avant toute sélection.");
    } catch (error) {
      const detail = managementError(error);
      if (detail.kind === "API" && detail.code === "ALREADY_EXISTS") {
        setResult("Cet identifiant existe déjà. Consultez le catalogue avant un nouveau choix.");
      } else if (detail.kind === "INVALID_REQUEST" || detail.kind === "INVALID_PROJECT_ID" || detail.code === "INVALID_REQUEST") {
        setResult("Identifiant ou nom invalide. Vérifiez les champs saisis.");
      } else if (detail.kind === "UNKNOWN_DOMAIN" || detail.code === "UNKNOWN_DOMAIN") {
        setResult("Ce domaine installé n’est plus disponible. Actualisez la page.");
      } else {
        setUncertain(true);
        setResult("Résultat de création incertain. Consultez le catalogue ; aucun nouvel envoi n’est autorisé depuis ce formulaire.");
      }
    } finally { setBusy(false); }
  };
  return <section className="project-create" aria-label="Créer un Project personnel">
    <h2>Créer un Project</h2>
    <p>Un Project organise vos briefs, notes et coffre. Sa création ne démarre aucune recherche ni agent.</p>
    {!connected && <p role="status">Management indisponible. La création exige le service local authentifié.</p>}
    {connected && domains.isPending && <p className="skeleton">Lecture des domaines installés…</p>}
    {connected && domains.isError && <p role="alert">Catalogue des domaines indisponible ou invalide.</p>}
    {connected && domains.isSuccess && eligible.length === 0 && <p role="status">Aucun domaine installé valide pour un nouveau Project.</p>}
    <form onSubmit={event => void submit(event)}>
      <label htmlFor="new-project-id">Identifiant</label>
      <input id="new-project-id" value={id} onChange={event => setId(event.target.value)} maxLength={63}
        pattern="[a-z][a-z0-9_]*" autoComplete="off" required disabled={!connected || busy || uncertain}
        aria-describedby="project-id-help" />
      <small id="project-id-help">Lettres minuscules, chiffres et soulignement ; commence par une lettre.</small>
      <label htmlFor="new-project-name">Nom affiché</label>
      <input id="new-project-name" value={name} onChange={event => setName(event.target.value)} maxLength={128} required
        disabled={!connected || busy || uncertain} />
      <label htmlFor="new-project-domain">Domaine installé</label>
      <select id="new-project-domain" value={chosen} onChange={event => setDomain(event.target.value)}
        disabled={!connected || busy || uncertain || eligible.length === 0}>
        {eligible.length === 0 && <option value="">Aucun domaine</option>}
        {eligible.map(item => <option value={item.id} key={item.id}>{item.id}{item.tagline ? ` · ${item.tagline}` : ""}</option>)}
      </select>
      <button type="submit" disabled={!connected || busy || uncertain || !validId(id) || !name.trim() || eligible.length === 0}>
        {busy ? "Création en cours…" : "Créer le Project"}
      </button>
    </form>
    {result && <p role={uncertain && result.startsWith("Résultat") ? "alert" : "status"}>{result}</p>}
  </section>;
}

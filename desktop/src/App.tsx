import { useState, type FormEvent } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { managementError, nativeManagement, type CreateInput, type ManagementTransport, type Project } from "./transport";

const connection = "native-management-v1";

function ProjectDetails({ project }: { project: Project }) {
  return <dl className="details">
    <div><dt>Identifiant</dt><dd>{project.id}</dd></div>
    <div><dt>Domaine</dt><dd>{project.domain}</dd></div>
    <div><dt>Schéma PostgreSQL</dt><dd>{project.postgres_schema}</dd></div>
    <div><dt>Préfixe Chroma</dt><dd>{project.chroma_prefix || "—"}</dd></div>
    <div><dt>Espace de travail</dt><dd>{project.workspace_root || "Projet historique"}</dd></div>
    <div><dt>Coffre</dt><dd>{project.vault_dir}</dd></div>
    <div><dt>État local</dt><dd>{project.runtime_dir}</dd></div>
  </dl>;
}

/** Selecting a Project changes only this view; no engine is started or rebound. */
export function ProjectsScreen({ transport }: { transport: ManagementTransport }) {
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [domain, setDomain] = useState("");
  const [notice, setNotice] = useState("");
  const runtime = useQuery({ queryKey: [connection, "runtime"], queryFn: transport.runtimeStatus,
    refetchInterval: (query) => query.state.data?.state === "READY" ? 2000 : query.state.data?.state === "STARTING" ? 500 : false });
  const ready = runtime.data?.state === "READY";
  const status = useQuery({ queryKey: [connection, "status"], queryFn: transport.status, enabled: ready });
  const connected = ready && status.isSuccess && status.data.management_available;
  const starting = runtime.isPending || runtime.data?.state === "STARTING" || (ready && status.isPending);
  const domains = useQuery({ queryKey: [connection, "domains"], queryFn: transport.domains, enabled: connected });
  const projects = useQuery({ queryKey: [connection, "projects"], queryFn: transport.projects, enabled: connected });
  const selected = useQuery({ queryKey: [connection, "project", selectedId],
    queryFn: () => transport.project(selectedId!), enabled: connected && selectedId !== null });
  const validation = useQuery({ queryKey: [connection, "validation", selectedId],
    queryFn: () => transport.validation(selectedId!), enabled: false, retry: false });
  const create = useMutation({
    mutationFn: (input: CreateInput) => transport.create(input),
    onSuccess: async (result) => {
      await cache.invalidateQueries({ queryKey: [connection, "projects"] });
      setSelectedId(result.project.id);
      setNotice(result.durability_confirmed
        ? "Projet créé. Ni le stockage ni la recherche n’ont été démarrés."
        : "Projet créé ; confirmation de durabilité indisponible. Rafraîchissez le catalogue avant toute autre action.");
      setName(""); setId(""); setDomain("");
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    setNotice("");
    create.mutate({ id: id.trim(), name: name.trim(), domain });
  }
  const createError = create.isError ? managementError(create.error) : null;
  const uncertain = createError?.kind === "UNCERTAIN_CREATE";
  const conflict = createError?.code === "ALREADY_EXISTS";
  const availableDomains = domains.data?.domains.filter((item) => item.configuration_valid) ?? [];

  return <main className="shell">
    <header className="masthead"><span className="eyebrow">MORGOTH / LOCAL</span><h1>Projets</h1>
      <p>Configurez des espaces de recherche isolés. Aucune recherche n’est lancée ici.</p></header>
    <section className="connection panel" aria-label="Connexion de gestion">
      <div><h2>Service de gestion</h2><p>{starting ? "Démarrage de la gestion…" : connected ? "Gestion connectée" : "Gestion locale indisponible"}</p></div>
      <span className={connected ? "pill good" : "pill"}>{starting ? "Démarrage" : connected ? "Connectée" : "Non connectée"}</span>
      {!connected && !starting && <button type="button" onClick={() => { runtime.refetch(); if (ready) status.refetch(); }}>Vérifier</button>}
    </section>
    {connected && <div className="grid">
      <section className="panel" aria-label="Liste des projets">
        <div className="section-head"><h2>Catalogue</h2><button type="button" onClick={() => projects.refetch()}>Actualiser</button></div>
        {projects.isPending && <p className="skeleton">Chargement des projets…</p>}
        {projects.isError && <p role="alert">Catalogue indisponible. Réessayez.</p>}
        {projects.data?.projects.length === 0 && <p>Aucun projet configuré.</p>}
        <ul className="project-list">{projects.data?.projects.map((item) => <li key={item.id}>
          <button type="button" className={selectedId === item.id ? "selected" : ""}
            onClick={() => { setSelectedId(item.id); setNotice(""); }}>
            <strong>{item.name}</strong><span>{item.id} · {item.domain}{item.legacy ? " · historique" : ""}</span>
          </button></li>)}</ul>
      </section>
      <section className="panel" aria-label="Configuration du projet">
        <h2>Configuration</h2>
        {!selectedId && <p>Sélectionnez un projet pour consulter sa configuration.</p>}
        {selectedId && selected.isPending && <p className="skeleton">Chargement de la configuration…</p>}
        {selected.isError && <p role="alert">Configuration indisponible. Réessayez.</p>}
        {selected.data && <><h3>{selected.data.name}</h3><ProjectDetails project={selected.data} />
          <p className="state">Configuration : {selected.data.configuration_valid ? "valide" : "invalide"} · Recherche : non vérifiée</p>
          <button type="button" disabled={validation.isFetching} onClick={() => validation.refetch()}>Valider la configuration</button>
          {validation.isFetching && <p>Validation en cours…</p>}
          {validation.isError && <p role="alert">Validation impossible.</p>}
          {validation.data && !validation.isFetching && <p role="status">{validation.data.configuration_valid ? "Configuration valide" : "Configuration invalide"} ; exécution non vérifiée.</p>}
        </>}
      </section>
      <section className="panel create-panel" aria-label="Nouveau projet">
        <h2>Nouveau projet</h2>
        <form onSubmit={submit} noValidate>
          <label htmlFor="project-name">Nom affiché</label>
          <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={128} />
          <label htmlFor="project-id">Identifiant machine</label>
          <input id="project-id" value={id} onChange={(event) => setId(event.target.value)} required aria-describedby="id-help" />
          <small id="id-help">Lettres minuscules, chiffres et tirets bas. Identité permanente.</small>
          <label htmlFor="project-domain">Domaine installé</label>
          <select id="project-domain" value={domain} onChange={(event) => setDomain(event.target.value)} required disabled={domains.isPending}>
            <option value="">Choisir un domaine</option>
            {availableDomains.map((item) => <option key={item.id} value={item.id}>{item.id}{item.tagline ? ` — ${item.tagline}` : ""}</option>)}
          </select>
          {domains.isError && <p role="alert">Domaines indisponibles.</p>}
          {domains.data?.domains.filter((item) => !item.configuration_valid).map((item) =>
            <p key={item.id} className="muted">{item.id} indisponible : {item.diagnostic || "configuration invalide"}</p>)}
          {conflict && <p role="alert">Cet identifiant existe déjà. Aucun projet n’a été écrasé.</p>}
          {createError && !conflict && <p role="alert">{uncertain
            ? "Résultat de création incertain. Actualisez le catalogue avant toute nouvelle tentative."
            : createError.code === "INVALID_REQUEST" ? "Vérifiez le nom et l’identifiant."
            : createError.code === "UNKNOWN_DOMAIN" ? "Ce domaine n’est plus disponible."
            : "Création impossible. Vérifiez le catalogue avant toute nouvelle tentative."}</p>}
          {uncertain && <button type="button" onClick={() => projects.refetch()}>Vérifier le catalogue</button>}
          <button className="primary" type="submit" disabled={create.isPending || !domain || !name.trim() || !id.trim() || !connected}>
            {create.isPending ? "Création en cours…" : "Créer le projet"}</button>
        </form>
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>
    </div>}
    <footer>Gestion des configurations uniquement · État du moteur de recherche non vérifié</footer>
  </main>;
}

export function App({ transport = nativeManagement }: { transport?: ManagementTransport }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000 } } }));
  return <QueryClientProvider client={queryClient}><ProjectsScreen transport={transport} /></QueryClientProvider>;
}

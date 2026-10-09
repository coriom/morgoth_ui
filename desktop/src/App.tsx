import { useState, type FormEvent } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { managementError, nativeManagement, nativeResearch, type CreateInput, type ManagementTransport,
  type Project, type ResearchEngineStatus, type ResearchTransport } from "./transport";

const connection = "native-management-v1";
const researchConnection = "native-research-v1";

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
function ResearchPane({ project, transport }: { project: Project; transport: ResearchTransport }) {
  const cache = useQueryClient();
  const status = useQuery({ queryKey: [researchConnection, "status"], queryFn: transport.status,
    refetchInterval: (query) => query.state.data?.state === "STARTING" ? 500 : 2000 });
  const engine = status.data;
  const ownsEngine = engine?.project_id === project.id;
  const activeElsewhere = !!engine?.project_id && !ownsEngine && engine.state !== "STOPPED";
  const initialized = ownsEngine && ["PAUSED", "NOT_READY", "RUNNING"].includes(engine?.state ?? "");
  const profiles = useQuery({ queryKey: [researchConnection, "profiles", engine?.project_id],
    queryFn: transport.profiles, enabled: initialized });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: [researchConnection, "status"] });
    await cache.invalidateQueries({ queryKey: [researchConnection, "profiles"] });
  };
  const initialize = useMutation({ mutationFn: () => transport.initialize(project.id), onSuccess: refresh });
  const select = useMutation({ mutationFn: (id: string) => transport.selectProfile(id), onSuccess: refresh });
  const start = useMutation({ mutationFn: transport.start, onSuccess: refresh });
  const stop = useMutation({ mutationFn: transport.stop, onSuccess: refresh });
  const busy = initialize.isPending || select.isPending || start.isPending || stop.isPending;
  const labels: Record<ResearchEngineStatus["state"], string> = {
    STOPPED: "Moteur non initialisé", STARTING: "Initialisation…",
    PAUSED: "Moteur prêt · recherche en pause", NOT_READY: "Dépendances incomplètes",
    RUNNING: "Recherche autonome active", FAILED: "Moteur en erreur", STOPPING: "Arrêt en cours…",
  };
  const current = profiles.data?.profiles.find((item) => item.id === profiles.data.current);
  const canStart = ownsEngine && engine?.state === "PAUSED" && engine.runtime?.awakening_ready === true
    && engine.runtime?.profile === "codex" && engine.runtime?.profile_status === "READY"
    && current?.id === "codex" && current?.status === "READY";

  return <section aria-label="Moteur de recherche">
    <h3>Moteur de recherche</h3>
    {project.legacy ? <p>La supervision Desktop n’est pas disponible pour le projet historique.</p> : <>
      {status.isPending && <p className="skeleton">Chargement de l’état du moteur…</p>}
      {status.isError && <p role="alert">État du moteur indisponible. La gestion des projets reste accessible.</p>}
      {engine && <>
        <p className="state">{ownsEngine || engine.state === "STOPPED" ? labels[engine.state]
          : `Le moteur du projet ${engine.project_id} reste actif · ${labels[engine.state]}`}</p>
        {activeElsewhere && <p>Choisissez {engine.project_id} pour l’arrêter avant d’initialiser ce projet.</p>}
        {ownsEngine && engine.state === "NOT_READY" && <p>Le processus est accessible, mais ses dépendances ne permettent pas de démarrer la recherche.</p>}
        {ownsEngine && engine.state === "FAILED" && <p role="alert">Échec du moteur. La gestion des projets reste disponible.</p>}
        {engine.state === "STOPPED" && <button type="button" disabled={busy || !project.configuration_valid}
          onClick={() => initialize.mutate()}>Initialiser le moteur</button>}
        {ownsEngine && engine.state !== "STOPPED" && engine.state !== "STOPPING" &&
          <button type="button" disabled={busy} onClick={() => stop.mutate()}>Arrêter le moteur</button>}
        {initialized && <>
          <h3>Profil LLM</h3>
          {profiles.isPending && <p className="skeleton">Chargement des profils…</p>}
          {profiles.isError && <p role="alert">Profils indisponibles.</p>}
          {profiles.data && <>
            <p>Profil actuel : {profiles.data.current} · recommandation : {profiles.data.recommended ?? "aucune"}</p>
            {profiles.data.profiles.find((item) => item.id === "codex")?.status === "BLOCKED" &&
              <p>Codex est bloqué tant que sa qualification de sécurité n’est pas terminée. La recherche ne peut pas démarrer.</p>}
            <ul>{profiles.data.profiles.map((item) => <li key={item.id}>
              <strong>{item.id}</strong> · {item.status}
              {item.id === profiles.data.current ? " · actif" : null}
              {item.id !== profiles.data.current && engine.state === "PAUSED" && <button type="button"
                disabled={busy || item.status !== "READY"} onClick={() => select.mutate(item.id)}>Sélectionner {item.id}</button>}
            </li>)}</ul>
          </>}
          {engine.state === "PAUSED" && !canStart && <p>La recherche attend un profil prêt et des dépendances disponibles.</p>}
          {canStart && <button type="button" className="primary" disabled={busy}
            onClick={() => start.mutate()}>Démarrer la recherche</button>}
        </>}
      </>}
      {(initialize.isError || select.isError || start.isError || stop.isError) &&
        <p role="alert">Opération refusée ou issue incertaine. Actualisez l’état du moteur avant de réessayer.</p>}
    </>}
  </section>;
}

export function ProjectsScreen({ transport, research }: { transport: ManagementTransport; research: ResearchTransport }) {
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
      <p>Configurez des espaces isolés et contrôlez explicitement un moteur de recherche.</p></header>
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
        {selected.data?.id === selectedId && <><h3>{selected.data.name}</h3><ProjectDetails project={selected.data} />
          <p className="state">Configuration : {selected.data.configuration_valid ? "valide" : "invalide"} · Recherche : non vérifiée</p>
          <button type="button" disabled={validation.isFetching} onClick={() => validation.refetch()}>Valider la configuration</button>
          {validation.isFetching && <p>Validation en cours…</p>}
          {validation.isError && <p role="alert">Validation impossible.</p>}
          {validation.data && !validation.isFetching && <p role="status">{validation.data.configuration_valid ? "Configuration valide" : "Configuration invalide"} ; exécution non vérifiée.</p>}
          <ResearchPane project={selected.data} transport={research} />
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
    <footer>Un seul moteur de recherche supervisé · Démarrage autonome explicite</footer>
  </main>;
}

export function App({ transport = nativeManagement, research = nativeResearch }:
  { transport?: ManagementTransport; research?: ResearchTransport }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000 } } }));
  return <QueryClientProvider client={queryClient}><ProjectsScreen transport={transport} research={research} /></QueryClientProvider>;
}

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { nativeManagement, nativeResearch, type ManagementTransport, type ResearchTransport } from "./transport";
import { readManagementStatus, readProject, readProjectList, readResearchProfiles, readResearchStatus, readRuntimeStatus } from "./readModels";

type View = "overview" | "missions" | "capabilities" | "models" | "security" | "projects";
const views: ReadonlyArray<{ id: View; label: string; code: string }> = [
  { id: "overview", label: "Vue d’ensemble", code: "01" },
  { id: "missions", label: "Missions", code: "02" },
  { id: "capabilities", label: "Capacités", code: "03" },
  { id: "models", label: "Modèles & runtime", code: "04" },
  { id: "security", label: "Sécurité", code: "05" },
  { id: "projects", label: "Projets", code: "06" },
];

function Fact({ label, value, source = "Observé", tone = "neutral" }: {
  label: string; value: string; source?: string; tone?: "neutral" | "good" | "warn";
}) {
  return <div className="fact"><dt>{label}<small>{source}</small></dt><dd className={tone}>{value}</dd></div>;
}

function EmptyEvidence({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-evidence"><span aria-hidden="true">—</span><h3>{title}</h3><p>{children}</p></div>;
}

/** D1 calls only fixed native read commands; it never mounts Project or research mutations. */
export function CommandCenter({ transport, research }: { transport: ManagementTransport; research: ResearchTransport }) {
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const runtime = useQuery({ queryKey: ["d1", "management-runtime"], queryFn: async () => readRuntimeStatus(await transport.runtimeStatus()) });
  const ready = runtime.isSuccess && runtime.data.state === "READY";
  const management = useQuery({ queryKey: ["d1", "management-status"], queryFn: async () => readManagementStatus(await transport.status()), enabled: ready });
  const connected = ready && management.isSuccess && management.data.management_available === true;
  const projects = useQuery({ queryKey: ["d1", "projects"], queryFn: async () => readProjectList(await transport.projects()), enabled: connected });
  const selectedInCatalog = connected && projects.isSuccess && projects.data.projects.some((item) => item.id === selectedId);
  const project = useQuery({ queryKey: ["d1", "project", selectedId], queryFn: async () => readProject(await transport.project(selectedId!)),
    enabled: connected && selectedId !== null && selectedInCatalog });
  const engine = useQuery({ queryKey: ["d1", "research-status"], queryFn: async () => readResearchStatus(await research.status()), enabled: connected });
  const profiles = useQuery({ queryKey: ["d1", "research-profiles", engine.data?.project_id],
    queryFn: async () => readResearchProfiles(await research.profiles()),
    enabled: connected && engine.isSuccess && engine.data.project_id != null && engine.data.state !== "STOPPED" && (view === "models" || view === "security") });
  const projectData = connected && projects.isSuccess ? projects.data : undefined;
  const engineData = connected && engine.isSuccess ? engine.data : undefined;
  const profileData = connected && engine.isSuccess && profiles.isSuccess ? profiles.data : undefined;
  const managerLoading = runtime.isPending || (ready && management.isPending);
  const managerError = runtime.isError || management.isError || (!managerLoading && !connected);
  const projectCount = connected && projectData ? String(projectData.projects.length) : "Indisponible";
  const refreshBusy = runtime.isFetching || management.isFetching || projects.isFetching || project.isFetching
    || engine.isFetching || profiles.isFetching;

  return <div className="command-layout">
    <aside className="sidebar" aria-label="Navigation principale">
      <div className="brand"><span className="brand-glyph" aria-hidden="true">M</span><div><strong>MORGOTH</strong><small>LOCAL COMMAND / D1</small></div></div>
      <div className="nav-caption">ESPACES</div>
      <nav aria-label="Espaces de supervision" className="nav-list">{views.map((item) =>
        <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined}
          className={view === item.id ? "nav-link active" : "nav-link"} onClick={() => setView(item.id)}>
          <span className="nav-code">{item.code}</span>{item.label}</button>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" aria-hidden="true" /><span>Supervision locale<br /><strong>Lecture seule</strong></span></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div><p className="eyebrow">MORGOTH / SUPERVISION</p><h1>{views.find((item) => item.id === view)?.label}</h1></div>
        <span className="read-only-tag">AUCUNE ACTION D’EXÉCUTION</span></header>
      <section className="connection-strip" aria-label="État de connexion">
        <span className={`connection-indicator ${connected ? "online" : ""}`} aria-hidden="true" />
        <div><strong>{managerLoading ? "Connexion en cours" : refreshBusy && connected ? "Vérification en cours" : connected ? "Gestion locale accessible" : "Gestion locale indisponible"}</strong>
          <span>{managerLoading ? "Lecture du superviseur natif" : connected ? "API de gestion authentifiée par le processus natif" : "Aucune activité déduite de l’interface"}</span></div>
        <button type="button" disabled={refreshBusy} onClick={() => { void runtime.refetch(); if (ready) void management.refetch();
          if (connected) { void projects.refetch(); void engine.refetch(); if (selectedInCatalog) void project.refetch();
            if (profiles.isSuccess) void profiles.refetch(); } }}>Actualiser</button>
      </section>
      {managerError && <p className="notice warn" role="alert">Les données du backend restent indisponibles. Aucune activité n’est présumée.</p>}

      {view === "overview" && <div className="content-stack">
        <p className="section-intro">État attesté par les contrats de lecture locaux. La connexion au service de gestion ne prouve pas que l’agent fonctionne.</p>
        <div className="metric-grid">
          <section className="metric"><span>GESTION LOCALE</span><strong>{managerLoading ? "Chargement…" : connected ? "Disponible" : "Indisponible"}</strong><small>Processus natif + statut de gestion</small></section>
          <section className="metric"><span>PROJETS CONFIGURÉS</span><strong>{projects.isPending && connected ? "Chargement…" : projectCount}</strong><small>Catalogue de configuration, pas missions actives</small></section>
          <section className="metric"><span>MOTEUR DE RECHERCHE</span><strong>{engine.isPending && connected ? "Chargement…" : engineData?.state ?? "Indisponible"}</strong><small>État du superviseur; autonomie non déduite</small></section>
          <section className="metric"><span>MISSIONS GÉNÉRALISTES</span><strong>Non exposées</strong><small>Pas de lecture Project-scopée dans ce contrat</small></section>
        </div>
        <div className="two-column">
          <section className="panel"><p className="eyebrow">01 / ÉTAT</p><h2>Ce qui est observable</h2><dl className="fact-list">
            <Fact label="Management" value={connected ? "Connecté" : "Non confirmé"} tone={connected ? "good" : "warn"} />
            <Fact label="Recherche" value={engineData?.state ?? "Indisponible"} source="Superviseur natif" />
            <Fact label="Project du moteur" value={engineData?.project_id ?? "Aucun confirmé"} source="Superviseur natif" />
            <Fact label="Modèle Ollama chargé" value="Non exposé" source="Indisponible" />
          </dl></section>
          <section className="panel"><p className="eyebrow">02 / GOUVERNANCE</p><h2>Limites en vigueur</h2><div className="boundary-list">
            <p><strong>Workloads Codex</strong><span>{profileData ? profileData.codex.workloads_ready ? "Prêts selon le profil observé" : "Bloqués selon le profil observé" : "Non vérifiables depuis cette vue"}</span></p>
            <p><strong>Human Gate 3</strong><span>Décision humaine; aucune commande d’approbation ici</span></p>
            <p><strong>Browser lab</strong><span>Qualification synthétique; aucune autorité de site réel</span></p>
          </div></section>
        </div>
        <section className="panel"><p className="eyebrow">03 / ÉVÉNEMENTS</p><h2>Historique récent</h2>
          <EmptyEvidence title="Flux non connecté">Aucun flux d’événements Project-scopé n’est publié au transport Desktop. Aucun événement fictif n’est affiché.</EmptyEvidence></section>
      </div>}

      {view === "missions" && <div className="content-stack"><p className="section-intro">Une mission requiert un objectif, un Project, des checkpoints et des preuves d’issue.</p>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">MISSION WORKSPACE</p><h2>Missions et décisions</h2></div><span className="tag">INDISPONIBLE</span></div>
          <EmptyEvidence title="Aucun registre de missions accessible">Le backend possède des checkpoints Project-scopés expérimentaux, mais le transport natif ne publie ni liste ni détail en lecture seule. « Indisponible » ne signifie pas zéro mission.</EmptyEvidence></section>
        <section className="panel"><h2>Contrat de lecture nécessaire</h2><p>Identité du Project, état, étapes confirmées, gaps de capacité, attente d’approbation, échec ou refus et preuve de résultat. Aucune action Démarrer, Reprendre ou Réessayer n’est fournie.</p></section></div>}

      {view === "capabilities" && <div className="content-stack"><p className="section-intro">Un contrat appris, une validation isolée et une permission d’exécution sont des faits distincts.</p>
        <div className="two-column"><section className="panel"><p className="eyebrow">INVENTAIRE</p><h2>Capacités Project-scopées</h2>
          <EmptyEvidence title="Inventaire non exposé">Le Desktop n’a pas de lecture authentifiée des versions, sources, validations, révocations ou portées des capacités.</EmptyEvidence></section>
          <section className="panel"><p className="eyebrow">PROCÉDURES</p><h2>Apprentissage expérimental</h2>
          <EmptyEvidence title="Procédures non exposées">Les expériences navigateur synthétiques ne confèrent aucune autorisation de site réel. Aucun enregistrement de démonstration n’est présenté comme capacité active.</EmptyEvidence></section></div></div>}

      {view === "models" && <div className="content-stack"><p className="section-intro">Le profil de recherche est observable lorsque son moteur est initialisé. La liste Ollama installée ou chargée n’est pas exposée.</p>
        <div className="two-column"><section className="panel"><p className="eyebrow">RUNTIME</p><h2>Recherche supervisée</h2><dl className="fact-list">
          <Fact label="État" value={engineData?.state ?? "Indisponible"} source="Superviseur natif" />
          <Fact label="Project associé" value={engineData?.project_id ?? "Aucun confirmé"} source="Superviseur natif" />
          <Fact label="Profil configuré" value={engineData?.runtime?.profile ?? "Indisponible"} source="Runtime si initialisé" />
          <Fact label="Profil prêt" value={engineData?.runtime?.profile_status ?? "Indisponible"} source="Runtime si initialisé" />
        </dl></section><section className="panel"><p className="eyebrow">MODÈLES LOCAUX</p><h2>Ollama</h2><dl className="fact-list">
          <Fact label="Connectivité Ollama" value="Non exposée" source="Indisponible" />
          <Fact label="Modèles installés" value="Non exposés" source="Indisponible" />
          <Fact label="Modèles chargés" value="Non exposés" source="Indisponible" />
          <Fact label="CPU / GPU / mémoire" value="Non mesurés" source="Indisponible" />
        </dl></section></div>
        <section className="panel"><p className="eyebrow">PROFILS</p><h2>Qualification disponible</h2>
          {profiles.isPending && profiles.fetchStatus === "fetching" && <p className="skeleton">Lecture des profils…</p>}
          {profiles.isError && <p role="alert">Profils indisponibles ou invalides.</p>}
          {profileData ? <><p>Profil courant : <strong>{profileData.current}</strong> · recommandation : {profileData.recommended ?? "aucune"}</p>
            <div className="table-wrap"><table><thead><tr><th>Profil</th><th>Statut</th><th>Qualification</th></tr></thead><tbody>{profileData.profiles.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.status}</td><td>{item.id === "codex" ? profileData.codex.workloads_ready ? "Workloads prêts selon le backend" : "Workloads bloqués" : "Voir statut du profil"}</td></tr>)}</tbody></table></div></>
            : !profiles.isError && <EmptyEvidence title="Profil non disponible">Cette vue ne peut ni initialiser un moteur ni lancer une inférence.</EmptyEvidence>}
        </section></div>}

      {view === "security" && <div className="content-stack"><p className="section-intro">Les indicateurs séparent les constats du superviseur, la politique revue dans le code et ce que Desktop ne peut pas vérifier.</p>
        <div className="two-column"><section className="panel"><p className="eyebrow">AUTORITÉ</p><h2>Actions et approbations</h2><dl className="fact-list">
          <Fact label="Commandes d’exécution dans D1" value="Aucune" source="Interface D1" tone="good" />
          <Fact label="Human Gate 3" value="Humain uniquement" source="Règle de gouvernance" />
          <Fact label="Approbations en attente" value="Non exposées" source="Indisponible" />
          <Fact label="Tentatives bloquées" value="Non exposées" source="Indisponible" />
          <Fact label="SAFE_FOR_WORKLOADS" value="Non exposé en temps réel" source="Indisponible; baseline revue = false" />
        </dl></section><section className="panel"><p className="eyebrow">CONFINEMENT</p><h2>Exécution séparée</h2><dl className="fact-list">
          <Fact label="Codex installé" value={profileData ? profileData.codex.installed ? "Oui" : "Non" : "Indisponible"} source="Profil si disponible" />
          <Fact label="Sandbox disponible" value={profileData ? profileData.codex.sandbox_available ? "Oui" : "Non" : "Indisponible"} source="Profil si disponible" />
          <Fact label="Sandbox qualifié" value={profileData ? profileData.codex.sandbox_qualified ? "Oui" : "Non" : "Indisponible"} source="Profil si disponible" />
          <Fact label="Workloads Codex" value={profileData ? profileData.codex.workloads_ready ? "Prêts selon le backend" : "Bloqués" : "Indisponibles"} source="Profil si disponible" tone={profileData?.codex.workloads_ready ? "good" : "warn"} />
          <Fact label="Sites Web réels" value="Non autorisés par ce Desktop" source="Portée D1" />
        </dl></section></div>
        <section className="panel"><h2>Contrat d’approbation</h2><p>Un enregistrement validé ou une procédure mémorisée n’est pas un grant. Les approbations Project-scopées ne sont pas lisibles ici; Desktop n’émet aucune autorisation.</p></section></div>}

      {view === "projects" && <div className="content-stack"><p className="section-intro">Catalogue de configuration. Ni stockage, ni recherche, ni mission ne sont démarrés par cette vue.</p>
        <div className="two-column projects-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">CATALOGUE</p><h2>Projects</h2></div><span className="tag">{projectCount}</span></div>
          {projects.isPending && connected && <p className="skeleton">Lecture du catalogue…</p>}
          {projects.isError && <p role="alert">Catalogue indisponible ou invalide.</p>}
          {!connected && <EmptyEvidence title="Catalogue indisponible">Le service de gestion n’est pas confirmé.</EmptyEvidence>}
          {projectData?.projects.length === 0 && <EmptyEvidence title="Aucun Project configuré">Le catalogue de configuration est vide.</EmptyEvidence>}
          <ul className="project-list">{projectData?.projects.map((item) => <li key={item.id}><button type="button" className={selectedId === item.id ? "selected" : ""}
            onClick={() => setSelectedId(item.id)} aria-current={selectedId === item.id ? "true" : undefined}><strong>{item.name}</strong><span>{item.id} · {item.domain}{item.legacy ? " · historique" : ""}</span></button></li>)}</ul>
        </section><section className="panel"><p className="eyebrow">PORTÉE SÉLECTIONNÉE</p><h2>Détail du Project</h2>
          {!selectedId && <EmptyEvidence title="Sélectionnez un Project">Le choix change seulement le périmètre affiché.</EmptyEvidence>}
          {selectedId && !selectedInCatalog && <p role="alert">Project absent du catalogue courant. Aucun détail n’est affiché.</p>}
          {selectedInCatalog && project.isPending && <p className="skeleton">Lecture du Project…</p>}
          {project.isError && <p role="alert">Détail indisponible ou invalide.</p>}
          {selectedInCatalog && project.data && project.data.id === selectedId && <><h3>{project.data.name}</h3><dl className="fact-list">
            <Fact label="Identifiant" value={project.data.id} />
            <Fact label="Domaine" value={project.data.domain} />
            <Fact label="Schéma PostgreSQL" value={project.data.postgres_schema} source="Configuration" />
            <Fact label="Configuration" value={project.data.configuration_valid ? "Valide" : "Invalide"} source="Catalogue, non revalidé" />
            <Fact label="Runtime vérifié" value={project.data.runtime_checked ? "Oui" : "Non"} source="Catalogue" />
            <Fact label="Moteur du Project" value={engineData?.project_id === selectedId ? engineData.state : "Aucun moteur attribué observé"} source="Superviseur natif" />
          </dl></>}
        </section></div></div>}
      <footer className="workspace-footer"><span>DESKTOP D1 · LECTURE SEULE</span><span>Un état absent reste inconnu.</span></footer>
    </main>
  </div>;
}

/** Own one query cache for this native window; no retries or background polling. */
export function App({ transport = nativeManagement, research = nativeResearch }:
  { transport?: ManagementTransport; research?: ResearchTransport }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={queryClient}><CommandCenter transport={transport} research={research} /></QueryClientProvider>;
}

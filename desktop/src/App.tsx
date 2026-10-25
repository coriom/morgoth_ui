import { useCallback, useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { nativeManagement, nativeResearch, nativeOllama, type ManagementTransport, type ResearchTransport, type OllamaTransport } from "./transport";
import { readCapabilityPage, readManagementStatus, readOllamaStatus, readProject, readProjectList, readResearchProfiles, readResearchStatus, readRuntimeStatus } from "./readModels";
import { nativeDrafts, readPreferred, type DraftTransport } from "./drafts";
import { MissionWorkspace } from "./MissionWorkspace";

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

/** Backend calls remain fixed reads; D4 writes only local, Project-scoped briefs. */
const mib = (value: number | null): string => value === null ? "Inconnu"
  : value < 1_048_576 ? `${value} octets` : `${(value / 1_048_576).toFixed(1)} MiB`;

export function CommandCenter({ transport, research, ollama, drafts }: { transport: ManagementTransport; research: ResearchTransport; ollama: OllamaTransport; drafts: DraftTransport }) {
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const [missionDirty, setMissionDirty] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [capabilityOffset, setCapabilityOffset] = useState(0);
  useEffect(() => {
    let active = true;
    void drafts.preferred().then((value) => { if (active) setSelectedId(readPreferred(value)); })
      .catch(() => { if (active) setSelectionError(true); })
      .finally(() => { if (active) setPreferenceLoaded(true); });
    return () => { active = false; };
  }, [drafts]);
  const runtime = useQuery({ queryKey: ["d1", "management-runtime"], queryFn: async () => readRuntimeStatus(await transport.runtimeStatus()) });
  const ready = runtime.isSuccess && runtime.data.state === "READY";
  const management = useQuery({ queryKey: ["d1", "management-status"], queryFn: async () => readManagementStatus(await transport.status()), enabled: ready });
  const connected = ready && management.isSuccess && management.data.management_available === true;
  const projects = useQuery({ queryKey: ["d1", "projects"], queryFn: async () => readProjectList(await transport.projects()), enabled: connected });
  const selectedInCatalog = connected && projects.isSuccess && projects.data.projects.some((item) => item.id === selectedId);
  const project = useQuery({ queryKey: ["d1", "project", selectedId], queryFn: async () => readProject(await transport.project(selectedId!)),
    enabled: connected && selectedId !== null && selectedInCatalog });
  const capabilities = useQuery({ queryKey: ["d2", "capabilities", selectedId, capabilityOffset],
    queryFn: async () => readCapabilityPage(await transport.capabilities(selectedId!, capabilityOffset), selectedId!),
    enabled: connected && selectedInCatalog && (view === "capabilities" || view === "security") });
  const engine = useQuery({ queryKey: ["d1", "research-status"], queryFn: async () => readResearchStatus(await research.status()), enabled: connected });
  const profiles = useQuery({ queryKey: ["d1", "research-profiles", engine.data?.project_id],
    queryFn: async () => readResearchProfiles(await research.profiles()),
    enabled: connected && engine.isSuccess && engine.data.project_id != null && engine.data.state !== "STOPPED" && (view === "models" || view === "security") });
  const localModels = useQuery({ queryKey: ["d3", "ollama-status"],
    queryFn: async () => readOllamaStatus(await ollama.status()), enabled: false });
  const projectData = connected && projects.isSuccess ? projects.data : undefined;
  const capabilityData = connected && selectedInCatalog && capabilities.isSuccess && capabilities.data.project_id === selectedId ? capabilities.data : undefined;
  const engineData = connected && engine.isSuccess ? engine.data : undefined;
  const profileData = connected && engine.isSuccess && profiles.isSuccess ? profiles.data : undefined;
  const localModelData = localModels.isSuccess ? localModels.data : undefined;
  const managerLoading = runtime.isPending || (ready && management.isPending);
  const managerError = runtime.isError || management.isError || (!managerLoading && !connected);
  const projectCount = connected && projectData ? String(projectData.projects.length) : "Indisponible";
  const refreshBusy = runtime.isFetching || management.isFetching || projects.isFetching || project.isFetching
    || engine.isFetching || profiles.isFetching || capabilities.isFetching || localModels.isFetching;
  const onDirtyChange = useCallback((value: boolean) => setMissionDirty(value), []);
  const leaveEditor = () => !missionDirty || window.confirm("Modifications non enregistrées. Les abandonner ?");
  const chooseProject = async (id: string | null) => {
    if (id === selectedId || !leaveEditor()) return;
    setSelectionError(false);
    try { await drafts.setPreferred(id); setSelectedId(id); setMissionDirty(false); setCapabilityOffset(0); }
    catch { setSelectionError(true); }
  };
  const navigate = (next: View) => { if (next !== view && leaveEditor()) { setView(next); setMissionDirty(false); } };
  const selectedProject = projectData?.projects.find((item) => item.id === selectedId);

  return <div className="command-layout">
    <aside className="sidebar" aria-label="Navigation principale">
      <div className="brand"><span className="brand-glyph" aria-hidden="true">M</span><div><strong>MORGOTH</strong><small>DESKTOP / MISSION WORKSPACE</small></div></div>
      <div className="nav-caption">ESPACES</div>
      <nav aria-label="Espaces de supervision" className="nav-list">{views.map((item) =>
        <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined}
          className={view === item.id ? "nav-link active" : "nav-link"} onClick={() => navigate(item.id)}>
          <span className="nav-code">{item.code}</span>{item.label}</button>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" aria-hidden="true" /><span>Briefs locaux<br /><strong>Aucune exécution</strong></span></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div><p className="eyebrow">MORGOTH / ESPACE LOCAL</p><h1>{views.find((item) => item.id === view)?.label}</h1></div>
        <div className="project-context"><label htmlFor="global-project">Project courant</label>
          <select id="global-project" value={selectedId ?? ""} disabled={!preferenceLoaded}
            onChange={(event) => void chooseProject(event.target.value || null)}>
            <option value="">Aucun Project sélectionné</option>
            {selectedId && !selectedInCatalog && <option value={selectedId}>{selectedId} · mémorisé, non vérifié</option>}
            {projectData?.projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
          </select><small>{selectedId ? selectedInCatalog ? "Vérifié dans le catalogue courant" : "Identité locale non vérifiée" : "Aucun périmètre actif"}</small>
        </div></header>
      <section className="connection-strip" aria-label="État de connexion">
        <span className={`connection-indicator ${connected ? "online" : ""}`} aria-hidden="true" />
        <div><strong>{managerLoading ? "Connexion en cours" : refreshBusy && connected ? "Vérification en cours" : connected ? "Gestion locale accessible" : "Gestion locale indisponible"}</strong>
          <span>{managerLoading ? "Lecture du superviseur natif" : connected ? "API de gestion authentifiée par le processus natif" : "Aucune activité déduite de l’interface"}</span>
          {management.dataUpdatedAt > 0 && <small>{connected ? "Dernière lecture Management réussie" : "Ancienne lecture Management, non actuelle"} : {new Date(management.dataUpdatedAt).toLocaleString("fr-FR")}</small>}</div>
        <button type="button" disabled={refreshBusy} onClick={() => { setRefreshSignal((value) => value + 1); void runtime.refetch(); if (ready) void management.refetch();
          if (view === "models") void localModels.refetch();
          if (connected) { void projects.refetch(); void engine.refetch(); if (selectedInCatalog) { void project.refetch();
            if (view === "capabilities" || view === "security") void capabilities.refetch(); }
            if (profiles.isSuccess) void profiles.refetch(); } }}>Actualiser</button>
      </section>
      {selectionError && <p className="notice warn" role="alert">Préférence Project indisponible. La sélection précédente est conservée.</p>}
      {selectedId && <p className="source-stamp">Project : <strong>{selectedProject?.name ?? selectedId}</strong> · {selectedInCatalog ? "catalogue Management vérifié" : "identité locale mémorisée, non vérifiée"}.
        {connected && management.isSuccess && ` Dernière lecture Management réussie : ${new Date(management.dataUpdatedAt).toLocaleString("fr-FR")}.`}</p>}
      {managerError && <p className="notice warn" role="alert">Les données du backend restent indisponibles. Aucune activité n’est présumée.</p>}

      {view === "overview" && <div className="content-stack">
        <p className="section-intro">État attesté par les contrats de lecture locaux. La connexion au service de gestion ne prouve pas que l’agent fonctionne.</p>
        <div className="metric-grid">
          <section className="metric"><span>GESTION LOCALE</span><strong>{managerLoading ? "Chargement…" : connected ? "Disponible" : "Indisponible"}</strong><small>Processus natif + statut de gestion</small></section>
          <section className="metric"><span>PROJETS CONFIGURÉS</span><strong>{projects.isPending && connected ? "Chargement…" : projectCount}</strong><small>Catalogue de configuration, pas missions actives</small></section>
          <section className="metric"><span>MOTEUR DE RECHERCHE</span><strong>{engine.isPending && connected ? "Chargement…" : engineData?.state ?? "Indisponible"}</strong><small>État du superviseur; autonomie non déduite</small></section>
          <section className="metric"><span>MISSIONS GÉNÉRALISTES</span><strong>Lecture Project</strong><small>Historique de test disponible après sélection; aucune activité live déduite</small></section>
        </div>
        <div className="two-column">
          <section className="panel"><p className="eyebrow">01 / ÉTAT</p><h2>Ce qui est observable</h2><dl className="fact-list">
            <Fact label="Management" value={connected ? "Connecté" : "Non confirmé"} tone={connected ? "good" : "warn"} />
            <Fact label="Recherche" value={engineData?.state ?? "Indisponible"} source="Superviseur natif" />
            <Fact label="Project du moteur" value={engineData?.project_id ?? "Aucun confirmé"} source="Superviseur natif" />
            <Fact label="Modèles Ollama résidents" value={localModelData?.loaded_state === "OBSERVED" ? String(localModelData.loaded.length) : "Non lus ou indisponibles"} source="Lecture locale manuelle uniquement" />
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

      {view === "missions" && <MissionWorkspace key={selectedId ?? "none"} projectId={selectedId}
        verified={selectedInCatalog} connected={connected} transport={transport} drafts={drafts}
        onDirtyChange={onDirtyChange} refreshSignal={refreshSignal} />}

      {view === "capabilities" && <div className="content-stack"><p className="section-intro">Inventaire expérimental du Project; validation, autorisation et exécution sont des faits distincts.</p>
        {!selectedInCatalog && <EmptyEvidence title="Sélectionnez un Project">Choisissez un Project dans l’espace Projets.</EmptyEvidence>}
        {selectedInCatalog && <section className="panel"><h2>Capacités · {selectedId}</h2>
          {capabilities.isPending && <p className="skeleton">Lecture de l’inventaire…</p>}
          {capabilities.isError && <p role="alert">Inventaire indisponible ou incompatible.</p>}
          {capabilityData?.capabilities.length === 0 && <EmptyEvidence title="Aucune capacité enregistrée">Le registre du Project est accessible et vide pour cette page.</EmptyEvidence>}
          {capabilityData && capabilityData.capabilities.length > 0 && <div className="table-wrap"><table><thead><tr><th>Capacité / version</th><th>Validation</th><th>État</th><th>Autorité</th><th>Source</th></tr></thead><tbody>{capabilityData.capabilities.map((item) =>
            <tr key={`${item.capability_id}:${item.version}:${item.documentation_digest}`}><td>{item.capability_id}<small>v{item.version} · {item.documentation_digest.slice(0, 12)}…</small></td>
              <td>{item.validation_state}</td><td>{item.state}</td><td>{item.approval_kind === "TEST_FIXTURE_ONLY" ? "Fixture de test uniquement" : "Aucun grant lu"}</td><td>{item.source_identity}</td></tr>)}</tbody></table></div>}
          {capabilityData && <div className="pager"><button type="button" disabled={capabilityOffset === 0} onClick={() => setCapabilityOffset(Math.max(0, capabilityOffset - 10))}>Précédent</button>
            <span>Page {Math.floor(capabilityOffset / 10) + 1}</span><button type="button" disabled={capabilityData.next_offset === null} onClick={() => setCapabilityOffset(capabilityData.next_offset!)}>Suivant</button></div>}
        </section>}
        <section className="panel"><h2>Procédures navigateur</h2><p>Un enregistrement synthétique, même validé, ne confère aucun droit sur un site réel.</p></section></div>}

      {view === "models" && <div className="content-stack"><p className="section-intro">Lecture locale non générative, sur demande. Un modèle installé, résident ou déclaré n’est pas qualifié pour une mission.</p>
        <div className="two-column"><section className="panel"><p className="eyebrow">RUNTIME</p><h2>Recherche supervisée</h2><dl className="fact-list">
          <Fact label="État" value={engineData?.state ?? "Indisponible"} source="Superviseur natif" />
          <Fact label="Project associé" value={engineData?.project_id ?? "Aucun confirmé"} source="Superviseur natif" />
          <Fact label="Profil configuré" value={engineData?.runtime?.profile ?? "Indisponible"} source="Runtime si initialisé" />
          <Fact label="Profil prêt" value={engineData?.runtime?.profile_status ?? "Indisponible"} source="Runtime si initialisé" />
        </dl></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">MODÈLES LOCAUX</p><h2>Ollama</h2></div>
          <button type="button" disabled={localModels.isFetching} onClick={() => void localModels.refetch()}>Lire l’état local</button></div>
          {!localModels.isFetched && <p>Lecture non demandée. Aucun appel d’inférence n’est effectué pour renseigner cette vue.</p>}
          {localModels.isFetching && <p className="skeleton">Lecture locale bornée…</p>}
          {localModels.isError && <p role="alert">Statut local indisponible ou incompatible. Aucun ancien résultat n’est présenté comme actuel.</p>}
          {localModelData && <dl className="fact-list">
            <Fact label="Connectivité Ollama" value={localModelData.service_state === "REACHABLE" ? "Accessible" : "Indisponible"} source="GET local /api/tags" tone={localModelData.service_state === "REACHABLE" ? "good" : "warn"} />
            <Fact label="Dernière lecture" value={new Date(localModelData.observed_at_ms).toLocaleString("fr-FR")} source="Horloge locale du processus natif" />
            <Fact label="Identité déclarée" value={localModelData.configured_model ?? "Inconnue"} source="Configuration native optionnelle, pas modèle CHAT" />
            <Fact label="Modèles installés" value={localModelData.installed_state === "OBSERVED" ? String(localModelData.installed.length) : "Indisponibles"} source="GET /api/tags" />
            <Fact label="Modèles résidents" value={localModelData.loaded_state === "OBSERVED" ? String(localModelData.loaded.length) : "Indisponibles"} source="GET /api/ps; zéro = aucun résident" />
            <Fact label="Échec de lecture" value={localModelData.failure_class ?? "Aucun"} source="Classe fixe, aucun corps HTTP" />
          </dl>}
        </section></div>
        {localModelData && <div className="two-column"><section className="panel"><h2>Installés</h2>
          {localModelData.installed_state !== "OBSERVED" ? <p>Liste indisponible.</p> : localModelData.installed.length === 0 ? <EmptyEvidence title="Aucun modèle installé">Liste Ollama accessible et vide.</EmptyEvidence>
            : <div className="table-wrap"><table><thead><tr><th>Identifiant</th><th>Taille déclarée</th></tr></thead><tbody>{localModelData.installed.map((item) => <tr key={item.id}><td>{item.id}</td><td>{mib(item.size_bytes)}</td></tr>)}</tbody></table></div>}
        </section><section className="panel"><h2>Résidents</h2>
          {localModelData.loaded_state !== "OBSERVED" ? <p>Résidence non vérifiée.</p> : localModelData.loaded.length === 0 ? <EmptyEvidence title="Aucun modèle résident">Le service répond; aucun modèle n’est actuellement listé comme chargé.</EmptyEvidence>
            : <div className="table-wrap"><table><thead><tr><th>Identifiant</th><th>Taille déclarée</th><th>VRAM rapportée</th></tr></thead><tbody>{localModelData.loaded.map((item) => <tr key={item.id}><td>{item.id}</td><td>{mib(item.size_bytes)}</td><td>{mib(item.ollama_reported_vram_bytes)}</td></tr>)}</tbody></table></div>}
        </section></div>}
        {localModelData && <section className="panel"><h2>Ressources Linux observées</h2><dl className="fact-list">
          <Fact label="Mémoire disponible" value={mib(localModelData.resources.linux_mem_available_bytes)} source="/proc/meminfo du système Linux invité" />
          <Fact label="Swap total / utilisé" value={`${mib(localModelData.resources.linux_swap_total_bytes)} / ${mib(localModelData.resources.linux_swap_used_bytes)}`} source="/proc/meminfo" />
          <Fact label="Limite / usage cgroup" value={`${mib(localModelData.resources.cgroup_memory_limit_bytes)} / ${mib(localModelData.resources.cgroup_memory_current_bytes)}`} source="cgroup v2 si disponible" />
          <Fact label="Marge cgroup" value={mib(localModelData.resources.cgroup_memory_headroom_bytes)} source="Calculée seulement si limite et usage connus" />
          <Fact label="Placement CPU / GPU" value="Inconnu" source="Aucune mesure de placement" />
          <Fact label="Utilisation GPU réelle" value="Inconnue" source="VRAM Ollama ≠ utilisation GPU mesurée" />
        </dl></section>}
        <section className="panel"><p className="eyebrow">PROFILS</p><h2>Qualification disponible</h2>
          {profiles.isPending && profiles.fetchStatus === "fetching" && <p className="skeleton">Lecture des profils…</p>}
          {profiles.isError && <p role="alert">Profils indisponibles ou invalides.</p>}
          {profileData ? <><p>Profil courant : <strong>{profileData.current}</strong> · recommandation : {profileData.recommended ?? "aucune"}</p>
            <div className="table-wrap"><table><thead><tr><th>Profil</th><th>Statut</th><th>Qualification</th></tr></thead><tbody>{profileData.profiles.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.status}</td><td>{item.id === "codex" ? profileData.codex.workloads_ready ? "Workloads prêts selon le backend" : "Workloads bloqués" : "Voir statut du profil"}</td></tr>)}</tbody></table></div></>
            : !profiles.isError && <EmptyEvidence title="Profil non disponible">Cette vue ne peut ni initialiser un moteur ni lancer une inférence.</EmptyEvidence>}
        </section></div>}

      {view === "security" && <div className="content-stack"><p className="section-intro">Les indicateurs séparent les constats du superviseur, la politique revue dans le code et ce que Desktop ne peut pas vérifier.</p>
        <div className="two-column"><section className="panel"><p className="eyebrow">AUTORITÉ</p><h2>Actions et approbations</h2><dl className="fact-list">
          <Fact label="Commandes d’exécution dans Desktop" value="Aucune" source="Interface D4" tone="good" />
          <Fact label="Human Gate 3" value="Humain uniquement" source="Règle de gouvernance" />
          <Fact label="Capacités en attente de revue" value={capabilityData ? String(capabilityData.capabilities.filter((item) => item.state === "PENDING_APPROVAL").length) : "Indisponible"} source="Page de registre test, pas file humaine" />
          <Fact label="Tentatives bloquées" value="Non exposées" source="Indisponible" />
          <Fact label="SAFE_FOR_WORKLOADS" value="Non exposé en temps réel" source="Indisponible; baseline revue = false" />
        </dl></section><section className="panel"><p className="eyebrow">CONFINEMENT</p><h2>Exécution séparée</h2><dl className="fact-list">
          <Fact label="Codex installé" value={profileData ? profileData.codex.installed ? "Oui" : "Non" : "Indisponible"} source="Profil si disponible" />
          <Fact label="Sandbox disponible" value={profileData ? profileData.codex.sandbox_available ? "Oui" : "Non" : "Indisponible"} source="Profil si disponible" />
          <Fact label="Sandbox qualifié" value={profileData ? profileData.codex.sandbox_qualified ? "Oui" : "Non" : "Indisponible"} source="Profil si disponible" />
          <Fact label="Workloads Codex" value={profileData ? profileData.codex.workloads_ready ? "Prêts selon le backend" : "Bloqués" : "Indisponibles"} source="Profil si disponible" tone={profileData?.codex.workloads_ready ? "good" : "warn"} />
          <Fact label="Sites Web réels" value="Non autorisés par ce Desktop" source="Portée D1" />
        </dl></section></div>
        <section className="panel"><h2>Contrat d’approbation</h2><p>Un enregistrement validé ou une procédure mémorisée n’est pas un grant. Les grants, leurs portées et leur provenance ne sont pas publiés par D2; Desktop n’émet aucune autorisation.</p></section></div>}

      {view === "projects" && <div className="content-stack"><p className="section-intro">Catalogue de configuration. Ni stockage, ni recherche, ni mission ne sont démarrés par cette vue.</p>
        <div className="two-column projects-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">CATALOGUE</p><h2>Projects</h2></div><span className="tag">{projectCount}</span></div>
          {projects.isPending && connected && <p className="skeleton">Lecture du catalogue…</p>}
          {projects.isError && <p role="alert">Catalogue indisponible ou invalide.</p>}
          {!connected && <EmptyEvidence title="Catalogue indisponible">Le service de gestion n’est pas confirmé.</EmptyEvidence>}
          {projectData?.projects.length === 0 && <EmptyEvidence title="Aucun Project configuré">Le catalogue de configuration est vide.</EmptyEvidence>}
          <ul className="project-list">{projectData?.projects.map((item) => <li key={item.id}><button type="button" className={selectedId === item.id ? "selected" : ""}
            onClick={() => void chooseProject(item.id)} aria-current={selectedId === item.id ? "true" : undefined}><strong>{item.name}</strong><span>{item.id} · {item.domain}{item.legacy ? " · historique" : ""}</span></button></li>)}</ul>
        </section><section className="panel"><p className="eyebrow">PORTÉE SÉLECTIONNÉE</p><h2>Détail du Project</h2>
          {!selectedId && <EmptyEvidence title="Sélectionnez un Project">Le choix change seulement le périmètre affiché.</EmptyEvidence>}
          {selectedId && !selectedInCatalog && <p role="alert">Project absent du catalogue courant. Aucun détail n’est affiché.</p>}
          {selectedInCatalog && project.isPending && <p className="skeleton">Lecture du Project…</p>}
          {project.isError && <p role="alert">Détail indisponible ou invalide.</p>}
          {selectedInCatalog && project.isSuccess && project.data.id === selectedId && <><h3>{project.data.name}</h3><dl className="fact-list">
            <Fact label="Identifiant" value={project.data.id} />
            <Fact label="Domaine" value={project.data.domain} />
            <Fact label="Configuration" value={project.data.configuration_valid ? "Valide" : "Invalide"} source="Catalogue, non revalidé" />
            <Fact label="Runtime vérifié" value={project.data.runtime_checked ? "Oui" : "Non"} source="Catalogue" />
            <Fact label="Moteur du Project" value={engineData?.project_id === selectedId ? engineData.state : "Aucun moteur attribué observé"} source="Superviseur natif" />
          </dl></>}
        </section></div></div>}
      <footer className="workspace-footer"><span>DESKTOP D4 · BRIEFS LOCAUX / LECTURE HISTORIQUE</span><span>Un état absent reste inconnu.</span></footer>
    </main>
  </div>;
}

/** Own one query cache for this native window; no retries or background polling. */
export function App({ transport = nativeManagement, research = nativeResearch, ollama = nativeOllama, drafts = nativeDrafts }:
  { transport?: ManagementTransport; research?: ResearchTransport; ollama?: OllamaTransport; drafts?: DraftTransport }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={queryClient}><CommandCenter transport={transport} research={research} ollama={ollama} drafts={drafts} /></QueryClientProvider>;
}

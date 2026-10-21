import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { nativeManagement, nativeResearch, type ManagementTransport, type ResearchTransport } from "./transport";
import { readCapabilityPage, readManagementStatus, readMission, readMissionPage, readProject, readProjectList, readResearchProfiles, readResearchStatus, readRuntimeStatus } from "./readModels";

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

/** D2 calls only fixed native read commands; it never mounts Project or research mutations. */
export function CommandCenter({ transport, research }: { transport: ManagementTransport; research: ResearchTransport }) {
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [missionOffset, setMissionOffset] = useState(0);
  const [capabilityOffset, setCapabilityOffset] = useState(0);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const runtime = useQuery({ queryKey: ["d1", "management-runtime"], queryFn: async () => readRuntimeStatus(await transport.runtimeStatus()) });
  const ready = runtime.isSuccess && runtime.data.state === "READY";
  const management = useQuery({ queryKey: ["d1", "management-status"], queryFn: async () => readManagementStatus(await transport.status()), enabled: ready });
  const connected = ready && management.isSuccess && management.data.management_available === true;
  const projects = useQuery({ queryKey: ["d1", "projects"], queryFn: async () => readProjectList(await transport.projects()), enabled: connected });
  const selectedInCatalog = connected && projects.isSuccess && projects.data.projects.some((item) => item.id === selectedId);
  const project = useQuery({ queryKey: ["d1", "project", selectedId], queryFn: async () => readProject(await transport.project(selectedId!)),
    enabled: connected && selectedId !== null && selectedInCatalog });
  const missions = useQuery({ queryKey: ["d2", "missions", selectedId, missionOffset],
    queryFn: async () => readMissionPage(await transport.missions(selectedId!, missionOffset), selectedId!),
    enabled: connected && selectedInCatalog && view === "missions" });
  const mission = useQuery({ queryKey: ["d2", "mission", selectedId, selectedMissionId],
    queryFn: async () => readMission(await transport.mission(selectedId!, selectedMissionId!), selectedId!),
    enabled: connected && selectedInCatalog && view === "missions" && selectedMissionId !== null });
  const capabilities = useQuery({ queryKey: ["d2", "capabilities", selectedId, capabilityOffset],
    queryFn: async () => readCapabilityPage(await transport.capabilities(selectedId!, capabilityOffset), selectedId!),
    enabled: connected && selectedInCatalog && (view === "capabilities" || view === "security") });
  const engine = useQuery({ queryKey: ["d1", "research-status"], queryFn: async () => readResearchStatus(await research.status()), enabled: connected });
  const profiles = useQuery({ queryKey: ["d1", "research-profiles", engine.data?.project_id],
    queryFn: async () => readResearchProfiles(await research.profiles()),
    enabled: connected && engine.isSuccess && engine.data.project_id != null && engine.data.state !== "STOPPED" && (view === "models" || view === "security") });
  const projectData = connected && projects.isSuccess ? projects.data : undefined;
  const missionData = connected && selectedInCatalog && missions.isSuccess && missions.data.project_id === selectedId ? missions.data : undefined;
  const detailData = connected && selectedInCatalog && mission.isSuccess && mission.data.project_id === selectedId && mission.data.mission_id === selectedMissionId ? mission.data : undefined;
  const capabilityData = connected && selectedInCatalog && capabilities.isSuccess && capabilities.data.project_id === selectedId ? capabilities.data : undefined;
  const engineData = connected && engine.isSuccess ? engine.data : undefined;
  const profileData = connected && engine.isSuccess && profiles.isSuccess ? profiles.data : undefined;
  const managerLoading = runtime.isPending || (ready && management.isPending);
  const managerError = runtime.isError || management.isError || (!managerLoading && !connected);
  const projectCount = connected && projectData ? String(projectData.projects.length) : "Indisponible";
  const refreshBusy = runtime.isFetching || management.isFetching || projects.isFetching || project.isFetching
    || engine.isFetching || profiles.isFetching || missions.isFetching || mission.isFetching || capabilities.isFetching;
  const chooseProject = (id: string) => { setSelectedId(id); setSelectedMissionId(null); setMissionOffset(0); setCapabilityOffset(0); };

  return <div className="command-layout">
    <aside className="sidebar" aria-label="Navigation principale">
      <div className="brand"><span className="brand-glyph" aria-hidden="true">M</span><div><strong>MORGOTH</strong><small>LOCAL COMMAND / D2</small></div></div>
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
          if (connected) { void projects.refetch(); void engine.refetch(); if (selectedInCatalog) { void project.refetch();
            if (view === "missions") { void missions.refetch(); if (selectedMissionId) void mission.refetch(); }
            if (view === "capabilities" || view === "security") void capabilities.refetch(); }
            if (profiles.isSuccess) void profiles.refetch(); } }}>Actualiser</button>
      </section>
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

      {view === "missions" && <div className="content-stack"><p className="section-intro">Checkpoints historiques du Project sélectionné, issus uniquement du registre expérimental `morgoth_test`.</p>
        {!selectedInCatalog && <EmptyEvidence title="Sélectionnez un Project">Choisissez un Project dans l’espace Projets. Le Project historique ne possède pas ce registre.</EmptyEvidence>}
        {selectedInCatalog && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">MISSION WORKSPACE</p><h2>Missions · {selectedId}</h2></div><span className="tag">HISTORIQUE · LECTURE SEULE</span></div>
          {missions.isPending && <p className="skeleton">Lecture des checkpoints…</p>}
          {missions.isError && <p role="alert">Registre indisponible ou incompatible pour ce Project. Aucune absence de mission n’est déduite.</p>}
          {missionData?.missions.length === 0 && <EmptyEvidence title="Aucune mission enregistrée">Le registre de test du Project est accessible et vide pour cette page.</EmptyEvidence>}
          {missionData && missionData.missions.length > 0 && <div className="table-wrap"><table><thead><tr><th>Mission</th><th>État du checkpoint</th><th>Mis à jour</th><th>Preuves</th></tr></thead><tbody>{missionData.missions.map((item) =>
            <tr key={item.mission_id}><td><button type="button" className="table-link" onClick={() => setSelectedMissionId(item.mission_id)}>{item.objective}</button><small>{item.mission_id}</small></td>
              <td>{item.state}</td><td>{new Date(item.updated_at).toLocaleString("fr-FR")}</td><td>{item.receipt_count} reçu(s) local(aux)</td></tr>)}</tbody></table></div>}
          {missionData && <div className="pager"><button type="button" disabled={missionOffset === 0} onClick={() => { setMissionOffset(Math.max(0, missionOffset - 10)); setSelectedMissionId(null); }}>Précédent</button>
            <span>Page {Math.floor(missionOffset / 10) + 1}</span><button type="button" disabled={missionData.next_offset === null} onClick={() => { setMissionOffset(missionData.next_offset!); setSelectedMissionId(null); }}>Suivant</button></div>}
        </section>}
        {selectedMissionId && selectedInCatalog && <section className="panel"><h2>Détail du checkpoint</h2>
          {mission.isPending && <p className="skeleton">Lecture du détail…</p>}
          {mission.isError && <p role="alert">Détail supprimé, hors Project ou indisponible.</p>}
          {detailData && <dl className="fact-list"><Fact label="Objectif" value={detailData.objective} source="Enregistrement historique" />
            <Fact label="État enregistré" value={detailData.state} source="Dernier checkpoint, pas statut live" />
            <Fact label="Étapes enregistrées" value={detailData.stages.join(" → ")} source="Historique borné" />
            <Fact label="Gaps de capacité" value={detailData.capability_gaps.join(", ") || "Aucun enregistré"} />
            <Fact label="Échecs / refus" value={detailData.failure_codes.join(", ") || "Aucun enregistré"} />
            <Fact label="Reprise éligible" value={detailData.resume_eligible ? "Oui selon le checkpoint" : "Non"} source="Aucune commande de reprise" />
            <Fact label="Reçus locaux" value={String(detailData.receipt_count)} source="Nombre; résultat brut masqué" />
            <Fact label="Créé / mis à jour" value={`${new Date(detailData.created_at).toLocaleString("fr-FR")} / ${new Date(detailData.updated_at).toLocaleString("fr-FR")}`} />
          </dl>}</section>}
      </div>}

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
          <Fact label="Commandes d’exécution dans D2" value="Aucune" source="Interface D2" tone="good" />
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
            onClick={() => chooseProject(item.id)} aria-current={selectedId === item.id ? "true" : undefined}><strong>{item.name}</strong><span>{item.id} · {item.domain}{item.legacy ? " · historique" : ""}</span></button></li>)}</ul>
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
      <footer className="workspace-footer"><span>DESKTOP D2 · LECTURE SEULE</span><span>Un état absent reste inconnu.</span></footer>
    </main>
  </div>;
}

/** Own one query cache for this native window; no retries or background polling. */
export function App({ transport = nativeManagement, research = nativeResearch }:
  { transport?: ManagementTransport; research?: ResearchTransport }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={queryClient}><CommandCenter transport={transport} research={research} /></QueryClientProvider>;
}

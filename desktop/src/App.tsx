import { useCallback, useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { nativeManagement, nativeResearch, nativeOllama, type ManagementTransport, type ResearchTransport, type OllamaTransport } from "./transport";
import { readCapabilityPage, readManagementStatus, readOllamaStatus, readProject, readProjectList, readResearchProfiles, readResearchStatus, readRuntimeStatus } from "./readModels";
import { nativeDrafts, readPreferred, type DraftTransport } from "./drafts";
import { MissionWorkspace } from "./MissionWorkspace";
import { KnowledgeWorkspace } from "./KnowledgeWorkspace";
import { Home } from "./Home";
import { CommandPalette } from "./CommandPalette";
import { nativeNotes, type NoteTransport } from "./notes";

type View = "home" | "missions" | "knowledge" | "projects" | "settings" | "runtime" | "capabilities" | "models" | "security";
const primaryViews: ReadonlyArray<{ id: View; label: string; icon: string }> = [
  { id: "home", label: "Accueil", icon: "⌂" },
  { id: "missions", label: "Missions", icon: "≡" },
  { id: "knowledge", label: "Connaissances", icon: "▤" },
  { id: "projects", label: "Projets", icon: "▦" },
  { id: "settings", label: "Réglages", icon: "⚙" },
];
const sectionName: Record<View, string> = { home: "Accueil", missions: "Missions", knowledge: "Connaissances",
  projects: "Projets", settings: "Réglages", runtime: "Runtime", capabilities: "Capacités",
  models: "Modèles & runtime", security: "Sécurité" };

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

export function CommandCenter({ transport, research, ollama, drafts, notes }: { transport: ManagementTransport; research: ResearchTransport; ollama: OllamaTransport; drafts: DraftTransport; notes: NoteTransport }) {
  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const [missionDirty, setMissionDirty] = useState(false);
  const [noteDirty, setNoteDirty] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [missionRequest, setMissionRequest] = useState<{kind:"create"|"open";id?:string;seq:number}|null>(null);
  const [noteCreateSignal, setNoteCreateSignal] = useState(0);
  const [noteOpenRequest, setNoteOpenRequest] = useState<{id:string;seq:number}|null>(null);
  const [requestSeq, setRequestSeq] = useState(0);
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
  const onNoteDirtyChange = useCallback((value: boolean) => setNoteDirty(value), []);
  const leaveEditor = () => (!missionDirty && !noteDirty) || window.confirm("Modifications non enregistrées. Les abandonner ?");
  const chooseProject = async (id: string | null) => {
    if (id === selectedId || !leaveEditor()) return;
    setSelectionError(false);
    try { await drafts.setPreferred(id); setSelectedId(id); setMissionDirty(false); setNoteDirty(false); setCapabilityOffset(0); setMissionRequest(null); setNoteOpenRequest(null); }
    catch { setSelectionError(true); }
  };
  const navigate = (next: View) => { if (next !== view && leaveEditor()) { setView(next); setMissionDirty(false); setNoteDirty(false); setMissionRequest(null); setNoteOpenRequest(null); } };
  const newDraft = () => { if (!selectedId || !leaveEditor()) return; const seq=requestSeq+1; setRequestSeq(seq);setMissionRequest({kind:"create",seq});setView("missions");setMissionDirty(false);setNoteDirty(false); };
  const openDraft = (id: string) => { if (!leaveEditor()) return; const seq=requestSeq+1;setRequestSeq(seq);setMissionRequest({kind:"open",id,seq});setView("missions");setMissionDirty(false);setNoteDirty(false); };
  const newNote = () => { if (!selectedId || !leaveEditor()) return;setNoteOpenRequest(null);setNoteCreateSignal(value=>value+1);setView("knowledge");setMissionDirty(false);setNoteDirty(false); };
  const openNote = (id: string) => { if (!leaveEditor()) return;const seq=requestSeq+1;setRequestSeq(seq);setNoteOpenRequest({id,seq});setView("knowledge");setMissionDirty(false);setNoteDirty(false); };
  const selectedProject = projectData?.projects.find((item) => item.id === selectedId);

  return <div className={sidebarCollapsed ? "command-layout sidebar-collapsed" : "command-layout"}>
    <aside className="sidebar" aria-label="Navigation principale">
      <div className="brand"><span className="brand-glyph" aria-hidden="true">m</span><strong>morgoth</strong><button type="button" className="sidebar-toggle" aria-label={sidebarCollapsed ? "Déployer la barre latérale" : "Réduire la barre latérale"} onClick={() => setSidebarCollapsed(value=>!value)}>{sidebarCollapsed ? "›" : "‹"}</button></div>
      <div className="sidebar-project"><label htmlFor="global-project">Espace actuel</label><select id="global-project" value={selectedId ?? ""} disabled={!preferenceLoaded} onChange={event => void chooseProject(event.target.value || null)}>
        <option value="">Aucun Project</option>{selectedId && !selectedInCatalog && <option value={selectedId}>{selectedId} · mémorisé</option>}
        {projectData?.projects.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
      </select><small>{selectedId ? selectedInCatalog ? "Project vérifié" : "Identité locale non vérifiée" : "Aucun périmètre"}</small></div>
      <button type="button" className="compact-project" onClick={()=>navigate("projects")}
        aria-label={`Choisir un Project ; actuel : ${selectedProject?.name ?? selectedId ?? "aucun"}`}
        title={selectedProject?.name ?? selectedId ?? "Choisir un Project"}>P</button>
      <nav aria-label="Espaces" className="nav-list">{primaryViews.filter(item=>item.id!=="settings").map(item =>
        <button key={item.id} type="button" aria-current={view===item.id ? "page" : undefined} className={view===item.id ? "nav-link active" : "nav-link"} onClick={()=>navigate(item.id)}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button type="button" className={view==="settings" || ["runtime","models","capabilities","security"].includes(view) ? "nav-link active" : "nav-link"} aria-current={view==="settings" ? "page" : undefined} onClick={()=>navigate("settings")}><span aria-hidden="true">⚙</span><span>Réglages</span></button>
        <CommandPalette projectId={selectedId} projects={projectData?.projects ?? []} drafts={drafts} notes={notes}
          navigate={next=>navigate(next)} chooseProject={id=>void chooseProject(id)} openDraft={openDraft} openNote={openNote} newDraft={newDraft} newNote={newNote} /></div>
    </aside>
    <main className="workspace">
      {view!=="home" && view!=="knowledge" && <header className="topbar"><div><p className="breadcrumb">{selectedProject?.name ?? selectedId ?? "Espace personnel"} / {sectionName[view]}</p><h1>{sectionName[view]}</h1>
        {view==="missions" && <p>Des briefs locaux non soumis et des checkpoints historiques distincts.</p>}</div></header>}
      {view!=="home" && view!=="knowledge" && <section className="connection-strip" aria-label="État de connexion">
        <span className={`connection-indicator ${connected ? "online" : ""}`} aria-hidden="true" />
        <div><strong>{managerLoading ? "Connexion en cours" : refreshBusy && connected ? "Vérification en cours" : connected ? "Gestion locale accessible" : "Gestion locale indisponible"}</strong>
          <span>{managerLoading ? "Lecture du superviseur natif" : connected ? "API de gestion authentifiée par le processus natif" : "Aucune activité déduite de l’interface"}</span>
          {management.dataUpdatedAt > 0 && <small>{connected ? "Dernière lecture Management réussie" : "Ancienne lecture Management, non actuelle"} : {new Date(management.dataUpdatedAt).toLocaleString("fr-FR")}</small>}</div>
        <button type="button" disabled={refreshBusy} onClick={() => { setRefreshSignal((value) => value + 1); void runtime.refetch(); if (ready) void management.refetch();
          if (view === "models") void localModels.refetch();
          if (connected) { void projects.refetch(); void engine.refetch(); if (selectedInCatalog) { void project.refetch();
            if (view === "capabilities" || view === "security") void capabilities.refetch(); }
            if (profiles.isSuccess) void profiles.refetch(); } }}>Actualiser</button>
      </section>}
      {selectionError && <p className="notice warn" role="alert">Préférence Project indisponible. La sélection précédente est conservée.</p>}
      {selectedId && view!=="home" && view!=="knowledge" && view!=="missions" && <p className="source-stamp">Project : <strong>{selectedProject?.name ?? selectedId}</strong> · {selectedInCatalog ? "catalogue Management vérifié" : "identité locale mémorisée, non vérifiée"}.
        {connected && management.isSuccess && ` Dernière lecture Management réussie : ${new Date(management.dataUpdatedAt).toLocaleString("fr-FR")}.`}</p>}
      {managerError && view!=="home" && view!=="knowledge" && view!=="missions" && <p className="notice warn" role="alert">Les données du backend restent indisponibles. Aucune activité n’est présumée.</p>}

      {view === "home" && <Home projectId={selectedId} projectName={selectedProject?.name ?? null} verified={selectedInCatalog}
        drafts={drafts} notes={notes} onOpenDraft={openDraft} onNewDraft={newDraft} onOpenNote={openNote} onNewNote={newNote} onProjects={()=>navigate("projects")} />}
      {view === "knowledge" && <KnowledgeWorkspace key={selectedId ?? "none"} projectId={selectedId} verified={selectedInCatalog}
        transport={notes} onDirtyChange={onNoteDirtyChange} createSignal={noteCreateSignal} openNoteRequest={noteOpenRequest} refreshSignal={refreshSignal} />}
      {view === "settings" && <div className="settings-index"><h2>Votre espace, à votre rythme.</h2><p>Les observations techniques restent disponibles ici, sans commande d’exécution.</p>
        <div className="settings-links"><button onClick={()=>navigate("runtime")}>Vue générale et diagnostics <span>→</span></button>
          <button onClick={()=>navigate("models")}>Modèles et runtime <span>→</span></button>
          <button onClick={()=>navigate("capabilities")}>Outils et capacités <span>→</span></button>
          <button onClick={()=>navigate("security")}>Sécurité et permissions <span>→</span></button></div>
        <p className="source-stamp">Apparence : thème sombre initial, jetons prêts pour une personnalisation ultérieure. Aucune préférence de thème n’est simulée.</p></div>}
      {view === "runtime" && <div className="settings-index"><h2>Observations disponibles</h2><dl className="fact-list">
        <Fact label="Management" value={connected ? "Accessible" : "Indisponible"} source="Lecture native" />
        <Fact label="Recherche" value={engineData?.state ?? "Inconnue"} source="Superviseur natif" />
        <Fact label="Project du moteur" value={engineData?.project_id ?? "Aucun confirmé"} source="Superviseur natif" />
        <Fact label="Projects configurés" value={projectCount} source="Catalogue courant" /></dl>
        <p>Aucun flux d’activité Project-scopé n’est connecté. Aucune activité n’est déduite de ces lectures.</p></div>}

      {view === "missions" && <MissionWorkspace key={selectedId ?? "none"} projectId={selectedId}
        verified={selectedInCatalog} connected={connected} transport={transport} drafts={drafts}
        onDirtyChange={onDirtyChange} refreshSignal={refreshSignal} request={missionRequest} />}

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
      <footer className="workspace-footer"><span>Morgoth · espace local</span><span>Un état absent reste inconnu.</span></footer>
    </main>
  </div>;
}

/** Own one query cache for this native window; no retries or background polling. */
export function App({ transport = nativeManagement, research = nativeResearch, ollama = nativeOllama, drafts = nativeDrafts, notes = nativeNotes }:
  { transport?: ManagementTransport; research?: ResearchTransport; ollama?: OllamaTransport; drafts?: DraftTransport; notes?: NoteTransport }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={queryClient}><CommandCenter transport={transport} research={research} ollama={ollama} drafts={drafts} notes={notes} /></QueryClientProvider>;
}

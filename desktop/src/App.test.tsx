import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./App";
import type { ComponentProps } from "react";
import type { NoteTransport } from "./notes";
import type { DraftInput, DraftTransport, LocalDraft } from "./drafts";
import type { ManagementTransport, Project, ResearchEngineStatus, ResearchTransport, OllamaTransport, OllamaStatus } from "./transport";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const project = (id: string): Project => ({ id, name: id, domain: "crypto", legacy: false,
  configuration_valid: true, runtime_checked: false });
const stopped: ResearchEngineStatus = { state: "STOPPED", project_id: null, domain: null, diagnostic: null, runtime: null };
function management(overrides: Partial<ManagementTransport> = {}): ManagementTransport {
  return { runtimeStatus: vi.fn(async () => ({ state: "READY" as const, diagnostic: null })),
    status: vi.fn(async () => ({ api_version: "1", management_available: true })),
    domains: vi.fn(async () => ({ domains: [], runtime_checked: false })),
    createProject: vi.fn(async (input) => ({ project: project(input.id), created: true, durability_confirmed: true, engine_started: false, storage_initialized: false })),
    projects: vi.fn(async () => ({ projects: [project("alpha"), project("beta")], configuration_valid: true, runtime_checked: false })),
    project: vi.fn(async (id) => project(id)), validation: vi.fn(async (id) => ({ project: project(id), configuration_valid: true, runtime_checked: false })),
    missions: vi.fn(async (id) => ({ project_id: id, missions: [], next_offset: null, source: "DISPOSABLE_POSTGRESQL" as const })),
    mission: vi.fn(async () => { throw new Error("not found"); }),
    capabilities: vi.fn(async (id) => ({ project_id: id, capabilities: [], next_offset: null, source: "DISPOSABLE_POSTGRESQL" as const })),
    knowledge: vi.fn(async (id) => ({ schema_version: 1 as const, project_id: id, source: "PROJECT_MARKDOWN_VAULT" as const, read_at: new Date().toISOString(), documents: [], next_offset: null })),
    knowledgeDocument: vi.fn(async () => { throw new Error("missing"); }),
    structuredTheses: vi.fn(async (id) => ({schema_version:1 as const,project_id:id,source:"PROJECT_STRUCTURED_POSTGRESQL" as const,read_at:new Date().toISOString(),theses:[],next_offset:null})),
    structuredThesis: vi.fn(async () => { throw new Error("missing"); }),
    structuredContradictions: vi.fn(async (id) => ({schema_version:1 as const,project_id:id,source:"PROJECT_STRUCTURED_POSTGRESQL" as const,read_at:new Date().toISOString(),contradictions:[],next_offset:null})),
    structuredContradiction: vi.fn(async () => { throw new Error("missing"); }),
    ...overrides };
}
function research(overrides: Partial<ResearchTransport> = {}): ResearchTransport {
  const profiles = { schema_version: 1, current: "codex", recommended: null,
    codex: { installed: true, authenticated: true, sandbox_available: true, sandbox_qualified: false, workloads_ready: false },
    profiles: [{ id: "codex", status: "BLOCKED" as const, reason: "gate", providers: {} }] };
  return { status: vi.fn(async () => stopped), profiles: vi.fn(async () => profiles), ...overrides };
}
const localStatus: OllamaStatus = { source: "OLLAMA_LOOPBACK_GET_V1", observed_at_ms: 1_700_000_000_000,
  service_state: "REACHABLE", installed_state: "OBSERVED", loaded_state: "OBSERVED", failure_class: null,
  configured_model: null, installed: [{ id: "model:1", size_bytes: 1048576 }], loaded: [],
  resources: { linux_mem_available_bytes: 2_097_152, linux_swap_total_bytes: null, linux_swap_used_bytes: null,
    cgroup_memory_limit_bytes: null, cgroup_memory_current_bytes: null, cgroup_memory_headroom_bytes: null } };
function local(overrides: Partial<OllamaTransport> = {}): OllamaTransport {
  return { status: vi.fn(async () => localStatus), ...overrides };
}
function drafts(): DraftTransport {
  return { preferred: vi.fn(async () => null), setPreferred: vi.fn(async () => undefined),
    list: vi.fn(async () => []), get: vi.fn(async () => { throw new Error("missing"); }),
    create: vi.fn(async () => { throw new Error("missing"); }),
    update: vi.fn(async () => { throw new Error("missing"); }),
    delete: vi.fn(async () => undefined) };
}
function memoryDrafts(): DraftTransport {
  const values = new Map<string, LocalDraft>();
  let selected: string | null = null;
  let sequence = 1;
  const get = async (projectId: string, draftId: string) => {
    const found = values.get(draftId);
    if (!found || found.project_id !== projectId) throw new Error("NOT_FOUND");
    return found;
  };
  return { preferred: vi.fn(async () => selected), setPreferred: vi.fn(async (id) => { selected = id; }),
    list: vi.fn(async (id) => [...values.values()].filter((value) => value.project_id === id)), get,
    create: vi.fn(async (input: DraftInput) => {
      const draft: LocalDraft = { ...input, schema_version: 1,
        draft_id: `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
        revision: 1, created_at_ms: 100, updated_at_ms: 100 };
      values.set(draft.draft_id, draft); return draft;
    }),
    update: vi.fn(async (input) => {
      const prior = await get(input.project_id, input.draft_id);
      if (prior.revision !== input.expected_revision) throw new Error("CONFLICT");
      const draft = { ...prior, title: input.title, objective: input.objective,
        verification_criteria: input.verification_criteria, revision: prior.revision + 1, updated_at_ms: prior.updated_at_ms + 1 };
      values.set(draft.draft_id, draft); return draft;
    }),
    delete: vi.fn(async (id, draftId, revision) => {
      const prior = await get(id, draftId);
      if (prior.revision !== revision) throw new Error("CONFLICT");
      values.delete(draftId);
    }) };
}
const emptyNotes = (): NoteTransport => ({ list: vi.fn(async () => []), get: vi.fn(async () => { throw new Error("missing"); }),
  create: vi.fn(async () => { throw new Error("missing"); }), update: vi.fn(async () => { throw new Error("missing"); }), delete: vi.fn(async () => undefined),
  exportMarkdown: vi.fn(async () => "/tmp/synthetic-export.md") });
function TestedApp(props: ComponentProps<typeof App>) { return <App notes={emptyNotes()} {...props} />; }
function nav(label: string) {
  const technical: Record<string,string> = { "Capacités": "Outils et capacités", "Modèles": "Modèles et runtime", "Sécurité": "Sécurité et permissions" };
  if (technical[label]) { fireEvent.click(screen.getByRole("button", { name: /Réglages/ }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(technical[label]) })); return; }
  fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
}

describe("read-only command center", () => {
  it("opens the safe command palette by keyboard and restores focus on escape", async () => {
    render(<TestedApp drafts={drafts()} transport={management()} research={research()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog", { name: "Recherche et navigation" });
    const search = within(dialog).getByRole("searchbox");
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "Réglages" } });
    expect(within(dialog).getByRole("option", { name: /Réglages/ })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Rechercher/ }));
  });
  it("reports loading without claiming operational readiness", () => {
    const pending = new Promise<Awaited<ReturnType<ManagementTransport["runtimeStatus"]>>>(() => {});
    const transport = management({ runtimeStatus: vi.fn(() => pending) });
    render(<TestedApp drafts={drafts()} transport={transport} research={research()} />);
    expect(screen.getByText("Aucun flux d’activité Project-scopé n’est fourni. Aucun événement n’est inventé.")).toBeTruthy();
    expect(transport.projects).not.toHaveBeenCalled();
    expect(screen.queryByText("Mission en cours")).toBeNull();
  });
  it("keeps disconnected state truthful and does not fetch downstream data", async () => {
    const transport = management({ status: vi.fn(async () => { throw new Error("secret failure text"); }) });
    render(<TestedApp drafts={drafts()} transport={transport} research={research()} />);
    nav("Projets");
    expect(await screen.findByText(/Les données du backend restent indisponibles/)).toBeTruthy();
    expect(transport.projects).not.toHaveBeenCalled();
    expect(screen.queryByText("secret failure text")).toBeNull();
  });
  it("shows configuration count separately from missions and model residency", async () => {
    render(<TestedApp drafts={drafts()} transport={management()} research={research()} />);
    expect(await screen.findByRole("option", { name: "alpha · alpha" })).toBeTruthy();
    nav("Projets"); expect(await screen.findByRole("button", { name: /alpha · crypto/ })).toBeTruthy();
    expect(screen.queryByText("Mission en cours")).toBeNull();
    nav("Modèles"); expect(screen.getByText("Lecture non demandée. Aucun appel d’inférence n’est effectué pour renseigner cette vue.")).toBeTruthy();
  });
  it("never exposes create, initialize, start, stop, select-profile or inference actions", async () => {
    const transport = management(); const engine = research();
    render(<TestedApp drafts={drafts()} transport={transport} research={engine} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "alpha · alpha" })).toBeTruthy());
    for (const view of ["Missions", "Capacités", "Modèles", "Sécurité", "Projets"]) nav(view);
    expect(screen.queryByRole("button", { name: /Initialiser|Démarrer|Arrêter|Sélectionner codex|Approuver|Inférence/ })).toBeNull();
    expect(transport.validation).not.toHaveBeenCalled();
    expect(engine.status).toHaveBeenCalled();
  });
  it("shows an empty catalogue as empty, not disconnected", async () => {
    render(<TestedApp drafts={drafts()} transport={management({ projects: vi.fn(async () => ({ projects: [], configuration_valid: true, runtime_checked: false })) })} research={research()} />);
    nav("Projets");
    expect(await screen.findByText("Aucun Project configuré")).toBeTruthy();
  });
  it("creates a Project only after confirmation and verifies the fresh catalog", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    let catalog: Project[] = [];
    const createProject = vi.fn(async (input: {id:string;name:string;domain:string}) => {
      catalog = [{ ...project(input.id), name: input.name, domain: input.domain }];
      return { project: catalog[0], created: true, durability_confirmed: true, engine_started: false, storage_initialized: false };
    });
    const transport = management({
      domains: vi.fn(async () => ({ domains: [{ id: "crypto", tagline: null, diagnostic: null, configuration_valid: true }], runtime_checked: false })),
      projects: vi.fn(async () => ({ projects: catalog, configuration_valid: true, runtime_checked: false })),
      createProject,
    });
    const store = drafts();
    render(<TestedApp drafts={store} transport={transport} research={research()} />);
    nav("Projets");
    expect(await screen.findByText("Aucun Project configuré")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Identifiant"), { target: { value: "personal" } });
    fireEvent.change(screen.getByLabelText("Nom affiché"), { target: { value: "Personnel" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Créer le Project" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Créer le Project" }));
    expect(createProject).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Créer le Project" }));
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Project créé et confirmé dans le catalogue/)).toBeTruthy());
    expect(createProject).toHaveBeenCalledWith({ id: "personal", name: "Personnel", domain: "crypto" });
    expect(store.setPreferred).not.toHaveBeenCalledWith("personal");
    expect(screen.getByText(/aucun moteur ni stockage agent démarré/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Créer le Project" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Personnel personal · crypto/ }));
    await waitFor(() => expect(store.setPreferred).toHaveBeenCalledWith("personal"));
  });
  it("keeps an uncertain Project POST from being sent twice", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const createProject = vi.fn(async () => { throw { kind: "UNCERTAIN_CREATE" }; });
    render(<TestedApp drafts={drafts()} transport={management({
      domains: vi.fn(async () => ({ domains: [{ id: "crypto", tagline: null, diagnostic: null, configuration_valid: true }], runtime_checked: false })),
      createProject,
    })} research={research()} />);
    nav("Projets");
    fireEvent.change(screen.getByLabelText("Identifiant"), { target: { value: "personal" } });
    fireEvent.change(screen.getByLabelText("Nom affiché"), { target: { value: "Personnel" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Créer le Project" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Créer le Project" }));
    await waitFor(() => expect(screen.getByText(/Résultat de création incertain/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Créer le Project" }));
    expect(createProject).toHaveBeenCalledTimes(1);
  });
  it("keeps Project detail within the selected catalog identity", async () => {
    const transport = management();
    render(<TestedApp drafts={drafts()} transport={transport} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    expect(await screen.findByText("Identifiant")).toBeTruthy();
    expect(transport.project).toHaveBeenCalledWith("alpha");
    fireEvent.click(screen.getByRole("button", { name: /beta · crypto/ }));
    await waitFor(() => expect(transport.project).toHaveBeenCalledWith("beta"));
    expect(screen.queryByText("/tmp/alpha/vault")).toBeNull();
  });
  it("hides a Project detail after its read fails on refresh", async () => {
    const detail = vi.fn().mockResolvedValueOnce(project("alpha")).mockRejectedValueOnce(new Error("private detail"));
    render(<TestedApp drafts={drafts()} transport={management({ project: detail })} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    expect(await screen.findByRole("heading", { name: "alpha" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualiser" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    expect(await screen.findByText("Détail indisponible ou invalide.")).toBeTruthy();
    expect(document.querySelector(".projects-grid .panel:last-child dl")).toBeNull();
    expect(screen.queryByText("private detail")).toBeNull();
  });
  it("rejects a detail response for a different Project", async () => {
    const transport = management({ project: vi.fn(async () => project("beta")) });
    render(<TestedApp drafts={drafts()} transport={transport} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    await waitFor(() => expect(transport.project).toHaveBeenCalledWith("alpha"));
    expect(document.querySelector(".projects-grid .panel:last-child dl")).toBeNull();
  });
  it("rejects malformed catalog data and does not show a fabricated count", async () => {
    const transport = management({ projects: vi.fn(async () => ({ projects: "secret" } as never)) });
    render(<TestedApp drafts={drafts()} transport={transport} research={research()} />);
    nav("Projets");
    expect(await screen.findByRole("alert", { name: "" })).toBeTruthy();
    expect(screen.getByText("Catalogue indisponible ou invalide.")).toBeTruthy();
  });
  it("shows blocked backend profile facts only when a research engine is initialized", async () => {
    const engineStatus: ResearchEngineStatus = { state: "PAUSED", project_id: "alpha", domain: "crypto", diagnostic: null,
      runtime: { schema_version: 1, project: "alpha", domain: "crypto", code_sha: null,
        initialized: true, awakening_ready: false, research_state: "PAUSED", autonomous_task_alive: false,
        profile: "codex", profile_status: "BLOCKED" } };
    const engine = research({ status: vi.fn(async () => engineStatus) });
    render(<TestedApp drafts={drafts()} transport={management()} research={engine} />);
    nav("Modèles");
    expect(await screen.findByText("Workloads bloqués")).toBeTruthy();
    expect(screen.getByText("Lecture non demandée. Aucun appel d’inférence n’est effectué pour renseigner cette vue.")).toBeTruthy();
    nav("Sécurité");
    const security = screen.getByText("SAFE_FOR_WORKLOADS").closest(".fact");
    expect(security?.textContent).toContain("Non exposé en temps réel");
  });
  it("separates other-Project engine state from selected Project", async () => {
    const engine = research({ status: vi.fn(async () => ({ ...stopped, state: "PAUSED" as const, project_id: "alpha" })) });
    render(<TestedApp drafts={drafts()} transport={management()} research={engine} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /beta · crypto/ }));
    const detail = (await screen.findByText("Détail du Project")).closest("section")!;
    await waitFor(() => expect(within(detail).getByText("Aucun moteur attribué observé")).toBeTruthy());
  });
  it("does not retry a failed backend call without user action", async () => {
    const status = vi.fn(async () => { throw new Error("offline"); });
    render(<TestedApp drafts={drafts()} transport={management({ status })} research={research()} />);
    nav("Projets");
    await screen.findByText(/Les données du backend restent indisponibles/);
    expect(status).toHaveBeenCalledTimes(1);
  });
  it("hides previously observed data after a failed refresh", async () => {
    const status = vi.fn().mockResolvedValueOnce({ api_version: "1", management_available: true })
      .mockRejectedValueOnce(new Error("private upstream detail"));
    render(<TestedApp drafts={drafts()} transport={management({ status })} research={research()} />);
    nav("Projets");
    expect(await screen.findByRole("button", { name: /alpha · crypto/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualiser" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    expect(await screen.findByText(/Les données du backend restent indisponibles/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /alpha · crypto/ })).toBeNull();
    expect(screen.queryByText("private upstream detail")).toBeNull();
    expect(status).toHaveBeenCalledTimes(2);
  });
  it("scopes mission and capability evidence to the selected Project", async () => {
    const mission = (id: string) => ({ mission_id: id === "alpha" ? "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000002",
      project_id: id, objective: `Objective ${id}`, state: "PENDING_HUMAN_APPROVAL", revision: 1,
      stages: ["MISSION_RECEIVED", "PENDING_HUMAN_APPROVAL"], capability_gaps: [], failure_codes: [],
      resume_eligible: true, receipt_count: 0, created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
      evidence_kind: "HISTORICAL_CHECKPOINT" as const });
    const transport = management({ missions: vi.fn(async (id) => ({ project_id: id, missions: [mission(id)], next_offset: null, source: "DISPOSABLE_POSTGRESQL" as const })),
      mission: vi.fn(async (id) => mission(id)),
      capabilities: vi.fn(async (id) => ({ project_id: id, capabilities: id === "alpha" ? [{ capability_id: "synthetic_read", project_id: id,
        version: "1", documentation_digest: "a".repeat(64), state: "PENDING_APPROVAL", validation_state: "PASSED",
        approval_kind: "NONE_RECORDED" as const, source_identity: "fixture:local", updated_at: "2026-10-21T00:00:00Z",
        source: "DISPOSABLE_POSTGRESQL" as const }] : [], next_offset: null, source: "DISPOSABLE_POSTGRESQL" as const })) });
    render(<TestedApp drafts={drafts()} transport={transport} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    nav("Missions");
    fireEvent.click(await screen.findByRole("button", { name: /Objective alpha/ }));
    expect(await screen.findByText("Dernier checkpoint, pas état live")).toBeTruthy();
    nav("Capacités");
    expect(await screen.findByText("synthetic_read")).toBeTruthy();
    nav("Projets");
    fireEvent.click(screen.getByRole("button", { name: /beta · crypto/ }));
    nav("Missions");
    expect(await screen.findByRole("button", { name: /Objective beta/ })).toBeTruthy();
    expect(screen.queryByText("Objective alpha")).toBeNull();
    nav("Capacités");
    expect(await screen.findByText("Aucune capacité enregistrée")).toBeTruthy();
    expect(screen.queryByText("synthetic_read")).toBeNull();
  });
  it("treats missing Project read service as unavailable, not empty", async () => {
    const transport = management({ missions: vi.fn(async () => { throw new Error("private SQL detail"); }) });
    render(<TestedApp drafts={drafts()} transport={transport} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    nav("Missions");
    expect(await screen.findByText(/Registre temporairement indisponible ou incompatible/)).toBeTruthy();
    expect(screen.queryByText("private SQL detail")).toBeNull();
    expect(transport.missions).toHaveBeenCalledTimes(1);
  });
  it("hides an old mission page after a failed manual refresh", async () => {
    const first = { project_id: "alpha", missions: [{ mission_id: "00000000-0000-0000-0000-000000000001",
      project_id: "alpha", objective: "Old checkpoint", state: "MISSION_RECEIVED", revision: 0,
      stages: ["MISSION_RECEIVED"], capability_gaps: [], failure_codes: [], resume_eligible: true,
      receipt_count: 0, created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
      evidence_kind: "HISTORICAL_CHECKPOINT" as const }], next_offset: null, source: "DISPOSABLE_POSTGRESQL" as const };
    const missions = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error("private backend"));
    render(<TestedApp drafts={drafts()} transport={management({ missions })} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    nav("Missions");
    expect(await screen.findByRole("button", { name: /Old checkpoint/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualiser" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    expect(await screen.findByText(/Registre temporairement indisponible ou incompatible/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Old checkpoint/ })).toBeNull();
    expect(screen.queryByText("private backend")).toBeNull();
  });
  it("reads local model status only after manual action and treats unloaded as healthy", async () => {
    const models = local();
    render(<TestedApp drafts={drafts()} transport={management()} research={research()} ollama={models} />);
    nav("Modèles");
    expect(models.status).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lire l’état local" }));
    expect(await screen.findByText("model:1")).toBeTruthy();
    expect(screen.getByText("Aucun modèle résident")).toBeTruthy();
    expect(screen.getByText("Placement CPU / GPU").nextElementSibling?.textContent).toBe("Inconnu");
    expect(models.status).toHaveBeenCalledTimes(1);
  });
  it("shows an unreachable local model as unavailable and never retries", async () => {
    const status = vi.fn(async () => ({ ...localStatus, service_state: "UNAVAILABLE" as const,
      installed_state: "UNAVAILABLE" as const, loaded_state: "UNAVAILABLE" as const,
      installed: [], loaded: [], failure_class: "CONNECT" as const }));
    render(<TestedApp drafts={drafts()} transport={management()} research={research()} ollama={local({ status })} />);
    nav("Modèles");
    fireEvent.click(screen.getByRole("button", { name: "Lire l’état local" }));
    expect(await screen.findByText("Liste indisponible.")).toBeTruthy();
    expect(screen.getByText("Connectivité Ollama").nextElementSibling?.textContent).toBe("Indisponible");
    expect(status).toHaveBeenCalledTimes(1);
  });
  it("hides a previous local model result after a failed manual refresh", async () => {
    const status = vi.fn().mockResolvedValueOnce(localStatus).mockRejectedValueOnce(new Error("private model metadata"));
    render(<TestedApp drafts={drafts()} transport={management()} research={research()} ollama={local({ status })} />);
    nav("Modèles");
    fireEvent.click(screen.getByRole("button", { name: "Lire l’état local" }));
    expect(await screen.findByText("model:1")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Lire l’état local" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Lire l’état local" }));
    expect(await screen.findByText(/Statut local indisponible ou incompatible/)).toBeTruthy();
    expect(screen.queryByText("model:1")).toBeNull();
    expect(screen.queryByText("private model metadata")).toBeNull();
    expect(status).toHaveBeenCalledTimes(2);
  });
  it("creates, reopens, edits, duplicates and deletes a local brief across window restarts", async () => {
    const store = memoryDrafts(); const backend = management();
    const first = render(<TestedApp drafts={store} transport={backend} research={research()} />);
    await screen.findByRole("option", { name: "alpha · alpha" });
    fireEvent.change(screen.getByLabelText("Espace actuel"), { target: { value: "alpha" } });
    await waitFor(() => expect(store.setPreferred).toHaveBeenCalledWith("alpha"));
    nav("Missions");
    fireEvent.click(await screen.findByRole("button", { name: /Nouveau brief/ }));
    fireEvent.change(screen.getByLabelText(/Titre ·/), { target: { value: "Mon brief" } });
    fireEvent.change(screen.getByLabelText(/Objectif ·/), { target: { value: "Identifier la source" } });
    fireEvent.change(screen.getByLabelText(/Critères de vérification ·/), { target: { value: "Une source vérifiée" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer localement" }));
    await waitFor(() => expect(store.create).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: /Mon brief Local/ })).toBeTruthy();
    first.unmount();
    render(<TestedApp drafts={store} transport={backend} research={research()} />);
    await waitFor(() => expect((screen.getByLabelText("Espace actuel") as HTMLSelectElement).value).toBe("alpha"));
    nav("Missions");
    fireEvent.click(await screen.findByRole("button", { name: /Mon brief Local/ }));
    expect((await screen.findByLabelText(/Objectif ·/) as HTMLTextAreaElement).value).toBe("Identifier la source");
    fireEvent.change(screen.getByLabelText(/Objectif ·/), { target: { value: "Identifier deux sources" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer localement" }));
    await waitFor(() => expect(store.update).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Dupliquer la version enregistrée" }));
    expect(await screen.findByRole("button", { name: /Copie · Mon brief Local/ })).toBeTruthy();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer…" }));
    await waitFor(() => expect(store.delete).toHaveBeenCalledTimes(1));
    confirm.mockRestore();
    expect(screen.queryByRole("button", { name: /Copie · Mon brief Local/ })).toBeNull();
    expect(backend.mission).not.toHaveBeenCalled();
  });
  it("guards unsaved text and isolates drafts when changing Projects", async () => {
    const store = memoryDrafts();
    render(<TestedApp drafts={store} transport={management()} research={research()} />);
    await screen.findByRole("option", { name: "alpha · alpha" });
    fireEvent.change(screen.getByLabelText("Espace actuel"), { target: { value: "alpha" } });
    nav("Missions");
    fireEvent.click(await screen.findByRole("button", { name: /Nouveau brief/ }));
    fireEvent.change(screen.getByLabelText(/Titre ·/), { target: { value: "Non enregistré" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    nav("Projets");
    expect(screen.getByRole("heading", { name: "Nouveau brief" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Espace actuel"), { target: { value: "beta" } });
    expect((screen.getByLabelText("Espace actuel") as HTMLSelectElement).value).toBe("alpha");
    expect(store.setPreferred).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("Espace actuel"), { target: { value: "beta" } });
    await waitFor(() => expect((screen.getByLabelText("Espace actuel") as HTMLSelectElement).value).toBe("beta"));
    expect(screen.queryByDisplayValue("Non enregistré")).toBeNull();
    confirm.mockRestore();
  });
  it("keeps the native Project selector synchronized and keyboard focused after a switch", async () => {
    render(<TestedApp drafts={memoryDrafts()} transport={management()} research={research()} />);
    await screen.findByRole("option", { name: "alpha · alpha" });
    const initial = screen.getByLabelText("Espace actuel") as HTMLSelectElement;
    initial.focus();
    fireEvent.change(initial, { target: { value: "alpha" } });
    await waitFor(() => {
      const current = screen.getByLabelText("Espace actuel") as HTMLSelectElement;
      expect(current.value).toBe("alpha");
      expect(current).not.toBe(initial);
      expect(document.activeElement).toBe(current);
    });
    fireEvent.change(screen.getByLabelText("Espace actuel"), { target: { value: "beta" } });
    await waitFor(() => {
      const current = screen.getByLabelText("Espace actuel") as HTMLSelectElement;
      expect(current.value).toBe("beta");
      expect(document.activeElement).toBe(current);
    });
  });
  it("asks once before replacing an unsaved brief from the command palette", async () => {
    render(<TestedApp drafts={memoryDrafts()} transport={management()} research={research()} />);
    await screen.findByRole("option", { name: "alpha · alpha" });
    fireEvent.change(screen.getByLabelText("Espace actuel"), { target: { value: "alpha" } });
    nav("Missions");
    fireEvent.click(await screen.findByRole("button", { name: /Nouveau brief/ }));
    fireEvent.change(screen.getByLabelText(/Titre ·/), { target: { value: "Texte non sauvé" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.click(await screen.findByRole("option", { name: /Nouveau brief local/ }));
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
  it("shows remembered local drafts while Management is unavailable", async () => {
    const store = memoryDrafts();
    await store.setPreferred("alpha");
    await store.create({ project_id: "alpha", title: "Hors ligne", objective: "Préparer un objectif", verification_criteria: "Vérifier plus tard" });
    render(<TestedApp drafts={store} transport={management({ runtimeStatus: vi.fn(async () => ({ state: "STOPPED" as const, diagnostic: null })) })} research={research()} />);
    nav("Missions");
    expect(await screen.findByRole("button", { name: /Hors ligne Local/ })).toBeTruthy();
    expect(screen.getByText(/Identité du Project mémorisée localement/)).toBeTruthy();
    expect(screen.getByText("Source backend non vérifiée. L’historique est indisponible.")).toBeTruthy();
  });
});

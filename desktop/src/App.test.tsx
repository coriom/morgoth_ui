import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as DesktopApp } from "./App";
import type { ManagementTransport, Project, ResearchTransport, ResearchEngineStatus } from "./transport";

afterEach(cleanup);

const project = (id: string): Project => ({
  id, name: id, domain: "crypto", legacy: false, manifest_path: `/tmp/${id}/project.yaml`,
  workspace_root: `/tmp/${id}/workspace`, postgres_schema: id, chroma_prefix: id,
  vault_dir: `/tmp/${id}/vault`, runtime_dir: `/tmp/${id}/runtime`,
  configuration_valid: true, runtime_checked: false,
});
function mockTransport(overrides: Partial<ManagementTransport> = {}): ManagementTransport {
  return {
    runtimeStatus: vi.fn(async () => ({ state: "READY" as const, diagnostic: null })),
    status: vi.fn(async () => ({ api_version: "1", management_available: true })),
    domains: vi.fn(async () => ({ domains: [
      { id: "crypto", tagline: "Marchés", configuration_valid: true, diagnostic: null },
      { id: "broken", tagline: null, configuration_valid: false, diagnostic: "INVALID_DOMAIN_PACK" },
    ], runtime_checked: false })),
    projects: vi.fn(async () => ({ projects: [project("research_a"), project("research_b")], configuration_valid: true, runtime_checked: false })),
    project: vi.fn(async (id) => project(id)),
    validation: vi.fn(async (id) => ({ project: project(id), configuration_valid: true, runtime_checked: false })),
    create: vi.fn(async (input) => ({ project: project(input.id), created: true, durability_confirmed: true,
      engine_started: false, storage_initialized: false })),
    ...overrides,
  };
}
const stopped: ResearchEngineStatus = { state: "STOPPED", project_id: null, domain: null, diagnostic: null, runtime: null };
const blockedCodex = { installed: true, authenticated: true, sandbox_available: true,
  sandbox_qualified: false, workloads_ready: false };
function mockResearch(overrides: Partial<ResearchTransport> = {}): ResearchTransport {
  return {
    status: vi.fn(async () => stopped), initialize: vi.fn(async () => stopped),
    profiles: vi.fn(async () => ({ schema_version: 1, current: "legacy", recommended: null, profiles: [], codex: blockedCodex })),
    selectProfile: vi.fn(async () => ({ schema_version: 1, current: "codex", recommended: null, profiles: [], codex: blockedCodex })),
    start: vi.fn(async () => stopped), stop: vi.fn(async () => stopped), ...overrides,
  };
}
function App({ transport, research = mockResearch() }: { transport: ManagementTransport; research?: ResearchTransport }) {
  return <DesktopApp transport={transport} research={research} />;
}
async function fillAndCreate(id = "new_project") {
  fireEvent.change(screen.getByLabelText("Nom affiché"), { target: { value: "Nouveau projet" } });
  fireEvent.change(screen.getByLabelText("Identifiant machine"), { target: { value: id } });
  fireEvent.change(screen.getByLabelText("Domaine installé"), { target: { value: "crypto" } });
  fireEvent.click(screen.getByRole("button", { name: "Créer le projet" }));
}

describe("Projects screen", () => {
  it("keeps loading and catalog failure states explicit", async () => {
    const pending = new Promise<Awaited<ReturnType<ManagementTransport["status"]>>>(() => {});
    const first = render(<App transport={mockTransport({ status: vi.fn(() => pending) })} />);
    expect(screen.getByText("Démarrage de la gestion…")).toBeTruthy();
    first.unmount();
    render(<App transport={mockTransport({ projects: vi.fn(async () => { throw new Error("offline catalog"); }) })} />);
    expect(await screen.findByText(/Catalogue indisponible/)).toBeTruthy();
  });
  it("shows disconnected state without loading catalog", async () => {
    const transport = mockTransport({ status: vi.fn(async () => { throw new Error("offline"); }) });
    render(<App transport={transport} />);
    expect(await screen.findByText("Gestion locale indisponible")).toBeTruthy();
    expect(transport.projects).not.toHaveBeenCalled();
  });
  it("opens in STARTING and FAILED without calling project operations", async () => {
    const pending = new Promise<Awaited<ReturnType<ManagementTransport["runtimeStatus"]>>>(() => {});
    const starting = mockTransport({ runtimeStatus: vi.fn(() => pending) });
    const first = render(<App transport={starting} />);
    expect(screen.getByText("Démarrage de la gestion…")).toBeTruthy();
    expect(starting.projects).not.toHaveBeenCalled();
    first.unmount();
    const failed = mockTransport({ runtimeStatus: vi.fn(async () => ({ state: "FAILED" as const, diagnostic: "BACKEND_MISMATCH" })) });
    render(<App transport={failed} />);
    expect(await screen.findByText("Gestion locale indisponible")).toBeTruthy();
    expect(failed.status).not.toHaveBeenCalled();
    expect(failed.projects).not.toHaveBeenCalled();
  });
  it("loads domains and separates project details and validation", async () => {
    const transport = mockTransport();
    render(<App transport={transport} />);
    expect(await screen.findByRole("button", { name: /research_a/ })).toBeTruthy();
    expect(screen.getByText(/broken indisponible/)).toBeTruthy();
    expect(screen.queryByRole("option", { name: /broken/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /research_a/ }));
    expect(await screen.findByText("/tmp/research_a/vault")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Valider la configuration" }));
    expect(await screen.findByText(/Configuration valide ; exécution non vérifiée/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /research_b/ }));
    expect(await screen.findByText("/tmp/research_b/vault")).toBeTruthy();
    expect(screen.queryByText("/tmp/research_a/vault")).toBeNull();
    expect(transport.validation).toHaveBeenCalledWith("research_a");
    expect(screen.getByText(/Recherche : non vérifiée/)).toBeTruthy();
  });
  it("creates once, refreshes catalog and shows durability warning", async () => {
    let finish!: (value: Awaited<ReturnType<ManagementTransport["create"]>>) => void;
    const create = vi.fn(() => new Promise<Awaited<ReturnType<ManagementTransport["create"]>>>(resolve => { finish = resolve; }));
    const transport = mockTransport({ create });
    render(<App transport={transport} />);
    await screen.findByRole("button", { name: /research_a/ });
    await fillAndCreate();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Création en cours…" })).toHaveProperty("disabled", true);
    finish({ project: project("new_project"), created: true, durability_confirmed: false,
      engine_started: false, storage_initialized: false });
    expect(await screen.findByText(/confirmation de durabilité indisponible/)).toBeTruthy();
    expect(transport.projects).toHaveBeenCalledTimes(2);
  });
  it("reports conflict without selecting another project", async () => {
    const transport = mockTransport({ create: vi.fn(async () => { throw { kind: "API", code: "ALREADY_EXISTS", status: 409 }; }) });
    render(<App transport={transport} />);
    await screen.findByRole("button", { name: /research_a/ });
    await fillAndCreate("research_a");
    expect(await screen.findByText(/Aucun projet n’a été écrasé/)).toBeTruthy();
    expect(screen.getByText(/Sélectionnez un projet/)).toBeTruthy();
  });
  it("treats timeout as uncertain and offers reconciliation", async () => {
    const transport = mockTransport({ create: vi.fn(async () => { throw { kind: "UNCERTAIN_CREATE" }; }) });
    render(<App transport={transport} />);
    await screen.findByRole("button", { name: /research_a/ });
    await fillAndCreate();
    expect(await screen.findByText(/Résultat de création incertain/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier le catalogue" }));
    await waitFor(() => expect(transport.projects).toHaveBeenCalledTimes(2));
  });
  it("shows empty catalog honestly", async () => {
    render(<App transport={mockTransport({ projects: vi.fn(async () => ({ projects: [], configuration_valid: true, runtime_checked: false })) })} />);
    expect(await screen.findByText("Aucun projet configuré.")).toBeTruthy();
  });
});

describe("one selected research engine", () => {
  const paused: ResearchEngineStatus = { state: "PAUSED", project_id: "research_a", domain: "crypto", diagnostic: null,
    runtime: { schema_version: 1, project: "research_a", domain: "crypto", code_sha: "a".repeat(40),
      initialized: true, awakening_ready: true, research_state: "PAUSED", autonomous_task_alive: false,
      profile: "legacy", profile_status: "BLOCKED" } };
  const profileList = { schema_version: 1, current: "legacy", recommended: null, codex: blockedCodex, profiles: [
    { id: "legacy", status: "BLOCKED" as const, reason: "synthetic", providers: {} },
    { id: "codex", status: "BLOCKED" as const, reason: "synthetic", providers: {} },
  ] };

  it("initializes only after explicit click and keeps other Project active", async () => {
    const research = mockResearch({ initialize: vi.fn(async () => ({ ...paused, state: "STARTING" as const })) });
    render(<App transport={mockTransport()} research={research} />);
    fireEvent.click(await screen.findByRole("button", { name: /research_a/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Initialiser le moteur" }));
    await waitFor(() => expect(research.initialize).toHaveBeenCalledWith("research_a"));
  });
  it("shows blocked Codex and refuses research start", async () => {
    const research = mockResearch({ status: vi.fn(async () => paused), profiles: vi.fn(async () => profileList),
      selectProfile: vi.fn(async () => ({ ...profileList, current: "codex" })) });
    render(<App transport={mockTransport()} research={research} />);
    fireEvent.click(await screen.findByRole("button", { name: /research_a/ }));
    expect(await screen.findByText(/Moteur prêt · recherche en pause/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sélectionner codex" })).toHaveProperty("disabled", true));
    expect(screen.getByRole("button", { name: "Sélectionner codex" }).closest("li")?.textContent).toContain("codex · BLOCKED");
    expect(screen.getByText("Confinement qualifié").nextElementSibling?.textContent).toBe("Non");
    expect(screen.getByText("Charges de recherche Codex").nextElementSibling?.textContent).toBe("Bloquées");
    expect(screen.queryByRole("button", { name: "Démarrer la recherche" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sélectionner claude" })).toBeNull();
    expect(research.selectProfile).not.toHaveBeenCalled();
  });
  it("does not start when a profile says READY but sandbox qualification is false", async () => {
    const readyProfile = { ...profileList, current: "codex", profiles: [
      { id: "codex", status: "READY" as const, reason: "synthetic", providers: {} },
    ] };
    const research = mockResearch({
      status: vi.fn(async () => ({ ...paused, runtime: { ...paused.runtime!, profile: "codex", profile_status: "READY" as const } })),
      profiles: vi.fn(async () => readyProfile),
    });
    render(<App transport={mockTransport()} research={research} />);
    fireEvent.click(await screen.findByRole("button", { name: /research_a/ }));
    expect(await screen.findByText("Charges de recherche Codex")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Démarrer la recherche" })).toBeNull();
    expect(research.start).not.toHaveBeenCalled();
  });
  it("does not rebind a running engine when another Project is selected", async () => {
    const running = { ...paused, state: "RUNNING" as const, runtime: { ...paused.runtime!, research_state: "RUNNING" } };
    const research = mockResearch({ status: vi.fn(async () => running), profiles: vi.fn(async () => profileList) });
    render(<App transport={mockTransport()} research={research} />);
    fireEvent.click(await screen.findByRole("button", { name: /research_b/ }));
    expect(await screen.findByText(/Le moteur du projet research_a reste actif/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Initialiser le moteur" })).toBeNull();
    expect(research.stop).not.toHaveBeenCalled();
  });
  it("management remains usable when research status fails", async () => {
    const research = mockResearch({ status: vi.fn(async () => { throw { kind: "RESEARCH_UNAVAILABLE" }; }) });
    render(<App transport={mockTransport()} research={research} />);
    fireEvent.click(await screen.findByRole("button", { name: /research_a/ }));
    expect(await screen.findByText(/État du moteur indisponible/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /research_b/ })).toBeTruthy();
  });
});

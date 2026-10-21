import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./App";
import type { ManagementTransport, Project, ResearchEngineStatus, ResearchTransport } from "./transport";

afterEach(cleanup);
const project = (id: string): Project => ({ id, name: id, domain: "crypto", legacy: false,
  configuration_valid: true, runtime_checked: false });
const stopped: ResearchEngineStatus = { state: "STOPPED", project_id: null, domain: null, diagnostic: null, runtime: null };
function management(overrides: Partial<ManagementTransport> = {}): ManagementTransport {
  return { runtimeStatus: vi.fn(async () => ({ state: "READY" as const, diagnostic: null })),
    status: vi.fn(async () => ({ api_version: "1", management_available: true })),
    domains: vi.fn(async () => ({ domains: [], runtime_checked: false })),
    projects: vi.fn(async () => ({ projects: [project("alpha"), project("beta")], configuration_valid: true, runtime_checked: false })),
    project: vi.fn(async (id) => project(id)), validation: vi.fn(async (id) => ({ project: project(id), configuration_valid: true, runtime_checked: false })),
    missions: vi.fn(async (id) => ({ project_id: id, missions: [], next_offset: null, source: "DISPOSABLE_POSTGRESQL" as const })),
    mission: vi.fn(async () => { throw new Error("not found"); }),
    capabilities: vi.fn(async (id) => ({ project_id: id, capabilities: [], next_offset: null, source: "DISPOSABLE_POSTGRESQL" as const })),
    ...overrides };
}
function research(overrides: Partial<ResearchTransport> = {}): ResearchTransport {
  const profiles = { schema_version: 1, current: "codex", recommended: null,
    codex: { installed: true, authenticated: true, sandbox_available: true, sandbox_qualified: false, workloads_ready: false },
    profiles: [{ id: "codex", status: "BLOCKED" as const, reason: "gate", providers: {} }] };
  return { status: vi.fn(async () => stopped), profiles: vi.fn(async () => profiles), ...overrides };
}
function nav(label: string) { fireEvent.click(screen.getByRole("button", { name: new RegExp(label) })); }

describe("read-only command center", () => {
  it("reports loading without claiming operational readiness", () => {
    const pending = new Promise<Awaited<ReturnType<ManagementTransport["runtimeStatus"]>>>(() => {});
    const transport = management({ runtimeStatus: vi.fn(() => pending) });
    render(<App transport={transport} research={research()} />);
    expect(screen.getByText("Connexion en cours")).toBeTruthy();
    expect(transport.projects).not.toHaveBeenCalled();
    expect(screen.getByText("Lecture Project")).toBeTruthy();
  });
  it("keeps disconnected state truthful and does not fetch downstream data", async () => {
    const transport = management({ status: vi.fn(async () => { throw new Error("secret failure text"); }) });
    render(<App transport={transport} research={research()} />);
    expect(await screen.findByText("Gestion locale indisponible")).toBeTruthy();
    expect(transport.projects).not.toHaveBeenCalled();
    expect(screen.queryByText("secret failure text")).toBeNull();
  });
  it("shows configuration count separately from missions and model residency", async () => {
    render(<App transport={management()} research={research()} />);
    expect(await screen.findByText("Gestion locale accessible")).toBeTruthy();
    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.getByText("Lecture Project")).toBeTruthy();
    expect(screen.getByText("Modèle Ollama chargé").nextElementSibling?.textContent).toBe("Non exposé");
  });
  it("never exposes create, initialize, start, stop, select-profile or inference actions", async () => {
    const transport = management(); const engine = research();
    render(<App transport={transport} research={engine} />);
    await screen.findByText("Gestion locale accessible");
    for (const view of ["Missions", "Capacités", "Modèles", "Sécurité", "Projets"]) nav(view);
    expect(screen.queryByRole("button", { name: /Créer|Initialiser|Démarrer|Arrêter|Sélectionner codex|Approuver|Inférence/ })).toBeNull();
    expect(transport.validation).not.toHaveBeenCalled();
    expect(engine.status).toHaveBeenCalled();
  });
  it("shows an empty catalogue as empty, not disconnected", async () => {
    render(<App transport={management({ projects: vi.fn(async () => ({ projects: [], configuration_valid: true, runtime_checked: false })) })} research={research()} />);
    nav("Projets");
    expect(await screen.findByText("Aucun Project configuré")).toBeTruthy();
  });
  it("keeps Project detail within the selected catalog identity", async () => {
    const transport = management();
    render(<App transport={transport} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    expect(await screen.findByText("Identifiant")).toBeTruthy();
    expect(transport.project).toHaveBeenCalledWith("alpha");
    fireEvent.click(screen.getByRole("button", { name: /beta · crypto/ }));
    await waitFor(() => expect(transport.project).toHaveBeenCalledWith("beta"));
    expect(screen.queryByText("/tmp/alpha/vault")).toBeNull();
  });
  it("rejects a detail response for a different Project", async () => {
    const transport = management({ project: vi.fn(async () => project("beta")) });
    render(<App transport={transport} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    await waitFor(() => expect(transport.project).toHaveBeenCalledWith("alpha"));
    expect(screen.queryByText("Identifiant")).toBeNull();
  });
  it("rejects malformed catalog data and does not show a fabricated count", async () => {
    const transport = management({ projects: vi.fn(async () => ({ projects: "secret" } as never)) });
    render(<App transport={transport} research={research()} />);
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
    render(<App transport={management()} research={engine} />);
    nav("Modèles");
    expect(await screen.findByText("Workloads bloqués")).toBeTruthy();
    expect(screen.getByText("Connectivité Ollama").nextElementSibling?.textContent).toBe("Non exposée");
    nav("Sécurité");
    const security = screen.getByText("SAFE_FOR_WORKLOADS").closest(".fact");
    expect(security?.textContent).toContain("Non exposé en temps réel");
  });
  it("separates other-Project engine state from selected Project", async () => {
    const engine = research({ status: vi.fn(async () => ({ ...stopped, state: "PAUSED" as const, project_id: "alpha" })) });
    render(<App transport={management()} research={engine} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /beta · crypto/ }));
    const detail = screen.getByText("Détail du Project").closest("section")!;
    await waitFor(() => expect(within(detail).getByText("Aucun moteur attribué observé")).toBeTruthy());
  });
  it("does not retry a failed backend call without user action", async () => {
    const status = vi.fn(async () => { throw new Error("offline"); });
    render(<App transport={management({ status })} research={research()} />);
    await screen.findByText("Gestion locale indisponible");
    expect(status).toHaveBeenCalledTimes(1);
  });
  it("hides previously observed data after a failed refresh", async () => {
    const status = vi.fn().mockResolvedValueOnce({ api_version: "1", management_available: true })
      .mockRejectedValueOnce(new Error("private upstream detail"));
    render(<App transport={management({ status })} research={research()} />);
    nav("Projets");
    expect(await screen.findByRole("button", { name: /alpha · crypto/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualiser" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    expect(await screen.findByText("Gestion locale indisponible")).toBeTruthy();
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
    render(<App transport={transport} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    nav("Missions");
    fireEvent.click(await screen.findByRole("button", { name: "Objective alpha" }));
    expect(await screen.findByText("Dernier checkpoint, pas statut live")).toBeTruthy();
    nav("Capacités");
    expect(await screen.findByText("synthetic_read")).toBeTruthy();
    nav("Projets");
    fireEvent.click(screen.getByRole("button", { name: /beta · crypto/ }));
    nav("Missions");
    expect(await screen.findByRole("button", { name: "Objective beta" })).toBeTruthy();
    expect(screen.queryByText("Objective alpha")).toBeNull();
    nav("Capacités");
    expect(await screen.findByText("Aucune capacité enregistrée")).toBeTruthy();
    expect(screen.queryByText("synthetic_read")).toBeNull();
  });
  it("treats missing Project read service as unavailable, not empty", async () => {
    const transport = management({ missions: vi.fn(async () => { throw new Error("private SQL detail"); }) });
    render(<App transport={transport} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    nav("Missions");
    expect(await screen.findByText(/Registre indisponible ou incompatible/)).toBeTruthy();
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
    render(<App transport={management({ missions })} research={research()} />);
    nav("Projets");
    fireEvent.click(await screen.findByRole("button", { name: /alpha · crypto/ }));
    nav("Missions");
    expect(await screen.findByRole("button", { name: "Old checkpoint" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualiser" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    expect(await screen.findByText(/Registre indisponible ou incompatible/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Old checkpoint" })).toBeNull();
    expect(screen.queryByText("private backend")).toBeNull();
  });
});

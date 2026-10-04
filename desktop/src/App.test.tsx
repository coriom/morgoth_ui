import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import type { ManagementTransport, Project } from "./transport";

afterEach(cleanup);

const project = (id: string): Project => ({
  id, name: id, domain: "crypto", legacy: false, manifest_path: `/tmp/${id}/project.yaml`,
  workspace_root: `/tmp/${id}/workspace`, postgres_schema: id, chroma_prefix: id,
  vault_dir: `/tmp/${id}/vault`, runtime_dir: `/tmp/${id}/runtime`,
  configuration_valid: true, runtime_checked: false,
});
function mockTransport(overrides: Partial<ManagementTransport> = {}): ManagementTransport {
  return {
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
    expect(screen.getByText("Connexion en cours…")).toBeTruthy();
    first.unmount();
    render(<App transport={mockTransport({ projects: vi.fn(async () => { throw new Error("offline catalog"); }) })} />);
    expect(await screen.findByText(/Catalogue indisponible/)).toBeTruthy();
  });
  it("shows disconnected state without loading catalog", async () => {
    const transport = mockTransport({ status: vi.fn(async () => { throw new Error("offline"); }) });
    render(<App transport={transport} />);
    expect(await screen.findByText("API de gestion indisponible")).toBeTruthy();
    expect(transport.projects).not.toHaveBeenCalled();
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

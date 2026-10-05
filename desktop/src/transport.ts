import { invoke } from "@tauri-apps/api/core";
import type { components } from "./api.generated";

export type Status = components["schemas"]["ManagementStatus"];
export type DomainList = components["schemas"]["DomainList"];
export type ProjectList = components["schemas"]["ProjectList"];
export type Project = components["schemas"]["ProjectView"];
export type Validation = components["schemas"]["ProjectValidation"];
export type Creation = components["schemas"]["ProjectCreation"];
export type CreateInput = components["schemas"]["CreateProjectRequest"];
export type RuntimeStatus = { state: "STARTING" | "READY" | "FAILED" | "STOPPING" | "STOPPED"; diagnostic: string | null };

export interface ManagementTransport {
  runtimeStatus(): Promise<RuntimeStatus>;
  status(): Promise<Status>;
  domains(): Promise<DomainList>;
  projects(): Promise<ProjectList>;
  project(id: string): Promise<Project>;
  validation(id: string): Promise<Validation>;
  create(input: CreateInput): Promise<Creation>;
}

/** Only fixed commands cross the WebView-to-native boundary. */
export const nativeManagement: ManagementTransport = {
  runtimeStatus: () => invoke<RuntimeStatus>("management_runtime_status"),
  status: () => invoke<Status>("management_status"),
  domains: () => invoke<DomainList>("list_domains"),
  projects: () => invoke<ProjectList>("list_projects"),
  project: (id) => invoke<Project>("get_project", { projectId: id }),
  validation: (id) => invoke<Validation>("validate_project", { projectId: id }),
  create: (input) => invoke<Creation>("create_project", { input }),
};

export type NativeError = { kind?: string; code?: string; status?: number };
export function managementError(error: unknown): NativeError {
  if (typeof error !== "object" || error === null) return { kind: "UNKNOWN" };
  const candidate = error as Record<string, unknown>;
  return {
    kind: typeof candidate.kind === "string" ? candidate.kind : "UNKNOWN",
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    status: typeof candidate.status === "number" ? candidate.status : undefined,
  };
}

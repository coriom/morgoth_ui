import { invoke } from "@tauri-apps/api/core";
import type { components } from "./api.generated";
import type { DesktopCodexReadinessV1 } from "../../types/morgoth";

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

export type ResearchPhase = "STOPPED" | "STARTING" | "PAUSED" | "NOT_READY" | "RUNNING" | "FAILED" | "STOPPING";
export type BackendRuntime = {
  schema_version: number; project: string; domain: string; code_sha: string | null;
  initialized: boolean; awakening_ready: boolean; research_state: string;
  autonomous_task_alive: boolean; profile: string; profile_status: "READY" | "BLOCKED" | "UNAVAILABLE";
};
export type ResearchEngineStatus = {
  state: ResearchPhase; project_id: string | null; domain: string | null;
  diagnostic: string | null; runtime: BackendRuntime | null;
};
export type ResearchProfiles = {
  schema_version: number; current: string; recommended: string | null;
  codex: DesktopCodexReadinessV1;
  profiles: Array<{ id: string; status: "READY" | "BLOCKED" | "UNAVAILABLE";
    reason: string; providers: Record<string, string> }>;
};
export interface ResearchTransport {
  status(): Promise<ResearchEngineStatus>;
  initialize(projectId: string): Promise<ResearchEngineStatus>;
  profiles(): Promise<ResearchProfiles>;
  selectProfile(profileId: string): Promise<ResearchProfiles>;
  start(): Promise<ResearchEngineStatus>;
  stop(): Promise<ResearchEngineStatus>;
}

/** Native authority is limited to six fixed research operations. */
export const nativeResearch: ResearchTransport = {
  status: () => invoke<ResearchEngineStatus>("research_engine_status"),
  initialize: (projectId) => invoke<ResearchEngineStatus>("initialize_research_engine", { projectId }),
  profiles: () => invoke<ResearchProfiles>("research_profiles"),
  selectProfile: (profileId) => invoke<ResearchProfiles>("select_research_profile", { profileId }),
  start: () => invoke<ResearchEngineStatus>("start_research"),
  stop: () => invoke<ResearchEngineStatus>("stop_research_engine"),
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

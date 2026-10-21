import { invoke } from "@tauri-apps/api/core";
import type { components } from "./api.generated";
import type { DesktopCodexReadinessV1, DesktopMissionPageV1, DesktopMissionReadV1, DesktopCapabilityPageV1 } from "../../types/morgoth";

export type Status = components["schemas"]["ManagementStatus"];
export type DomainList = components["schemas"]["DomainList"];
export type Project = Pick<components["schemas"]["ProjectView"], "id" | "name" | "domain" | "legacy" | "configuration_valid" | "runtime_checked">;
export type ProjectList = { projects: Project[]; configuration_valid: boolean; runtime_checked: boolean };
export type Validation = { project: Project; configuration_valid: boolean; runtime_checked: boolean };
export type MissionPage = DesktopMissionPageV1;
export type Mission = DesktopMissionReadV1;
export type CapabilityPage = DesktopCapabilityPageV1;
export type RuntimeStatus = { state: "STARTING" | "READY" | "FAILED" | "STOPPING" | "STOPPED"; diagnostic: string | null };

export interface ManagementTransport {
  runtimeStatus(): Promise<RuntimeStatus>;
  status(): Promise<Status>;
  domains(): Promise<DomainList>;
  projects(): Promise<ProjectList>;
  project(id: string): Promise<Project>;
  validation(id: string): Promise<Validation>;
  missions(id: string, offset: number): Promise<MissionPage>;
  mission(id: string, missionId: string): Promise<Mission>;
  capabilities(id: string, offset: number): Promise<CapabilityPage>;
}

/** Only fixed commands cross the WebView-to-native boundary. */
export const nativeManagement: ManagementTransport = {
  runtimeStatus: () => invoke<RuntimeStatus>("management_runtime_status"),
  status: () => invoke<Status>("management_status"),
  domains: () => invoke<DomainList>("list_domains"),
  projects: () => invoke<ProjectList>("list_projects"),
  project: (id) => invoke<Project>("get_project", { projectId: id }),
  validation: (id) => invoke<Validation>("validate_project", { projectId: id }),
  missions: (id, offset) => invoke<MissionPage>("list_mission_reads", { projectId: id, offset }),
  mission: (id, missionId) => invoke<Mission>("get_mission_read", { projectId: id, missionId }),
  capabilities: (id, offset) => invoke<CapabilityPage>("list_capability_reads", { projectId: id, offset }),
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
  profiles(): Promise<ResearchProfiles>;
}

/** D1 native authority exposes only status and profile reads. */
export const nativeResearch: ResearchTransport = {
  status: () => invoke<ResearchEngineStatus>("research_engine_status"),
  profiles: () => invoke<ResearchProfiles>("research_profiles"),
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

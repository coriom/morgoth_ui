import type { Project, ProjectList, ResearchEngineStatus, ResearchProfiles, RuntimeStatus, Status } from "./transport";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bounded(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function invalid(): never { throw new Error("INVALID_READ_MODEL"); }

/** Reject malformed native IPC data before presenting it as observed status. */
export function readRuntimeStatus(value: unknown): RuntimeStatus {
  if (!record(value) || !["STARTING", "READY", "FAILED", "STOPPING", "STOPPED"].includes(String(value.state))
    || !(value.diagnostic === null || bounded(value.diagnostic, 128))) invalid();
  return value as RuntimeStatus;
}

/** Management availability alone does not establish workload readiness. */
export function readManagementStatus(value: unknown): Status {
  if (!record(value) || value.api_version !== "1" || typeof value.management_available !== "boolean") invalid();
  return value as Status;
}

export function readProject(value: unknown): Project {
  if (!record(value) || !bounded(value.id, 63) || !/^[a-z][a-z0-9_]{0,62}$/.test(value.id)
    || !bounded(value.name, 128)
    || !bounded(value.domain, 128) || !bounded(value.postgres_schema, 128)
    || typeof value.legacy !== "boolean" || typeof value.configuration_valid !== "boolean"
    || typeof value.runtime_checked !== "boolean") invalid();
  return value as Project;
}

/** A list is configuration evidence, never a live mission inventory. */
export function readProjectList(value: unknown): ProjectList {
  if (!record(value) || !Array.isArray(value.projects) || value.projects.length > 500
    || typeof value.configuration_valid !== "boolean" || typeof value.runtime_checked !== "boolean") invalid();
  const projects = value.projects.map(readProject);
  if (new Set(projects.map((project) => project.id)).size !== projects.length) invalid();
  return value as ProjectList;
}

/** Research status is scoped to its reported Project, not the selected UI Project. */
export function readResearchStatus(value: unknown): ResearchEngineStatus {
  if (!record(value) || !["STOPPED", "STARTING", "PAUSED", "NOT_READY", "RUNNING", "FAILED", "STOPPING"].includes(String(value.state))
    || !(value.project_id === null || bounded(value.project_id, 128))
    || !(value.runtime === null || (record(value.runtime)
      && bounded(value.runtime.profile, 128)
      && ["READY", "BLOCKED", "UNAVAILABLE"].includes(String(value.runtime.profile_status))))) invalid();
  return value as ResearchEngineStatus;
}

/** Read only the bounded, safe profile fields exposed by the native runtime. */
export function readResearchProfiles(value: unknown): ResearchProfiles {
  if (!record(value) || !bounded(value.current, 128)
    || !(value.recommended === null || bounded(value.recommended, 128))
    || !Array.isArray(value.profiles) || value.profiles.length > 32 || !record(value.codex)) invalid();
  for (const field of ["installed", "authenticated", "sandbox_available", "sandbox_qualified", "workloads_ready"]) {
    if (typeof value.codex[field] !== "boolean") invalid();
  }
  for (const profile of value.profiles) {
    if (!record(profile) || !bounded(profile.id, 128)
      || !["READY", "BLOCKED", "UNAVAILABLE"].includes(String(profile.status))) invalid();
  }
  return value as ResearchProfiles;
}

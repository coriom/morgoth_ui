import type { Project, ProjectList, ResearchEngineStatus, ResearchProfiles, RuntimeStatus, Status, MissionPage, Mission, CapabilityPage } from "./transport";

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
    || !bounded(value.domain, 128)
    || typeof value.legacy !== "boolean" || typeof value.configuration_valid !== "boolean"
    || typeof value.runtime_checked !== "boolean"
    || Object.keys(value).some((key) => !["id", "name", "domain", "legacy", "configuration_valid", "runtime_checked"].includes(key))) invalid();
  return value as Project;
}

const code = (value: unknown): value is string => bounded(value, 96) && /^[A-Za-z0-9_.:-]+$/.test(value);
const date = (value: unknown): value is string => bounded(value, 40) && !Number.isNaN(Date.parse(value));
const uuid = (value: unknown): value is string => bounded(value, 36) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function readMission(value: unknown, projectId: string): Mission {
  if (!record(value) || !uuid(value.mission_id) || value.project_id !== projectId
    || !bounded(value.objective, 240) || !code(value.state)
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || !Array.isArray(value.stages) || value.stages.length > 16 || !value.stages.every(code)
    || !Array.isArray(value.capability_gaps) || value.capability_gaps.length > 16 || !value.capability_gaps.every(code)
    || !Array.isArray(value.failure_codes) || value.failure_codes.length > 4 || !value.failure_codes.every(code)
    || typeof value.resume_eligible !== "boolean" || !Number.isSafeInteger(value.receipt_count)
    || (value.receipt_count as number) < 0 || !date(value.created_at) || !date(value.updated_at)
    || value.evidence_kind !== "HISTORICAL_CHECKPOINT"
    || Object.keys(value).some((key) => !["mission_id", "project_id", "objective", "state", "revision", "stages", "capability_gaps", "failure_codes", "resume_eligible", "receipt_count", "created_at", "updated_at", "evidence_kind"].includes(key))) invalid();
  return value as unknown as Mission;
}

export function readMissionPage(value: unknown, projectId: string): MissionPage {
  if (!record(value) || value.project_id !== projectId || value.source !== "DISPOSABLE_POSTGRESQL"
    || !Array.isArray(value.missions) || value.missions.length > 10
    || !(value.next_offset === null || (Number.isSafeInteger(value.next_offset) && (value.next_offset as number) >= 1 && (value.next_offset as number) <= 1010))) invalid();
  value.missions.forEach((mission) => readMission(mission, projectId));
  if (new Set(value.missions.map((mission: Mission) => mission.mission_id)).size !== value.missions.length) invalid();
  return value as unknown as MissionPage;
}

export function readCapabilityPage(value: unknown, projectId: string): CapabilityPage {
  if (!record(value) || value.project_id !== projectId || value.source !== "DISPOSABLE_POSTGRESQL"
    || !Array.isArray(value.capabilities) || value.capabilities.length > 10
    || !(value.next_offset === null || (Number.isSafeInteger(value.next_offset) && (value.next_offset as number) >= 1 && (value.next_offset as number) <= 1010))) invalid();
  for (const item of value.capabilities) {
    if (!record(item) || item.project_id !== projectId || !code(item.capability_id) || !code(item.version)
      || !bounded(item.documentation_digest, 64) || !/^[0-9a-f]{64}$/.test(item.documentation_digest)
      || !code(item.state) || !code(item.validation_state)
      || !["NONE_RECORDED", "TEST_FIXTURE_ONLY"].includes(String(item.approval_kind))
      || !bounded(item.source_identity, 200) || !date(item.updated_at) || item.source !== "DISPOSABLE_POSTGRESQL"
      || Object.keys(item).some((key) => !["capability_id", "project_id", "version", "documentation_digest", "state", "validation_state", "approval_kind", "source_identity", "updated_at", "source"].includes(key))) invalid();
  }
  return value as unknown as CapabilityPage;
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

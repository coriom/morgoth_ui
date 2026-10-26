import type { Project, ProjectList, ProjectCreation, ResearchEngineStatus, ResearchProfiles, RuntimeStatus, Status, MissionPage, Mission, CapabilityPage, OllamaStatus } from "./transport";
import type { components } from "./api.generated";

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
export function readDomainList(value: unknown): components["schemas"]["DomainList"] {
  if (!record(value) || !Array.isArray(value.domains) || value.domains.length > 32 || value.runtime_checked !== false
    || value.domains.some((item: unknown) => !record(item) || !bounded(item.id, 63)
      || !/^[a-z][a-z0-9_]{0,62}$/.test(item.id) || typeof item.configuration_valid !== "boolean"
      || !(item.tagline === null || bounded(item.tagline, 256))
      || !(item.diagnostic === null || bounded(item.diagnostic, 128)))) invalid();
  return value as components["schemas"]["DomainList"];
}

export function readProjectCreation(value: unknown, input: {id: string; name: string; domain: string}): ProjectCreation {
  if (!record(value) || value.created !== true || value.durability_confirmed !== true
    || value.engine_started !== false || value.storage_initialized !== false) invalid();
  const project = readProject(value.project);
  if (project.id !== input.id || project.name !== input.name.trim() || project.domain !== input.domain || project.legacy) invalid();
  return value as ProjectCreation;
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

const modelId = (value: unknown): value is string => bounded(value, 96) && /^[A-Za-z0-9_.:/-]+$/.test(value);
const byteCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const byteOrUnknown = (value: unknown): value is number | null => value === null || byteCount(value);

/** Reject extra model metadata, private text, impossible states and unsafe numeric values. */
export function readOllamaStatus(value: unknown): OllamaStatus {
  if (!record(value) || value.source !== "OLLAMA_LOOPBACK_GET_V1"
    || !Number.isSafeInteger(value.observed_at_ms) || (value.observed_at_ms as number) <= 0
    || !["REACHABLE", "UNAVAILABLE"].includes(String(value.service_state))
    || !["OBSERVED", "UNAVAILABLE"].includes(String(value.installed_state))
    || !["OBSERVED", "UNAVAILABLE"].includes(String(value.loaded_state))
    || !(value.failure_class === null || ["CONNECT", "TIMEOUT", "TRANSPORT", "HTTP_STATUS", "REDIRECT_REJECTED", "INCOMPATIBLE_RESPONSE", "OVERSIZED_RESPONSE"].includes(String(value.failure_class)))
    || !(value.configured_model === null || modelId(value.configured_model))
    || !Array.isArray(value.installed) || value.installed.length > 64
    || !Array.isArray(value.loaded) || value.loaded.length > 64
    || !record(value.resources)
    || Object.keys(value).some((key) => !["source", "observed_at_ms", "service_state", "installed_state", "loaded_state", "failure_class", "configured_model", "installed", "loaded", "resources"].includes(key))) invalid();
  if (value.installed_state === "UNAVAILABLE" && value.installed.length !== 0
    || value.loaded_state === "UNAVAILABLE" && value.loaded.length !== 0
    || value.service_state === "UNAVAILABLE" && (value.installed_state !== "UNAVAILABLE" || value.loaded_state !== "UNAVAILABLE")
    || value.loaded_state === "OBSERVED" && value.installed_state !== "OBSERVED"
    || value.failure_class === null && (value.installed_state !== "OBSERVED" || value.loaded_state !== "OBSERVED")) invalid();
  for (const item of value.installed) {
    if (!record(item) || !modelId(item.id) || !byteCount(item.size_bytes)
      || Object.keys(item).some((key) => !["id", "size_bytes"].includes(key))) invalid();
  }
  for (const item of value.loaded) {
    if (!record(item) || !modelId(item.id) || !byteCount(item.size_bytes) || !byteOrUnknown(item.ollama_reported_vram_bytes)
      || Object.keys(item).some((key) => !["id", "size_bytes", "ollama_reported_vram_bytes"].includes(key))) invalid();
  }
  if (new Set(value.installed.map((item: { id: string }) => item.id)).size !== value.installed.length
    || new Set(value.loaded.map((item: { id: string }) => item.id)).size !== value.loaded.length) invalid();
  const resourceFields = ["linux_mem_available_bytes", "linux_swap_total_bytes", "linux_swap_used_bytes",
    "cgroup_memory_limit_bytes", "cgroup_memory_current_bytes", "cgroup_memory_headroom_bytes"];
  const resources = value.resources as Record<string, unknown>;
  if (Object.keys(resources).length !== resourceFields.length
    || resourceFields.some((field) => !byteOrUnknown(resources[field]))) invalid();
  return value as unknown as OllamaStatus;
}

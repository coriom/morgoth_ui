import { invoke } from "@tauri-apps/api/core";

export type LocalDraft = {
  schema_version: 1; draft_id: string; project_id: string; title: string;
  objective: string; verification_criteria: string; revision: number;
  created_at_ms: number; updated_at_ms: number;
};
export type DraftInput = Pick<LocalDraft, "project_id" | "title" | "objective" | "verification_criteria">;
export type DraftUpdate = DraftInput & { draft_id: string; expected_revision: number };
export interface DraftTransport {
  preferred(): Promise<string | null>;
  setPreferred(projectId: string | null): Promise<void>;
  list(projectId: string): Promise<LocalDraft[]>;
  get(projectId: string, draftId: string): Promise<LocalDraft>;
  create(input: DraftInput): Promise<LocalDraft>;
  update(input: DraftUpdate): Promise<LocalDraft>;
  delete(projectId: string, draftId: string, expectedRevision: number): Promise<void>;
}

export const nativeDrafts: DraftTransport = {
  preferred: () => invoke("preferred_project_read"),
  setPreferred: (projectId) => invoke("preferred_project_set", { projectId }),
  list: (projectId) => invoke("local_drafts_list", { projectId }),
  get: (projectId, draftId) => invoke("local_draft_get", { projectId, draftId }),
  create: (input) => invoke("local_draft_create", { input }),
  update: (input) => invoke("local_draft_update", { input }),
  delete: (projectId, draftId, expectedRevision) => invoke("local_draft_delete", { projectId, draftId, expectedRevision }),
};

const project = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && value.trim().length > 0 && [...value].length <= limit && !value.includes("\0");
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Native IPC is an authority boundary; malformed or foreign drafts never become UI state. */
export function readDraft(value: unknown, projectId: string): LocalDraft {
  if (!record(value) || value.schema_version !== 1 || !uuid(value.draft_id) || value.project_id !== projectId
    || !text(value.title, 120) || !text(value.objective, 4000) || !text(value.verification_criteria, 4000)
    || !integer(value.revision) || value.revision === 0 || !integer(value.created_at_ms)
    || !integer(value.updated_at_ms) || (value.updated_at_ms as number) < (value.created_at_ms as number)
    || Object.keys(value).some((key) => !["schema_version", "draft_id", "project_id", "title", "objective", "verification_criteria", "revision", "created_at_ms", "updated_at_ms"].includes(key))) {
    throw new Error("INVALID_LOCAL_DRAFT");
  }
  return value as LocalDraft;
}
export function readDraftList(value: unknown, projectId: string): LocalDraft[] {
  if (!project(projectId) || !Array.isArray(value) || value.length > 200) throw new Error("INVALID_LOCAL_DRAFT_LIST");
  const drafts = value.map((item) => readDraft(item, projectId));
  if (new Set(drafts.map((item) => item.draft_id)).size !== drafts.length) throw new Error("INVALID_LOCAL_DRAFT_LIST");
  return drafts;
}
export function readPreferred(value: unknown): string | null {
  if (value !== null && !project(value)) throw new Error("INVALID_LOCAL_PREFERENCE");
  return value;
}

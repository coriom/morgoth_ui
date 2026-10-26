import { invoke } from "@tauri-apps/api/core";
export type BackupReceipt = { project_id: string; schema_version: 1; exported_at_ms: number; notes_count: number; drafts_count: number; sha256: string; recovery_required: boolean };
export type RestorePreview = { receipt: BackupReceipt; token: string };
export interface BackupTransport {
  counts(projectId: string): Promise<unknown>;
  export(projectId: string): Promise<unknown>;
  preview(projectId: string): Promise<unknown>;
  restore(projectId: string, token: string): Promise<unknown>;
}
export const nativeBackups: BackupTransport = {
  counts: projectId => invoke("workspace_backup_counts", { projectId }),
  export: projectId => invoke("workspace_backup_export", { projectId }),
  preview: projectId => invoke("workspace_restore_preview", { projectId }),
  restore: (projectId, token) => invoke("workspace_restore_apply", { projectId, token }),
};
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function readCounts(v: unknown): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || !count(v[0]) || v[0] > 500 || !count(v[1]) || v[1] > 200) throw Error("INVALID_BACKUP_COUNTS");
  return [v[0], v[1]];
}
export function readReceipt(v: unknown, projectId: string): BackupReceipt {
  if (!object(v) || Object.keys(v).length !== 7 || v.project_id !== projectId || v.schema_version !== 1
    || !count(v.exported_at_ms) || v.exported_at_ms === 0 || !count(v.notes_count) || v.notes_count > 500
    || !count(v.drafts_count) || v.drafts_count > 200 || typeof v.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(v.sha256) || typeof v.recovery_required !== "boolean") throw Error("INVALID_BACKUP_RECEIPT");
  return v as BackupReceipt;
}
export function readPreview(v: unknown, projectId: string): RestorePreview {
  if (!object(v) || Object.keys(v).length !== 2 || typeof v.token !== "string"
    || !/^[0-9a-f-]{36}$/.test(v.token)) throw Error("INVALID_BACKUP_PREVIEW");
  return { receipt: readReceipt(v.receipt, projectId), token: v.token };
}

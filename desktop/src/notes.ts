import { invoke } from "@tauri-apps/api/core";

export type LocalNote = {
  schema_version: 1; note_id: string; project_id: string; title: string;
  collection: string; markdown: string; revision: number;
  created_at_ms: number; updated_at_ms: number; provenance: string;
};
export type ImportEntry = { name: string; title: string; outcome: "ELIGIBLE"|"REJECTED"|"DUPLICATE"; warning: string|null; excerpt: string|null };
export type ImportPreview = { token: string; project_id: string; inspected: number; eligible: number; rejected: number; duplicate: number;
  unresolved_links: number; ambiguous_links: number; estimated_bytes: number; recovery: boolean; entries: ImportEntry[] };
export type NoteInput = Pick<LocalNote, "project_id" | "title" | "collection" | "markdown">;
export type NoteUpdate = NoteInput & { note_id: string; expected_revision: number };
export interface NoteTransport {
  list(projectId: string): Promise<unknown>;
  get(projectId: string, noteId: string): Promise<unknown>;
  create(input: NoteInput): Promise<unknown>;
  update(input: NoteUpdate): Promise<unknown>;
  delete(projectId: string, noteId: string, expectedRevision: number): Promise<void>;
  exportMarkdown(projectId: string, noteId: string): Promise<string>;
  importPreview?(projectId: string, directory: boolean): Promise<unknown>;
  importApply?(projectId: string, token: string): Promise<unknown>;
}
export const nativeNotes: NoteTransport = {
  list: projectId => invoke("local_notes_list", { projectId }),
  get: (projectId, noteId) => invoke("local_note_get", { projectId, noteId }),
  create: input => invoke("local_note_create", { input }),
  update: input => invoke("local_note_update", { input }),
  delete: (projectId, noteId, expectedRevision) => invoke("local_note_delete", { projectId, noteId, expectedRevision }),
  exportMarkdown: (projectId, noteId) => invoke<string>("local_note_export", { projectId, noteId }),
  importPreview: (projectId, directory) => invoke("local_notes_import_preview", { projectId, directory }),
  importApply: (projectId, token) => invoke("local_notes_import_apply", { projectId, token }),
};
const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export function readNote(value: unknown, projectId: string): LocalNote {
  if (!record(value) || Object.keys(value).length !== 10 || value.schema_version !== 1 || !uuid(value.note_id)
    || value.project_id !== projectId || typeof value.title !== "string" || !value.title.trim()
    || [...value.title].length > 160 || typeof value.collection !== "string" || !value.collection.trim()
    || [...value.collection].length > 48 || typeof value.markdown !== "string" || value.markdown.length > 32768
    || !integer(value.revision) || value.revision < 1 || !integer(value.created_at_ms)
    || !integer(value.updated_at_ms) || value.updated_at_ms < value.created_at_ms
    || !validProvenance(value.provenance)) throw new Error("INVALID_LOCAL_NOTE");
  return value as LocalNote;
}
function validProvenance(value: unknown): value is string {
  if (value === "HUMAN_LOCAL") return true;
  if (typeof value !== "string" || value.length > 512) return false;
  const match = /^HUMAN_IMPORTED_V1:([0-9a-f]{64}):([0-9]+):([A-Za-z0-9_-]+)$/.exec(value);
  if (!match) return false;
  try {
    const name = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(match[3].replace(/-/g,"+").replace(/_/g,"/")), char => char.charCodeAt(0)));
    return name.length > 0 && name.length <= 240 && name.split("/").every(part => !!part && part !== "." && part !== ".." && !part.startsWith(".") && !/[\x00-\x1f\x7f]/.test(part));
  } catch { return false; }
}
export function importSourceName(note: LocalNote): string | null {
  if (!note.provenance.startsWith("HUMAN_IMPORTED_V1:")) return null;
  try { return new TextDecoder().decode(Uint8Array.from(atob(note.provenance.split(":")[3].replace(/-/g,"+").replace(/_/g,"/")),char=>char.charCodeAt(0))); }
  catch { return null; }
}
export function readImportPreview(value: unknown, projectId: string): ImportPreview {
  if (!record(value) || !uuid(value.token) || value.project_id !== projectId || !Array.isArray(value.entries) || value.entries.length > 1000
    || !["inspected","eligible","rejected","duplicate","unresolved_links","ambiguous_links","estimated_bytes"].every(k => integer(value[k]))
    || typeof value.recovery !== "boolean" || !integer(value.eligible) || value.eligible > 500 || !integer(value.inspected) || value.inspected > 1000
    || !integer(value.estimated_bytes) || value.estimated_bytes > 8*1024*1024
    || value.entries.some((e: unknown) => !record(e) || typeof e.name !== "string" || e.name.length > 240 || typeof e.title !== "string" || e.title.length > 160
      || !["ELIGIBLE","REJECTED","DUPLICATE"].includes(String(e.outcome)) || (e.warning !== null && (typeof e.warning !== "string" || e.warning.length > 160))
      || (e.excerpt !== null && (typeof e.excerpt !== "string" || e.excerpt.length > 160)))
    || value.entries.filter((e: ImportEntry) => e.outcome === "ELIGIBLE").length !== value.eligible
    || value.entries.filter((e: ImportEntry) => e.outcome === "REJECTED").length !== value.rejected
    || value.entries.filter((e: ImportEntry) => e.outcome === "DUPLICATE").length !== value.duplicate) throw new Error("INVALID_IMPORT_PREVIEW");
  return value as ImportPreview;
}
export function readNoteList(value: unknown, projectId: string): LocalNote[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("INVALID_LOCAL_NOTE_LIST");
  const items = value.map(item => readNote(item, projectId));
  if (new Set(items.map(item => item.note_id)).size !== items.length) throw new Error("INVALID_LOCAL_NOTE_LIST");
  return items;
}

export type NoteLink = { target: string; label: string };
const LINK = /\[\[([0-9a-f-]{36})(?:\|([^\]\n]{1,100}))?\]\]/g;
export function linksFrom(markdown: string): NoteLink[] {
  const found = new Map<string, NoteLink>();
  for (const match of markdown.matchAll(LINK)) {
    if (match.index > 0 && markdown[match.index - 1] === "!") continue;
    if (uuid(match[1])) found.set(match[1], { target: match[1], label: match[2]?.trim() || match[1] });
  }
  return [...found.values()];
}
export function backlinksTo(notes: readonly LocalNote[], noteId: string): LocalNote[] {
  return notes.filter(note => note.note_id !== noteId && linksFrom(note.markdown).some(link => link.target === noteId));
}
export function filterNotes(notes: readonly LocalNote[], query: string, collection: string): LocalNote[] {
  const needle = query.trim().toLocaleLowerCase();
  return notes.filter(note => (collection === "all" || note.collection === collection)
    && (!needle || `${note.title}\n${note.markdown}`.toLocaleLowerCase().includes(needle)));
}

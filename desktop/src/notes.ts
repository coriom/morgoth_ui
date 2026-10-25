import { invoke } from "@tauri-apps/api/core";

export type LocalNote = {
  schema_version: 1; note_id: string; project_id: string; title: string;
  collection: string; markdown: string; revision: number;
  created_at_ms: number; updated_at_ms: number; provenance: "HUMAN_LOCAL";
};
export type NoteInput = Pick<LocalNote, "project_id" | "title" | "collection" | "markdown">;
export type NoteUpdate = NoteInput & { note_id: string; expected_revision: number };
export interface NoteTransport {
  list(projectId: string): Promise<unknown>;
  get(projectId: string, noteId: string): Promise<unknown>;
  create(input: NoteInput): Promise<unknown>;
  update(input: NoteUpdate): Promise<unknown>;
  delete(projectId: string, noteId: string, expectedRevision: number): Promise<void>;
}
export const nativeNotes: NoteTransport = {
  list: projectId => invoke("local_notes_list", { projectId }),
  get: (projectId, noteId) => invoke("local_note_get", { projectId, noteId }),
  create: input => invoke("local_note_create", { input }),
  update: input => invoke("local_note_update", { input }),
  delete: (projectId, noteId, expectedRevision) => invoke("local_note_delete", { projectId, noteId, expectedRevision }),
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
    || value.provenance !== "HUMAN_LOCAL") throw new Error("INVALID_LOCAL_NOTE");
  return value as LocalNote;
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

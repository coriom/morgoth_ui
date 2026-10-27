import type { StructuredThesis, StructuredThesisPage, StructuredContradiction, StructuredContradictionPage } from "./transport";

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const optional = (v: unknown, max: number): boolean => v === null || text(v, max);
const date = (v: unknown): v is string => text(v, 48) && Number.isFinite(Date.parse(v));
const source = "PROJECT_STRUCTURED_POSTGRESQL";
const statuses = ["active", "contradicted", "quarantined", "superseded"];
const confidences = ["low", "medium", "high"];
const refusal = (): never => { throw new Error("INCOMPATIBLE_STRUCTURED_MEMORY"); };

export function readStructuredThesis(value: unknown, projectId: string): StructuredThesis {
  if (!object(value) || Object.keys(value).length !== 16 || value.schema_version !== 1 || value.project_id !== projectId || value.source !== source
    || !uuid(value.thesis_id) || !text(value.subject, 160) || !text(value.claim, 2048)
    || !statuses.includes(String(value.status)) || !confidences.includes(String(value.confidence))
    || !date(value.created_at) || !optional(value.code_version, 64) || !optional(value.objective_id, 80)
    || !optional(value.quarantine_reason, 240) || !(value.superseded_by === null || uuid(value.superseded_by))
    || (value.status === "superseded" && value.superseded_by === null)
    || !Array.isArray(value.evidence_sources) || value.evidence_sources.length > 8
    || !Number.isInteger(value.evidence_count) || (value.evidence_count as number) < value.evidence_sources.length
    || (value.evidence_count as number) > 32 || typeof value.evidence_omitted !== "boolean"
    || value.evidence_sources.some(item => !object(item) || Object.keys(item).length !== 1 || !text(item.source, 80) || !/^[a-zA-Z0-9_.:-]+$/.test(item.source as string))) refusal();
  return value as unknown as StructuredThesis;
}

export function readStructuredContradiction(value: unknown, projectId: string): StructuredContradiction {
  if (!object(value) || Object.keys(value).length !== 9 || value.schema_version !== 1 || value.project_id !== projectId || value.source !== source
    || !uuid(value.contradiction_id) || !uuid(value.thesis_id_a) || !uuid(value.thesis_id_b)
    || !date(value.detected_at) || !optional(value.subject_group, 160) || !optional(value.resolution, 240)) refusal();
  return value as unknown as StructuredContradiction;
}

function page(value: unknown, projectId: string, offset: number, key: "theses" | "contradictions"): Record<string, unknown> {
  if (!object(value) || Object.keys(value).length !== 6 || value.schema_version !== 1 || value.project_id !== projectId || value.source !== source
    || !date(value.read_at) || !Array.isArray(value[key]) || value[key].length > 20
    || !(value.next_offset === null || (Number.isInteger(value.next_offset) && (value.next_offset as number) > offset && (value.next_offset as number) <= 500))) refusal();
  return value as Record<string, unknown>;
}
export function readThesisPage(value: unknown, projectId: string, offset: number): StructuredThesisPage {
  const data = page(value, projectId, offset, "theses");
  return { ...data, theses: (data.theses as unknown[]).map(item => readStructuredThesis(item, projectId)) } as StructuredThesisPage;
}
export function readContradictionPage(value: unknown, projectId: string, offset: number): StructuredContradictionPage {
  const data = page(value, projectId, offset, "contradictions");
  return { ...data, contradictions: (data.contradictions as unknown[]).map(item => readStructuredContradiction(item, projectId)) } as StructuredContradictionPage;
}

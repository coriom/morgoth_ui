import type { KnowledgeDocument, KnowledgePage, ManagementTransport } from "./transport";

const digest = /^[0-9a-f]{64}$/;
export function readKnowledgePage(raw: KnowledgePage, projectId: string, offset: number): KnowledgePage {
  if (raw.schema_version !== 1 || raw.project_id !== projectId || raw.source !== "PROJECT_MARKDOWN_VAULT"
      || !Array.isArray(raw.documents) || raw.documents.length > 20 || typeof raw.read_at !== "string"
      || raw.read_at.length > 48 || Number.isNaN(Date.parse(raw.read_at))
      || (raw.next_offset !== null && (!Number.isInteger(raw.next_offset) || raw.next_offset <= offset || raw.next_offset > 95))) {
    throw new Error("KNOWLEDGE_INCOMPATIBLE");
  }
  for (const document of raw.documents) readKnowledgeDocument(document, projectId, false);
  return raw;
}

export function readKnowledgeDocument(raw: KnowledgeDocument, projectId: string, detail = true): KnowledgeDocument {
  if (raw.schema_version !== 1 || raw.project_id !== projectId || raw.source !== "PROJECT_MARKDOWN_VAULT" || !digest.test(raw.document_id)
      || typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 160
      || typeof raw.recorded_at !== "string" || Number.isNaN(Date.parse(raw.recorded_at))
      || !Array.isArray(raw.links) || raw.links.length > 32
      || raw.links.some(link => typeof link.label !== "string" || link.label.length > 160
        || (link.target_id !== null && !digest.test(link.target_id)))
      || (detail ? typeof raw.content !== "string" || raw.content.length > 16_384 : raw.content !== null)) {
    throw new Error("KNOWLEDGE_INCOMPATIBLE");
  }
  return raw;
}

/** Five pages maximum; all metadata comes from one canonical Project. */
export async function readKnowledgeCorpus(transport: ManagementTransport, projectId: string): Promise<{documents: KnowledgeDocument[]; readAt: string}> {
  const documents: KnowledgeDocument[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let readAt = "";
  for (let pageNo = 0; pageNo < 5; pageNo++) {
    const page = readKnowledgePage(await transport.knowledge(projectId, offset, ""), projectId, offset);
    readAt = page.read_at;
    for (const document of page.documents) {
      if (seen.has(document.document_id)) throw new Error("KNOWLEDGE_DUPLICATE");
      seen.add(document.document_id); documents.push(document);
    }
    if (page.next_offset === null) return { documents, readAt };
    offset = page.next_offset;
  }
  throw new Error("KNOWLEDGE_TRUNCATED");
}

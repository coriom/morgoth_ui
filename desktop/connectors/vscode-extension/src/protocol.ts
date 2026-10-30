export const PROTOCOL = 1;
export const MAX_LINE = 16384;
export const MAX_BRIEF = 12000;
export const MAX_SELECTION = 1024;
export const LIFE_MS = 10 * 60_000;
export const SCRATCH = "Morgoth D15 integration verified.";

export type Operation = "pair" | "metadata" | "selection" | "scratch" | "brief_scratch" | "disconnect";
export interface Request { v: 1; id: number; op: Operation; code?: string; session?: string; content?: string; digest?: string }
export function parseRequest(raw: string): Request | null {
  if (Buffer.byteLength(raw) > MAX_LINE) return null;
  const declared = Array.from(raw.matchAll(/"(v|id|op|code|session|content|digest)"\s*:/g), match => match[1]);
  if (new Set(declared).size !== declared.length) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item);
  if (item.v !== PROTOCOL || !Number.isSafeInteger(item.id) || (item.id as number) < 1 ||
      !["pair", "metadata", "selection", "scratch", "brief_scratch", "disconnect"].includes(String(item.op)) ||
      keys.some(key => !["v", "id", "op", "code", "session", "content", "digest"].includes(key))) return null;
  if (item.code !== undefined && (item.op !== "pair" || typeof item.code !== "string" || !/^[a-f0-9]{32}$/.test(item.code))) return null;
  if (item.session !== undefined && (item.op === "pair" || typeof item.session !== "string" || !/^[a-f0-9]{32}$/.test(item.session))) return null;
  if (item.op === "pair" ? !item.code || item.session : !item.session || item.code) return null;
  if (item.op === "brief_scratch") {
    if (typeof item.content !== "string" || Buffer.byteLength(item.content, "utf8") > MAX_BRIEF || !item.content.trim() ||
        typeof item.digest !== "string" || !/^[a-f0-9]{64}$/.test(item.digest)) return null;
  } else if (item.content !== undefined || item.digest !== undefined) return null;
  return item as unknown as Request;
}
export function safeLabel(value: string): string { return value.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 96); }

/**
 * Server-side helper: read the Morgoth UI session token from disk and
 * forward a request to the backend with the X-Morgoth-Token header.
 *
 * Runs only in the Next.js Node runtime (route handlers under app/api/*).
 * The token lives at ~/.morgoth/ui_token (mode 0600 — see
 * morgoth/api/token.py). Reading it here keeps the secret in this Node
 * process; the browser never sees the header.
 *
 * Cached in-module: a single read at first use, then reused for the
 * lifetime of the process. The file rarely rotates (only on token
 * deletion), and a stale cache manifests as 401s the operator will
 * notice immediately, so the trade-off favors speed.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_PATH = join(homedir(), ".morgoth", "ui_token");
const BACKEND = process.env.MORGOTH_BACKEND_URL ?? "http://localhost:8000";

let cached: string | null = null;

async function readToken(): Promise<string> {
  if (cached) return cached;
  const raw = await readFile(TOKEN_PATH, "utf8");
  const token = raw.trim();
  if (!token) throw new Error(`empty ${TOKEN_PATH}`);
  cached = token;
  return token;
}

export async function proxyToBackend(
  path: string,
  method: "POST" | "GET",
  body?: unknown,
): Promise<Response> {
  let token: string;
  try {
    token = await readToken();
  } catch (err) {
    return new Response(
      JSON.stringify({
        detail: `cannot read ${TOKEN_PATH} — is the backend running? (${(err as Error).message})`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const upstream = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Morgoth-Token": token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  // Pass through status + body verbatim so the browser sees the real
  // backend error (409 on non-pending, 422 on missing reason, etc.).
  const text = await upstream.text();
  return new Response(text || "{}", {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

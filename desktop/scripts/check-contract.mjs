import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bytes = readFileSync(resolve(root, "contracts/management_api_v1.openapi.json"));
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== "681e6e6311ded43bdd28e387178641caec45535c201a3dce4ed8ecc765e79b76") throw new Error("Pinned backend contract checksum differs");
const generated = astToString(await openapiTS(JSON.parse(bytes.toString("utf8"))));
const committed = readFileSync(resolve(root, "src/api.generated.ts"), "utf8");
if (!committed.trim().endsWith(generated.trim())) throw new Error("Generated TypeScript types are stale");
console.log("Pinned OpenAPI checksum and generated types match");

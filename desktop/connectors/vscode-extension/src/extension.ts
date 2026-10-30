import * as vscode from "vscode";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { LIFE_MS, MAX_LINE, MAX_SELECTION, parseRequest, safeLabel, SCRATCH } from "./protocol";

const EXTENSION_ID = "coriom.morgoth-vscode-connector";
const ALLOWED = new Set([".md", ".txt", ".ts", ".js"]);
let listener: net.Server | undefined;
let socketPath: string | undefined;
let active: net.Socket | undefined;
let code: string | undefined;
let session: string | undefined;
let until = 0;
let workspaceHash: string | undefined;
let workspaceRoot: string | undefined;
let extensionRoot: string | undefined;
let pendingTimer: NodeJS.Timeout | undefined;
let sessionTimer: NodeJS.Timeout | undefined;

function fail(code: string): { code: string } { return { code }; }
function identity(): { hash: string; label: string; root: string } {
  if (!vscode.workspace.isTrusted || vscode.workspace.workspaceFolders?.length !== 1 || process.platform !== "linux") throw Error("WORKSPACE_REFUSED");
  const folder = vscode.workspace.workspaceFolders[0];
  if (folder.uri.scheme !== "file" || ![undefined, "wsl"].includes(vscode.env.remoteName)) throw Error("HOST_REFUSED");
  const root = fs.realpathSync(folder.uri.fsPath);
  if (!fs.statSync(root).isDirectory()) throw Error("WORKSPACE_REFUSED");
  return { hash: createHash("sha256").update(root).digest("hex"), label: safeLabel(folder.name), root };
}
function checkedWorkspace(): { hash: string; label: string; root: string } {
  const current = identity();
  if (current.hash !== workspaceHash || current.root !== workspaceRoot) throw Error("WORKSPACE_CHANGED");
  return current;
}
function editorMetadata(includeSelection: boolean): Record<string, unknown> {
  const current = checkedWorkspace();
  const editor = vscode.window.activeTextEditor;
  if (!editor) return { workspace: current.label, workspace_hash: current.hash, editor: null };
  const document = editor.document;
  if (document.uri.scheme !== "file") return { workspace: current.label, workspace_hash: current.hash, editor: null };
  const real = fs.realpathSync(document.uri.fsPath);
  if (!real.startsWith(current.root + path.sep) || !ALLOWED.has(path.extname(real).toLowerCase())) throw Error("DOCUMENT_REFUSED");
  const relative = path.relative(current.root, real);
  const selectedCharacters = document.offsetAt(editor.selection.end) - document.offsetAt(editor.selection.start);
  if (includeSelection && selectedCharacters > MAX_SELECTION) throw Error("SELECTION_TOO_LARGE");
  const selected = includeSelection ? document.getText(editor.selection) : "";
  if (includeSelection && Buffer.byteLength(selected, "utf8") > MAX_SELECTION) throw Error("SELECTION_TOO_LARGE");
  const data: Record<string, unknown> = {
    workspace: current.label, workspace_hash: current.hash,
    editor: { document: safeLabel(relative), language: safeLabel(document.languageId), version: document.version,
      dirty: document.isDirty, selected_length: includeSelection ? Buffer.byteLength(selected, "utf8") : Math.min(selectedCharacters, MAX_SELECTION + 1) },
  };
  if (includeSelection) data.selected_text = selected;
  return data;
}
function trustedDirectory(): string {
  const root = process.env.MORGOTH_D15_SOCKET_DIR || path.join(os.homedir(), ".local", "state", "morgoth", "vscode");
  if (!path.isAbsolute(root) || root.includes("..")) throw Error("SOCKET_PATH_REFUSED");
  for (let item = path.dirname(root); item !== path.dirname(item); item = path.dirname(item)) {
    try { if (fs.lstatSync(item).isSymbolicLink()) throw Error("SOCKET_PATH_REFUSED"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  for (let item = root; item !== path.dirname(item); item = path.dirname(item)) {
    if (fs.lstatSync(item).isSymbolicLink()) throw Error("SOCKET_PATH_REFUSED");
  }
  const meta = fs.lstatSync(root);
  if (!meta.isDirectory() || meta.isSymbolicLink() || meta.uid !== process.getuid?.() || (meta.mode & 0o077) !== 0) throw Error("SOCKET_DIR_UNTRUSTED");
  return root;
}
function stop(): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  if (sessionTimer) clearTimeout(sessionTimer);
  pendingTimer = undefined; sessionTimer = undefined;
  active?.destroy(); active = undefined;
  try { listener?.close(); } catch { /* listener was not yet active */ }
  listener = undefined;
  if (socketPath) {
    try { if (fs.lstatSync(socketPath).isSocket()) fs.unlinkSync(socketPath); } catch { /* already gone */ }
  }
  socketPath = undefined; code = undefined; session = undefined; until = 0; workspaceHash = undefined; workspaceRoot = undefined;
}
function reply(socket: net.Socket, id: number, data: unknown, error = false): void {
  const encoded = JSON.stringify({v:1,id,status:error ? "ERROR" : "OK",data}) + "\n";
  if (Buffer.byteLength(encoded) > MAX_LINE) { socket.end(); return; }
  socket.write(encoded);
}
function onConnection(socket: net.Socket): void {
  if (active) { socket.destroy(); return; }
  active = socket;
  let buffer = "";
  socket.setTimeout(15_000, () => socket.destroy());
  socket.on("data", async chunk => {
    buffer += chunk.toString("utf8");
    if (Buffer.byteLength(buffer) > MAX_LINE || buffer.split("\n").length > 2) { socket.destroy(); return; }
    if (!buffer.includes("\n")) return;
    const [line, rest] = buffer.split("\n", 2); buffer = rest;
    const req = parseRequest(line);
    if (!req) { socket.destroy(); return; }
    try {
      if (req.op === "pair") {
        if (!code || req.code !== code || Date.now() > until || session) throw Error("PAIR_REFUSED");
        const current = identity();
        workspaceHash = current.hash; workspaceRoot = current.root;
        session = randomBytes(16).toString("hex"); code = undefined; until = Date.now() + LIFE_MS;
        if (pendingTimer) clearTimeout(pendingTimer);
        sessionTimer = setTimeout(stop, LIFE_MS);
        if (!extensionRoot) throw Error("EXTENSION_UNAVAILABLE");
        const extensionSha = createHash("sha256").update(fs.readFileSync(path.join(extensionRoot, "out", "extension.js"))).digest("hex");
        const protocolSha = createHash("sha256").update(fs.readFileSync(path.join(extensionRoot, "out", "protocol.js"))).digest("hex");
        reply(socket, req.id, { extension: EXTENSION_ID, version: "0.1.0", host: vscode.env.remoteName ?? "linux-local",
          extension_sha256: extensionSha, extension_protocol_sha256: protocolSha,
          workspace: current.label, workspace_hash: current.hash, trusted: true, folders: 1, session, expires_in_seconds: 600 });
      } else {
        if (!session || req.session !== session || Date.now() >= until) throw Error("AUTHORIZATION_REQUIRED");
        if (req.op === "metadata") reply(socket, req.id, editorMetadata(false));
        else if (req.op === "selection") reply(socket, req.id, editorMetadata(true));
        else if (req.op === "scratch") {
          checkedWorkspace();
          const document = await vscode.workspace.openTextDocument({ language: "plaintext", content: SCRATCH });
          await vscode.window.showTextDocument(document, { preview: false });
          if (vscode.window.activeTextEditor?.document !== document || document.getText() !== SCRATCH) throw Error("SCRATCH_READBACK_FAILED");
          reply(socket, req.id, { operation: "open_scratch", status: "VERIFIED", text: SCRATCH, unsaved: document.uri.scheme === "untitled" });
        } else if (req.op === "disconnect") { reply(socket, req.id, { revoked: true }); session = undefined; socket.end(); }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "OPERATION_REFUSED";
      reply(socket, req.id, fail(["PAIR_REFUSED", "AUTHORIZATION_REQUIRED", "WORKSPACE_CHANGED", "WORKSPACE_REFUSED", "HOST_REFUSED", "DOCUMENT_REFUSED", "SELECTION_TOO_LARGE", "SCRATCH_READBACK_FAILED"].includes(message) ? message : "OPERATION_REFUSED"), true);
      if (req.op === "pair" || ["WORKSPACE_CHANGED", "WORKSPACE_REFUSED", "HOST_REFUSED", "AUTHORIZATION_REQUIRED"].includes(message)) stop();
    }
  });
  socket.on("close", () => { if (active === socket) stop(); });
  socket.on("error", () => { if (active === socket) stop(); });
}
export async function connectWorkspace(): Promise<string> {
  if (listener) throw Error("SESSION_EXISTS");
  identity();
  const dir = trustedDirectory();
  const filename = path.join(dir, "bridge.sock");
  try { fs.lstatSync(filename); throw Error("SOCKET_ALREADY_EXISTS"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  code = randomBytes(16).toString("hex"); until = Date.now() + 120_000;
  listener = net.createServer(onConnection);
  await new Promise<void>((resolve, reject) => {
    listener!.once("error", reject);
    listener!.listen(filename, () => { listener!.removeListener("error", reject); fs.chmodSync(filename, 0o600); socketPath = filename; resolve(); });
  }).catch(error => { stop(); throw error; });
  listener.on("error", () => stop());
  pendingTimer = setTimeout(() => { if (!session) stop(); }, 120_000);
  vscode.window.showInformationMessage(`Morgoth : entrez ce code dans le Desktop sous deux minutes : ${code}`);
  return code;
}
export function activate(context: vscode.ExtensionContext): void {
  extensionRoot = fs.realpathSync(context.extensionPath);
  context.subscriptions.push(vscode.commands.registerCommand("morgoth.connectWorkspace", async () => {
    try { await connectWorkspace(); } catch { vscode.window.showErrorMessage("Morgoth : espace de travail ou transport local non admissible."); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand("morgoth.disconnectWorkspace", () => { stop(); vscode.window.showInformationMessage("Morgoth déconnecté."); }));
  context.subscriptions.push({ dispose: stop });
}
export function deactivate(): void { stop(); }

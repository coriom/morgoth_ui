/* Real Extension Development Host test. Runs only in an isolated synthetic workspace. */
import * as vscode from "vscode";
import * as assert from "node:assert/strict";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { connectWorkspace, deactivate } from "./extension";
import { SCRATCH } from "./protocol";

async function request(socket: net.Socket, id: number, op: string, extra: Record<string, string>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let value = "";
    const timer = setTimeout(() => reject(Error("REPLY_TIMEOUT")), 10_000);
    const onData = (chunk: Buffer) => {
      value += chunk.toString("utf8");
      if (!value.includes("\n")) return;
      clearTimeout(timer); socket.off("data", onData);
      try { const parsed = JSON.parse(value.split("\n")[0]) as Record<string, unknown>;
        assert.equal(parsed.id, id); assert.equal(parsed.status, "OK"); resolve(parsed.data as Record<string, unknown>);
      } catch (error) { reject(error); }
    };
    socket.on("data", onData);
    socket.write(JSON.stringify({v:1,id,op,...extra}) + "\n");
  });
}
export async function run(): Promise<void> {
  assert.equal(process.platform, "linux");
  const root = vscode.workspace.workspaceFolders?.[0];
  assert.ok(root && vscode.workspace.workspaceFolders?.length === 1 && vscode.workspace.isTrusted);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root.uri, "sample.md"));
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(0, 0, 0, 9);
  const extension = vscode.extensions.getExtension("coriom.morgoth-vscode-connector");
  assert.ok(extension);
  await extension.activate();
  const code = await connectWorkspace();
  const dir = process.env.MORGOTH_D15_SOCKET_DIR;
  assert.ok(dir);
  if (process.env.MORGOTH_D15_EXTERNAL_PAIR_FILE) {
    const receipt = process.env.MORGOTH_D15_EXTERNAL_PAIR_FILE;
    assert.ok(path.isAbsolute(receipt));
    fs.writeFileSync(receipt, code + "\n", {flag:"wx",mode:0o600});
    const socketPath = path.join(dir,"bridge.sock");
    const until = Date.now() + 300_000;
    while (fs.existsSync(socketPath) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 300));
    assert.ok(Date.now() < until, "Desktop did not disconnect within test deadline");
    assert.equal(vscode.window.activeTextEditor?.document.getText(), SCRATCH);
    console.log("D15_NATIVE_VSCODE_API_PASS workspace=synthetic scratch=visible disconnect=pass");
    deactivate();
    return;
  }
  if (process.env.MORGOTH_D15_RUST_PROBE) {
    const executable = process.env.MORGOTH_D15_RUST_PROBE;
    assert.ok(path.isAbsolute(executable));
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(executable, ["vscode_gateway::tests::real_vscode_extension_host", "--exact", "--ignored", "--nocapture"], {
        env: { HOME: process.env.HOME ?? "", MORGOTH_D15_SOCKET_DIR: dir, MORGOTH_D15_TEST_PAIR_CODE: code,
          MORGOTH_D15_EXTENSION_SHA256: createHash("sha256").update(fs.readFileSync(path.join(__dirname,"extension.js"))).digest("hex"),
          MORGOTH_D15_PROTOCOL_SHA256: createHash("sha256").update(fs.readFileSync(path.join(__dirname,"protocol.js"))).digest("hex") },
        stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
      });
      let output = "";
      let errors = "";
      child.stdout.on("data", chunk => { output += String(chunk).slice(0, 1024); });
      child.stderr.on("data", chunk => { errors += String(chunk).slice(0, 1024); });
      child.once("error", reject);
      child.once("close", value => { if (value !== 0) console.error("D15_RUST_PROBE_FAILED", (output + errors).slice(0, 1024)); resolve(value ?? -1); });
    });
    assert.equal(exitCode, 0);
    assert.equal(vscode.window.activeTextEditor?.document.getText(), SCRATCH);
    console.log("D15_REAL_RUST_VSCODE_PASS workspace=synthetic pair=pass metadata=pass selection=pass scratch=pass disconnect=pass");
    deactivate();
    return;
  }
  const socket = net.createConnection(path.join(dir, "bridge.sock"));
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  const paired = await request(socket, 1, "pair", {code});
  assert.equal(paired.extension, "coriom.morgoth-vscode-connector");
  assert.equal(paired.trusted, true);
  const session = paired.session as string;
  await new Promise(resolve => setTimeout(resolve, 16_000));
  const metadata = await request(socket, 2, "metadata", {session});
  assert.equal((metadata.editor as Record<string, unknown>).document, "sample.md");
  const selection = await request(socket, 3, "selection", {session});
  assert.equal(selection.selected_text, "Synthetic");
  const scratch = await request(socket, 4, "scratch", {session});
  assert.equal(scratch.text, SCRATCH);
  assert.equal(scratch.unsaved, true);
  assert.equal(vscode.window.activeTextEditor?.document.getText(), SCRATCH);
  const receipt = await request(socket, 5, "disconnect", {session});
  assert.equal(receipt.revoked, true);
  socket.destroy();
  deactivate();
  console.log("D15_REAL_VSCODE_API_PASS workspace=synthetic metadata=pass selection=pass scratch=pass disconnect=pass");
}

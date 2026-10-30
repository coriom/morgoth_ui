// D14 fixed local fixture adapter. No caller-selected URL, selector, script or profile.
import { chromium } from 'playwright';
import http from 'node:http';
import readline from 'node:readline';

const MAX_LINE = 4096;
let browser, context, page, server, origin, revision = 0, handles = new Map();
const first = '<!doctype html><html lang="fr"><title>Atelier D14</title><h1>Atelier navigateur</h1><h2>Registres de test</h2><ul><li>Alpha</li><li>Bêta</li></ul><label>Code synthétique <input aria-label="Code synthétique" maxlength="32"></label><button type="button" onclick="document.getElementById(\'state\').textContent=document.querySelector(\'input\').value">Appliquer le code</button><output id="state">En attente</output><a href="/second">Page suivante</a></html>';
const second = '<!doctype html><html lang="fr"><title>Atelier D14 — suite</title><h1>Suite du registre</h1><p>Seconde page de test.</p><a href="/">Retour</a></html>';
const reply = (id, status, data = {}) => process.stdout.write(JSON.stringify({ v: 1, id, status, data }) + '\n');
const fail = (code) => { throw new Error(code); };
const ensure = () => { if (!browser || !page || !server) fail('SESSION_REQUIRED'); };
const current = () => { ensure(); if (new URL(page.url()).origin !== origin) fail('ORIGIN_CHANGED'); return page.url(); };
async function inspect() {
  current(); revision++; handles = new Map();
  const fields = [];
  for (const kind of ['textbox', 'button', 'link']) {
    const locators = await page.getByRole(kind).all();
    for (const locator of locators.slice(0, 12)) {
      if (!(await locator.isVisible())) continue;
      const name = ((await locator.getAttribute('aria-label')) || (await locator.innerText().catch(() => '')) || '').slice(0, 80);
      const ref = `E${revision}-${handles.size + 1}`;
      handles.set(ref, { kind, locator, url: page.url() });
      fields.push({ ref, kind, name });
    }
  }
  return { url: current(), origin, revision, title: (await page.title()).slice(0, 160), headings: (await page.getByRole('heading').allTextContents()).slice(0, 12).map(x => x.slice(0, 160)), text: (await page.locator('body').innerText()).slice(0, 2048), elements: fields, state: (await page.locator('#state').count()) ? (await page.locator('#state').innerText()).slice(0, 80) : null };
}
async function close() {
  handles.clear(); revision++;
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  browser = context = page = server = undefined; origin = undefined;
}
async function dispatch(req) {
  if (req?.v !== 1 || !Number.isSafeInteger(req.id) || typeof req.op !== 'string') fail('PROTOCOL_INVALID');
  if (req.op === 'start') {
    if (browser) fail('SESSION_EXISTS');
    server = http.createServer((request, response) => {
      if (request.method !== 'GET' || !['/', '/second', '/favicon.ico'].includes(request.url)) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.url === '/second' ? second : first);
    });
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      origin = `http://127.0.0.1:${server.address().port}`;
      browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 10000 });
      context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', permissions: [] });
      context.setDefaultTimeout(5000);
      await context.route('**/*', route => {
        let allowed = false;
        try { const u = new URL(route.request().url()); allowed = u.origin === origin && ['http:'].includes(u.protocol); } catch { /* deny */ }
        return allowed ? route.continue() : route.abort();
      });
      page = await context.newPage();
      context.on('page', opened => { if (opened !== page) void opened.close(); });
      page.on('download', download => void download.cancel());
      await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 10000 });
      return { origin, browser: browser.version(), url: current() };
    } catch { await close(); fail('START_FAILED'); }
  }
  if (req.op === 'disconnect') { await close(); return { disconnected: true }; }
  current();
  if (req.op === 'status') return { origin, url: current(), revision };
  if (req.op === 'navigate') {
    if (!['/', '/second'].includes(req.path) || Object.keys(req).some(k => !['v','id','op','path'].includes(k))) fail('URL_REFUSED');
    await page.goto(origin + req.path, { waitUntil: 'domcontentloaded', timeout: 10000 });
    current(); handles.clear(); revision++; return { url: current(), origin };
  }
  if (req.op === 'inspect' || req.op === 'readback') return inspect();
  if (req.op === 'fill' || req.op === 'click') {
    if (typeof req.ref !== 'string' || req.ref.length > 24 || typeof req.value !== 'string' || req.value.length > 32 || !/^[A-Za-z0-9 -]*$/.test(req.value)) fail('ARGUMENT_REFUSED');
    const item = handles.get(req.ref);
    if (!item || item.url !== current() || (req.op === 'fill' && item.kind !== 'textbox') || (req.op === 'click' && item.kind !== 'button')) fail('STALE_ELEMENT');
    if (page.url() !== origin + '/') fail('ACTION_SCOPE_REFUSED');
    if (!(await item.locator.isVisible()) || !(await item.locator.isEnabled())) fail('ELEMENT_UNAVAILABLE');
    if (req.op === 'fill') await item.locator.fill(req.value, { timeout: 5000 });
    else await item.locator.click({ timeout: 5000 });
    return inspect();
  }
  fail('OPERATION_REFUSED');
}
const allowedErrors = new Set(['PROTOCOL_INVALID','SESSION_REQUIRED','SESSION_EXISTS','ORIGIN_CHANGED','START_FAILED','URL_REFUSED','ARGUMENT_REFUSED','STALE_ELEMENT','ACTION_SCOPE_REFUSED','ELEMENT_UNAVAILABLE','OPERATION_REFUSED']);
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', async line => {
  if (Buffer.byteLength(line) > MAX_LINE) { reply(0, 'ERROR', { code: 'REQUEST_TOO_LARGE' }); await close(); process.exit(2); }
  let request;
  try { request = JSON.parse(line); const result = await dispatch(request); reply(request.id, 'OK', result); }
  catch (error) { reply(request?.id ?? 0, 'ERROR', { code: allowedErrors.has(error?.message) ? error.message : 'OPERATION_FAILED' }); }
});
process.on('SIGTERM', () => { void close().finally(() => process.exit(0)); });
process.stdin.on('end', () => { void close().finally(() => process.exit(0)); });

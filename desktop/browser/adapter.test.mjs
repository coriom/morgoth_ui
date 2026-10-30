import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import readline from 'node:readline';

test('real isolated Chromium fixture, scoped handles and cleanup', { timeout: 30000 }, async () => {
  const child = spawn(process.execPath, [new URL('./adapter.mjs', import.meta.url).pathname], { stdio: ['pipe','pipe','ignore'] });
  const lines = readline.createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  let id = 0;
  async function call(op, fields = {}) {
    child.stdin.write(JSON.stringify({ v:1, id:++id, op, ...fields }) + '\n');
    const next = await Promise.race([iterator.next(), new Promise((_,reject) => setTimeout(() => reject(Error('timeout')), 15000))]);
    assert.equal(next.done, false);
    const response = JSON.parse(next.value);
    assert.equal(response.id, id);
    return response;
  }
  try {
    assert.equal((await call('inspect')).data.code, 'SESSION_REQUIRED');
    const started = await call('start');
    assert.equal(started.status, 'OK');
    assert.match(started.data.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await call('navigate', { path:'https://example.com' })).data.code, 'URL_REFUSED');
    assert.equal((await call('navigate', { path:'file:///etc/passwd' })).data.code, 'URL_REFUSED');
    assert.equal((await call('eval', { script:'1+1' })).data.code, 'OPERATION_REFUSED');
    let page = (await call('inspect')).data;
    assert.equal(page.title, 'Atelier D14');
    const field = page.elements.find(x => x.kind === 'textbox');
    const button = page.elements.find(x => x.kind === 'button');
    assert.ok(field && button);
    assert.equal((await call('fill', { ref:'E0-1', value:'D14-CHECK' })).data.code, 'STALE_ELEMENT');
    page = (await call('fill', { ref:field.ref, value:'D14-CHECK' })).data;
    const currentButton = page.elements.find(x => x.kind === 'button');
    assert.equal((await call('click', { ref:button.ref, value:'' })).data.code, 'STALE_ELEMENT');
    page = (await call('click', { ref:currentButton.ref, value:'' })).data;
    assert.equal(page.state, 'D14-CHECK');
    assert.equal((await call('navigate', { path:'/second' })).status, 'OK');
    assert.equal((await call('inspect')).data.title, 'Atelier D14 — suite');
    assert.equal((await call('disconnect')).status, 'OK');
    assert.equal((await call('inspect')).data.code, 'SESSION_REQUIRED');
    assert.equal((await call('start')).status, 'OK');
    assert.equal((await call('inspect')).data.state, 'En attente');
  } finally { child.stdin.end(); child.kill(); lines.close(); }
});

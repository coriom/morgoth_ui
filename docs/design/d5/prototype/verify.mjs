// Local visual-prototype smoke. Node 22+ and an already installed Chromium are required.
// Uses only file:// and a temporary loopback DevTools connection; never contacts Morgoth.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = process.env.D5_CHROMIUM;
if (!browser) throw new Error('D5_CHROMIUM_REQUIRED');
const target = pathToFileURL(resolve(import.meta.dirname, 'index.html')).href;
const proc = spawn(browser, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-allow-origins=*','--remote-debugging-port=0',target],{stdio:['ignore','ignore','pipe']});
let port;
let stderr='';
proc.stderr.on('data',chunk=>{stderr+=chunk.toString();const match=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);if(match)port=Number(match[1]);if(stderr.length>20_000)stderr=stderr.slice(-4000)});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(condition,code)=>{if(!condition)throw new Error(code)};
try{
  for(let i=0;i<100&&!port;i++)await pause(50);
  assert(port,'CHROMIUM_DEBUG_PORT_UNAVAILABLE');
  let tabs=[];
  for(let i=0;i<50;i++){try{tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(tabs.some(t=>t.type==='page'))break}catch{}await pause(50)}
  const tab=tabs.find(t=>t.type==='page');assert(tab,'CHROMIUM_PAGE_UNAVAILABLE');
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  let id=0;const pending=new Map();ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id)}});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,message=>message.error?reject(new Error(`CDP_${method}_FAILED`)):resolve(message.result));ws.send(JSON.stringify({id:request,method,params}));setTimeout(()=>{if(pending.delete(request))reject(new Error(`CDP_${method}_TIMEOUT`))},5000)});
  const evalJS=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('PAGE_SCRIPT_EXCEPTION');return r.result.value};
  await cdp('Runtime.enable');
  assert(await evalJS("!document.querySelector('#view-home').classList.contains('hidden')"),'HOME_NOT_VISIBLE');
  assert(await evalJS("document.querySelector('.preview-ribbon').textContent.includes('Données fictives')"),'PREVIEW_LABEL_MISSING');
  await evalJS("document.querySelector('.nav-item[data-view=missions]').click()");
  assert(await evalJS("!document.querySelector('#view-missions').classList.contains('hidden')"),'MISSIONS_NOT_VISIBLE');
  await evalJS("document.querySelector('#new-brief').click(); document.querySelector('#brief-title').value === ''");
  assert(await evalJS("document.querySelector('#brief-title').value === ''"),'NEW_BRIEF_NOT_EMPTY');
  await evalJS("document.querySelector('#brief-title').value='À vérifier';document.querySelector('#brief-title').dispatchEvent(new Event('input',{bubbles:true}));window.confirm=()=>false;document.querySelector('.nav-item[data-view=notes]').click()");
  assert(await evalJS("!document.querySelector('#view-missions').classList.contains('hidden')"),'UNSAVED_GUARD_FAILED');
  await evalJS("window.confirm=()=>true;document.querySelector('.nav-item[data-view=notes]').click()");
  assert(await evalJS("!document.querySelector('#view-notes').classList.contains('hidden')"),'NOTES_NOT_VISIBLE');
  assert(await evalJS("document.querySelectorAll('#note-list .list-item').length===5"),'NOTES_DATA_MISMATCH');
  await evalJS("document.querySelector('#view-notes [data-view=graph]').click()");
  assert(await evalJS("document.querySelectorAll('.graph-node').length===5"),'GRAPH_DATA_MISMATCH');
  await evalJS("document.querySelector('#graph-local').click()");
  assert(await evalJS("document.querySelector('#graph-local').getAttribute('aria-pressed')==='true'"),'GRAPH_LOCAL_FAILED');
  await evalJS("document.querySelector('#search-launch').click()");
  assert(await evalJS("document.querySelector('#palette').open"),'PALETTE_NOT_OPEN');
  await evalJS("document.querySelector('#palette-close').click()");
  assert(!await evalJS("document.querySelector('#palette').open"),'PALETTE_NOT_CLOSED');
  await evalJS("document.querySelector('.nav-item[data-view=home]').click();document.querySelector('.quick-actions [data-new=note]').click()");
  assert(await evalJS("document.querySelector('#note-reader h2').textContent==='Nouvelle note' && document.querySelector('#all-note-count').textContent==='6'"),'NEW_NOTE_PREVIEW_FAILED');
  const source=readFileSync(resolve(import.meta.dirname,'app.js'),'utf8');
  assert(!/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|__TAURI__/.test(source),'UNEXPECTED_DATA_ACCESS');
  console.log('D5_PROTOTYPE_SMOKE_PASS: navigation, unsaved guard, shared note graph, local note preview, palette, preview provenance');
  ws.close();
}finally{proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),pause(2000)]);if(proc.exitCode===null)proc.kill('SIGKILL')}

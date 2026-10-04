// Run against a separate, running development App: node scripts/browser-automation-smoke.mjs <binary> <app-home>
// No model requests, external sites, user credentials or config writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import path from 'node:path';

const [binary, appHome, projectPath] = process.argv.slice(2);
if (!binary || !appHome) throw new Error('Usage: node scripts/browser-automation-smoke.mjs <binary> <isolated-app-home>');
const endpoint = JSON.parse(await readFile(path.join(appHome, 'session-api.json'), 'utf8'));
assert.match(endpoint.url, /^http:\/\/127\.0\.0\.1:\d+$/);
let url;
const childFixture = createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url === '/changed') return res.end('<title>Changed frame</title><p>Frame navigation complete</p>');
  res.end(`<!doctype html><title>Cross-origin child</title><style>body{background:rgb(15,150,100);font:16px sans-serif}input,button,select{display:block;margin:8px}</style>
    <label for="child">Child name</label><input id="child">
    <select aria-label="Child choice"><option value="a">Alpha</option><option value="b">Beta</option></select>
    <button onclick="document.querySelector('#result').textContent='Child '+document.querySelector('input').value+' / '+document.querySelector('select').value">Apply child</button>
    <p id="result">Child waiting</p><a href="/changed">Navigate child</a>
    <iframe title="Nested child" src="${url}/nested" style="height:110px;width:90%"></iframe><div style="height:800px"></div><p>Child page end</p>`);
});
childFixture.listen(0, '127.0.0.1');
await once(childFixture, 'listening');
const childUrl = `http://127.0.0.1:${childFixture.address().port}`;
const fixture = createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url === '/nested') return res.end(`<title>Nested frame</title><button onclick="this.textContent='Nested clicked'">Nested button</button>`);
  if (req.url?.startsWith('/frames')) return res.end(`<!doctype html><title>Frame test</title>
    <h2>Cross-origin browser test</h2><p id="isolation"></p>
    <iframe id="child-frame" title="Cross-origin child" sandbox="allow-scripts" src="${childUrl}/child" style="width:95%;height:430px;border:3px solid navy"></iframe>
    <button onclick="document.querySelector('iframe').remove()">Remove frame</button>
    <script>
      document.getElementById('isolation').textContent = typeof window.webkit?.messageHandlers?.grokBrowserFrame === 'undefined' ? 'Bridge isolated' : 'Bridge exposed';
      document.querySelector('iframe').onload = () => { try { document.querySelector('iframe').contentWindow.document.body; document.title='Same origin protection missing'; } catch { /* expected */ } };
    </script>`);
  if (req.url === '/dynamic-frames') return res.end(`<!doctype html><title>Dynamic frames</title>
    <p>Ordinary embedded news content</p><script>
    for (let i=0;i<12;i++) {
      const frame=document.createElement('iframe');
      frame.src='${childUrl}/changed?ad='+i;
      document.body.appendChild(frame);
    }
    const link=document.createElement('a');link.href='${url}/next';link.download='article.html';
    link.textContent='Download article';document.body.appendChild(link);
    </script>`);
  if (req.url === '/next') return res.end('<title>Next page</title><p>Navigation succeeded</p>');
  res.end(`<!doctype html><title>Grok browser smoke</title>
    <style>body{padding:24px;font:16px sans-serif}input,button,select{display:block;margin:16px 0;min-height:30px}</style>
    <h1>Browser automation fixture</h1><label for="name">Your name</label><input id="name">
    <select aria-label="Choice"><option value="a">Alpha</option><option value="b">Beta</option></select>
    <button onclick="document.querySelector('#result').textContent='Hello '+document.querySelector('input').value+' / '+document.querySelector('select').value">Apply</button>
    <p id="result">Waiting</p><a href="/next">Next page</a><div style="height:1500px"></div><p>Page end</p>`);
});
fixture.listen(0, '127.0.0.1');
await once(fixture, 'listening');
url = `http://127.0.0.1:${fixture.address().port}`;
const child = spawn(path.resolve(binary), ['--browser-mcp'], {
  env: {...process.env, GROK_BROWSER_ENDPOINT:endpoint.url, GROK_BROWSER_TOKEN:endpoint.token, GROK_BROWSER_PROJECT_PATH:projectPath || path.resolve(appHome, "workspaces/general")},
  stdio:['pipe','pipe','pipe'],
});
child.stderr.on('data', data => process.stderr.write(data));
const pending = new Map();
const lines = createInterface({input:child.stdout});
lines.on('line', line => {
  const reply = JSON.parse(line);
  pending.get(reply.id)?.(reply);
  pending.delete(reply.id);
});
let id = 0;
async function rpc(method, params = {}) {
  const requestId = ++id;
  let timer;
  try {
    return await Promise.race([
      new Promise(resolve => {
        pending.set(requestId, resolve);
        child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n');
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${method} timed out`)), 45000); }),
    ]);
  } finally { clearTimeout(timer); pending.delete(requestId); }
}
async function call(name, args = {}, error = false) {
  const reply = await rpc('tools/call', {name,arguments:args});
  assert.equal(reply.result?.isError, error, JSON.stringify(reply));
  return error ? reply.result.content[0].text : JSON.parse(reply.result.content[0].text);
}
try {
  assert.equal((await rpc('initialize', {protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'smoke',version:'1'}})).result.serverInfo.name, 'grok-browser');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  assert.equal((await rpc('tools/list')).result.tools.length, 10);
  const denied = await fetch(`${endpoint.url}/v1/browser/action`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tabId:'agent-00000000-0000-4000-8000-000000000001',action:'browser_snapshot',args:{}})});
  assert.equal(denied.status, 401);
  await call('browser_open', {url});
  let snap = await call('browser_snapshot');
  assert.equal(snap.title, 'Grok browser smoke');
  const ref = snap.elements.find(e => e.label === 'Your name').ref;
  await call('browser_fill', {ref,text:'Grok 世界'});
  assert.match(await call('browser_fill', {ref,text:'duplicate'}, true), /stale/);
  snap = await call('browser_snapshot');
  assert.equal(snap.elements.find(e => e.label === 'Your name').value, 'Grok 世界');
  await call('browser_select', {ref:snap.elements.find(e => e.tag === 'select').ref,value:'b'});
  snap = await call('browser_snapshot');
  await call('browser_click', {ref:snap.elements.find(e => e.label === 'Apply').ref});
  snap = await call('browser_snapshot');
  assert.match(snap.text, /Hello Grok 世界 \/ b/);
  await call('browser_click', {ref:snap.elements.find(e => e.tag === 'a').ref});
  for (let attempt = 0; attempt < 10; attempt++) {
    snap = await call('browser_snapshot');
    if (snap.title === 'Next page') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(snap.title, 'Next page');
  await call('browser_back');
  for (let attempt = 0; attempt < 10; attempt++) {
    snap = await call('browser_snapshot');
    if (snap.title === 'Grok browser smoke') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(snap.title, 'Grok browser smoke');
  await call('browser_scroll', {pixels:10000});
  snap = await call('browser_snapshot');
  assert.ok(snap.scrollY > 0);
  assert.match(snap.viewportText, /Page end/);
  await call('browser_open', {url:`${url}/next`});
  assert.equal((await call('browser_snapshot')).title, 'Next page');
  assert.match(await call('browser_open', {url:'file:///etc/passwd'}, true), /HTTP/);
  await call('browser_open', {url:`${url}/dynamic-frames`});
  assert.equal((await call('browser_snapshot')).title, 'Dynamic frames');
  const dynamicFrames = (await call('browser_frames')).frames;
  assert.equal(dynamicFrames.filter(f => f.url.startsWith(`${childUrl}/changed?ad=`)).length, 12);
  const health = await fetch(`${endpoint.url}/v1/health`, {headers:{authorization:`Bearer ${endpoint.token}`}});
  assert.equal(health.status, 200);
  await call('browser_open', {url:`${url}/frames`});
  snap = await call('browser_snapshot');
  assert.equal(snap.title, 'Frame test');
  assert.match(snap.text, /Bridge isolated/);
  const frames = (await call('browser_frames')).frames;
  const childFrame = frames.find(f => f.url === `${childUrl}/child`).frame;
  const nestedFrame = frames.find(f => f.url === `${url}/nested`).frame;
  let childSnap = await call('browser_snapshot', {frame:childFrame});
  assert.equal(childSnap.title, 'Cross-origin child');
  await call('browser_fill', {frame:childFrame,ref:childSnap.elements.find(e => e.label === 'Child name').ref,text:'iframe 世界'});
  childSnap = await call('browser_snapshot', {frame:childFrame});
  await call('browser_select', {frame:childFrame,ref:childSnap.elements.find(e => e.tag === 'select').ref,value:'b'});
  childSnap = await call('browser_snapshot', {frame:childFrame});
  await call('browser_click', {frame:childFrame,ref:childSnap.elements.find(e => e.label === 'Apply child').ref});
  childSnap = await call('browser_snapshot', {frame:childFrame});
  assert.match(childSnap.text, /Child iframe 世界 \/ b/);
  let nestedSnap = await call('browser_snapshot', {frame:nestedFrame});
  await call('browser_click', {frame:nestedFrame,ref:nestedSnap.elements.find(e => e.label === 'Nested button').ref});
  nestedSnap = await call('browser_snapshot', {frame:nestedFrame});
  assert.match(nestedSnap.text, /Nested clicked/);
  const shot = await rpc('tools/call', {name:'browser_screenshot',arguments:{}});
  assert.equal(shot.result.isError, false, JSON.stringify(shot));
  const metadata = JSON.parse(shot.result.content[0].text);
  assert.ok(metadata.width > 0 && metadata.width <= 1600);
  assert.ok(metadata.height > 0 && metadata.height <= 1600);
  assert.equal(metadata.data, undefined);
  const image = shot.result.content.find(item => item.type === 'image');
  assert.equal(image.mimeType, 'image/png');
  const pixels = Buffer.from(image.data, 'base64');
  assert.equal(pixels.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual(await readFile(metadata.path), pixels);
  await writeFile(path.join(appHome, 'browser-screenshot-proof.png'), pixels);
  const pathOnly = await rpc('tools/call', {name:'browser_screenshot',arguments:{includeImage:false}});
  assert.equal(pathOnly.result.content.length, 1);
  await call('browser_scroll', {frame:childFrame,pixels:10000});
  childSnap = await call('browser_snapshot', {frame:childFrame});
  assert.match(childSnap.viewportText, /Child page end/);
  await call('browser_scroll', {frame:childFrame,pixels:-10000});
  childSnap = await call('browser_snapshot', {frame:childFrame});
  await call('browser_click', {frame:childFrame,ref:childSnap.elements.find(e => e.label === 'Navigate child').ref});
  let changed;
  for (let attempt=0; attempt<10; attempt++) {
    changed = (await call('browser_frames')).frames.find(f => f.url === `${childUrl}/changed`);
    if (changed) break;
    await new Promise(resolve => setTimeout(resolve,100));
  }
  assert.ok(changed);
  assert.match(await call('browser_snapshot', {frame:childFrame}, true), /stale|changed|failed/i);
  assert.equal((await call('browser_snapshot', {frame:changed.frame})).title, 'Changed frame');
  snap = await call('browser_snapshot');
  await call('browser_click', {ref:snap.elements.find(e => e.label === 'Remove frame').ref});
  assert.match(await call('browser_snapshot', {frame:changed.frame}, true), /stale|changed|failed/i);
  await call('browser_open', {url:`${url}/frames?restore`});
  assert.ok((await call('browser_frames')).frames.some(f => f.url === `${childUrl}/child`));
  await call('browser_open', {url:`${url}/next`});
  await call('browser_back');
  let restored = [];
  for (let attempt=0; attempt<10; attempt++) {
    restored = (await call('browser_frames')).frames;
    if (restored.some(f => f.url === `${url}/nested`) && restored.some(f => f.url === `${childUrl}/child`)) break;
    await new Promise(resolve => setTimeout(resolve,100));
  }
  assert.ok(restored.some(f => f.url === `${childUrl}/child`), JSON.stringify({restored, page:await call('browser_snapshot')}));
  assert.ok(restored.some(f => f.url === `${url}/nested`));
  await call('browser_close');
  assert.match(await call('browser_snapshot', {}, true), /closed/);
  await call('browser_open', {url});
  assert.equal((await call('browser_snapshot')).title, 'Grok browser smoke');
  await call('browser_close');
  console.log('PASS: MCP handshake, token gate, open, snapshot, fill, stale ref, select, click, navigation, back, scroll, scheme gate, cross-origin/nested frames, frame navigation/removal, isolated bridge, PNG screenshots, close/reopen.');
} finally {
  child.stdin.end();
  lines.close();
  child.kill();
  childFixture.closeAllConnections();
  childFixture.close();
  fixture.closeAllConnections();
  fixture.close();
}

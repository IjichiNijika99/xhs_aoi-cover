/* ===========================================================
   shot-one.mjs —— 只渲染指定主题（可多分辨率），用于快速迭代设计
   用法：node tools/shot-one.mjs <bgmId> <themeIds,逗号分隔> [outDir] [port]
   例：  node tools/shot-one.mjs 400602 aoi tools/shots 8080
   =========================================================== */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BGM_ID = Number(process.argv[2] || 400602);
const THEME_IDS = (process.argv[3] || 'aoi').split(',').map(s => s.trim()).filter(Boolean);
const OUT_DIR = path.resolve(process.argv[4] || 'tools/shots');
const PORT = Number(process.argv[5] || 8080);
const BASE = `http://127.0.0.1:${PORT}`;
const DEVTOOLS_PORT = 9340;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
fs.mkdirSync(OUT_DIR, { recursive: true });

const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DEVTOOLS_PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'one' + Date.now())}`, '--no-first-run',
  '--window-size=1600,1200', 'about:blank'], { stdio: 'ignore' });

let v = null;
for (let i = 0; i < 60; i++) { try { v = await (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const logs = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('[error] ' + m.params.entry.text);
});
const raw = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => raw(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable');

const evalJs = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await S('Page.navigate', { url: BASE + '/index.html' });
await sleep(2500);

const info = await evalJs(`(async () => {
  const mod = await import('/js/bgm.js');
  const d = await mod.getSubject(${BGM_ID});
  d.displayTitle = d.nameCn || d.name;
  const { img } = await mod.loadPoster(d);
  const s = window.__studio.state;
  s.subject = d; s.posterImg = img;
  s.opts.userScore = 8.7;
  s.opts.badge = '新番速递';
  s.opts.comment = '作画经费全烧在第 8 集了，但剧情是真的在硬撑。';
  await document.fonts.ready;
  return { title: d.nameCn || d.name, poster: [img.width, img.height] };
})()`);
console.log('条目：', info.title, '海报', info.poster.join('x'));

for (const tid of THEME_IDS) {
  // 用同一个主题渲染两次，顺带验证缓存路径没问题
  const res = await evalJs(`(async () => {
    const s = window.__studio.state;
    s.opts.theme = ${JSON.stringify(tid)};
    const t = window.__studio.THEMES.find(x => x.id === ${JSON.stringify(tid)});
    s.opts.palette = t.defaultPalette;
    await document.fonts.ready;
    const out = {};
    for (const w of [1080, 1080]) {
      const c = document.createElement('canvas');
      window.__studio.renderTheme(c, { ...s, opts: { ...s.opts, exportWidth: w } });
      out.png = c.toDataURL('image/png');
      out.size = [c.width, c.height];
    }
    window.__lastPng = out.png;
    return out.size;
  })()`);
  const png = await evalJs('window.__lastPng');
  const file = path.join(OUT_DIR, `${tid}.png`);
  fs.writeFileSync(file, Buffer.from(String(png).split(',')[1], 'base64'));
  console.log(`  ✓ ${tid}  ${res.join('x')}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

if (logs.length) { console.log('\n--- 报错 ---'); logs.slice(0, 10).forEach(l => console.log('  ' + l)); }
else console.log('\n控制台无报错');

ws.close(); proc.kill();
await sleep(300);

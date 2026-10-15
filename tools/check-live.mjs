/* ===========================================================
   check-live.mjs —— 直接打开线上站点做真实可用性验证
   重点：ES 模块能否加载、字体能否生效、页面有无报错、画布能否出图
   用法：node tools/check-live.mjs [url]
   =========================================================== */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const URL_ = process.argv[2] || 'https://ijichinijika99.github.io/xhs_aoi-cover/';
const DEVTOOLS_PORT = 9350;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DEVTOOLS_PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'live' + Date.now())}`, '--no-first-run',
  '--window-size=1500,1100', 'about:blank'], { stdio: 'ignore' });

let v = null;
for (let i = 0; i < 60; i++) { try { v = await (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const events = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method) events.push(m);
});
const raw = (method, params = {}, sid) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sid ? { sessionId: sid } : {}) })); });
const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => raw(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable'); await S('Network.enable');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  — ' + detail : ''}`); };
const evalJs = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

console.log(`\n=== 线上站点验证：${URL_}\n`);
await S('Page.navigate', { url: URL_ });
await sleep(6000);

check('页面标题正确', (await evalJs('document.title')).includes('番剧封面工坊'), await evalJs('document.title'));

// ES 模块是否真的执行了（app.js 会把 __studio 挂到 window）
const hasStudio = await evalJs('typeof window.__studio === "object" && Array.isArray(window.__studio.THEMES)');
check('ES 模块加载并执行成功', hasStudio === true, 'window.__studio 已就绪');

const themeCount = hasStudio ? await evalJs('window.__studio.THEMES.length') : 0;
check('主题数量 = 9', themeCount === 9, `${themeCount} 套`);

const themeIds = hasStudio ? await evalJs('window.__studio.THEMES.map(t=>t.id).join(",")') : '';
check('专属主题 aoi 已上线', themeIds.includes('aoi'), themeIds);

// 字体：得意黑是否真的被解析到
const fontOk = await evalJs(`(async () => {
  try { await document.fonts.ready; } catch {}
  return document.fonts.check('700 40px "Smiley Sans Oblique"');
})()`);
check('得意黑字体加载成功', fontOk === true, String(fontOk));

// 画布能正常出图（空状态占位）
const canvasInfo = await evalJs(`(() => {
  const c = document.getElementById('canvas');
  if (!c) return { err: '找不到 canvas' };
  try {
    const d = c.getContext('2d').getImageData(c.width/2, c.height/2, 1, 1).data;
    return { w: c.width, h: c.height, centerPixel: [d[0], d[1], d[2]] };
  } catch (e) { return { err: String(e.message) }; }
})()`);
check('画布完成首帧渲染', !canvasInfo.err && canvasInfo.w === 1080, JSON.stringify(canvasInfo));

// 模块请求是否都是 200
const reqs = events.filter(e => e.method === 'Network.responseReceived').map(e => ({
  url: e.params.response.url, status: e.params.response.status,
}));
const siteReqs = reqs.filter(r => r.url.startsWith(URL_.slice(0, 40)));
const bad = siteReqs.filter(r => r.status >= 400);
check('站内资源无 4xx/5xx', bad.length === 0, bad.length ? bad.map(b => b.status + ' ' + b.url).join(' | ') : `共 ${siteReqs.length} 个请求全部正常`);

const woff = siteReqs.filter(r => r.url.endsWith('.woff2'));
check('字体分片按需加载（不是全量 80 个）', woff.length > 0 && woff.length < 80, `只请求了 ${woff.length} 个分片`);

const errs = events.filter(e => e.method === 'Log.entryAdded' && e.params.entry.level === 'error').map(e => e.params.entry.text);
const exc = events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
check('控制台无报错', errs.length === 0 && exc.length === 0, [...errs, ...exc].slice(0, 2).join(' | '));

// 截一张线上页面图存档
const shot = await S('Page.captureScreenshot', { format: 'png' });
const outDir = path.resolve('tools/shots');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, '_live-site.png'), Buffer.from(shot.data, 'base64'));
console.log('\n线上页面截图 => tools/shots/_live-site.png');

const failed = results.filter(r => !r.ok);
console.log(`\n=== 结果：${results.length - failed.length}/${results.length} 通过 ===`);
if (failed.length) console.log('失败项：' + failed.map(f => f.name).join('、'));

ws.close(); proc.kill();
await sleep(300);
process.exit(failed.length ? 1 : 0);

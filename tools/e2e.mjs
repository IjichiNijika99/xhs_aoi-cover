/* ===========================================================
   e2e.mjs —— 端到端验证：真实 UI 交互 + 真实搜索 + 真实下载
   验证点：
     1. 搜索接口能用，结果能渲染
     2. 点位图 → 海报加载 → 画面出图
     3. 真实点击「下载 PNG」，浏览器确实收到下载且是合法 PNG
     4. 导出的图跨域未污染（这正是最容易坏的地方）
     5. 移动端视口下布局不溢出
   =========================================================== */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 8080, DEVTOOLS_PORT = 9336;
const BASE = `http://127.0.0.1:${PORT}`;
const DL_DIR = path.resolve('tools/downloads');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
fs.rmSync(DL_DIR, { recursive: true, force: true });
fs.mkdirSync(DL_DIR, { recursive: true });

const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DEVTOOLS_PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'e2e' + Date.now())}`, '--no-first-run',
  '--window-size=1600,1200', 'about:blank'], { stdio: 'ignore' });

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
const raw = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => raw(m, p, sessionId);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? '  — ' + detail : ''}`);
};

await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable');
await S('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR });
await S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

const evalJs = async (expression, awaitPromise = true) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

console.log('\n=== 端到端验证 ===\n');
await S('Page.navigate', { url: BASE + '/index.html' });
await sleep(3000);

/* ---------- 0. 全新打开（还没选任何番）不应报错 ---------- */
console.log('[0] 全新打开、空状态的健壮性');
const bootErr = await evalJs(`(() => {
  const c = document.getElementById('canvas');
  const ctx = c.getContext('2d');
  const px = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
  return { w: c.width, h: c.height, center: Array.from(px).slice(0, 3), hasPoster: !!window.__studio.state.posterImg };
})()`);
check('空状态能正常出图（占位框）', bootErr.w === 1080 && bootErr.center.some(v => v > 0), `${bootErr.w}x${bootErr.h} 中心像素 ${bootErr.center}`);

/* ---------- 1. 真实搜索 ---------- */
console.log('[1] 搜索「孤独摇滚」');
await evalJs(`(() => { const q = document.getElementById('q'); q.value = '孤独摇滚'; q.dispatchEvent(new Event('input')); document.getElementById('btnSearch').click(); return 1; })()`);
await sleep(4000);
const nResults = await evalJs(`document.querySelectorAll('#results .result').length`);
check('搜索结果渲染', nResults > 0, `${nResults} 条`);
const firstTitle = await evalJs(`document.querySelector('#results .result .r-name')?.textContent || ''`);
check('结果标题合理', /孤独摇滚|ぼっち/.test(firstTitle), firstTitle);

/* ---------- 2. 点击结果 → 载入海报 ---------- */
console.log('\n[2] 点第一个结果，等海报');
await evalJs(`document.querySelector('#results .result').click(); 1`);
let posterOk = false, posterInfo = '';
for (let i = 0; i < 30; i++) {
  await sleep(700);
  const st = await evalJs(`(() => { const s = window.__studio.state; return { has: !!s.posterImg, w: s.posterImg?.width || 0, h: s.posterImg?.height || 0, url: s.posterUrl || '', title: s.subject?.nameCn || '' }; })()`);
  if (st.has) { posterOk = true; posterInfo = `${st.w}x${st.h} 「${st.title}」 url=${st.url.slice(0, 62)}`; break; }
}
check('海报加载成功', posterOk, posterInfo);
check('海报走的是 /r/ 端点（带 CORS）', /\/r\/\d+\//.test(posterInfo), '');

/* ---------- 3. 设置评分与角标 ---------- */
console.log('\n[3] 设置评分 / 角标 / 主题');
await evalJs(`(() => {
  const sc = document.getElementById('userScore');
  sc.value = '9.2'; sc.dispatchEvent(new Event('input', {bubbles:true}));
  const b = document.getElementById('badge');
  b.value = '冷门神作'; b.dispatchEvent(new Event('input', {bubbles:true}));
  const c = document.getElementById('comment');
  c.value = '分镜和音乐的配合太顶了，看完立刻单曲循环。'; c.dispatchEvent(new Event('input', {bubbles:true}));
  document.querySelector('.theme-chip[data-theme="impact"]').click();
  return 1; })()`);
await sleep(1200);
const applied = await evalJs(`(() => { const o = window.__studio.state.opts; return { score: o.userScore, badge: o.badge, theme: o.theme, palette: o.palette }; })()`);
check('选项已生效', applied.score === 9.2 && applied.badge === '冷门神作' && applied.theme === 'impact', JSON.stringify(applied));

/* ---------- 4. 真实点击下载 ---------- */
console.log('\n[4] 点「下载 PNG」');
await evalJs(`document.getElementById('btnExport').click(); 1`);
let files = [];
for (let i = 0; i < 40; i++) {
  await sleep(500);
  files = fs.readdirSync(DL_DIR).filter(f => f.endsWith('.png'));
  if (files.length) break;
}
check('浏览器收到下载文件', files.length > 0, files.join(', '));

if (files.length) {
  const p = path.join(DL_DIR, files[0]);
  const buf = fs.readFileSync(p);
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  check('文件是合法 PNG 魔数', isPng, `${(buf.length / 1024).toFixed(0)} KB`);
  // 解析 IHDR 取真实尺寸
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  check('导出尺寸 = 1080x1440', w === 1080 && h === 1440, `${w}x${h}`);
  const scoreInName = /9\.2/.test(files[0]);
  check('文件名含评分与主题', scoreInName && /热血冲击/.test(files[0]), files[0]);
}

/* ---------- 5. 跨域污染检测 ---------- */
console.log('\n[5] 跨域污染检测（导出后再读一次像素）');
const tainted = await evalJs(`(() => {
  try {
    const c = document.createElement('canvas');
    window.__studio.renderTheme(c, { ...window.__studio.state, opts: { ...window.__studio.state.opts, exportWidth: 1080 } });
    c.getContext('2d').getImageData(0, 0, 4, 4);
    const blob = c.toDataURL('image/png').length;
    return { tainted: false, dataUrlLen: blob };
  } catch (e) { return { tainted: true, err: String(e.message) }; }
})()`);
check('画布未被跨域污染', tainted.tainted === false, JSON.stringify(tainted));

/* ---------- 6. 导出分辨率（在页面重载前测，此时海报仍在） ---------- */
console.log('\n[6] 导出分辨率');
const exportRes = await evalJs(`(() => {
  const c = document.createElement('canvas');
  window.__studio.renderTheme(c, { ...window.__studio.state, opts: { ...window.__studio.state.opts, exportWidth: 1440 } });
  return { w: c.width, h: c.height };
})()`);
check('可选 1440 宽高清导出', exportRes.w === 1440 && exportRes.h === 1920, `${exportRes.w}x${exportRes.h}`);

/* ---------- 7. 移动端视口（真实手机 UA + 视口，需重新加载让检测生效） ---------- */
console.log('\n[6] 移动端 iPhone 视口 390x844');
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await S('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA, platform: 'iPhone' });
await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await S('Page.navigate', { url: BASE + '/index.html' });
await sleep(3000);
const mobile = await evalJs(`(() => {
  const doc = document.documentElement;
  const bar = getComputedStyle(document.querySelector('.mobile-bar')).display;
  const canvas = document.getElementById('canvas').getBoundingClientRect();
  const cw = document.getElementById('canvas');
  return {
    overflowX: doc.scrollWidth - doc.clientWidth,
    mobileBar: bar,
    canvasCssW: Math.round(canvas.width),
    canvasBackingW: cw.width,
    viewport: doc.clientWidth,
    themeCols: getComputedStyle(document.getElementById('themeGrid')).gridTemplateColumns.split(' ').length,
    previewWidth: window.__studio.state.previewWidth,
  };
})()`);
check('手机端无横向溢出', mobile.overflowX <= 0, `溢出 ${mobile.overflowX}px`);
check('手机端悬浮操作条可见', mobile.mobileBar === 'flex', mobile.mobileBar);
check('画布不超出视口', mobile.canvasCssW <= mobile.viewport, `${mobile.canvasCssW} <= ${mobile.viewport}`);
check('手机端预览降分辨率以省性能', mobile.previewWidth === 720, `previewWidth=${mobile.previewWidth}，canvas=${mobile.canvasBackingW}px`);
check('手机端主题两列', mobile.themeCols === 2, `${mobile.themeCols} 列`);

/* ---------- 7b. 手机端折叠面板 ---------- */
console.log('\n[7b] 手机端折叠面板');
const acc = await evalJs(`(() => {
  const heads = [...document.querySelectorAll('.card-head')];
  const before = heads.map(h => h.closest('.card').classList.contains('collapsed'));
  // 点开「我的评分」卡片
  const scoreHead = document.querySelector('.card[data-card="3"] .card-head');
  scoreHead.click();
  const after = heads.map(h => h.closest('.card').classList.contains('collapsed'));
  const summary = document.querySelector('.card[data-card="2"] .card-head').dataset.summary || '';
  return { collapsedCount: before.filter(Boolean).length, toggled: before[2] !== after[2], summary, hasToggleUI: getComputedStyle(document.querySelector('.card-toggle')).display !== 'none' };
})()`);
check('手机端默认收起部分卡片', acc.collapsedCount > 0, `收起 ${acc.collapsedCount} 个`);
check('点击标题可展开/收起', acc.toggled === true, '');
check('折叠时显示当前选择摘要', acc.summary.length > 0, acc.summary);
check('折叠按钮在手机端可见', acc.hasToggleUI === true, '');

/* ---------- 8. 手机端导出仍是全分辨率（预览降清不影响成品） ---------- */
console.log('\n[8] 手机端重新加载后，搜索→载入→导出全流程仍可用');
await evalJs(`(() => { const q = document.getElementById('q'); q.value = '葬送的芙莉莲'; q.dispatchEvent(new Event('input')); document.getElementById('btnSearch').click(); return 1; })()`);
await sleep(4000);
await evalJs(`document.querySelector('#results .result')?.click(); 1`);
let mobilePoster = false;
for (let i = 0; i < 25; i++) {
  await sleep(700);
  mobilePoster = await evalJs(`!!window.__studio.state.posterImg`);
  if (mobilePoster) break;
}
check('手机端能载入海报', mobilePoster === true, '');
const mobileExport = await evalJs(`(() => {
  const c = document.createElement('canvas');
  window.__studio.renderTheme(c, { ...window.__studio.state, opts: { ...window.__studio.state.opts, exportWidth: 1080 } });
  return { w: c.width, h: c.height, previewW: window.__studio.state.previewWidth };
})()`);
check('手机端导出分辨率不受预览降清影响', mobileExport.w === 1080 && mobileExport.previewW === 720,
  `导出 ${mobileExport.w}x${mobileExport.h}，预览 ${mobileExport.previewW}`);

/* ---------- 7. 手机端截图存档 ---------- */
const SHOT_DIR = path.resolve('tools/shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = await S('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(SHOT_DIR, '_mobile-ui.png'), Buffer.from(shot.data, 'base64'));

// 恢复桌面并截一张整体 UI
await S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
await sleep(1200);
const shot2 = await S('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(SHOT_DIR, '_desktop-ui.png'), Buffer.from(shot2.data, 'base64'));

/* ---------- 控制台报错 ---------- */
const badLogs = events.filter(e => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .map(e => e.params.entry.text);
const exceptions = events.filter(e => e.method === 'Runtime.exceptionThrown')
  .map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
check('无控制台报错', badLogs.length === 0 && exceptions.length === 0,
  [...badLogs, ...exceptions].slice(0, 3).join(' | '));

const failed = results.filter(r => !r.ok);
console.log(`\n=== 结果：${results.length - failed.length}/${results.length} 通过 ===`);
if (failed.length) console.log('失败项：' + failed.map(f => f.name).join('、'));

ws.close(); proc.kill();
await sleep(300);
process.exit(failed.length ? 1 : 0);

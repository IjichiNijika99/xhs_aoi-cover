/* ===========================================================
   shot-ui.mjs —— 截取界面整图（含新增的「网络中转」卡片）
   用全新 profile，模拟第一次打开（无 localStorage）
   =========================================================== */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 8080, DEVTOOLS_PORT = 9338;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));

const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DEVTOOLS_PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'uishot' + Date.now())}`, '--no-first-run',
  '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

let v = null;
for (let i = 0; i < 60; i++) { try { v = await (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`)).json(); break; } catch { await sleep(300); } }
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
const raw = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => raw(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');

const outDir = path.resolve('tools/shots');
fs.mkdirSync(outDir, { recursive: true });

// 桌面：整页长截图（把面板完整拍下来）
await S('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: BASE + '/index.html' });
await sleep(2800);
const fullH = await S('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.scrollHeight' });
await S('Emulation.setDeviceMetricsOverride', { width: 1500, height: Math.min(4200, fullH.result.value), deviceScaleFactor: 1, mobile: false });
await sleep(900);
let shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.writeFileSync(path.join(outDir, '_ui-desktop-full.png'), Buffer.from(shot.data, 'base64'));
console.log('桌面整页截图 =>', path.join(outDir, '_ui-desktop-full.png'), `(${Math.min(4200, fullH.result.value)}px 高)`);

// 手机
await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
await S('Page.navigate', { url: BASE + '/index.html' });
await sleep(2800);
shot = await S('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(outDir, '_ui-mobile.png'), Buffer.from(shot.data, 'base64'));
console.log('手机首屏截图 =>', path.join(outDir, '_ui-mobile.png'));

ws.close(); proc.kill();
await sleep(300);

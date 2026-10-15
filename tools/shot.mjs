/* ===========================================================
   shot.mjs —— 用 Chrome DevTools Protocol 做真实渲染验证
   用途：无头 Chrome 打开本地站点 → 注入真实番剧数据 → 逐主题截图
   依赖：仅 Node 内置模块（fetch + WebSocket）
   用法：node tools/shot.mjs <bgmId> [outDir] [port]
   =========================================================== */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BGM_ID = Number(process.argv[2] || 400602);
const OUT_DIR = path.resolve(process.argv[3] || 'tools/shots');
const PORT = Number(process.argv[4] || 8080);
const BASE = `http://127.0.0.1:${PORT}`;
const DEVTOOLS_PORT = 9333;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('找不到 Chrome / Edge');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 极简 CDP 客户端 ---------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); }
      }, 60000);
    });
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const chromePath = findChrome();
  const userDataDir = path.join(os.tmpdir(), 'xhs-shot-profile-' + Date.now());

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${DEVTOOLS_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1600,1200',
    'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`);
      version = await r.json();
      break;
    } catch { await sleep(300); }
  }
  if (!version) { chrome.kill(); throw new Error('Chrome 调试端口没起来'); }
  console.log('浏览器：', version['Browser']);

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');

  const logs = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Log.entryAdded') logs.push(`[${m.params.entry.level}] ${m.params.entry.text}`);
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    }
  });

  // 打开站点
  await S('Page.navigate', { url: BASE + '/index.html' });
  await sleep(2500);

  // 注入真实数据并渲染
  const injected = await S('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const mod = await import('/js/bgm.js');
      const detail = await mod.getSubject(${BGM_ID});
      detail.displayTitle = detail.nameCn || detail.name;
      const { img, url } = await mod.loadPoster(detail);
      const s = window.__studio.state;
      s.subject = detail;
      s.posterImg = img;
      s.posterUrl = url;
      s.opts.userScore = 8.7;
      s.opts.badge = '新番速递';
      s.opts.comment = '作画经费全烧在第 8 集了，但剧情是真的在硬撑。';
      document.getElementById('skeleton').hidden = true;
      await document.fonts.ready;
      return { id: detail.id, title: detail.nameCn || detail.name, score: detail.score, img: [img.width, img.height] };
    })()`,
  });
  if (injected.exceptionDetails) {
    console.error('注入失败：', JSON.stringify(injected.exceptionDetails, null, 2));
  } else {
    console.log('条目：', injected.result.value);
  }

  // 逐主题截图
  const themes = await S('Runtime.evaluate', {
    returnByValue: true,
    expression: `window.__studio.THEMES.map(t => t.id)`,
  });
  const ids = themes.result.value;
  console.log('主题数：', ids.length);

  const summary = [];
  for (const id of ids) {
    const r = await S('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `(async () => {
        const s = window.__studio.state;
        s.opts.theme = ${JSON.stringify(id)};
        const t = window.__studio.THEMES.find(x => x.id === ${JSON.stringify(id)});
        s.opts.palette = t.defaultPalette;
        await document.fonts.ready;
        // 用离屏 canvas 按导出尺寸渲染，避开预览缩放
        const c = document.createElement('canvas');
        window.__studio.renderTheme(c, { ...s, opts: { ...s.opts, exportWidth: 1080 } });
        const dataUrl = c.toDataURL('image/png');
        window.__lastPng = dataUrl;
        return { id: ${JSON.stringify(id)}, len: dataUrl.length, w: c.width, h: c.height };
      })()`,
    });
    if (r.exceptionDetails) { console.error('渲染 ' + id + ' 失败：', r.exceptionDetails.text); continue; }
    const { len, w, h } = r.result.value;
    const png = await S('Runtime.evaluate', { returnByValue: true, expression: 'window.__lastPng' });
    const b64 = String(png.result.value).split(',')[1];
    const file = path.join(OUT_DIR, `${id}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    summary.push({ id, bytes: fs.statSync(file).size, size: `${w}x${h}`, dataLen: len });
    console.log(`  ✓ ${id.padEnd(10)} ${w}x${h}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }

  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify({ injected: injected.result?.value, summary, logs }, null, 2));

  if (logs.length) {
    console.log('\n--- 控制台日志 ---');
    for (const l of logs.slice(0, 40)) console.log('  ' + l);
  } else {
    console.log('\n控制台无报错');
  }

  ws.close();
  chrome.kill();
  await sleep(300);
  console.log('\n截图目录：' + OUT_DIR);
}

main().catch(e => { console.error('失败：', e); process.exit(1); });

/* ===========================================================
   launcher.mjs —— 一键启动：挑端口 → 起服务 → 自动开浏览器
   由 启动.bat 调用，也可以直接 node launcher.mjs 运行。
   =========================================================== */

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

/** 从 startPort 开始找一个能监听的端口 */
function findFreePort(startPort, tries = 20) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let left = tries;
    const attempt = () => {
      const srv = net.createServer();
      srv.once('error', () => {
        srv.close();
        port += 1;
        if (--left <= 0) return reject(new Error('找不到可用端口'));
        attempt();
      });
      srv.once('listening', () => {
        srv.close(() => resolve(port));
      });
      srv.listen(port, '0.0.0.0');
    };
    attempt();
  });
}

/** 用系统默认程序打开网址（Windows / macOS / Linux 都兼容） */
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      // 注意：URL 要单独作为参数传，不要拼进命令串，避免 & 被当成命令分隔符
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) {
    console.log(`  （自动打开浏览器失败：${e.message}，请手动访问上面的网址）`);
  }
}

const args = process.argv.slice(2).filter(a => a !== '--no-open');
const NO_OPEN = process.argv.includes('--no-open');
const startPort = Number(args[0] || 8080);

// 中文提示放在 Node 里输出：cmd 的控制台代码页对 UTF-8 批处理不友好，
// 而 Node 打印 UTF-8 是正常的，所以 .bat 保持纯 ASCII、文案从这里出。
console.log('');
console.log('  番剧封面工坊 - 正在启动，请不要关闭本窗口');
console.log('  ==========================================');
console.log('');

let port;
try {
  port = await findFreePort(startPort);
} catch (e) {
  console.error('  [错误] ' + e.message);
  process.exit(1);
}
if (port !== startPort) console.log(`  （${startPort} 被占用，改用 ${port}）`);

// 服务端作为子进程启动，stdout 直接继承到当前窗口
const child = spawn(process.execPath, [path.join(DIR, 'server.mjs'), String(port)], {
  cwd: DIR,
  stdio: 'inherit',
});

child.on('error', e => {
  console.error('  [错误] 无法启动服务：' + e.message);
  process.exit(1);
});
child.on('exit', code => process.exit(code ?? 0));

// 等服务真正监听后再开浏览器
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 250));
  const ok = await new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => { s.destroy(); resolve(false); });
  });
  if (ok) break;
}
if (!NO_OPEN) openBrowser(url);
console.log(`  服务地址：${url}`);
if (NO_OPEN) console.log('  （--no-open：已跳过自动打开浏览器）');
else console.log('  （如果没自动打开，手动把上面的网址复制到浏览器）');
console.log('  关闭这个窗口即可停止服务');
console.log('');

/* ===========================================================
   server.mjs —— 零依赖静态服务器
   用法： node server.mjs [端口]
   作用： 本地预览 + 局域网访问（手机可以用同一个 WiFi 打开）
   =========================================================== */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  // 防目录穿越：解析后必须仍在 ROOT 内
  const filePath = path.resolve(ROOT, '.' + urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache',
      // 图片跨域导出需要；本地开发无所谓但保持一致
      'Access-Control-Allow-Origin': '*',
    };
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

/** 挑出真正可用的局域网地址：过滤掉虚拟网卡 / VPN / 链路本地地址 */
function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  // 虚拟网卡与 VPN 的常见关键字，这些地址手机连不上，列出来只会让人困惑
  const skipName = /virtual|vmware|virtualbox|vethernet|hyper-v|tailscale|zerotier|radmin|loopback|bluetooth|tap|tun\b/i;
  for (const [name, list] of Object.entries(nets)) {
    if (skipName.test(name)) continue;
    for (const n of list || []) {
      if (n.family !== 'IPv4' || n.internal) continue;
      if (n.address.startsWith('169.254.')) continue;   // 链路本地
      if (n.address.startsWith('127.')) continue;
      out.push({ name, address: n.address });
    }
  }
  // 常见家用/办公网段优先（192.168 > 10. > 172.16-31）
  const rank = a => {
    if (a.address.startsWith('192.168.')) return 0;
    if (a.address.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) return 2;
    return 3;
  };
  return out.sort((a, b) => rank(a) - rank(b));
}

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddresses();
  console.log('');
  console.log('  番剧封面工坊 已启动');
  console.log('  ─────────────────────────────────────────');
  console.log(`  电脑上打开：  http://127.0.0.1:${PORT}/`);
  if (lan.length) {
    console.log(`  手机上打开：  http://${lan[0].address}:${PORT}/`);
    console.log(`                （手机需连同一个 WiFi）`);
    if (lan.length > 1) {
      console.log(`  备用地址：    ${lan.slice(1).map(x => 'http://' + x.address + ':' + PORT + '/').join('  ')}`);
    }
  } else {
    console.log('  手机上打开：  没检测到可用的局域网地址');
  }
  console.log('  ─────────────────────────────────────────');
  console.log('  关闭这个窗口即可停止服务');
  console.log('');
});

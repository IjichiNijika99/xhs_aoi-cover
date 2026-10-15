/* ===========================================================
   themes.js —— 主题库 + 配色方案
   一个主题 = 配色 + 海报装饰法 + 信息区外观（spec）。
   spec 与绘制都在这里定义，core.js 只负责渲染与导出。
   =========================================================== */

import {
  BASE_W, FONT_DISPLAY, FONT_TEXT, FONT_NUM, FONT_SERIF,
  measure, grainPattern, vignette, roundRect, clipRoundRect, strokeRoundRect,
  drawImageFitRounded, drawBlurredBackdrop,
  rgba, readableOn, makeRng, fmtScore,
} from './util.js';
import { RATIOS, paintInfo } from './core.js';

const F = k => k === 'serif' ? FONT_SERIF : k === 'display' ? FONT_DISPLAY : k === 'num' ? FONT_NUM : FONT_TEXT;

/* ===========================================================
   配色方案
   =========================================================== */

export const PALETTES = [
  { id: 'midnight', name: '午夜深蓝', bg: '#0E1420', ink: '#F2F4F8', accent: '#5B8DEF', accent2: '#22D3EE', score: '#FFFFFF' },
  { id: 'vermilion', name: '朱红', bg: '#17110F', ink: '#F7F1E8', accent: '#E8452C', accent2: '#FFB020', score: '#FFFFFF' },
  { id: 'neon', name: '霓虹粉青', bg: '#0B0618', ink: '#F5F0FF', accent: '#00E5FF', accent2: '#FF3DA6', score: '#00E5FF' },
  { id: 'matcha', name: '抹茶奶绿', bg: '#111A14', ink: '#EFF6EE', accent: '#7BD389', accent2: '#F2C14E', score: '#FFFFFF' },
  { id: 'sepia', name: '胶片暖褐', bg: '#241A10', ink: '#F6EDDC', accent: '#D9A05B', accent2: '#B87333', score: '#F6EDDC' },
  { id: 'sakura', name: '樱花浅粉', bg: '#FBF3F4', ink: '#2B2024', accent: '#E8748E', accent2: '#8E7CC3', score: '#2B2024' },
  { id: 'mono', name: '纯黑白', bg: '#F7F5EF', ink: '#0D0D0D', accent: '#111111', accent2: '#666666', score: '#0D0D0D' },
  { id: 'cream', name: '米白纸感', bg: '#F4EFE4', ink: '#1A1614', accent: '#D9542B', accent2: '#2F6F5E', score: '#1A1614' },
  { id: 'cyber', name: '赛博紫', bg: '#120A2A', ink: '#F3EBFF', accent: '#8B5CF6', accent2: '#22D3EE', score: '#A78BFA' },
  { id: 'ink', name: '水墨靛青', bg: '#0F1B24', ink: '#EAF2F6', accent: '#3FB6C4', accent2: '#E0A458', score: '#FFFFFF' },
  { id: 'candy', name: '奶糖橙', bg: '#FFF6EC', ink: '#2A2118', accent: '#F97316', accent2: '#14B8A6', score: '#2A2118' },
  { id: 'nord', name: '北欧灰蓝', bg: '#2E3440', ink: '#ECEFF4', accent: '#88C0D0', accent2: '#EBCB8B', score: '#FFFFFF' },
  { id: 'forest', name: '山雾松林', bg: '#0F2420', ink: '#F2F7F0', accent: '#E8734A', accent2: '#7FD1B9', score: '#FFFFFF' },
];

export function paletteById(id) { return PALETTES.find(x => x.id === id) || PALETTES[0]; }

/** 浅色配色需要深色文字 */
export function isLightPalette(p) {
  const h = p.bg.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

/* ===========================================================
   装饰笔刷
   =========================================================== */

function halftone(ctx, x, y, w, h, color, step = 14, r = 2.4, alpha = 0.5) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  for (let gy = y; gy < y + h; gy += step)
    for (let gx = x + ((Math.round((gy - y) / step) % 2) ? step / 2 : 0); gx < x + w; gx += step) {
      ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill();
    }
  ctx.restore();
}
function hatch(ctx, x, y, w, h, color, step = 18, lw = 2, alpha = 0.35, angle = 1) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 0); ctx.clip();
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h * angle, y);
    ctx.stroke();
  }
  ctx.restore();
}
function scanlines(ctx, x, y, w, h, color = '#000', step = 6, lw = 2, alpha = 0.14) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  for (let gy = y; gy < y + h; gy += step) ctx.fillRect(x, gy, w, lw);
  ctx.restore();
}
function paperTexture(ctx, x, y, w, h, color, alpha = 0.06, count = 260) {
  const rng = makeRng('paper' + Math.round(x) + Math.round(y) + Math.round(w) + Math.round(h));
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const px = x + rng() * w, py = y + rng() * h, len = 8 + rng() * 46, ang = rng() * Math.PI;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); ctx.stroke();
  }
  ctx.restore();
}
function grid(ctx, x, y, w, h, color, step = 54, lw = 1.5, alpha = 0.13) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw;
  for (let gx = x; gx < x + w; gx += step) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
  for (let gy = y; gy < y + h; gy += step) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  ctx.restore();
}
function cornerMarks(ctx, x, y, w, h, len, color, lw = 4) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(px + dx * len, py); ctx.lineTo(px, py); ctx.lineTo(px, py + dy * len); ctx.stroke();
  }
  ctx.restore();
}
function speedLines(ctx, x, y, w, h, color, count = 26, alpha = 0.35) {
  const rng = makeRng('speed' + Math.round(w) + Math.round(h));
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const px = x + rng() * w, py = y + rng() * h, len = 30 + rng() * 160, ang = -0.6 + rng() * 0.35;
    ctx.lineWidth = 1 + rng() * 3;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); ctx.stroke();
  }
  ctx.restore();
}
/** 还没选图时，画一个占位框，避免空白画布看起来像坏了 */
function drawPlaceholder(ctx, x, y, w, h, radius, pal) {
  ctx.save();
  roundRect(ctx, x, y, w, h, Math.min(radius, 26));
  ctx.fillStyle = 'rgba(128,134,150,.14)';
  ctx.fill();
  ctx.setLineDash([14, 12]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(128,134,150,.5)';
  ctx.stroke();
  ctx.setLineDash([]);
  const cx = x + w / 2, cy = y + h / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(128,134,150,.85)';
  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.055)}px ${FONT_TEXT}`;
  ctx.fillText('搜索番剧或上传图片', cx, cy - 14);
  ctx.font = `500 ${Math.round(Math.min(w, h) * 0.042)}px ${FONT_TEXT}`;
  ctx.fillStyle = 'rgba(128,134,150,.65)';
  ctx.fillText('海报会显示在这里', cx, cy + 26);
  ctx.restore();
}

/** 海报（或占位框）·所有主题共用 */
function paintPoster(ctx, c) {
  const { img, P, pal } = c;
  if (!img) { drawPlaceholder(ctx, P.x, P.y, P.w, P.h, P.radius, pal); return; }
  drawImageFitRounded(ctx, img, P.x, P.y, P.w, P.h, P.radius, 'cover', P.focusY);
}

/**
 * 海报氛围底。
 * 关键点：scale 不要太大（否则海报被拉扁，模糊后成了横向色带），
 * 再用主题底色按 tint 压一层，既保留海报的色调倾向又保证与主题配色一致。
 */
function backdrop(ctx, img, W, H, o = {}) {
  if (!img) return; // 没图时由主题自身的底色兜底
  const { blur = 74, darken = 0.55, scale = 1.12, saturate = 1.2, tint = null, tintAlpha = 0.55 } = o;
  drawBlurredBackdrop(ctx, img, W, H, { blur, darken, scale, saturate });
  if (tint) {
    ctx.save();
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/* ===========================================================
   满幅海报模式（bleed）：海报铺满整张画布，文字直接叠压在图上。
   这是让海报最显眼的做法 —— 海报占 100% 画面，不再被边框和留白挤小。
   =========================================================== */

/** 底部重、顶部次重、中段留出画面主体的压暗渐变，保证叠压文字可读 */
const SCRIMS = {
  sunset: [
    [0, 'rgba(8,20,26,.78)'], [0.20, 'rgba(8,20,26,.12)'],
    [0.40, 'rgba(8,20,26,0)'], [0.52, 'rgba(8,20,26,.34)'],
    [0.68, 'rgba(8,20,26,.74)'], [0.84, 'rgba(6,16,21,.92)'], [1, 'rgba(6,16,21,.98)'],
  ],
  bottom: [
    [0, 'rgba(0,0,0,.36)'], [0.30, 'rgba(0,0,0,0)'],
    [0.52, 'rgba(0,0,0,.32)'], [0.78, 'rgba(0,0,0,.78)'], [1, 'rgba(0,0,0,.93)'],
  ],
  even: [
    [0, 'rgba(0,0,0,.54)'], [0.30, 'rgba(0,0,0,.14)'],
    [0.55, 'rgba(0,0,0,.32)'], [1, 'rgba(0,0,0,.80)'],
  ],
};

function paintScrim(ctx, W, H, kind) {
  const stops = SCRIMS[kind] || SCRIMS.bottom;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * 斜角标牌（角标沿 45° 贴角）。
 *
 * 关键几何事实：一条无限长的 45° 带子只要与左上角相交，就必然横跨整个画布。
 * 所以这里画的是「有长度的斜牌」—— 起点伸到画面外，末端在画面内斜切收口，
 * 视觉上就是从角上斜斜贴出来的一张标签，而不是一条对角线。
 *
 * 实现上不依赖 ctx.rotate 的坐标系推断：先把矩形的四个角在局部坐标里算好，
 * 再逐个变换到画布坐标，每条边的位置都是显式可验证的。
 */
function paintCornerRibbon(ctx, W, H, {
  text,
  size = 26,
  weight = 700,
  spacing = 3,
  padding = 34,      // 文字两侧留白
  h = 64,            // 牌宽（垂直于 45° 方向）
  angle = 45,        // 倾斜角度
  centerAt = 175,    // 牌中心离左上角的距离（沿 45° 方向）
  flare = 12,        // 末端斜切量
  color = '#fff',
  bg = '#000',
}) {
  const t = String(text || '').trim();
  if (!t) return;

  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT_DISPLAY}`;
  const tw = [...t].reduce((a, c) => a + measure(ctx, c), 0) + spacing * Math.max(0, t.length - 1);
  const L = tw + padding * 2 + flare;

  // 局部坐标：x 沿牌的走向，y 垂直于牌。牌中心在原点。
  const R = -angle * Math.PI / 180;
  const cos = Math.cos(R), sin = Math.sin(R);
  const toCanvas = (lx, ly) => [
    centerAt / Math.SQRT2 + lx * cos - ly * sin,
    centerAt / Math.SQRT2 + lx * sin + ly * cos,
  ];

  const hw = L / 2, hh = h / 2;
  const local = [
    [-hw, -hh],                 // 起点上角（伸到画面外的那端）
    [hw - flare, -hh],          // 末端上角
    [hw, 0],                    // 末端中间（斜切的尖）
    [hw - flare, hh],           // 末端下角
    [-hw, hh],                  // 起点下角
  ];

  ctx.beginPath();
  const pts = local.map(([lx, ly]) => toCanvas(lx, ly));
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();

  ctx.save();
  ctx.clip();                   // 牌以外的部分（包括伸出画布的部分）自然被裁掉
  ctx.fillStyle = bg;
  ctx.fillRect(-W, -H, W * 3, H * 3);

  // 文字：跟着牌的走向排
  ctx.translate(centerAt / Math.SQRT2, centerAt / Math.SQRT2);
  ctx.rotate(R);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `${weight} ${size}px ${FONT_DISPLAY}`;
  let x = -L / 2 + padding;
  for (const ch of t) {
    ctx.fillStyle = color;
    ctx.fillText(ch, x, 0);
    x += measure(ctx, ch) + spacing;
  }
  ctx.restore();
  ctx.restore();
}

/**
 * 等高线纹理（登山 / 地形图的味道）。
 * 画在一张离屏画布上并返回它，方便主题缓存起来反复 drawImage，
 * 避免每次重绘都跑一遍随机游走。
 */
function makeContourTexture(W, H, color, { alpha = 0.16, lines = 9, step = 26 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const rng = makeRng('contour' + lines + H);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < lines; i++) {
    const baseY = H * (0.30 + 0.66 * (i / Math.max(1, lines - 1)));
    const amp = 26 + rng() * 52;
    const phase = rng() * Math.PI * 2;
    const pts = [];
    let noise = 0;
    for (let x = -40; x <= W + 40; x += step) {
      noise = noise * 0.72 + (rng() - 0.5) * amp * 0.55;
      pts.push([x, baseY + Math.sin((x / W) * Math.PI * 2 + phase) * amp * 0.5 + noise]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    ctx.stroke();
  }
  ctx.restore();
  return cv;
}

/** 远处的山脊折线 */
function ridgeLine(ctx, x, y, w, color, lw = 3, alpha = 0.9) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w * 0.20, y - w * 0.100);
  ctx.lineTo(x + w * 0.32, y - w * 0.032);
  ctx.lineTo(x + w * 0.50, y - w * 0.190);
  ctx.lineTo(x + w * 0.68, y - w * 0.050);
  ctx.lineTo(x + w * 0.80, y - w * 0.105);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
}

/** 登山路线的小圆点虚线 */
function trailDots(ctx, x, y, color, { count = 16, r = 2.6, gap = 15, alpha = 0.5, arc = 10 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = x + i * gap;
    const py = y - Math.sin(i / count * Math.PI) * arc;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 满幅海报本体（没图时退回主题底色 + 占位提示） */
function paintBleedPoster(ctx, c, { focusY = 0.34 } = {}) {
  const { img, W, H, pal } = c;
  if (!img) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 52px ${FONT_TEXT}`;
    ctx.fillText('搜索番剧或上传图片', W / 2, H / 2 - 20);
    ctx.font = `500 34px ${FONT_TEXT}`;
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.fillText('海报会铺满整张图', W / 2, H / 2 + 46);
    ctx.restore();
    return;
  }
  // cover 铺满；focusY 偏上一点，尽量保住角色的脸
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  const s = Math.max(W / iw, H / ih);
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) * focusY, dw, dh);
}

/** 海报投影卡片 */
function shadowCard(ctx, x, y, w, h, r, color, blur, offY) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetY = offY;
  ctx.fillStyle = color.replace(/[\d.]+\)$/, '1)').startsWith('rgba') ? '#000' : '#000';
  roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
}
/** 自适应字号：给定宽度内尽量大 */
function fitSize(ctx, text, family, weight, maxW, maxSize, minSize = 34) {
  let s = maxSize;
  while (s > minSize) {
    ctx.font = `${weight} ${Math.round(s)}px ${family}`;
    if (measure(ctx, text) <= maxW) break;
    s -= 2;
  }
  return s;
}

/* ===========================================================
   通用部件：角标 / 分数 / 短评 / 元信息 / 页脚
   =========================================================== */

function paintKicker(ctx, k, x, w, y, align) {
  const size = k.size;
  const h = size * 1.95;
  ctx.save();
  ctx.font = `${k.weight} ${size}px ${F(k.family)}`;
  const tw = k.spacing
    ? [...k.text].reduce((a, c) => a + measure(ctx, c), 0) + k.spacing * (k.text.length - 1)
    : measure(ctx, k.text);
  const boxW = tw + k.padX * 2;
  const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const bx = align === 'center' ? anchorX - boxW / 2 : align === 'right' ? anchorX - boxW : x;
  if (k.bg) {
    roundRect(ctx, bx, y, boxW, h, k.radius);
    ctx.fillStyle = k.bg; ctx.fill();
    if (k.border) { ctx.lineWidth = k.borderWidth; ctx.strokeStyle = k.border; ctx.stroke(); }
  } else if (k.underline) {
    ctx.fillStyle = k.underline;
    const uw = k.underlineW ?? boxW;
    const ux = align === 'center' ? anchorX - uw / 2 : align === 'right' ? anchorX - uw : x;
    ctx.fillRect(ux, y + h - 4, uw, k.underlineH);
  }
  ctx.textBaseline = 'middle';
  const ty = y + h / 2;
  if (k.spacing && !k.bg) {
    let cx = align === 'center' ? anchorX - tw / 2 : align === 'right' ? anchorX - tw : x;
    for (const ch of k.text) { ctx.fillStyle = k.color; ctx.fillText(ch, cx, ty); cx += measure(ctx, ch) + k.spacing; }
  } else {
    ctx.textAlign = k.bg ? 'center' : align;
    if (k.shadow) { ctx.shadowColor = k.shadow.color; ctx.shadowBlur = k.shadow.blur; }
    ctx.fillStyle = k.color;
    ctx.fillText(k.text, k.bg ? bx + boxW / 2 : anchorX, ty);
  }
  ctx.restore();
  return h;
}

function paintTitle(ctx, t, x, w, y, align) {
  ctx.save();
  ctx.font = `${t.weight} ${t.size}px ${F(t.family)}`;
  const lines = t.lines;
  const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const lh = t.size * t.lineHeight;
  const top = (lh - t.size * 0.74) / 2;
  if (t.shadow) { ctx.shadowColor = t.shadow.color; ctx.shadowBlur = t.shadow.blur; ctx.shadowOffsetY = t.shadow.y || 0; }
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    const baseY = y + i * lh + top + t.size * 0.74;
    if (t.spacing) {
      const lw = [...line].reduce((a, c) => a + measure(ctx, c), 0) + t.spacing * (line.length - 1);
      let cx = align === 'center' ? anchorX - lw / 2 : align === 'right' ? anchorX - lw : x;
      for (const ch of line) {
        if (t.stroke) { ctx.lineWidth = t.stroke.width; ctx.strokeStyle = t.stroke.color; ctx.strokeText(ch, cx, baseY); }
        ctx.fillStyle = t.color; ctx.fillText(ch, cx, baseY);
        cx += measure(ctx, ch) + t.spacing;
      }
    } else {
      ctx.textAlign = align;
      if (t.stroke) { ctx.lineWidth = t.stroke.width; ctx.strokeStyle = t.stroke.color; ctx.strokeText(line, anchorX, baseY); }
      ctx.fillStyle = t.color; ctx.fillText(line, anchorX, baseY);
    }
  });
  ctx.restore();
  return lines.length * lh;
}

function tierText(v) {
  const n = Number(v);
  if (!isFinite(n)) return '';
  if (n >= 9) return '神作';
  if (n >= 8) return '力荐';
  if (n >= 7) return '佳作';
  if (n >= 6) return '还行';
  if (n >= 5) return '一般';
  if (n >= 4) return '微妙';
  return '弃番';
}

function paintScore(ctx, s, x, w, y, align) {
  const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const main = fmtScore(s.value);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (main === null) {
    if (s.bgmValue === null) { ctx.restore(); return 0; }
    ctx.font = `600 ${s.size}px ${FONT_TEXT}`;
    ctx.textAlign = align;
    const txt = `BGM ${fmtScore(s.bgmValue)}` + (s.rankShow && s.rank ? ` · 排名 #${s.rank}` : '');
    ctx.fillStyle = s.color;
    ctx.fillText(txt, anchorX, y + s.size * 0.85);
    ctx.restore();
    return s.size * 1.25;
  }

  ctx.font = `800 ${s.size}px ${FONT_NUM}`;
  const numW = measure(ctx, main);
  const gx = align === 'center' ? anchorX - numW / 2 : align === 'right' ? anchorX - numW : x;
  const baseY = y + s.size * 0.79;
  if (s.shadow) { ctx.shadowColor = s.shadow.color; ctx.shadowBlur = s.shadow.blur; ctx.shadowOffsetY = s.shadow.y || 0; }
  if (s.stroke) { ctx.lineWidth = s.stroke.width; ctx.strokeStyle = s.stroke.color; ctx.strokeText(main, gx, baseY); }
  ctx.fillStyle = s.color;
  ctx.fillText(main, gx, baseY);
  if (s.shadow) { ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

  let rightEdge = gx + numW;
  if (s.unit) {
    ctx.font = `600 ${s.unitSize}px ${FONT_TEXT}`;
    ctx.fillStyle = s.subColor;
    ctx.fillText(s.unit, rightEdge + 12, baseY - 8);
    rightEdge += 12 + measure(ctx, s.unit);
  }
  // 右侧竖排：档位 + BGM + 排名
  const rx = rightEdge + 30;
  const rows = [];
  if (s.tier) rows.push({ type: 'tier', text: tierText(s.value) });
  if (s.bgmValue !== null) rows.push({ type: 'bgm', text: `BGM ${fmtScore(s.bgmValue)}` + (s.rankShow && s.rank ? `　排名 #${s.rank}` : '') });
  if (rows.length) {
    const rowHs = rows.map(r => r.type === 'tier' ? s.tierSize * 1.75 : s.subSize * 1.5);
    const totalH = rowHs.reduce((a, b) => a + b, 0);
    let ry = y + Math.max(0, (s.size * s.lineHeight - totalH) / 2);
    rows.forEach((r, i) => {
      if (r.type === 'tier') {
        ctx.font = `700 ${s.tierSize}px ${FONT_TEXT}`;
        const tw = measure(ctx, r.text);
        roundRect(ctx, rx, ry, tw + 30, s.tierSize * 1.72, 999);
        ctx.fillStyle = s.tierBg; ctx.fill();
        ctx.fillStyle = s.tierColor;
        ctx.fillText(r.text, rx + 15, ry + s.tierSize * 1.28);
      } else {
        ctx.font = `500 ${s.subSize}px ${FONT_TEXT}`;
        ctx.fillStyle = s.subColor;
        ctx.fillText(r.text, rx, ry + s.subSize * 1.16);
      }
      ry += rowHs[i];
    });
  }
  ctx.restore();
  return s.size * s.lineHeight;
}

function paintComment(ctx, c, x, w, y, align) {
  ctx.save();
  ctx.font = `${c.weight} ${c.size}px ${F(c.family)}`;
  const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const lh = c.size * c.lineHeight;
  const top = (lh - c.size * 0.74) / 2;
  let textX = anchorX;
  if (c.quote) {
    const qx = align === 'center' ? x : align === 'right' ? x + w - 8 : x;
    ctx.fillStyle = c.quoteColor;
    ctx.fillRect(qx, y + 2, 7, Math.max(0, c.lines.length * lh - 18));
    if (align === 'left') textX = x + 38;
  }
  ctx.textBaseline = 'alphabetic';
  if (c.shadow) { ctx.shadowColor = c.shadow.color; ctx.shadowBlur = c.shadow.blur; }
  c.lines.forEach((line, i) => {
    const baseY = y + i * lh + top + c.size * 0.74;
    if (c.stroke) { ctx.lineWidth = c.stroke.width; ctx.strokeStyle = c.stroke.color; ctx.strokeText(line, textX, baseY); }
    ctx.fillStyle = c.color;
    ctx.fillText(line, textX, baseY);
  });
  ctx.restore();
  return c.lines.length * lh;
}

function chipsWidth(ctx, line, gap, padX) {
  return line.reduce((a, it) => a + measure(ctx, it) + padX * 2, 0) + gap * Math.max(0, line.length - 1);
}
function paintMeta(ctx, m, x, w, y, align) {
  ctx.save();
  ctx.font = `${m.weight} ${m.size}px ${F(m.family)}`;
  const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const lh = m.size * m.lineHeight;
  const top = (lh - m.size * 0.74) / 2;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  m.lines.forEach((line, i) => {
    const baseY = y + i * lh + top + m.size * 0.74;
    const total = chipsWidth(ctx, line, m.gap, m.padX);
    let cx = align === 'center' ? anchorX - total / 2 : align === 'right' ? anchorX - total : x;
    line.forEach((item, j) => {
      const iw = measure(ctx, item) + m.padX * 2;
      if (m.chipBg) {
        roundRect(ctx, cx, baseY - m.size * 1.2, iw, m.size * 1.72, m.radius);
        ctx.fillStyle = m.chipBg; ctx.fill();
      }
      if (m.dot && j > 0 && !m.chipBg) {
        ctx.fillStyle = m.dotColor;
        ctx.beginPath();
        ctx.arc(cx - m.gap / 2, baseY - m.size * 0.34, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = m.chipBg && m.chipColor ? m.chipColor : m.color;
      ctx.fillText(item, cx + m.padX, baseY);
      cx += iw + m.gap;
    });
  });
  ctx.restore();
  return m.lines.length * lh;
}

function paintFooter(ctx, f, x, w, y, align) {
  ctx.save();
  ctx.font = `${f.weight} ${f.size}px ${F(f.family)}`;
  ctx.textBaseline = 'alphabetic';
  const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const baseY = y + f.size * 0.9;
  const widths = f.parts.map(p => measure(ctx, p));
  if (f.separator && f.separator.length) {
    const sepW = measure(ctx, f.separator) * (f.parts.length - 1);
    const total = widths.reduce((a, b) => a + b, 0) + sepW;
    let cx = align === 'center' ? anchorX - total / 2 : align === 'right' ? anchorX - total : x;
    ctx.textAlign = 'left';
    f.parts.forEach((p, i) => {
      if (i > 0) { ctx.fillStyle = f.sepColor; ctx.fillText(f.separator, cx, baseY); cx += measure(ctx, f.separator); }
      ctx.fillStyle = i === 0 ? f.color : f.accentColor;
      ctx.fillText(p, cx, baseY);
      cx += widths[i];
    });
  } else {
    ctx.textAlign = align;
    f.parts.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? f.color : f.accentColor;
      ctx.fillText(p, anchorX, baseY + i * f.size * 1.5);
    });
  }
  ctx.restore();
  return f.size * 1.5 * f.parts.length;
}

/* ===========================================================
   信息区容器（少数主题需要把信息放进卡片里）
   =========================================================== */

function glassPanel(ctx, x, y, w, h, radius, tint = 'rgba(255,255,255,.12)', border = 'rgba(255,255,255,.28)') {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = tint; ctx.fill();
  ctx.restore();
  strokeRoundRect(ctx, x, y, w, h, radius, border, 2);
}

/* ===========================================================
   spec 编译
   =========================================================== */

function compileSpec(theme, pal, state, ctx) {
  const { subject, opts } = state;
  const S = theme.info;
  const light = isLightPalette(pal);
  const onDark = !light;
  const base = onDark ? '#FFFFFF' : '#141414';
  const align = opts.alignOverride && opts.alignOverride !== 'auto' ? opts.alignOverride : S.align;

  const X = 72 + (S.inset || 0);
  const W = BASE_W - X * 2;

  const titleText = (subject?.displayTitle || subject?.nameCn || subject?.name || '').trim();
  let title = null;
  if (titleText && opts.showTitle !== false) {
    let size = S.titleSize;
    if (S.autoFit) size = fitSize(ctx, titleText, F(S.titleFont), S.titleWeight, W, S.titleSize, S.autoFitMin || 36);
    ctx.font = `${S.titleWeight} ${size}px ${F(S.titleFont)}`;
    const lines = wrapTextLocal(ctx, titleText, W, S.titleMaxLines || 2);
    title = {
      lines, size, weight: S.titleWeight, family: S.titleFont,
      lineHeight: S.titleLineHeight,
      color: S.titleColor || base,
      shadow: theme.effects?.titleGlow ? { color: rgba(pal.accent, theme.effects.titleGlow), blur: 30, y: 0 } : null,
      stroke: S.titleStroke || null,
      spacing: opts.titleSpacing ?? S.titleSpacing ?? 0,
    };
  }

  const userScore = fmtScore(opts.userScore);
  const bgmScore = opts.showBgm !== false ? fmtScore(subject?.score) : null;
  const scoreVal = userScore ?? bgmScore;
  let score = null;
  if (opts.showScore !== false && (scoreVal !== null)) {
    score = {
      value: Number(scoreVal),
      bgmValue: bgmScore !== null ? Number(bgmScore) : null,
      rank: subject?.rank ?? null,
      rankShow: opts.showRank !== false,
      tier: opts.showTier !== false,
      size: S.scoreSize, lineHeight: 1.0,
      unit: (opts.scoreUnit || '').trim(),
      unitSize: Math.round(S.scoreSize * 0.21),
      tierSize: S.tierSize, subSize: S.subSize,
      color: S.scoreColor || pal.score || base,
      subColor: S.subColor || (onDark ? 'rgba(255,255,255,.66)' : 'rgba(20,20,20,.56)'),
      tierBg: S.tierBg || rgba(pal.accent, 0.18),
      tierColor: S.tierColor || (onDark ? '#fff' : '#111'),
      shadow: theme.effects?.scoreGlow ? { color: rgba(S.scoreColor || pal.accent, theme.effects.scoreGlow), blur: 36, y: 0 } : null,
      stroke: S.scoreStroke || null,
    };
    if (!score.tier) score.tier = false;
  }

  const ct = (opts.comment || '').trim();
  let comment = null;
  if (ct && opts.showComment !== false) {
    ctx.font = `${S.commentWeight} ${S.commentSize}px ${F(S.commentFont)}`;
    const availW = W - (S.quote ? 42 : 0);
    comment = {
      lines: wrapTextLocal(ctx, ct, availW, S.commentMaxLines || 3),
      size: S.commentSize, weight: S.commentWeight, family: S.commentFont,
      lineHeight: S.commentLineHeight,
      color: S.commentColor || (onDark ? 'rgba(255,255,255,.8)' : 'rgba(20,20,20,.74)'),
      quote: S.quote, quoteColor: rgba(pal.accent, 0.8),
      shadow: null, stroke: null,
    };
  }

  let meta = null;
  if (opts.showMeta !== false) {
    const items = [];
    const push = v => { if (v && String(v).trim()) items.push(String(v).trim()); };
    if (opts.showOriginal !== false && subject?.name && subject.name !== titleText) push(subject.name);
    push(subject?.year ? subject.year + ' 年' : '');
    const eps = (subject?.eps || '').replace(/[^0-9]/g, '');
    push(eps ? '全 ' + eps + ' 话' : '');
    push(subject?.studio || '');
    if (opts.showTags !== false && subject?.tags?.length) push(subject.tags.slice(0, 2).join(' / '));
    if (items.length) {
      ctx.font = `${S.metaWeight} ${S.metaSize}px ${FONT_TEXT}`;
      // 限制条目数量，避免信息区过高把海报挤扁
      const capped = S.metaMaxItems ? items.slice(0, S.metaMaxItems) : items;
      // 胶囊型主题强制一个信息一个胶囊，排布更整齐
      const lines = S.metaChipOnePerLine
        ? capped.map(x => [x])
        : wrapChipsLocal(ctx, capped, W, S.chipGap, S.chipPadX);
      meta = {
        lines,
        size: S.metaSize, weight: S.metaWeight, family: 'text',
        lineHeight: S.metaLineHeight, gap: S.chipGap, padX: S.chipPadX,
        color: S.metaColor || (onDark ? 'rgba(255,255,255,.46)' : 'rgba(20,20,20,.44)'),
        chipBg: S.chipBg || null,
        chipColor: S.chipColor || null,
        radius: S.chipRadius,
        dot: S.chipDot, dotColor: S.chipDotColor || (onDark ? 'rgba(255,255,255,.4)' : 'rgba(20,20,20,.3)'),
      };
    }
  }

  let footer = null;
  const parts = [];
  if ((opts.footerCustom || '').trim()) parts.push(opts.footerCustom.trim());
  else {
    if (subject?.id) parts.push('数据来自 Bangumi 番组计划');
    if (opts.watermark !== false && (opts.xhsId || '').trim()) parts.push(opts.xhsId.trim());
  }
  if (parts.length) {
    footer = {
      parts, size: S.footSize, weight: 500, family: 'text',
      color: S.footColor || (onDark ? 'rgba(255,255,255,.42)' : 'rgba(20,20,20,.4)'),
      accentColor: S.footAccent || rgba(pal.accent, onDark ? 0.85 : 1),
      separator: S.footSeparator,
      sepColor: onDark ? 'rgba(255,255,255,.28)' : 'rgba(20,20,20,.25)',
    };
  }

  return { x: X, w: W, align, kicker: null, title, score, comment, meta, footer, gaps: S.gaps, infoS: S };
}

function wrapTextLocal(ctx, text, maxW, maxLines) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const ch of para) {
      if (measure(ctx, line + ch) > maxW && line) { out.push(line); line = ch; }
      else line += ch;
      if (out.length >= maxLines) break;
    }
    if (out.length >= maxLines) break;
    if (line) out.push(line);
  }
  if (out.length >= maxLines) {
    const flat = String(text).replace(/\n/g, '');
    if (out.join('').length < flat.length) {
      let last = out[maxLines - 1];
      while (last.length > 1 && measure(ctx, last + '…') > maxW) last = last.slice(0, -1);
      out[maxLines - 1] = last + '…';
    }
  }
  return out.slice(0, maxLines);
}
function wrapChipsLocal(ctx, items, maxW, gap, padX) {
  const lines = [[]]; let w = 0;
  for (const it of items) {
    const iw = measure(ctx, it) + padX * 2;
    const add = lines[lines.length - 1].length ? gap + iw : iw;
    if (w + add > maxW && lines[lines.length - 1].length) { lines.push([it]); w = iw; }
    else { lines[lines.length - 1].push(it); w += add; }
  }
  return lines;
}

/**
 * 角标（用户自定义文案，可为空）
 * 两种贴法：
 *   mode 'inline' —— 信息区第一行（原有做法）
 *   mode 'corner' —— 斜贴在画面左上角（bleed 主题用，更抢眼）
 */
function buildKicker(theme, pal, state, ctx) {
  const text = (state.opts.badge || '').trim();
  if (!text) return null;
  const S = theme.info;
  const onDark = !isLightPalette(pal);
  ctx.font = `${S.kickerWeight} ${S.kickerSize}px ${F(S.kickerFamily)}`;
  const tw = S.kickerSpacing
    ? [...text].reduce((a, c) => a + measure(ctx, c), 0) + S.kickerSpacing * (text.length - 1)
    : measure(ctx, text);
  return {
    mode: S.kickerMode || 'inline',
    text, size: S.kickerSize, weight: S.kickerWeight, family: S.kickerFamily,
    color: S.kickerColor || (S.kickerBg ? readableOn(S.kickerBg, '#fff', '#111') : (onDark ? pal.accent : pal.accent)),
    bg: S.kickerBg || null, border: S.kickerBorder || null, borderWidth: S.kickerBorderWidth || 2,
    underline: S.kickerUnderline || null, underlineW: null, underlineH: S.kickerUnderlineH || 4,
    padX: S.kickerPadX, radius: S.kickerRadius, spacing: S.kickerSpacing,
    ribbon: S.ribbon || null,
    shadow: null, textW: tw,
  };
}

/* ===========================================================
   主题定义
   =========================================================== */

export const THEMES = [
  {
    id: 'magazine', name: '杂志编辑', desc: '米白纸底 + 巨大数字 + 编辑排版，像动画杂志内页',
    tags: ['浅色', '编辑排版'], defaultPalette: 'cream',
    info: {
      align: 'left', inset: 8,
      titleSize: 68, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.24, titleMaxLines: 2, autoFit: true, autoFitMin: 40,
      scoreSize: 152, scoreColor: null, tierSize: 30, subSize: 27,
      commentSize: 34, commentWeight: 400, commentFont: 'text', commentLineHeight: 1.56, commentMaxLines: 3,
      metaSize: 26, metaWeight: 500, metaLineHeight: 1.9, chipGap: 26, chipPadX: 0, chipDot: true, chipRadius: 999,
      kickerSize: 28, kickerWeight: 700, kickerFamily: 'text', kickerPadX: 26, kickerRadius: 8, kickerSpacing: 0,
      footSize: 25, footSeparator: '／',
      gaps: { kicker: 24, title: 26, score: 30, comment: 22, meta: 24, footer: 26 },
    },
    poster: { mode: 'block', w: 0.94, hFactor: 0.92, y: 92, radius: 4, frame: 'paper', focusY: 0.42 },
    draw(ctx, c) {
      const { W, H, pal, img, state, P } = c;
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
      paperTexture(ctx, 0, 0, W, H, pal.ink, 0.05, 420);
      ctx.fillStyle = pal.accent; ctx.fillRect(0, 0, W, 16);
      ctx.fillStyle = pal.accent2; ctx.fillRect(0, 16, W * 0.34, 6);
      // 海报纸卡
      ctx.save();
      ctx.shadowColor = 'rgba(24,22,20,.24)'; ctx.shadowBlur = 46; ctx.shadowOffsetY = 18;
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, P.x - 10, P.y - 10, P.w + 20, P.h + 20, 3); ctx.fill();
      ctx.restore();
      paintPoster(ctx, c);
      strokeRoundRect(ctx, P.x - 10, P.y - 10, P.w + 20, P.h + 20, 3, 'rgba(24,22,20,.14)', 2);      // 左侧竖排装饰
      ctx.save();
      ctx.translate(P.x - 34, P.y + P.h);
      ctx.rotate(-Math.PI / 2);
      ctx.font = `600 21px ${FONT_TEXT}`;
      ctx.fillStyle = 'rgba(24,22,20,.32)';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${state.subject?.year || ''}　ANIMATION REVIEW`, 20, 0);
      ctx.restore();
    },
  },

  {
    id: 'impact', name: '热血冲击', desc: '深底 + 超大字 + 斜切色块与速度线，适合高能吐槽',
    tags: ['深色', '强冲击'], defaultPalette: 'vermilion',
    effects: { titleGlow: 0.5, scoreGlow: 0.45 },
    info: {
      align: 'left', inset: 0,
      titleSize: 86, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.14, titleMaxLines: 2, autoFit: true, autoFitMin: 44,
      scoreSize: 164, tierSize: 32, subSize: 28, scoreColor: null,
      commentSize: 36, commentWeight: 500, commentFont: 'text', commentLineHeight: 1.55, commentMaxLines: 3,
      metaSize: 27, metaWeight: 500, metaLineHeight: 1.95, chipGap: 26, chipPadX: 0, chipDot: true,
      kickerSize: 30, kickerWeight: 700, kickerFamily: 'text', kickerPadX: 24, kickerRadius: 3, kickerSpacing: 3,
      footSize: 25, footSeparator: '·',
      gaps: { kicker: 26, title: 28, score: 32, comment: 24, meta: 24, footer: 26 },
    },
    poster: { mode: 'block', w: 0.62, hFactor: 1.42, y: 88, radius: 4, frame: 'slash', focusY: 0.35 },
    draw(ctx, c) {
      const { W, H, pal, img, P } = c;
      ctx.fillStyle = '#0A0A0F'; ctx.fillRect(0, 0, W, H);
      backdrop(ctx, img, W, H, { blur: 88, darken: 0.62, saturate: 1.2, tint: pal.bg, tintAlpha: 0.62 });
      speedLines(ctx, 0, 0, W, H, pal.accent, 34, 0.15);
      ctx.save();
      ctx.globalAlpha = 0.15; ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.46); ctx.lineTo(W, H * 0.40); ctx.lineTo(W, H * 0.62); ctx.lineTo(0, H * 0.68);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // 错位边框
      roundRect(ctx, P.x - 16, P.y + 16, P.w + 32, P.h + 32, 6);
      ctx.fillStyle = rgba(pal.accent, 0.92); ctx.fill();
      roundRect(ctx, P.x - 7, P.y + 7, P.w + 14, P.h + 14, 6);
      ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fill();
      paintPoster(ctx, c);
      strokeRoundRect(ctx, P.x, P.y, P.w, P.h, 3, 'rgba(255,255,255,.85)', 3);
      cornerMarks(ctx, P.x - 26, P.y - 26, P.w + 52, P.h + 52, 56, pal.accent, 6);
    },
  },

  {
    id: 'neon', name: '霓虹赛博', desc: '深紫黑 + 青粉霓虹描边 + 网格扫描线，夜间刷番氛围',
    tags: ['深色', '霓虹'], defaultPalette: 'cyber',
    effects: { titleGlow: 0.7, scoreGlow: 0.62 },
    info: {
      align: 'left', inset: 4,
      titleSize: 74, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.2, titleMaxLines: 2, autoFit: true, autoFitMin: 42,
      scoreSize: 158, tierSize: 30, subSize: 27,
      commentSize: 34, commentWeight: 400, commentFont: 'text', commentLineHeight: 1.56, commentMaxLines: 3,
      metaSize: 26, metaWeight: 500, metaLineHeight: 1.95, chipGap: 26, chipPadX: 0, chipDot: true,
      kickerSize: 28, kickerWeight: 600, kickerFamily: 'text', kickerPadX: 26, kickerRadius: 6, kickerSpacing: 3,
      kickerBorder: null, kickerBg: 'rgba(0,0,0,.4)', kickerColor: null, kickerBorderWidth: 2,
      footSize: 25, footSeparator: ' ／ ',
      gaps: { kicker: 26, title: 28, score: 32, comment: 24, meta: 24, footer: 26 },
    },
    poster: { mode: 'block', w: 0.60, hFactor: 1.42, y: 96, radius: 6, frame: 'neon', focusY: 0.4 },
    draw(ctx, c) {
      const { W, H, pal, img, P, state } = c;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0B0618'); g.addColorStop(0.55, '#120A2A'); g.addColorStop(1, '#05030E');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      backdrop(ctx, img, W, H, { blur: 96, darken: 0.66, saturate: 1.3, tint: pal.bg, tintAlpha: 0.66 });
      grid(ctx, 0, 0, W, H, pal.accent, 54, 1.5, 0.12);
      ctx.save();
      ctx.shadowColor = pal.accent; ctx.shadowBlur = 44;
      strokeRoundRect(ctx, P.x - 11, P.y - 11, P.w + 22, P.h + 22, 8, pal.accent, 3);
      ctx.shadowColor = pal.accent2; ctx.shadowBlur = 30;
      strokeRoundRect(ctx, P.x - 23, P.y - 23, P.w + 46, P.h + 46, 11, pal.accent2, 2);
      ctx.restore();
      paintPoster(ctx, c);
      scanlines(ctx, P.x, P.y, P.w, P.h, '#000', 6, 2, 0.2);
      cornerMarks(ctx, P.x - 32, P.y - 32, P.w + 64, P.h + 64, 42, pal.accent2, 3);
      ctx.save();
      ctx.translate(W - 52, P.y + P.h);
      ctx.rotate(-Math.PI / 2);
      ctx.font = `600 20px ${FONT_NUM}`;
      ctx.fillStyle = rgba(pal.accent2, 0.8);
      ctx.textBaseline = 'middle';
      ctx.fillText(`BGM-${state.subject?.id ?? '------'} / ${fmtScore(state.opts.userScore ?? state.subject?.score) ?? '--'}`, 20, 0);
      ctx.restore();
    },
  },

  {
    id: 'minimal', name: '极简通风', desc: '大留白 + 细线分组 + 小字号，安静克制的高级感',
    tags: ['浅色', '极简'], defaultPalette: 'mono', skipGrain: true,
    info: {
      align: 'left', inset: 24,
      titleSize: 58, titleWeight: 600, titleFont: 'text', titleLineHeight: 1.36, titleMaxLines: 2, autoFit: true, autoFitMin: 38,
      scoreSize: 128, tierSize: 25, subSize: 24, scoreColor: null,
      commentSize: 32, commentWeight: 400, commentFont: 'text', commentLineHeight: 1.62, commentMaxLines: 3,
      metaSize: 24, metaWeight: 500, metaLineHeight: 1.85, chipGap: 36, chipPadX: 0, chipDot: false,
      kickerSize: 25, kickerWeight: 600, kickerFamily: 'text', kickerPadX: 0, kickerRadius: 0,
      kickerSpacing: 6, kickerUnderline: null, kickerUnderlineH: 4,
      footSize: 23, footSeparator: '',
      gaps: { kicker: 26, title: 24, score: 28, comment: 22, meta: 22, footer: 24 },
    },
    poster: { mode: 'block', w: 0.80, hFactor: 1.30, y: 128, radius: 2, frame: 'hairline', focusY: 0.4 },
    draw(ctx, c) {
      const { W, H, pal, img, P, state } = c;
      ctx.fillStyle = '#FAFAF8'; ctx.fillRect(0, 0, W, H);
      paperTexture(ctx, 0, 0, W, H, '#141414', 0.022, 300);
      ctx.save();
      ctx.shadowColor = 'rgba(20,22,26,.10)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 22;
      ctx.fillStyle = '#fff'; ctx.fillRect(P.x, P.y, P.w, P.h);
      ctx.restore();
      paintPoster(ctx, c);
      ctx.strokeStyle = 'rgba(22,24,28,.10)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(P.x, P.y, P.w, P.h);
      ctx.font = `500 21px ${FONT_TEXT}`;
      ctx.fillStyle = 'rgba(22,24,28,.34)';
      ctx.fillText('ANIME', P.x, 86);
      ctx.fillStyle = pal.accent;
      ctx.fillRect(P.x + measure(ctx, 'ANIME') + 18, 76, 46, 3);
      ctx.textAlign = 'right';
      ctx.fillText(String(state.subject?.year || '—'), P.x + P.w, 86);
      ctx.textAlign = 'left';
    },
  },

  {
    id: 'film', name: '胶片放映', desc: '暖褐调 + 齿孔边框 + 日期戳，老片重映的怀旧感',
    tags: ['暖色', '复古'], defaultPalette: 'sepia',
    info: {
      align: 'left', inset: 18,
      titleSize: 62, titleWeight: 700, titleFont: 'serif', titleLineHeight: 1.3, titleMaxLines: 2, autoFit: true, autoFitMin: 38,
      scoreSize: 142, tierSize: 28, subSize: 26, scoreColor: null,
      commentSize: 33, commentWeight: 400, commentFont: 'text', commentLineHeight: 1.6, commentMaxLines: 3,
      metaSize: 25, metaWeight: 500, metaLineHeight: 1.92, chipGap: 28, chipPadX: 0, chipDot: true,
      kickerSize: 26, kickerWeight: 700, kickerFamily: 'text', kickerPadX: 22, kickerRadius: 2, kickerSpacing: 4,
      footSize: 24, footSeparator: ' · ',
      gaps: { kicker: 24, title: 26, score: 30, comment: 22, meta: 24, footer: 26 },
    },
    poster: { mode: 'block', w: 0.86, hFactor: 1.30, y: 156, radius: 2, frame: 'film', focusY: 0.4 },
    draw(ctx, c) {
      const { W, H, pal, img, P, state } = c;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#241A10'); g.addColorStop(0.5, '#2E2114'); g.addColorStop(1, '#1A1209');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      backdrop(ctx, img, W, H, { blur: 86, darken: 0.58, saturate: 0.85, tint: '#2A1E12', tintAlpha: 0.58 });
      paperTexture(ctx, 0, 0, W, H, '#F6EDDC', 0.05, 380);
      ctx.fillStyle = 'rgba(12,8,4,.92)';
      ctx.fillRect(P.x - 30, P.y - 34, P.w + 60, P.h + 68);
      ctx.fillStyle = '#2E2114';
      for (let hx = P.x - 12; hx < P.x + P.w + 12 - 20; hx += 46) {
        roundRect(ctx, hx, P.y - 26, 20, 28, 4); ctx.fill();
        roundRect(ctx, hx, P.y + P.h - 2, 20, 28, 4); ctx.fill();
      }
      paintPoster(ctx, c);
      ctx.strokeStyle = rgba(pal.accent, 0.5); ctx.lineWidth = 2;
      ctx.strokeRect(P.x, P.y, P.w, P.h);
      const stamp = (state.subject?.date || '').replace(/-/g, ' . ');
      if (stamp) {
        ctx.save();
        ctx.translate(P.x + P.w - 24, P.y + P.h - 26);
        ctx.rotate(-Math.PI / 2);
        ctx.font = `600 23px ${FONT_NUM}`;
        ctx.fillStyle = rgba(pal.accent, 0.95);
        ctx.textBaseline = 'middle';
        ctx.fillText(stamp, 8, 0);
        ctx.restore();
      }
      ctx.font = `700 21px ${FONT_NUM}`;
      ctx.fillStyle = rgba(pal.accent, 0.85);
      ctx.fillText('● 35MM ／ ANIMATION', P.x - 30, 94);
      ctx.fillStyle = rgba(pal.accent, 0.32);
      ctx.fillRect(P.x - 30, 112, W - (P.x - 30) * 2, 2);
    },
  },

  {
    id: 'glass', name: '玻璃卡片', desc: '海报模糊铺满 + 毛玻璃信息卡，现代 App 界面质感',
    tags: ['深色', '玻璃拟态'], defaultPalette: 'midnight',
    info: {
      align: 'left', inset: 32,
      titleSize: 64, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.24, titleMaxLines: 2, autoFit: true, autoFitMin: 38,
      scoreSize: 144, tierSize: 28, subSize: 26, scoreColor: null,
      commentSize: 33, commentWeight: 400, commentFont: 'text', commentLineHeight: 1.58, commentMaxLines: 3,
      metaSize: 25, metaWeight: 500, metaLineHeight: 1.9, chipGap: 16, chipPadX: 24, chipDot: false, chipRadius: 999,
      chipBg: 'rgba(255,255,255,.15)', chipColor: 'rgba(255,255,255,.88)', metaChipOnePerLine: true, metaMaxItems: 3,
      kickerSize: 26, kickerWeight: 700, kickerFamily: 'text', kickerPadX: 24, kickerRadius: 999,
      kickerBg: 'rgba(255,255,255,.15)', kickerBorder: 'rgba(255,255,255,.35)', kickerBorderWidth: 1.5, kickerColor: '#fff',
      footSize: 24, footSeparator: ' · ',
      gaps: { kicker: 24, title: 26, score: 30, comment: 22, meta: 22, footer: 26 },
    },
    poster: { mode: 'block', w: 0.50, hFactor: 1.42, y: 128, radius: 26, frame: 'glass', focusY: 0.4 },
    draw(ctx, c) {
      const { W, H, pal, img, P } = c;
      backdrop(ctx, img, W, H, { blur: 64, darken: 0.34, scale: 1.45, saturate: 1.2 });
      const cardY = 70, cardH = H - cardY * 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.42)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
      roundRect(ctx, 56, cardY, W - 112, cardH, 52);
      ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.fill();
      ctx.restore();
      strokeRoundRect(ctx, 56, cardY, W - 112, cardH, 52, 'rgba(255,255,255,.3)', 2);
      ctx.save();
      clipRoundRect(ctx, 56, cardY, W - 112, cardH, 52);
      const hg = ctx.createLinearGradient(0, cardY, 0, cardY + 240);
      hg.addColorStop(0, 'rgba(255,255,255,.16)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg; ctx.fillRect(56, cardY, W - 112, 260);
      ctx.restore();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      roundRect(ctx, P.x, P.y, P.w, P.h, P.radius); ctx.fill();
      ctx.restore();
      paintPoster(ctx, c);
      strokeRoundRect(ctx, P.x, P.y, P.w, P.h, P.radius, 'rgba(255,255,255,.35)', 2);
    },
  },

  {
    id: 'paper', name: '黑白报纸', desc: '纯黑白 + 衬线字 + 分栏细线，像一篇严肃的动画评论',
    tags: ['黑白色', '报纸'], defaultPalette: 'mono', skipGrain: true,
    info: {
      align: 'left', inset: 2,
      titleSize: 72, titleWeight: 700, titleFont: 'serif', titleLineHeight: 1.22, titleMaxLines: 2, autoFit: true, autoFitMin: 40,
      scoreSize: 150, tierSize: 28, subSize: 26, scoreColor: '#0D0D0D',
      commentSize: 33, commentWeight: 400, commentFont: 'serif', commentLineHeight: 1.62, commentMaxLines: 3,
      metaSize: 24, metaWeight: 500, metaLineHeight: 1.9, chipGap: 32, chipPadX: 0, chipDot: false,
      kickerSize: 26, kickerWeight: 700, kickerFamily: 'text', kickerPadX: 20, kickerRadius: 0, kickerSpacing: 5,
      footSize: 23, footSeparator: ' — ',
      gaps: { kicker: 24, title: 26, score: 30, comment: 22, meta: 24, footer: 26 },
    },
    poster: { mode: 'block', w: 0.86, hFactor: 1.26, y: 168, radius: 0, frame: 'print', focusY: 0.4 },
    draw(ctx, c) {
      const { W, pal, img, P, state } = c;
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, BASE_W * 2);
      paperTexture(ctx, 0, 0, W, c.H, '#111', 0.05, 460);
      ctx.fillStyle = '#111';
      ctx.font = `700 30px ${FONT_SERIF}`;
      ctx.fillText('ANIME　CRITIQUE', P.x, 96);
      ctx.font = `500 21px ${FONT_TEXT}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(13,13,13,.6)';
      ctx.fillText(state.subject?.date || '', P.x + P.w, 96);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111';
      ctx.fillRect(P.x, 116, P.w, 5);
      ctx.fillRect(P.x, 126, P.w, 2);
      paintPoster(ctx, c);
      halftone(ctx, P.x, P.y, P.w, P.h, '#111', 16, 1.6, 0.10);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
      ctx.strokeRect(P.x, P.y, P.w, P.h);
    },
  },

  {
    id: 'wa', name: '和风斜纹', desc: '藏青底 + 朱红印章 + 斜纹，日式番剧介绍页',
    tags: ['深色', '和风'], defaultPalette: 'ink',
    info: {
      align: 'left', inset: 12,
      titleSize: 70, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.24, titleMaxLines: 2, autoFit: true, autoFitMin: 40,
      scoreSize: 146, tierSize: 30, subSize: 27, scoreColor: null,
      commentSize: 34, commentWeight: 400, commentFont: 'text', commentLineHeight: 1.58, commentMaxLines: 3,
      metaSize: 26, metaWeight: 500, metaLineHeight: 1.92, chipGap: 28, chipPadX: 0, chipDot: true,
      kickerSize: 28, kickerWeight: 700, kickerFamily: 'text', kickerPadX: 22, kickerRadius: 2, kickerSpacing: 4,
      footSize: 25, footSeparator: ' ・ ',
      gaps: { kicker: 26, title: 26, score: 30, comment: 22, meta: 24, footer: 26 },
    },
    poster: { mode: 'block', w: 0.72, hFactor: 1.42, y: 104, radius: 0, frame: 'waku', focusY: 0.4 },
    draw(ctx, c) {
      const { W, H, pal, img, P, state } = c;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#101C2E'); g.addColorStop(1, '#0A1220');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      backdrop(ctx, img, W, H, { blur: 82, darken: 0.6, saturate: 0.95, tint: '#0F1B24', tintAlpha: 0.6 });
      hatch(ctx, 0, 0, W, H, '#F4EFE4', 22, 2, 0.05);
      strokeRoundRect(ctx, P.x - 20, P.y - 20, P.w + 40, P.h + 40, 0, 'rgba(244,239,228,.26)', 2);
      ctx.fillStyle = rgba(pal.accent, 0.92);
      ctx.fillRect(P.x - 20, P.y - 20, P.w + 40, 7);
      paintPoster(ctx, c);
      strokeRoundRect(ctx, P.x, P.y, P.w, P.h, 0, '#F4EFE4', 2.5);
      // 印章
      const ss = 112;
      const sx = W - 84 - ss / 2, sy = P.y - 20;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(-0.06);
      roundRect(ctx, -ss / 2, -ss / 2, ss, ss, 6);
      ctx.fillStyle = pal.accent; ctx.fill();
      ctx.fillStyle = '#F4EFE4';
      ctx.font = `700 34px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtScore(state.opts.userScore ?? state.subject?.score) ?? '—', 0, -8);
      ctx.font = `600 17px ${FONT_TEXT}`;
      ctx.fillText('MY SCORE', 0, 28);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
    },
  },

  /* ---------------------------------------------------------
     9. 雪村葵 —— 专属主题
     满幅海报铺满整张画布、文字直接叠压在图上，海报占比 100%。
     向山进发的要素做得很含蓄：等高线纹理、山脊线、登山路线的圆点虚线、
     左下角一行坐标（谷川岳一带），以及一枚小小的「山」戳。
     懂的人会心一笑，不懂的人只觉得是一张有质感的山系封面。
     --------------------------------------------------------- */
  {
    id: 'aoi',
    name: '雪村葵',
    desc: '满幅海报 + 山系等高线 + 斜角角标，向山进发要素藏在细节里',
    tags: ['满幅海报', '山系', '专属'],
    defaultPalette: 'forest',
    skipGrain: true,
    effects: { titleGlow: 0.28, scoreGlow: 0.2 },
    crumb: '36.84°N 138.93°E　谷川岳',
    info: {
      align: 'left', inset: 0,
      titleSize: 78, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.2, titleMaxLines: 2,
      autoFit: true, autoFitMin: 40,
      scoreSize: 152, tierSize: 30, subSize: 27, scoreColor: null,
      commentSize: 34, commentWeight: 400, commentFont: 'text', commentLineHeight: 1.55, commentMaxLines: 3,
      metaSize: 26, metaWeight: 500, metaLineHeight: 1.88, chipGap: 26, chipPadX: 0, chipDot: true,
      // 角标斜贴在左上角
      kickerMode: 'corner',
      kickerSize: 27, kickerWeight: 700, kickerFamily: 'text', kickerSpacing: 2,
      ribbon: { size: 27, weight: 700, spacing: 3, h: 64, centerAt: 178, padding: 36, flare: 14, angle: 45 },
      footSize: 24, footSeparator: '　·　',
      gaps: { kicker: 0, title: 26, score: 30, comment: 22, meta: 24, footer: 26 },
      // 信息区更靠底，把画面主体完整留给海报
      bottomBias: 1.12,
    },
    poster: { mode: 'bleed', focusY: 0.32 },
    draw(ctx, c) {
      const { W, H, pal, img, state, spec } = c;

      // 1) 海报铺满整张画布
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      paintBleedPoster(ctx, c, { focusY: 0.32 });

      // 2) 压暗渐变，保证叠压的文字读得清
      paintScrim(ctx, W, H, 'sunset');

      // 3) 等高线（缓存一次，之后只是 drawImage）
      if (!this._contour) this._contour = makeContourTexture(W, H, '#EAF6EF', { alpha: 0.13, lines: 9, step: 30 });
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this._contour, 0, 0);
      ctx.restore();

      // 4) 斜角角标（左上）
      const k = spec.kicker;
      if (k && k.mode === 'corner') {
        paintCornerRibbon(ctx, W, H, {
          text: k.text,
          size: k.ribbon?.size ?? k.size,
          weight: k.ribbon?.weight ?? k.weight,
          spacing: k.ribbon?.spacing ?? k.spacing,
          h: k.ribbon?.h ?? 64,
          centerAt: k.ribbon?.centerAt ?? 175,
          padding: k.ribbon?.padding ?? 34,
          flare: k.ribbon?.flare ?? 12,
          angle: k.ribbon?.angle ?? 45,
          bg: pal.accent,
          color: readableOn(pal.accent, '#FFFFFF', '#141414'),
        });
      }

      // 5) 山脊线：贴着信息区上方，像远处的山
      const infoTop = H - 430;
      ridgeLine(ctx, spec.x, infoTop - 26, spec.w, '#CFE9DD', 3, 0.32);

      // 6) 登山路线的圆点虚线 + 坐标（左下角的小细节）
      trailDots(ctx, spec.x, H - 30, pal.accent2, { count: 14, r: 2.4, gap: 15, alpha: 0.42, arc: 9 });
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.font = `500 21px ${FONT_NUM}`;
      ctx.fillStyle = '#EAF6EF';
      ctx.textAlign = 'right';
      ctx.fillText(this.crumb || '', W - 56, H - 26);
      ctx.restore();

      // 7) 小小的「山」戳（右下角，藏在角落里）
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = '#EAF6EF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W - 52, H - 84, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W - 66, H - 78);
      ctx.lineTo(W - 56, H - 92);
      ctx.lineTo(W - 46, H - 78);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W - 58, H - 92);
      ctx.lineTo(W - 56, H - 98);
      ctx.lineTo(W - 53, H - 92);
      ctx.stroke();
      ctx.restore();
    },
  },
];

export function themeById(id) { return THEMES.find(t => t.id === id) || THEMES[0]; }

/* ===========================================================
   主渲染入口
   =========================================================== */

export function renderTheme(canvas, state) {
  const opts = state.opts;
  const theme = themeById(opts.theme);
  const pal = paletteById(opts.palette || theme.defaultPalette);
  const H = RATIOS[opts.ratio] ?? 1440;
  const W = BASE_W;
  const scale = (opts.exportWidth || BASE_W) / BASE_W;

  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const spec = compileSpec(theme, pal, state, ctx);
  spec.kicker = buildKicker(theme, pal, state, ctx);

  const img = state.posterImg;
  const bleed = theme.poster.mode === 'bleed';
  const P = bleed
    // 满幅模式：海报的"矩形"就是整张画布，主题自己去 cover 绘制
    ? { x: 0, y: 0, w: W, h: H, radius: 0, focusY: theme.poster.focusY ?? 0.34 }
    : layoutPosterBlock(theme, spec, W, H, ctx);

  const c = { ctx, W, H, pal, img, P, spec, state, opts, theme };
  theme.draw(ctx, c);

  if (bleed) {
    // 满幅模式：信息区从底部往上排。
    // 一定要在 theme.draw 之后画 —— 压暗渐变在 draw 里，先画文字会被盖住。
    const scratch = getScratch();
    const sctx = scratch.getContext('2d');
    sctx.setTransform(scale, 0, 0, scale, 0, 0);
    const used = paintInfoZone(sctx, spec, 0, H);
    const bottomPad = Math.round(84 * (theme.info.bottomBias ?? 1));
    paintInfoZone(ctx, spec, H - bottomPad - used, H);
  } else {
    // 版式：先离屏量高度，再定位置，最后只画一次。
    // 内容少的时候把富余空间均分到海报下方与信息区下方，避免空白全堆在底部。
    const infoY = P.y + P.h + (theme.poster.infoGap ?? 52);
    const scratch = getScratch();
    const sctx = scratch.getContext('2d');
    sctx.setTransform(scale, 0, 0, scale, 0, 0);
    sctx.imageSmoothingEnabled = true;
    const used = paintInfoZone(sctx, spec, infoY, H);
    const leftover = H - MIN_BOTTOM_PAD - (infoY + used);
    const shift = leftover > 8 ? Math.min(leftover / 2, MAX_SHIFT) : 0;
    paintInfoZone(ctx, spec, infoY + shift, H);
  }

  // 颗粒与晕影：浅色极简类主题跳过，避免画面发脏
  if (opts.grain !== false && !theme.skipGrain) grainPattern(ctx, opts.grainAmount ?? 9);
  if (theme.effects?.vignette) vignette(ctx, W, H, theme.effects.vignette);
  return canvas;
}

/** 算出「海报块」的矩形（非满幅模式用） */
function layoutPosterBlock(theme, spec, W, H, ctx) {
  const infoH = estimateInfoHeight(ctx, spec);
  const topPad = theme.poster.y ?? 96;
  let avail = H - topPad - 72 - infoH - 44;
  avail = Math.min(avail, H * (theme.poster.maxH || 0.74));

  let pw, ph;
  if (theme.poster.w) {
    pw = Math.round(W * theme.poster.w);
    ph = Math.round(pw * theme.poster.hFactor);
    if (ph > avail) { ph = Math.round(avail); pw = Math.round(ph / theme.poster.hFactor); }
  } else {
    ph = Math.round(avail);
    pw = Math.round(ph / theme.poster.hFactor);
  }
  pw -= pw % 2; ph -= ph % 2;
  let px = Math.round((W - pw) / 2);
  if (theme.poster.align === 'left') px = spec.x;
  return { x: px, y: topPad, w: pw, h: ph, radius: theme.poster.radius ?? 0, focusY: theme.poster.focusY ?? 0.42 };
}

/** 复用的离屏画布，仅用于测量 */
let scratchCanvas = null;
function getScratch() {
  if (!scratchCanvas) scratchCanvas = document.createElement('canvas');
  return scratchCanvas;
}

function paintInfoZone(ctx, spec, y0, H) {
  const align = spec.align;
  const x = spec.x, w = spec.w;
  const g = spec.gaps;
  let y = y0;
  // corner 模式的角标由主题自己斜贴在左上角，这里不占信息区高度
  if (spec.kicker && spec.kicker.mode !== 'corner') {
    y += paintKicker(ctx, spec.kicker, x, w, y, align) + g.kicker;
  }
  if (spec.title) y += paintTitle(ctx, spec.title, x, w, y, align) + g.title;
  if (spec.score) y += paintScore(ctx, spec.score, x, w, y, align) + g.score;
  if (spec.comment) y += paintComment(ctx, spec.comment, x, w, y, align) + g.comment;
  if (spec.meta) y += paintMeta(ctx, spec.meta, x, w, y, align) + g.meta;
  if (spec.footer) y += paintFooter(ctx, spec.footer, x, w, y, align) + g.footer;
  return y - y0;
}

/** 下边距下限：不要让内容贴到画布最底部 */
const MIN_BOTTOM_PAD = 56;
/** 信息区最多下移多少（避免小图时飘到画面中间） */
const MAX_SHIFT = 72;

/** 估算信息区高度，用于回推海报可用高度 */
function estimateInfoHeight(ctx, spec) {
  const g = spec.gaps;
  let h = 0;
  // corner 模式的角标贴在画面上，不占信息区高度
  if (spec.kicker && spec.kicker.mode !== 'corner') h += spec.kicker.size * 1.95 + g.kicker;
  if (spec.title) h += spec.title.lines.length * spec.title.size * spec.title.lineHeight + g.title;
  if (spec.score) h += spec.score.size * 1.0 + g.score;
  if (spec.comment) h += spec.comment.lines.length * spec.comment.size * spec.comment.lineHeight + g.comment;
  if (spec.meta) h += spec.meta.lines.length * spec.meta.size * spec.meta.lineHeight + g.meta;
  if (spec.footer) h += spec.footer.size * 1.5 + g.footer;
  return h;
}

export function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('导出失败'))), type, quality);
  });
}

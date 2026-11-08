/* ===========================================================
   themes.js —— 「雪村葵」主题系列
   ---------------------------------------------------------------
   这一族主题的共同点：海报是主角（满幅铺满或大块占据），
   文字直接叠压在图上，山岳要素（海拔 / 坐标 / 山名）贯穿始终。

   每个主题的差异在：版式走向、字体性格、装饰笔触、信息排布。
      sunset  日落饭能   海报满铺，右上圆形山章，底部山脊剪影
      summit  登顶       巨型海拔数字做主角，压倒性标题
      trail   路线笔记   浅色纸感，手绘山顶轮廓与山径
      night   夜行       深蓝星夜，月牙与发光稜线
      journal 山岳手帐   明信片版式，左侧竖幅海报，右栏竖排
   =========================================================== */

import {
  BASE_W, FONT_DISPLAY, FONT_TEXT, FONT_NUM, FONT_SERIF,
  measure, grainPattern, vignette, roundRect, clipRoundRect, strokeRoundRect,
  drawImageFitRounded, drawBlurredBackdrop,
  rgba, readableOn, makeRng, fmtScore,
} from './util.js';
import { RATIOS } from './core.js';
import { mountainById, formatCoords, formatElev } from './mountains.js';

const F = k => k === 'serif' ? FONT_SERIF : k === 'display' ? FONT_DISPLAY : k === 'num' ? FONT_NUM : FONT_TEXT;

/**
 * 拼字体串。务必保证 weight 是合法数字：
 * 一旦拼出 "undefined 34px ..." 这类非法字符串，
 * canvas 会整条静默丢弃赋值、回退到 10px sans-serif，
 * 表现就是"字号明明设了 34px、画出来却是小字"，极难排查。
 */
function fontStr(weight, size, family) {
  const w = Number(weight);
  const sz = Number(size);
  return `${Number.isFinite(w) ? w : 400} ${Number.isFinite(sz) ? sz : 16}px ${F(family)}`;
}

/* ===========================================================
   配色方案（山色系）
   =========================================================== */

export const PALETTES = [
  { id: 'forest', name: '山雾松林', bg: '#0F2420', ink: '#F2F7F0', accent: '#E8734A', accent2: '#7FD1B9', score: '#FFFFFF' },
  { id: 'dawn', name: '日出橙', bg: '#1A1210', ink: '#FFF6EC', accent: '#FF6B35', accent2: '#FFD166', score: '#FFD166' },
  { id: 'sky', name: '晴空白', bg: '#F7F6F2', ink: '#1C2321', accent: '#2F7D6B', accent2: '#E06A45', score: '#1C2321' },
  { id: 'night', name: '星夜蓝', bg: '#0A1020', ink: '#EAF1FF', accent: '#7EA6E0', accent2: '#FFD98E', score: '#EAF1FF' },
  { id: 'paper', name: '牛皮纸', bg: '#EFE6D6', ink: '#2A2419', accent: '#A9563A', accent2: '#4E6B58', score: '#2A2419' },
  { id: 'moss', name: '苔绿', bg: '#1B2417', ink: '#EEF3E6', accent: '#A8C66C', accent2: '#E4A15C', score: '#FFFFFF' },
  { id: 'snow', name: '雪顶白', bg: '#EDF0F3', ink: '#1B2226', accent: '#3D6E9E', accent2: '#C4763F', score: '#1B2229' },
  { id: 'dusk', name: '暮紫', bg: '#1A1526', ink: '#F0EAF8', accent: '#B892D6', accent2: '#F2B880', score: '#FFFFFF' },
];

export function paletteById(id) { return PALETTES.find(x => x.id === id) || PALETTES[0]; }
export function isLightPalette(p) {
  const h = p.bg.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

/* ===========================================================
   装饰笔刷
   =========================================================== */

/** 山脊剪影：一条折线填到底部，做画面的"地" */
function ridgeSilhouette(ctx, W, H, baseY, color, seed = 'ridge', amp = 1, alpha = 1) {
  const rng = makeRng(seed);
  const pts = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const x = -20 + (W + 40) * (i / n);
    const peak = (i % 2 === 0 ? 0.55 : 0.15) + rng() * 0.45;
    pts.push([x, baseY - peak * 90 * amp]);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], H + 40);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], H + 40);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 等高线纹理（离屏缓存，返回 canvas） */
function makeContourTexture(W, H, color, { alpha = 0.14, lines = 9, step = 30 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rng = makeRng('contour' + lines + H);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < lines; i++) {
    const baseY = H * (0.28 + 0.66 * (i / Math.max(1, lines - 1)));
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

/** 远处的山脊折线（不填充） */
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
function trailDots(ctx, x, y, color, { count = 14, r = 2.4, gap = 15, alpha = 0.45, arc = 9 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.arc(x + i * gap, y - Math.sin(i / count * Math.PI) * arc, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 星星（固定种子，位置稳定） */
function stars(ctx, W, H, color, count = 60, seed = 'stars') {
  const rng = makeRng(seed);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.25 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(rng() * W, rng() * H * 0.62, 0.8 + rng() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 纸纹 */
function paperTexture(ctx, x, y, w, h, color, alpha = 0.05, count = 300) {
  const rng = makeRng('paper' + Math.round(w) + Math.round(h));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const px = x + rng() * w, py = y + rng() * h;
    const len = 8 + rng() * 44, ang = rng() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
}

/** 压暗渐变：保证叠压文字可读，同时让画面主体透出来 */
const SCRIMS = {
  sunset: [[0, 'rgba(8,20,26,.78)'], [0.20, 'rgba(8,20,26,.12)'], [0.40, 'rgba(8,20,26,0)'], [0.52, 'rgba(8,20,26,.34)'], [0.68, 'rgba(8,20,26,.74)'], [0.84, 'rgba(6,16,21,.92)'], [1, 'rgba(6,16,21,.98)']],
  top: [[0, 'rgba(8,12,20,.86)'], [0.18, 'rgba(8,12,20,.48)'], [0.42, 'rgba(8,12,20,.06)'], [0.62, 'rgba(8,12,20,.30)'], [1, 'rgba(8,12,20,.74)']],
  bottom: [[0, 'rgba(0,0,0,.36)'], [0.30, 'rgba(0,0,0,0)'], [0.52, 'rgba(0,0,0,.32)'], [0.78, 'rgba(0,0,0,.78)'], [1, 'rgba(0,0,0,.93)']],
  even: [[0, 'rgba(0,0,0,.52)'], [0.30, 'rgba(0,0,0,.12)'], [0.58, 'rgba(0,0,0,.30)'], [1, 'rgba(0,0,0,.82)']],
};
function paintScrim(ctx, W, H, kind) {
  const stops = SCRIMS[kind] || SCRIMS.bottom;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** 满幅海报铺满画布（cover，focusY 偏上保住角色的脸） */
function paintBleedPoster(ctx, c, { focusY = 0.34 } = {}) {
  const { img, W, H, pal } = c;
  if (!img) { drawEmpty(ctx, c); return; }
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  const s = Math.max(W / iw, H / ih);
  ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) * focusY, iw * s, ih * s);
}

function drawEmpty(ctx, c) {
  const { W, H, pal } = c;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.font = `600 50px ${FONT_TEXT}`;
  ctx.fillText('搜索番剧或上传图片', W / 2, H / 2 - 18);
  ctx.font = `500 32px ${FONT_TEXT}`;
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.fillText('海报会铺满整张图', W / 2, H / 2 + 44);
  ctx.restore();
}

/** 裁切 + 圆角 */
function paintCrop(ctx, c, x, y, w, h, r, focusY = 0.4) {
  if (!c.img) { drawEmpty(ctx, c); return; }
  drawImageFitRounded(ctx, c.img, x, y, w, h, r, 'cover', focusY);
}

/* ===========================================================
   统一的信息排版内核（主题只给外观参数）
   =========================================================== */

const TIERS = [[9, '神作'], [8, '力荐'], [7, '佳作'], [6, '还行'], [5, '一般'], [4, '微妙'], [0, '弃番']];
function tierOf(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  for (const [t, label] of TIERS) if (n >= t) return label;
  return '';
}

function measureSpaced(ctx, text, spacing) {
  return [...text].reduce((a, c) => a + measure(ctx, c), 0) + spacing * Math.max(0, text.length - 1);
}

function wrapText(ctx, text, maxW, maxLines) {
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

function drawSpacedLine(ctx, text, x, y, spacing, color, align) {
  const total = measureSpaced(ctx, text, spacing);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.fillStyle = color;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += measure(ctx, ch) + spacing;
  }
}

/** 画单个信息块，返回消耗的高度 */
function paintBlock(ctx, key, item, x, y, w, align, pal) {
  const anchor = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  let consumed = 0;

  if (key === 'kicker') {
    const k = item;
    ctx.save();
    ctx.font = fontStr(k.weight, k.size, k.family);
    const tw = k.spacing ? measureSpaced(ctx, k.text, k.spacing) : measure(ctx, k.text);    const boxW = tw + k.padX * 2;

    if (k.style === 'angled') {
      const angle = (k.angle ?? 45) * Math.PI / 180;
      const flare = k.flare ?? 12;
      const L = boxW + flare;
      const cx = k.cx ?? boxW / 2 + 18;
      const cy = k.cy ?? boxW / 2 + 18;
      const R = -angle;
      const cos = Math.cos(R), sin = Math.sin(R);
      const toC = (lx, ly) => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
      const local = [[-L / 2, -k.bandH / 2], [L / 2 - flare, -k.bandH / 2], [L / 2, 0], [L / 2 - flare, k.bandH / 2], [-L / 2, k.bandH / 2]];
      const pts = local.map(([a, b]) => toC(a, b));
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = k.bg;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.rotate(R);
      ctx.textBaseline = 'middle';
      let px = -L / 2 + k.padX;
      for (const ch of k.text) {
        ctx.fillStyle = k.color;
        ctx.fillText(ch, px, 0);
        px += measure(ctx, ch) + (k.spacing || 0);
      }
      ctx.restore();
      // 斜牌自己定位，不占信息流高度
      consumed = 0;
    } else if (k.style === 'ribbon') {
      const bx = align === 'center' ? anchor - boxW / 2 : align === 'right' ? anchor - boxW : x;
      roundRect(ctx, bx, y, boxW, k.bandH || k.size * 2, k.radius ?? 999);
      ctx.fillStyle = k.bg;
      ctx.fill();
      if (k.border) { ctx.lineWidth = k.borderWidth ?? 2; ctx.strokeStyle = k.border; ctx.stroke(); }
      ctx.textBaseline = 'middle';
      if (k.spacing) drawSpacedLine(ctx, k.text, bx + boxW / 2, y + (k.bandH || k.size * 2) / 2, k.spacing, k.color, 'center');
      else {
        ctx.textAlign = 'center';
        ctx.fillStyle = k.color;
        ctx.fillText(k.text, bx + boxW / 2, y + (k.bandH || k.size * 2) / 2);
      }
      consumed = (k.bandH || k.size * 2) + (k.gap ?? 18);
    } else if (k.style === 'underline') {
      ctx.textBaseline = 'top';
      if (k.spacing) drawSpacedLine(ctx, k.text, align === 'center' ? anchor : x, y, k.spacing, k.color, align);
      else {
        ctx.textAlign = align;
        ctx.fillStyle = k.color;
        ctx.fillText(k.text, anchor, y);
      }
      const uw = k.underlineW ?? boxW;
      const ux = align === 'center' ? anchor - uw / 2 : align === 'right' ? anchor - uw : x;
      ctx.fillStyle = k.underline;
      ctx.fillRect(ux, y + k.size * 1.5, uw, k.underlineH ?? 4);
      consumed = k.size * 1.5 + (k.gap ?? 18);
    } else {
      ctx.textBaseline = 'top';
      if (k.spacing) drawSpacedLine(ctx, k.text, align === 'center' ? anchor : x, y, k.spacing, k.color, align);
      else {
        ctx.textAlign = align;
        ctx.fillStyle = k.color;
        ctx.fillText(k.text, anchor, y);
      }
      consumed = k.size * 1.3 + (k.gap ?? 14);
    }
    ctx.restore();
    return consumed;
  }

  if (key === 'mountain') {
    const m = item;
    ctx.save();
    ctx.font = fontStr(m.weight, m.size, m.family);
    ctx.textBaseline = 'top';
    if (m.text) {
      if (m.spacing) drawSpacedLine(ctx, m.text, align === 'center' ? anchor : x, y, m.spacing, m.color, align);
      else {
        ctx.textAlign = align;
        ctx.fillStyle = m.color;
        ctx.fillText(m.text, anchor, y);
      }
    }
    ctx.restore();
    return m.size * m.lineHeight + m.gap;
  }

  if (key === 'title') {
    const t = item;
    ctx.save();
    ctx.font = fontStr(t.weight, t.size, t.family);
    ctx.textBaseline = 'alphabetic';
    if (t.shadow) { ctx.shadowColor = t.shadow.color; ctx.shadowBlur = t.shadow.blur; ctx.shadowOffsetY = t.shadow.y || 0; }
    const lh = t.size * t.lineHeight;
    t.lines.forEach((line, i) => {
      const baseY = y + i * lh + t.size * 0.82;
      if (t.spacing) drawSpacedLine(ctx, line, align === 'center' ? anchor : x, baseY, t.spacing, t.color, align);
      else {
        if (t.stroke) { ctx.lineWidth = t.stroke.width; ctx.strokeStyle = t.stroke.color; ctx.strokeText(line, anchor, baseY); }
        ctx.fillStyle = t.color;
        ctx.textAlign = align;
        ctx.fillText(line, anchor, baseY);
      }
    });
    ctx.restore();
    return lh * t.lines.length + t.gap;
  }

  if (key === 'score') {
    const s = item;
    const main = fmtScore(s.value);
    if (main === null) return 0;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${s.size}px ${FONT_NUM}`;
    const numW = measure(ctx, main);
    const gx = align === 'center' ? anchor - numW / 2 : align === 'right' ? anchor - numW : x;
    const baseY = y + s.size * 0.80;
    if (s.shadow) { ctx.shadowColor = s.shadow.color; ctx.shadowBlur = s.shadow.blur; ctx.shadowOffsetY = s.shadow.y || 0; }
    ctx.fillStyle = s.color;
    ctx.fillText(main, gx, baseY);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (s.unit) {
      ctx.font = `600 ${Math.round(s.size * 0.22)}px ${FONT_TEXT}`;
      ctx.fillStyle = s.subColor;
      ctx.fillText(s.unit, gx + numW + 10, baseY - 8);
    }
    const rows = [];
    if (s.tier) rows.push({ type: 'tier', text: tierOf(s.value) });
    if (s.bgm !== null && s.bgm !== undefined) rows.push({ type: 'bgm', text: `BGM ${fmtScore(s.bgm)}` + (s.rank ? `　#${s.rank}` : '') });
    const rowHs = rows.map(r => r.type === 'tier' ? s.tierSize * 1.8 : s.subSize * 1.5);
    const rowsHeight = rowHs.reduce((a, b) => a + b, 0);

    // 数字本体的视觉范围：top → baseline(0.80) → 下沉(0.12)
    const numH = s.size * 0.92;
    // 右侧竖排如果比数字高，就从数字顶部往下排；否则垂直居中。
    // 关键是"底部"要对齐，不能只对顶部，否则档位胶囊会掉到数字下方，
    // 把后面的吐槽压住（这个坑踩过一次）。
    const blockH = Math.max(numH, rowsHeight);
    if (rows.length) {
      const rx = gx + numW + (s.unit ? measure(ctx, s.unit) + 26 : 28);
      let ry = y + (blockH - rowsHeight) / 2;
      rows.forEach((r, i) => {
        if (r.type === 'tier') {
          ctx.font = `700 ${s.tierSize}px ${FONT_TEXT}`;
          const tw = measure(ctx, r.text);
          roundRect(ctx, rx, ry, tw + 26, s.tierSize * 1.72, 999);
          ctx.fillStyle = s.tierBg; ctx.fill();
          ctx.fillStyle = s.tierColor;
          ctx.fillText(r.text, rx + 13, ry + s.tierSize * 1.26);
        } else {
          ctx.font = `500 ${s.subSize}px ${FONT_TEXT}`;
          ctx.fillStyle = s.subColor;
          ctx.fillText(r.text, rx, ry + s.subSize * 1.16);
        }
        ry += rowHs[i];
      });
    }
    ctx.restore();
    return blockH + s.gap;
  }

  if (key === 'comment') {
    const cm = item;
    ctx.save();
    ctx.font = fontStr(cm.weight, cm.size, cm.family);

    ctx.textBaseline = 'alphabetic';
    const lh = cm.size * cm.lineHeight;
    let tx = align === 'center' ? anchor : x;
    if (cm.quote) {
      const qx = align === 'center' ? x + w / 2 - 4 : align === 'right' ? x + w - 6 : x;
      ctx.fillStyle = cm.quoteColor;
      ctx.fillRect(qx, y + 2, 6, Math.max(0, cm.lines.length * lh - 16));
      if (align !== 'center') tx = x + 30;
    }
    ctx.textAlign = align === 'center' ? 'center' : 'left';
    cm.lines.forEach((line, i) => {
      ctx.fillStyle = cm.color;
      ctx.fillText(line, tx, y + i * lh + cm.size * 0.84);
    });
    ctx.restore();
    return lh * cm.lines.length + cm.gap;
  }

  if (key === 'meta') {
    const m = item;
    ctx.save();
    ctx.font = fontStr(m.weight ?? 500, m.size, 'text');
    ctx.textBaseline = 'alphabetic';
    // 窄栏（如「山岳手帐」）时自动折成多行，避免溢出画面
    const maxW = m.maxWidth ?? w;
    const lines = [];
    let cur = [];
    let curW = 0;
    for (const it of m.items) {
      const iw = measure(ctx, it);
      const add = cur.length ? m.gap + iw : iw;
      if (curW + add > maxW && cur.length) { lines.push(cur); cur = [it]; curW = iw; }
      else { cur.push(it); curW += add; }
    }
    if (cur.length) lines.push(cur);

    let ly = y;
    for (const line of lines) {
      const total = line.reduce((a, it) => a + measure(ctx, it), 0) + m.gap * Math.max(0, line.length - 1);
      let cx = align === 'center' ? anchor - total / 2 : align === 'right' ? anchor - total : x;
      const baseY = ly + m.size * 0.9;
      line.forEach((it, i) => {
        if (i > 0 && m.dot) {
          ctx.fillStyle = m.dotColor;
          ctx.beginPath();
          ctx.arc(cx - m.gap / 2, baseY - m.size * 0.32, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = m.color;
        ctx.textAlign = 'left';
        ctx.fillText(it, cx, baseY);
        cx += measure(ctx, it) + m.gap;
      });
      ly += m.size * 1.6;
    }
    ctx.restore();
    return m.size * 1.6 * lines.length + m.gapY;
  }

  if (key === 'footer') {
    const f = item;
    ctx.save();
    ctx.font = fontStr(f.weight, f.size, f.family);
    ctx.textBaseline = 'alphabetic';
    const baseY = y + f.size * 0.95;
    const widths = f.parts.map(p => measure(ctx, p));
    const sepW = measure(ctx, f.separator) * (f.parts.length - 1);
    const total = widths.reduce((a, b) => a + b, 0) + sepW;
    let cx = align === 'center' ? anchor - total / 2 : align === 'right' ? anchor - total : x;
    ctx.textAlign = 'left';
    f.parts.forEach((p, i) => {
      if (i > 0) { ctx.fillStyle = f.sepColor; ctx.fillText(f.separator, cx, baseY); cx += measure(ctx, f.separator); }
      ctx.fillStyle = i === 0 ? f.color : f.accentColor;
      ctx.fillText(p, cx, baseY);
      cx += widths[i];
    });
    ctx.restore();
    return f.size * 1.5;
  }

  return 0;
}

/** 按 ink.order 顺序绘制，返回总高度 */
function paintInkOrdered(ctx, ink, x, y, w, align) {
  let cy = y;
  for (const key of ink.order) {
    const item = ink[key];
    if (!item) continue;
    cy += paintBlock(ctx, key, item, x, cy, w, align);
  }
  return cy - y;
}

/** 量高（用离屏 ctx，不污染画面） */
let scratchCtx = null;
function measureInkHeight(ink, x, w, align) {
  if (!scratchCtx) {
    const cv = document.createElement('canvas');
    cv.width = 10; cv.height = 10;
    scratchCtx = cv.getContext('2d');
  }
  return paintInkOrdered(scratchCtx, ink, x, 0, w, align);
}

/** 把用户设置编译成 ink */
function buildInk(pal, state, ctx, cfg) {
  const { subject, opts } = state;
  const onDark = !isLightPalette(pal);
  const base = onDark ? '#FFFFFF' : '#141414';
  const W = cfg.w, x = cfg.x;
  const align = cfg.align || 'left';
  const mtn = mountainById(opts.mountain);

  const titleText = (subject?.displayTitle || subject?.nameCn || subject?.name || '').trim();
  let title = null;
  if (titleText && opts.showTitle !== false) {
    let size = cfg.titleSize;
    if (cfg.autoFit !== false) {
      let s = size;
      while (s > (cfg.autoFitMin || 36)) {
        ctx.font = fontStr(cfg.titleWeight, Math.round(s), cfg.titleFont);
        if (measure(ctx, titleText) <= W) break;
        s -= 2;
      }
      size = s;
    }
    ctx.font = fontStr(cfg.titleWeight, size, cfg.titleFont);
    title = {
      lines: wrapText(ctx, titleText, W, cfg.titleMaxLines || 2),
      size, weight: cfg.titleWeight, family: cfg.titleFont,
      lineHeight: cfg.titleLineHeight ?? 1.22,
      color: cfg.titleColor || base,
      spacing: cfg.titleSpacing || 0,
      stroke: cfg.titleStroke || null,
      shadow: cfg.titleGlow ? { color: rgba(pal.accent, cfg.titleGlow), blur: 26, y: 0 } : null,
      gap: cfg.gapTitle ?? 22,
    };
  }

  const userScore = fmtScore(opts.userScore);
  const bgm = opts.showBgm !== false ? fmtScore(subject?.score) : null;
  const scoreVal = userScore ?? bgm;
  let score = null;
  if (opts.showScore !== false && scoreVal !== null) {
    score = {
      value: Number(scoreVal),
      bgm: bgm !== null ? Number(bgm) : null,
      rank: opts.showRank !== false ? (subject?.rank ?? null) : null,
      tier: opts.showTier !== false,
      size: cfg.scoreSize,
      color: cfg.scoreColor || base,
      subColor: cfg.subColor || (onDark ? 'rgba(255,255,255,.68)' : 'rgba(20,20,20,.56)'),
      tierSize: cfg.tierSize ?? 28,
      subSize: cfg.subSize ?? 26,
      tierBg: cfg.tierBg || rgba(pal.accent, 0.2),
      tierColor: cfg.tierColor || (onDark ? '#fff' : '#111'),
      unit: (opts.scoreUnit || '').trim(),
      shadow: cfg.scoreGlow ? { color: rgba(pal.accent, cfg.scoreGlow), blur: 32, y: 0 } : null,
      gap: cfg.gapScore ?? 22,
    };
  }

  const ct = (opts.comment || '').trim();
  let comment = null;
  if (ct && opts.showComment !== false) {
    ctx.font = fontStr(cfg.commentWeight ?? 400, cfg.commentSize, cfg.commentFont || 'text');
    comment = {
      lines: wrapText(ctx, ct, W - (cfg.quote ? 34 : 0), cfg.commentMaxLines ?? 3),
      size: cfg.commentSize, weight: cfg.commentWeight ?? 400,
      family: cfg.commentFont || 'text',
      lineHeight: cfg.commentLineHeight ?? 1.5,
      color: cfg.commentColor || (onDark ? 'rgba(255,255,255,.82)' : 'rgba(20,20,20,.76)'),
      quote: cfg.quote, quoteColor: rgba(pal.accent, 0.85),
      gap: cfg.gapComment ?? 18,
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
      meta = {
        items,
        size: cfg.metaSize, weight: cfg.metaWeight ?? 500,
        maxWidth: cfg.metaMaxWidth || W,
        color: cfg.metaColor || (onDark ? 'rgba(255,255,255,.50)' : 'rgba(20,20,20,.48)'),
        dot: cfg.metaDot !== false,
        dotColor: cfg.metaDotColor || (onDark ? 'rgba(255,255,255,.42)' : 'rgba(20,20,20,.32)'),
        gap: cfg.metaGap ?? 22,
        gapY: cfg.gapMeta ?? 16,
      };
    }
  }

  let mountain = null;
  if (cfg.mountain && opts.showMountain !== false) {
    mountain = {
      text: cfg.mountain.text(mtn),
      size: cfg.mountain.size ?? 21,
      weight: cfg.mountain.weight ?? 500,
      family: cfg.mountain.family || 'num',
      color: cfg.mountain.color || (onDark ? 'rgba(255,255,255,.62)' : 'rgba(20,20,20,.58)'),
      spacing: cfg.mountain.spacing ?? 0,
      lineHeight: cfg.mountain.lineHeight ?? 1.4,
      gap: cfg.gapMountain ?? 16,
    };
  }

  let footer = null;
  const parts = [];
  if ((opts.footerCustom || '').trim()) parts.push(opts.footerCustom.trim());
  else {
    if (subject?.id) parts.push('Bangumi');
    if (opts.watermark !== false && (opts.xhsId || '').trim()) parts.push(opts.xhsId.trim());
  }
  if (parts.length) {
    footer = {
      parts, size: cfg.footSize ?? 22, weight: 500,
      color: cfg.footColor || (onDark ? 'rgba(255,255,255,.44)' : 'rgba(20,20,20,.42)'),
      accentColor: cfg.footAccent || rgba(pal.accent, onDark ? 0.9 : 1),
      separator: cfg.footSep || '　·　',
      sepColor: onDark ? 'rgba(255,255,255,.26)' : 'rgba(20,20,20,.24)',
    };
  }

  let kicker = null;
  const badgeText = (opts.badge || '').trim();
  if (badgeText && cfg.kicker) {
    kicker = {
      text: badgeText,
      size: cfg.kicker.size ?? 27,
      weight: cfg.kicker.weight ?? 700,
      family: cfg.kicker.family || 'text',
      spacing: cfg.kicker.spacing ?? 0,
      style: cfg.kicker.style || 'plain',
      bg: cfg.kicker.bg,
      color: cfg.kicker.color || readableOn(cfg.kicker.bg || pal.bg, '#FFFFFF', '#141414'),
      border: cfg.kicker.border || null,
      borderWidth: cfg.kicker.borderWidth ?? 2,
      radius: cfg.kicker.radius ?? 999,
      padX: cfg.kicker.padX ?? 28,
      bandH: cfg.kicker.bandH,
      gap: cfg.kicker.gap,
      underline: cfg.kicker.underline || pal.accent,
      underlineW: cfg.kicker.underlineW,
      underlineH: cfg.kicker.underlineH,
      angle: cfg.kicker.angle,
      flare: cfg.kicker.flare,
      cx: cfg.kicker.cx,
      cy: cfg.kicker.cy,
    };
  }

  return {
    x, w: W, align, kicker, mountain, title, score, comment, meta, footer,
    order: cfg.order || ['kicker', 'mountain', 'title', 'score', 'comment', 'meta', 'footer'],
  };
}

/* ===========================================================
   主题定义
   =========================================================== */

export const THEMES = [
  /* ---------------- 1. 日落饭能 ---------------- */
  {
    id: 'sunset',
    name: '日落饭能',
    desc: '海报满铺，右上圆形山章，底部山脊剪影',
    tags: ['满幅海报', '暖色'],
    defaultPalette: 'forest',
    skipGrain: true,
    build(theme, pal, state, ctx) {
      return buildInk(pal, state, ctx, {
        x: 64, w: BASE_W - 128, align: 'left',
        kicker: { style: 'ribbon', size: 27, weight: 700, bg: pal.accent, spacing: 3, padX: 30, bandH: 58, radius: 999, gap: 20 },
        mountain: { text: m => formatCoords(m.coords) + '　' + m.name, size: 21, spacing: 1 },
        titleSize: 78, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.18,
        titleMaxLines: 2, autoFit: true, autoFitMin: 42, titleGlow: 0.34,
        scoreSize: 150, tierSize: 29, subSize: 27, scoreGlow: 0.22,
        commentSize: 34, commentFont: 'text', commentLineHeight: 1.52, quote: true,
        metaSize: 25, footSize: 22,
        order: ['kicker', 'mountain', 'title', 'score', 'comment', 'meta', 'footer'],
      });
    },
    draw(ctx, c, ink, pal) {
      const { W, H } = c;
      paintBleedPoster(ctx, c, { focusY: 0.30 });
      paintScrim(ctx, W, H, 'sunset');

      // 右上圆章：山名 + 海拔
      const mtn = mountainById(c.opts.mountain);
      const r = 74;
      const cx = W - 64 - r, cy = 64 + r;
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(cx, cy, r - 11, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${mtn.elev >= 1000 ? 27 : 34}px ${FONT_DISPLAY}`;
      ctx.fillText(String(mtn.elev), cx, cy - 12);
      ctx.font = `600 15px ${FONT_TEXT}`;
      ctx.globalAlpha = 0.78;
      ctx.fillText('m', cx, cy + 12);
      ctx.globalAlpha = 1;
      ctx.font = `600 17px ${FONT_TEXT}`;
      ctx.fillStyle = pal.accent2;
      ctx.fillText(mtn.name, cx, cy + 38);
      ctx.restore();

      // 底部山脊剪影
      ridgeSilhouette(ctx, W, H, H - 26, 'rgba(8,20,26,.52)', 'sunset-ridge', 0.8, 0.9);

      // 信息块（底部对齐）
      const h = measureInkHeight(ink, ink.x, ink.w, ink.align);
      paintInkOrdered(ctx, ink, ink.x, H - 76 - h, ink.w, ink.align);

      // 左下登山路线
      trailDots(ctx, ink.x, H - 28, pal.accent2, { count: 13, r: 2.3, gap: 15, alpha: 0.4, arc: 8 });
    },
  },

  /* ---------------- 2. 登顶 ---------------- */
  {
    id: 'summit',
    name: '登顶',
    desc: '巨型海拔数字压倒性占据版面，日出撞色',
    tags: ['满幅海报', '高冲击'],
    defaultPalette: 'dawn',
    skipGrain: true,
    build(theme, pal, state, ctx) {
      return buildInk(pal, state, ctx, {
        x: 64, w: BASE_W - 128, align: 'left',
        kicker: { style: 'plain', size: 26, weight: 700, spacing: 6, color: '#FFFFFF', gap: 10 },
        titleSize: 92, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.1,
        titleMaxLines: 2, autoFit: true, autoFitMin: 46, titleGlow: 0.5,
        scoreSize: 164, tierSize: 29, subSize: 27, scoreGlow: 0.4,
        commentSize: 34, commentFont: 'text', commentLineHeight: 1.5, quote: true,
        metaSize: 24, footSize: 22,
        order: ['kicker', 'title', 'score', 'comment', 'meta', 'footer'],
      });
    },
    draw(ctx, c, ink, pal) {
      const { W, H } = c;
      paintBleedPoster(ctx, c, { focusY: 0.20 });
      paintScrim(ctx, W, H, 'top');

      const mtn = mountainById(c.opts.mountain);

      // 顶部：巨幅海拔数字（画面主角）
      // 位置全部按实测高度往下推，避免数字压住下面的坐标与标题。
      const elevText = mtn.elev.toLocaleString('en-US');
      const elevSize = 168;
      const elevTop = 52;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `800 ${elevSize}px ${FONT_NUM}`;
      const numW = measure(ctx, elevText);
      ctx.fillStyle = pal.accent;
      ctx.shadowColor = rgba(pal.accent, 0.45);
      ctx.shadowBlur = 42;
      ctx.fillText(elevText, 56, elevTop);
      ctx.restore();
      const elevBottom = elevTop + elevSize * 0.78;

      // 单位 + 山名（紧贴数字右侧基线）
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = `700 36px ${FONT_TEXT}`;
      ctx.fillText('m', 56 + numW + 12, elevBottom);
      ctx.font = `600 28px ${FONT_TEXT}`;
      ctx.fillStyle = rgba(pal.accent2, 0.95);
      ctx.fillText(mtn.name, 56 + numW + 12, elevBottom + 36);
      ctx.restore();

      // 坐标 + 日文名（数字下方另起一行）
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,255,255,.54)';
      ctx.font = `500 21px ${FONT_NUM}`;
      ctx.fillText(formatCoords(mtn.coords) + '　' + mtn.jp, 60, elevBottom + 76);
      ctx.restore();

      // 右侧竖向刻度
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) {
        const y = 340 + i * 46;
        ctx.beginPath();
        ctx.moveTo(W - 56, y);
        ctx.lineTo(W - 56 - (i % 3 === 0 ? 26 : 13), y);
        ctx.stroke();
      }
      ctx.restore();

      // 信息块（底部）
      const h = measureInkHeight(ink, ink.x, ink.w, ink.align);
      paintInkOrdered(ctx, ink, ink.x, H - 82 - h, ink.w, ink.align);
    },
  },

  /* ---------------- 3. 路线笔记 ---------------- */
  {
    id: 'trail',
    name: '路线笔记',
    desc: '浅色纸感，手绘山顶轮廓与山径，像一页登山手记',
    tags: ['浅色', '手记感'],
    defaultPalette: 'sky',
    skipGrain: true,
    build(theme, pal, state, ctx) {
      return buildInk(pal, state, ctx, {
        x: 76, w: BASE_W - 152, align: 'left',
        kicker: { style: 'underline', size: 26, weight: 700, spacing: 6, underlineW: 64, underlineH: 4, gap: 22 },
        titleSize: 72, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.2,
        titleMaxLines: 2, autoFit: true, autoFitMin: 40,
        scoreSize: 146, tierSize: 27, subSize: 25,
        commentSize: 32, commentFont: 'text', commentLineHeight: 1.6, quote: false,
        metaSize: 24, footSize: 21,
        mountain: { text: m => m.name + '　' + formatElev(m.elev) + '　' + formatCoords(m.coords), size: 21, spacing: 1 },
        order: ['kicker', 'title', 'score', 'comment', 'meta', 'mountain', 'footer'],
      });
    },
    draw(ctx, c, ink, pal) {
      const { W, H } = c;
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      paperTexture(ctx, 0, 0, W, H, pal.ink, 0.04, 380);

      // 海报：占上方，带白边（像手记里贴上去的照片）。
      // 高度要按"画布剩余空间"算，不能写死比例，否则信息区会被挤出画面。
      const px = 64, pw = W - 128;
      const infoH = measureInkHeight(ink, ink.x, ink.w, ink.align);
      const posterTop = 64;
      const infoGap = 66;
      const maxPosterH = H - posterTop - infoGap - infoH - 40;
      const ph = Math.min(Math.round(pw * 1.02), Math.round(maxPosterH));
      ctx.save();
      ctx.shadowColor = 'rgba(28,35,33,.18)';
      ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#fff';
      roundRect(ctx, px - 12, 64 - 12, pw + 24, ph + 24, 6);
      ctx.fill();
      ctx.restore();
      paintCrop(ctx, c, px, 64, pw, ph, 3, 0.36);
      strokeRoundRect(ctx, px - 12, 64 - 12, pw + 24, ph + 24, 6, 'rgba(28,35,33,.14)', 2);

      // 左侧进度刻度（手记感）
      ctx.save();
      ctx.strokeStyle = rgba(pal.accent, 0.3);
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const y = 104 + i * 38;
        ctx.beginPath();
        ctx.moveTo(26, y);
        ctx.lineTo(26 + (i % 4 === 0 ? 18 : 9), y);
        ctx.stroke();
      }
      ctx.restore();

      // 手绘山顶线稿（很轻，藏在右下）
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(W - 300, 600);
      ctx.lineTo(W - 232, 520);
      ctx.lineTo(W - 186, 566);
      ctx.lineTo(W - 118, 470);
      ctx.lineTo(W - 48, 600);
      ctx.stroke();
      ctx.restore();

      // 信息块
      paintInkOrdered(ctx, ink, ink.x, posterTop + ph + infoGap, ink.w, ink.align);

      // 底部虚线
      ctx.save();
      ctx.setLineDash([8, 10]);
      ctx.strokeStyle = 'rgba(28,35,33,.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(64, H - 34);
      ctx.lineTo(W - 64, H - 34);
      ctx.stroke();
      ctx.restore();
    },
  },

  /* ---------------- 4. 夜行 ---------------- */
  {
    id: 'night',
    name: '夜行',
    desc: '深蓝星夜 + 月牙 + 发光稜线，夜间登山氛围',
    tags: ['深色', '夜间'],
    defaultPalette: 'night',
    skipGrain: true,
    build(theme, pal, state, ctx) {
      return buildInk(pal, state, ctx, {
        x: 64, w: BASE_W - 128, align: 'left',
        kicker: { style: 'ribbon', size: 26, weight: 700, bg: rgba(pal.accent, 0.95), spacing: 3, padX: 28, bandH: 54, gap: 22 },
        titleSize: 80, titleWeight: 400, titleFont: 'display', titleLineHeight: 1.16,
        titleMaxLines: 2, autoFit: true, autoFitMin: 42, titleGlow: 0.5,
        scoreSize: 154, tierSize: 27, subSize: 25, scoreGlow: 0.35,
        commentSize: 32, commentFont: 'text', commentLineHeight: 1.55, quote: true,
        metaSize: 23, footSize: 21,
        mountain: { text: m => formatCoords(m.coords) + '　' + m.name, size: 20, spacing: 1, color: 'rgba(234,241,255,.55)' },
        order: ['kicker', 'title', 'score', 'comment', 'meta', 'mountain', 'footer'],
      });
    },
    draw(ctx, c, ink, pal) {
      const { W, H } = c;
      paintBleedPoster(ctx, c, { focusY: 0.26 });
      ctx.save();
      ctx.globalAlpha = 0.58;
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      paintScrim(ctx, W, H, 'even');

      stars(ctx, W, H, '#EAF1FF', 70, 'night-stars');

      // 月牙：必须在离屏画布上做"挖除"，不能直接在主画布用
      // destination-out —— 那会把海报本身也挖掉一个洞。
      const mx = W - 132, my = 132, mr = 52;
      const mc = document.createElement('canvas');
      mc.width = Math.ceil(mr * 2 + 8);
      mc.height = Math.ceil(mr * 2 + 8);
      const mctx = mc.getContext('2d');
      mctx.fillStyle = rgba(pal.accent2, 0.95);
      mctx.beginPath();
      mctx.arc(mr + 4, mr + 4, mr, 0, Math.PI * 2);
      mctx.fill();
      mctx.globalCompositeOperation = 'destination-out';
      mctx.beginPath();
      mctx.arc(mr + 4 + 24, mr + 4 - 14, mr * 0.92, 0, Math.PI * 2);
      mctx.fill();
      ctx.drawImage(mc, mx - mr - 4, my - mr - 4);

      // 发光稜线
      const h = measureInkHeight(ink, ink.x, ink.w, ink.align);
      const infoY = H - 76 - h;
      ctx.save();
      ctx.shadowColor = rgba(pal.accent, 0.8);
      ctx.shadowBlur = 24;
      ridgeLine(ctx, ink.x, infoY - 24, ink.w, 'rgba(220,232,255,.72)', 2.5, 0.75);
      ctx.restore();

      paintInkOrdered(ctx, ink, ink.x, infoY, ink.w, ink.align);

      // 底部海拔 + 日文名
      const mtn = mountainById(c.opts.mountain);
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.font = `500 19px ${FONT_NUM}`;
      ctx.fillStyle = '#EAF1FF';
      ctx.textAlign = 'right';
      ctx.fillText(formatElev(mtn.elev) + '　' + mtn.jp, W - 60, H - 32);
      ctx.restore();
    },
  },

  /* ---------------- 5. 山岳手帐 ---------------- */
  {
    id: 'journal',
    name: '山岳手帐',
    desc: '明信片版式：左侧竖幅海报，右栏文字，山岳铭牌如盖章',
    tags: ['版式感', '明信片'],
    defaultPalette: 'paper',
    skipGrain: true,
    build(theme, pal, state, ctx) {
      const colX = 428;
      return buildInk(pal, state, ctx, {
        x: colX, w: BASE_W - colX - 76, align: 'left',
        kicker: { style: 'plain', size: 23, weight: 700, spacing: 5, gap: 12 },
        titleSize: 58, titleWeight: 400, titleFont: 'serif', titleLineHeight: 1.32,
        titleMaxLines: 3, autoFit: true, autoFitMin: 32,
        scoreSize: 120, tierSize: 25, subSize: 23,
        commentSize: 29, commentFont: 'serif', commentLineHeight: 1.62, quote: false,
        metaSize: 22, footSize: 19,
        order: ['kicker', 'title', 'score', 'comment', 'meta', 'footer'],
      });
    },
    draw(ctx, c, ink, pal) {
      const { W, H } = c;
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      paperTexture(ctx, 0, 0, W, H, pal.ink, 0.05, 420);

      // 左侧竖幅海报
      const px = 56, py = 56, pw = 340, ph = H - 112;
      ctx.save();
      ctx.shadowColor = 'rgba(42,36,25,.22)';
      ctx.shadowBlur = 44; ctx.shadowOffsetY = 16;
      ctx.fillStyle = '#fff';
      roundRect(ctx, px - 10, py - 10, pw + 20, ph + 20, 3);
      ctx.fill();
      ctx.restore();
      paintCrop(ctx, c, px, py, pw, ph, 2, 0.34);
      strokeRoundRect(ctx, px - 10, py - 10, pw + 20, ph + 20, 3, 'rgba(42,36,25,.16)', 2);

      // 右栏：竖排日文山名（淡色装饰）
      const mtn = mountainById(c.opts.mountain);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(pal.ink, 0.15);
      ctx.font = `700 44px ${FONT_DISPLAY}`;
      [...mtn.jp].forEach((ch, i) => ctx.fillText(ch, W - 88, 132 + i * 52));
      ctx.restore();

      // 右侧竖线
      ctx.save();
      ctx.strokeStyle = rgba(pal.ink, 0.14);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(W - 52, 96);
      ctx.lineTo(W - 52, H - 96);
      ctx.stroke();
      ctx.restore();

      // 山岳铭牌（手帐里盖的章）：这里不用 info.x，按左栏宽度来
      const colX = 428;
      const colW = W - colX - 76;
      const sealY = H - 286;
      ctx.save();
      ctx.strokeStyle = rgba(pal.accent, 0.5);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      roundRect(ctx, colX, sealY, colW, 92, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(pal.accent, 0.92);
      ctx.font = `700 29px ${FONT_DISPLAY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(mtn.name, colX + 20, sealY + 40);
      ctx.fillStyle = rgba(pal.ink, 0.6);
      ctx.font = `500 19px ${FONT_NUM}`;
      ctx.fillText(formatCoords(mtn.coords), colX + 20, sealY + 70);
      ctx.fillStyle = rgba(pal.ink, 0.5);
      ctx.font = `600 21px ${FONT_NUM}`;
      ctx.textAlign = 'right';
      ctx.fillText(formatElev(mtn.elev), colX + colW - 20, sealY + 44);
      ctx.restore();

      // 右栏信息块
      const used = paintInkOrdered(ctx, ink, ink.x, 108, ink.w, ink.align);

      // 信息块与铭牌之间：一条竖向"山径"虚线把上下连通，
      // 免得中间空一大片显得版式没做完。
      const trailTop = 108 + used + 30;
      const trailBottom = sealY - 34;
      if (trailBottom - trailTop > 60) {
        const tx = ink.x + 14;
        ctx.save();
        ctx.strokeStyle = rgba(pal.ink, 0.18);
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 9]);
        ctx.beginPath();
        ctx.moveTo(tx, trailTop);
        ctx.lineTo(tx, trailBottom);
        ctx.stroke();
        ctx.setLineDash([]);
        // 终点小旗
        ctx.fillStyle = rgba(pal.accent, 0.75);
        ctx.beginPath();
        ctx.moveTo(tx, trailBottom);
        ctx.lineTo(tx + 26, trailBottom + 8);
        ctx.lineTo(tx, trailBottom + 16);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = rgba(pal.ink, 0.3);
        ctx.font = `500 19px ${FONT_NUM}`;
        ctx.textAlign = 'left';
        ctx.fillText('SUMMIT', tx + 38, trailBottom + 13);
        ctx.restore();
      }

      // 上下虚线（明信片感）
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = rgba(pal.ink, 0.16);
      ctx.lineWidth = 2;
      for (const y of [38, H - 22]) {
        ctx.beginPath();
        ctx.moveTo(56, y);
        ctx.lineTo(W - 56, y);
        ctx.stroke();
      }
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

  const c = { ctx, W, H, pal, img: state.posterImg, state, opts, theme };
  const ink = theme.build(theme, pal, state, ctx);
  // 「文字对齐」选项：auto = 跟随主题，其余统一覆盖
  if (opts.alignOverride && opts.alignOverride !== 'auto') {
    ink.align = opts.alignOverride;
  }
  theme.draw(ctx, c, ink, pal);

  if (opts.grain !== false && !theme.skipGrain) grainPattern(ctx, opts.grainAmount ?? 8);
  if (theme.effects?.vignette) vignette(ctx, W, H, theme.effects.vignette);
  return canvas;
}

export function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('导出失败'))), type, quality);
  });
}

/**
 * 调试用：把某个主题的信息块排版结果吐出来。
 * 每个块的高度、累计位置一目了然，排错时比看渲染图快得多。
 */
export function debugLayout(state) {
  const opts = state.opts;
  const theme = themeById(opts.theme);
  const pal = paletteById(opts.palette || theme.defaultPalette);
  const cv = document.createElement('canvas');
  cv.width = 10; cv.height = 10;
  const ctx = cv.getContext('2d');
  const ink = theme.build(theme, pal, state, ctx);

  const blocks = [];
  let y = 0;
  for (const key of ink.order) {
    const item = ink[key];
    if (!item) continue;
    const h = paintBlock(ctx, key, item, ink.x, y, ink.w, ink.align, pal);
    blocks.push({ key, height: Math.round(h), from: Math.round(y), to: Math.round(y + h) });
    y += h;
  }
  // 把关键块的原始参数也带上，方便核对字体/尺寸是否如预期
  const peek = k => ink[k] ? {
    size: ink[k].size, weight: ink[k].weight, family: ink[k].family,
    lineHeight: ink[k].lineHeight, gap: ink[k].gap,
    lines: ink[k].lines, color: ink[k].color,
  } : null;
  return {
    total: Math.round(y), blocks, x: ink.x, w: ink.w,
    peek: { title: peek('title'), score: peek('score'), comment: peek('comment'), mountain: peek('mountain') },
  };
}

/* ===========================================================
   util.js —— Canvas 绘图工具库
   所有主题共用。设计基准坐标系为 1080 x 1440（3:4），
   通过 ctx 的 setTransform 缩放，主题内可直接写绝对像素。
   =========================================================== */

export const BASE_W = 1080;
export const BASE_H = 1440;

/* ---------- 字体 ---------- */
export const FONT_DISPLAY = '"Smiley Sans Oblique", "MiSans", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
export const FONT_TEXT = '"MiSans", "HarmonyOS Sans SC", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif';
export const FONT_NUM = '"Bahnschrift", "DIN Alternate", "Helvetica Neue", Arial, sans-serif';
export const FONT_SERIF = '"Songti SC", "SimSun", "Noto Serif SC", Georgia, serif';

/* 字体度量缓存：避免重复 measureText 造成卡顿 */
const measureCache = new Map();

export function font(weight, size, family = FONT_TEXT) {
  return `${weight} ${Math.round(size)}px ${family}`;
}
export function displayFont(size, weight = 400) {
  return font(weight, size, FONT_DISPLAY);
}
export function numFont(size, weight = 700) {
  return font(weight, size, FONT_NUM);
}

/* ---------- 数字 ---------- */
export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}
export function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** 两个 hex 颜色按 t 混合 */
export function mix(hexA, hexB, t) {
  const A = hexToRgb(hexA), B = hexToRgb(hexB);
  return '#' + [A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t]
    .map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
/** 相对亮度 0~1，用于自动决定文字黑白 */
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** 在给定背景色上返回读得清的文字色 */
export function readableOn(bgHex, light = '#FFFFFF', dark = '#111111') {
  return luminance(bgHex) > 0.45 ? dark : light;
}

/* ---------- 随机（可复现，保证同一输入每次导出完全一致） ---------- */
export function makeRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ---------- 形状 ---------- */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}
export function fillRoundRect(ctx, x, y, w, h, r, style) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = style;
  ctx.fill();
}
export function strokeRoundRect(ctx, x, y, w, h, r, style, lw = 2) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = style;
  ctx.lineWidth = lw;
  ctx.stroke();
}
/** 用于 clip 的路径（不填不描） */
export function clipRoundRect(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
}

/* ---------- 图片 ---------- */
/**
 * 把图片画进目标矩形。
 * fit: 'cover' 填满并裁切 | 'contain' 完整放入（可能有留白）
 */
export function drawImageFit(ctx, img, x, y, w, h, fit = 'cover', focusY = 0.5) {
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  if (!iw || !ih) return;
  const sx = w / iw, sy = h / ih;
  if (fit === 'contain') {
    const s = Math.min(sx, sy);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const s = Math.max(sx, sy);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * focusY, dw, dh);
  }
}
/** 同 drawImageFit，但按圆角裁切 */
export function drawImageFitRounded(ctx, img, x, y, w, h, r, fit = 'cover', focusY = 0.5) {
  ctx.save();
  clipRoundRect(ctx, x, y, w, h, r);
  drawImageFit(ctx, img, x, y, w, h, fit, focusY);
  ctx.restore();
}
/** 整张海报铺满画布并加模糊，作为「氛围底」 */
export function drawBlurredBackdrop(ctx, img, W, H, { blur = 60, scale = 1.25, darken = 0.45, saturate = 1.15 } = {}) {
  const iw = img.width, ih = img.height;
  const s = Math.max(W / iw, H / ih) * scale;
  const dw = iw * s, dh = ih * s;
  ctx.save();
  ctx.globalAlpha = 1;
  if ('filter' in ctx) ctx.filter = `blur(${blur}px) saturate(${saturate})`;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  if ('filter' in ctx) ctx.filter = 'none';
  ctx.restore();
  if (darken > 0) {
    ctx.fillStyle = `rgba(0,0,0,${darken})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------- 文本 ---------- */
/**
 * 把文本按最大宽度切成多行。逐字测量，中英文混排都能正确断行。
 * 遇到 \n 强制换行。
 */
export function wrapText(ctx, text, maxWidth, { maxLines = 99, ellipsis = '…' } = {}) {
  const out = [];
  const paragraphs = String(text ?? '').split('\n');
  for (const para of paragraphs) {
    if (para === '') { out.push(''); continue; }
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      ctx.font = ctx.font; // 保持当前字体
      if (measureTextCached(ctx, test) > maxWidth && line !== '') {
        out.push(line);
        line = ch;
        if (out.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (out.length >= maxLines) break;
    if (line !== '') out.push(line);
  }
  if (out.length > maxLines) out.length = maxLines;
  // 超长时最后一行加省略号
  if (out.length === maxLines) {
    const joined = out.join('');
    const flat = String(text).replace(/\n/g, '');
    if (joined.length < flat.length) {
      let last = out[maxLines - 1];
      while (last.length > 1 && measureTextCached(ctx, last + ellipsis) > maxWidth) last = last.slice(0, -1);
      out[maxLines - 1] = last + ellipsis;
    }
  }
  return out;
}

function measureTextCached(ctx, t) {
  const key = ctx.font + '\u0000' + t;
  let v = measureCache.get(key);
  if (v === undefined) {
    v = ctx.measureText(t).width;
    if (measureCache.size > 4000) measureCache.clear();
    measureCache.set(key, v);
  }
  return v;
}
export function measure(ctx, t) { return measureTextCached(ctx, t); }

/**
 * 绘制多行文本。
 * opts: { lineHeight, align('left'|'center'|'right'), baseline('top'|'middle'),
 *         color, stroke:{color,width}, shadow:{color,blur,x,y}, letterSpacing }
 */
export function drawText(ctx, text, x, y, {
  lineHeight = 1.2,
  align = 'left',
  baseline = 'top',
  color = '#fff',
  stroke = null,
  shadow = null,
  letterSpacing = 0,
  maxWidth = Infinity,
  maxLines = 99,
} = {}) {
  const lines = maxWidth === Infinity
    ? String(text ?? '').split('\n')
    : wrapText(ctx, text, maxWidth, { maxLines });
  const lh = lineHeight * fontSizeOf(ctx);
  ctx.save();
  ctx.textAlign = letterSpacing ? 'left' : align;
  ctx.textBaseline = baseline;
  if (shadow) { ctx.shadowColor = shadow.color; ctx.shadowBlur = shadow.blur; ctx.shadowOffsetX = shadow.x || 0; ctx.shadowOffsetY = shadow.y || 0; }
  lines.forEach((line, i) => {
    const ly = baseline === 'middle'
      ? y + (i - (lines.length - 1) / 2) * lh
      : y + i * lh;
    const lx = letterSpacing
      ? (align === 'center' ? x - lineWidth(ctx, line, letterSpacing) / 2
        : align === 'right' ? x - lineWidth(ctx, line, letterSpacing) : x)
      : x;
    if (letterSpacing) drawSpacedLine(ctx, line, lx, ly, letterSpacing, color, stroke);
    else {
      if (stroke) { ctx.lineWidth = stroke.width; ctx.strokeStyle = stroke.color; ctx.strokeText(line, lx, ly); }
      ctx.fillStyle = color;
      ctx.fillText(line, lx, ly);
    }
  });
  ctx.restore();
  return lines.length;
}
function drawSpacedLine(ctx, line, x, y, spacing, color, stroke) {
  let cx = x;
  for (const ch of line) {
    if (stroke) { ctx.lineWidth = stroke.width; ctx.strokeStyle = stroke.color; ctx.strokeText(ch, cx, y); }
    ctx.fillStyle = color;
    ctx.fillText(ch, cx, y);
    cx += measureTextCached(ctx, ch) + spacing;
  }
}
function lineWidth(ctx, line, spacing) {
  let w = 0;
  for (const ch of line) w += measureTextCached(ctx, ch) + spacing;
  return Math.max(0, w - spacing);
}
function fontSizeOf(ctx) {
  const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  return m ? parseFloat(m[1]) : 16;
}

/* ---------- 效果 ---------- */
let grainCanvas = null;
/** 生成一次噪点纹理，之后反复平铺，用来消除放大带来的塑料感 */
export function grainPattern(ctx, amount = 10, size = 128) {
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = grainCanvas.height = size;
    const g = grainCanvas.getContext('2d');
    const d = g.createImageData(size, size);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 128 + (Math.random() * 2 - 1) * 90;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
  }
  const p = ctx.createPattern(grainCanvas, 'repeat');
  ctx.save();
  ctx.globalAlpha = amount / 255;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = p;
  ctx.fillRect(-2000, -2000, 8000, 8000);
  ctx.restore();
}

export function vignette(ctx, W, H, strength = 0.4) {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.18, W / 2, H * 0.5, Math.max(W, H) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** 竖向线性渐变填充 */
export function vGradient(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  stops.forEach(([pos, color]) => g.addColorStop(pos, color));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** 把多行文字垂直排布成一块，返回实际占用高度 */
export function textBlockHeight(lineCount, lineHeightPx) {
  return lineCount <= 0 ? 0 : lineCount * lineHeightPx;
}

/** 在矩形内画一条水平细线（或渐隐线） */
export function hairline(ctx, x1, x2, y, color, width = 2, fade = 0) {
  if (!fade) {
    ctx.fillStyle = color;
    ctx.fillRect(x1, y - width / 2, x2 - x1, width);
    return;
  }
  const g = ctx.createLinearGradient(x1, 0, x2, 0);
  g.addColorStop(0, rgba(color.startsWith('#') ? color : '#ffffff', 0));
  g.addColorStop(0.5, color);
  g.addColorStop(1, rgba(color.startsWith('#') ? color : '#ffffff', 0));
  ctx.fillStyle = g;
  ctx.fillRect(x1, y - width / 2, x2 - x1, width);
}

/** 分数格式化：10 -> "10.0", 7.8 -> "7.8", 8 -> "8.0" */
export function fmtScore(v) {
  if (v === '' || v === null || v === undefined || isNaN(v)) return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return n.toFixed(1);
}

/** 评分档位文案（十分制） */
export function scoreTier(score) {
  const n = Number(score);
  if (!isFinite(n)) return '';
  if (n >= 9) return '神作';
  if (n >= 8) return '力荐';
  if (n >= 7) return '佳作';
  if (n >= 6) return '还行';
  if (n >= 5) return '一般';
  if (n >= 4) return '微妙';
  return '弃番';
}
export function tierColor(score, accent) {
  const n = Number(score);
  if (!isFinite(n)) return accent;
  if (n >= 9) return '#FF4D6D';
  if (n >= 8) return '#FF7A45';
  if (n >= 7) return '#FFB020';
  if (n >= 6) return '#7FD858';
  if (n >= 5) return '#4DC9D8';
  if (n >= 4) return '#8A93A8';
  return '#6B7280';
}

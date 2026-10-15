/* ===========================================================
   core.js —— 信息区渲染引擎（排版原语）
   主题定义与顶层渲染在 themes.js；这里只提供可复用的绘制部件，
   供主题在统一的信息区坐标体系里调用。
   =========================================================== */

import {
  BASE_W, FONT_DISPLAY, FONT_TEXT, FONT_NUM, FONT_SERIF, font,
  roundRect, clipRoundRect, drawImageFitRounded, drawBlurredBackdrop,
  wrapText, measure, drawText, grainPattern, vignette,
  rgba, mix, readableOn, makeRng, clamp, fmtScore, scoreTier, tierColor,
} from './util.js';

export { BASE_W, FONT_DISPLAY, FONT_TEXT, FONT_NUM, FONT_SERIF, drawText, wrapText, measure, grainPattern, vignette, roundRect, clipRoundRect, drawImageFitRounded, drawBlurredBackdrop, rgba, mix, readableOn, makeRng, clamp, fmtScore, scoreTier, tierColor };

/** 画布比例预设 */
export const RATIOS = {
  '3:4': 1440,
  '4:5': 1350,
  '9:16': 1920,
  '1:1': 1080,
};

/* ===========================================================
   信息区绘制：所有主题共用同一套排版逻辑，只是外观参数不同
   =========================================================== */

function metricTop(size, lineHeight) {
  const lh = size * lineHeight;
  return (lh - size * 0.72) / 2;
}
function blockHeight(size, lineHeight, lines) {
  return lines > 0 ? size * lineHeight * lines : 0;
}

/** 底部信息块，最终用 globalAlpha 整体淡入淡出 */
function clipFooterBand(ctx, ink, y0, canvasH) {
  const pad = ink.safePad ?? 72;
  const x = ink.x ?? pad;
  const w = ink.w ?? BASE_W - pad * 2;
  roundRect(ctx, x, y0 - 16, w, canvasH - y0 + 32, 28);
  ctx.clip();
}

/** 预排版：算出各个块的高度与换行，便于主题做对齐 */
export function layoutInfo(ctx, ink) {
  const r = { blocks: {}, order: [] };
  const push = (key, h, extra = {}) => {
    r.blocks[key] = { h, ...extra };
    r.order.push(key);
    return h;
  };

  // 角标
  if (ink.kicker?.text) {
    ctx.font = font(ink.kicker.weight ?? 700, ink.kicker.size ?? 30, ink.kicker.family ?? FONT_TEXT);
    const tw = ink.kicker.spacing
      ? [...ink.kicker.text].reduce((a, c) => a + measure(ctx, c), 0) + ink.kicker.spacing * (ink.kicker.text.length - 1)
      : measure(ctx, ink.kicker.text);
    push('kicker', tw, { textW: tw });
  }

  // 标题
  if (ink.title) {
    const size = ink.title.size ?? 62;
    ctx.font = font(ink.title.weight ?? 700, size, ink.title.family ?? FONT_DISPLAY);
    const lines = wrapText(ctx, ink.title.text, ink.w !== undefined ? ink.w : BASE_W - 144, { maxLines: ink.title.maxLines ?? 2 });
    r.titleLines = lines;
    push('title', blockHeight(size, ink.title.lineHeight ?? 1.3, lines.length));
  }

  // 分数
  if (ink.score?.show && fmtScore(ink.score.value) !== null) {
    const s = ink.score;
    const size = s.size ?? 132;
    const lh = s.lineHeight ?? 1.0;
    let rightH = 0;
    ctx.font = font(600, s.tierSize ?? 30, FONT_TEXT);
    if (s.tier) rightH += (s.tierSize ?? 30) * 1.35;
    if (s.bgmShow && fmtScore(s.bgmValue) !== null && !s.bgmInline) rightH += (s.subSize ?? 28) * 1.4;
    if (s.unit) rightH += (s.unitSize ?? 30) * 1.3;
    push('score', Math.max(size * lh, rightH), { size, lh, rightH });
  } else if (ink.score?.show && ink.score.bgmShow && fmtScore(ink.score.bgmValue) !== null) {
    const s = ink.score;
    const size = s.bgmOnlySize ?? 54;
    push('score', size * 1.25, { size, lh: 1.25, rightH: 0 });
  }

  // 吐槽短评
  if (ink.comment?.text) {
    const c = ink.comment;
    ctx.font = font(c.weight ?? 400, c.size ?? 34, c.family ?? FONT_TEXT);
    const lines = wrapText(ctx, c.text, (ink.w ?? BASE_W - 144) - (c.quote ? 56 : 0), { maxLines: c.maxLines ?? 3 });
    r.commentLines = lines;
    push('comment', lines.length * (c.size ?? 34) * (c.lineHeight ?? 1.55));
  }

  // 条目信息 chips
  if (ink.meta?.items?.length) {
    const m = ink.meta;
    ctx.font = font(m.weight ?? 500, m.size ?? 26, FONT_TEXT);
    const items = m.items.filter(Boolean);
    if (items.length) {
      const lines = wrapChips(ctx, items, (ink.w ?? BASE_W - 144), m.gap ?? 26, m.chipPadX ?? 0);
      r.chipLines = lines;
      push('meta', lines.length * (m.size ?? 26) * (m.lineHeight ?? 1.9));
    }
  }

  // 页脚（水印 / 自定义文案）
  const footParts = ink.footer?.parts?.filter(Boolean) ?? [];
  if (footParts.length) {
    ctx.font = font(ink.footer.weight ?? 500, ink.footer.size ?? 26, ink.footer.family ?? FONT_TEXT);
    push('footer', (ink.footer.size ?? 26) * 1.5);
  }
  r.footParts = footParts;
  r.gaps = ink.gaps ?? {};
  return r;
}

function wrapChips(ctx, items, maxW, gap, padX) {
  const lines = [[]];
  let w = 0;
  for (const it of items) {
    const iw = measure(ctx, it) + padX * 2;
    const add = lines[lines.length - 1].length ? gap + iw : iw;
    if (w + add > maxW && lines[lines.length - 1].length) {
      lines.push([it]);
      w = iw;
    } else {
      lines[lines.length - 1].push(it);
      w += add;
    }
  }
  return lines;
}

/**
 * 把信息区画到画布上。
 * y0 = 信息区起始 y；align 由 ink.align 决定。
 * 返回占用高度。
 */
export function paintInfo(ctx, ink, y0, canvasH) {
  const lay = layoutInfo(ctx, ink);
  const pad = ink.safePad ?? 72;
  const x = ink.x ?? pad;
  const w = ink.w ?? BASE_W - pad * 2;
  const align = ink.align ?? 'left';
  const anchorX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const gaps = ink.gaps ?? { kicker: 20, title: 22, score: 26, comment: 20, meta: 22, footer: 26 };

  ctx.save();
  if (ink.bgBlur) ctx.filter = `blur(${ink.bgBlur}px)`;
  if (ink.footerBand) clipFooterBand(ctx, ink, y0 - (gaps.kicker ?? 20), canvasH);
  let y = y0;

  /* ---- 角标 ---- */
  if (lay.blocks.kicker) {
    const k = ink.kicker;
    const size = k.size ?? 30;
    const tw = lay.blocks.kicker.textW;
    const h = size * 1.9;
    const bx = align === 'center' ? anchorX - (tw + (k.padX ?? 34) * 2) / 2
      : align === 'right' ? anchorX - (tw + (k.padX ?? 34) * 2)
        : x;
    ctx.save();
    if (k.bg) {
      roundRect(ctx, bx, y, tw + (k.padX ?? 34) * 2, h, k.radius ?? 8);
      ctx.fillStyle = k.bg;
      ctx.fill();
      if (k.border) { ctx.lineWidth = k.borderWidth ?? 2; ctx.strokeStyle = k.border; ctx.stroke(); }
    } else if (k.underline) {
      ctx.fillStyle = k.underline;
      const uw = k.underlineW ?? tw + (k.padX ?? 34) * 2;
      const ux = align === 'center' ? anchorX - uw / 2 : align === 'right' ? anchorX - uw : x;
      ctx.fillRect(ux, y + h - 6, uw, k.underlineH ?? 6);
    }
    ctx.font = font(k.weight ?? 700, size, k.family ?? FONT_TEXT);
    ctx.textAlign = k.bg ? 'center' : align;
    ctx.textBaseline = 'middle';
    const ty = y + h / 2;
    if (k.spacing && !k.bg) {
      const lx = align === 'center' ? anchorX - tw / 2 : align === 'right' ? anchorX - tw : x;
      let cx = lx;
      for (const ch of k.text) { ctx.fillStyle = k.color ?? '#fff'; ctx.fillText(ch, cx, ty); cx += measure(ctx, ch) + k.spacing; }
    } else {
      if (k.shadow) { ctx.shadowColor = k.shadow.color; ctx.shadowBlur = k.shadow.blur; }
      ctx.fillStyle = k.color ?? '#fff';
      ctx.fillText(k.text, k.bg ? bx + (tw + (k.padX ?? 34) * 2) / 2 : anchorX, ty);
    }
    ctx.restore();
    y += h + (gaps.kicker ?? 20);
  }

  /* ---- 标题 ---- */
  if (lay.blocks.title) {
    const t = ink.title;
    const size = t.size ?? 62;
    const lh = t.lineHeight ?? 1.3;
    const lines = lay.titleLines;
    ctx.save();
    ctx.font = font(t.weight ?? 700, size, t.family ?? FONT_DISPLAY);
    if (t.shadow) { ctx.shadowColor = t.shadow.color; ctx.shadowBlur = t.shadow.blur; ctx.shadowOffsetY = t.shadow.y || 0; }
    lines.forEach((line, i) => {
      const baseY = y + i * size * lh + metricTop(size, lh) + size * 0.72;
      let lx = anchorX;
      if (t.spacing) {
        const lw = [...line].reduce((a, c) => a + measure(ctx, c), 0) + t.spacing * (line.length - 1);
        lx = align === 'center' ? anchorX - lw / 2 : align === 'right' ? anchorX - lw : x;
        let cx = lx;
        for (const ch of line) {
          if (t.stroke) { ctx.lineWidth = t.stroke.width; ctx.strokeStyle = t.stroke.color; ctx.strokeText(ch, cx, baseY); }
          ctx.fillStyle = t.color ?? '#fff';
          ctx.fillText(ch, cx, baseY);
          cx += measure(ctx, ch) + t.spacing;
        }
      } else {
        ctx.textAlign = align;
        ctx.textBaseline = 'alphabetic';
        if (t.stroke) { ctx.lineWidth = t.stroke.width; ctx.strokeStyle = t.stroke.color; ctx.strokeText(line, lx, baseY); }
        ctx.fillStyle = t.color ?? '#fff';
        ctx.fillText(line, lx, baseY);
      }
    });
    ctx.restore();
    y += lay.blocks.title.h + (gaps.title ?? 22);
  }

  /* ---- 分数 ---- */
  if (lay.blocks.score) {
    const s = ink.score;
    const b = lay.blocks.score;
    const size = b.size, lh = b.lh;
    const sc = fmtScore(s.value);
    const tc = s.tierColorize ? tierColor(s.value, s.accent ?? '#FFB020') : (s.color ?? '#fff');
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    const top = y;
    if (sc !== null) {
      ctx.font = numFontOf(size, s.weight ?? 800);
      const numW = measure(ctx, sc);
      const unitW = s.unit ? measure(ctx, s.unit) * 0 + 0 : 0;
      const groupW = numW;
      const gx = align === 'center' ? anchorX - groupW / 2 : align === 'right' ? anchorX - groupW : x;
      const baselineY = top + size * 0.80;
      if (s.shadow) { ctx.shadowColor = s.shadow.color; ctx.shadowBlur = s.shadow.blur; ctx.shadowOffsetY = s.shadow.y || 0; }
      if (s.stroke) { ctx.lineWidth = s.stroke.width; ctx.strokeStyle = s.stroke.color; ctx.strokeText(sc, gx, baselineY); }
      ctx.fillStyle = tc;
      ctx.fillText(sc, gx, baselineY);
      if (s.unit) {
        ctx.font = font(600, s.unitSize ?? 30, FONT_TEXT);
        ctx.fillStyle = s.subColor ?? tc;
        ctx.fillText(s.unit, gx + numW + 12, baselineY - 6);
      }
      // 右侧竖排附属信息
      if (b.rightH > 0) {
        let ry = top + (size * lh - b.rightH) / 2 + (s.tierSize ?? 30) * 1.05;
        const rx = gx + numW + (s.unit ? measure(ctx, s.unit) + 26 : 30);
        ctx.textAlign = 'left';
        if (s.tier) {
          ctx.font = font(700, s.tierSize ?? 30, FONT_TEXT);
          ctx.fillStyle = s.tierBg ?? rgba(tc.startsWith('#') ? tc : '#ffffff', 0.16);
          const tw = measure(ctx, scoreTier(s.value));
          const th = (s.tierSize ?? 30) * 1.7;
          roundRect(ctx, rx, ry - th + 8, tw + 30, th, 999);
          ctx.fill();
          ctx.fillStyle = s.tierColor ?? tc;
          ctx.fillText(scoreTier(s.value), rx + 15, ry);
          ry += (s.tierSize ?? 30) * 1.35;
        }
        if (s.bgmShow && fmtScore(s.bgmValue) !== null && !s.bgmInline) {
          ctx.font = font(500, s.subSize ?? 28, FONT_TEXT);
          ctx.fillStyle = s.subColor ?? 'rgba(255,255,255,.72)';
          ctx.fillText(`BGM ${fmtScore(s.bgmValue)}` + (s.rankShow && s.rank ? ` · #${s.rank}` : ''), rx, ry);
        }
      }
    } else if (s.bgmShow && fmtScore(s.bgmValue) !== null) {
      ctx.font = font(600, b.size, FONT_TEXT);
      ctx.textAlign = align;
      const txt = `BGM ${fmtScore(s.bgmValue)}` + (s.rankShow && s.rank ? ` · 排名 #${s.rank}` : '');
      const gx = align === 'center' ? anchorX : anchorX;
      ctx.fillStyle = s.color ?? '#fff';
      ctx.fillText(txt, gx, top + b.size * 0.85);
    }
    // 行内 BGM 注明
    if (s.bgmInline && s.bgmShow && fmtScore(s.bgmValue) !== null && sc !== null) {
      ctx.font = font(500, s.subSize ?? 28, FONT_TEXT);
      ctx.textAlign = align;
      ctx.fillStyle = s.subColor ?? 'rgba(255,255,255,.7)';
      const iy = top + b.h + 4;
      ctx.fillText(`BGM 站内评分 ${fmtScore(s.bgmValue)}` + (s.rankShow && s.rank ? `　排名 #${s.rank}` : ''), anchorX, iy);
    }
    ctx.restore();
    y += b.h + (gaps.score ?? 26);
  }

  /* ---- 吐槽短评 ---- */
  if (lay.blocks.comment) {
    const c = ink.comment;
    const size = c.size ?? 34;
    const lh = c.lineHeight ?? 1.55;
    ctx.save();
    if (c.quote) {
      ctx.fillStyle = c.quoteColor ?? 'rgba(255,255,255,.28)';
      const qw = 8;
      const qx = align === 'center' ? anchorX - ((ink.w ?? BASE_W - 144)) / 2 : align === 'right' ? anchorX - (ink.w ?? BASE_W - 144) : x;
      ctx.fillRect(qx, y + 4, qw, lay.blocks.comment.h - 16);
    }
    ctx.font = font(c.weight ?? 400, size, c.family ?? FONT_TEXT);
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const textX = c.quote ? x + 40 : anchorX;
    const tw = c.quote ? (ink.w ?? BASE_W - 144) - 56 : undefined;
    lay.commentLines.forEach((line, i) => {
      const baseY = y + i * size * lh + metricTop(size, lh) + size * 0.72;
      let lx = textX;
      if (align === 'center') lx = anchorX;
      if (c.stroke) { ctx.lineWidth = c.stroke.width; ctx.strokeStyle = c.stroke.color; ctx.strokeText(line, lx, baseY); }
      ctx.fillStyle = c.color ?? 'rgba(255,255,255,.86)';
      ctx.fillText(line, lx, baseY);
    });
    ctx.restore();
    y += lay.blocks.comment.h + (gaps.comment ?? 20);
  }

  /* ---- 条目信息 chips ---- */
  if (lay.blocks.meta) {
    const m = ink.meta;
    const size = m.size ?? 26;
    const lh = m.lineHeight ?? 1.9;
    ctx.save();
    ctx.font = font(m.weight ?? 500, size, FONT_TEXT);
    lay.chipLines.forEach((line, i) => {
      const baseY = y + i * size * lh + metricTop(size, lh) + size * 0.72;
      let cx = align === 'center' ? anchorX - (chipsWidth(ctx, line, m.gap ?? 26, m.chipPadX ?? 0)) / 2
        : align === 'right' ? anchorX - chipsWidth(ctx, line, m.gap ?? 26, m.chipPadX ?? 0)
          : x;
      line.forEach((item, j) => {
        const iw = measure(ctx, item) + (m.chipPadX ?? 0) * 2;
        if (m.chipBg) {
          roundRect(ctx, cx, baseY - size * 1.22, iw, size * 1.72, m.chipRadius ?? 999);
          ctx.fillStyle = typeof m.chipBg === 'function' ? m.chipBg(j) : m.chipBg;
          ctx.fill();
        }
        if (m.dot && j > 0 && !m.chipBg) {
          ctx.fillStyle = m.dotColor ?? 'rgba(255,255,255,.35)';
          ctx.beginPath();
          ctx.arc(cx - (m.gap ?? 26) / 2, baseY - size * 0.36, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = m.color ?? 'rgba(255,255,255,.66)';
        ctx.textAlign = 'left';
        ctx.fillText(item, cx + (m.chipPadX ?? 0), baseY);
        cx += iw + (m.gap ?? 26);
      });
    });
    ctx.restore();
    y += lay.blocks.meta.h + (gaps.meta ?? 22);
  }

  /* ---- 页脚 ---- */
  if (lay.blocks.footer) {
    const f = ink.footer;
    const size = f.size ?? 26;
    ctx.save();
    ctx.font = font(f.weight ?? 500, size, f.family ?? FONT_TEXT);
    ctx.textBaseline = 'alphabetic';
    const baseY = y + size * 0.9;
    if (f.separator) {
      const parts = lay.footParts;
      const widths = parts.map(p => measure(ctx, p));
      const sepW = measure(ctx, f.separator) * (parts.length - 1);
      const totalW = widths.reduce((a, b) => a + b, 0) + sepW;
      let cx = align === 'center' ? anchorX - totalW / 2 : align === 'right' ? anchorX - totalW : x;
      parts.forEach((p, i) => {
        if (i > 0) {
          ctx.fillStyle = f.sepColor ?? 'rgba(255,255,255,.35)';
          ctx.fillText(f.separator, cx, baseY);
          cx += measure(ctx, f.separator);
        }
        ctx.fillStyle = i === 0 ? (f.color ?? 'rgba(255,255,255,.62)') : (f.accentColor ?? f.color ?? 'rgba(255,255,255,.62)');
        ctx.fillText(p, cx, baseY);
        cx += widths[i];
      });
    } else {
      ctx.textAlign = align;
      ctx.fillStyle = f.color ?? 'rgba(255,255,255,.62)';
      lay.footParts.forEach((p, i) => {
        ctx.fillText(p, anchorX, baseY + i * size * 1.5);
      });
    }
    ctx.restore();
    y += lay.blocks.footer.h;
  }

  ctx.restore();
  return y - y0;
}

function chipsWidth(ctx, line, gap, padX) {
  return line.reduce((a, it) => a + measure(ctx, it) + padX * 2, 0) + gap * Math.max(0, line.length - 1);
}

function numFontOf(size, weight) {
  return font(weight, size, FONT_NUM);
}

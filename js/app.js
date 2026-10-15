/* ===========================================================
   app.js —— 界面逻辑与状态管理
   =========================================================== */

import { searchAnime, getSubject, loadPoster, loadImage, pickImage } from './bgm.js';
import { THEMES, PALETTES, paletteById, themeById, renderTheme, canvasToBlob, isLightPalette } from './themes.js';

const $ = id => document.getElementById(id);
const LS_KEY = 'xhs-cover-studio-v2';

/* ---------- 默认设置 ---------- */
const DEFAULTS = {
  theme: 'aoi',
  palette: '',          // 空 = 跟随主题默认配色
  ratio: '3:4',
  exportWidth: 1080,
  alignOverride: 'auto',
  grain: true,
  userScore: 8.0,
  scoreUnit: '',
  showTier: true,
  showBgm: true,
  showRank: false,
  badge: '新番速递',
  comment: '',
  showTitle: true,
  showMeta: true,
  showTags: true,
  showComment: true,
  watermark: true,
  xhsId: '@1409467028',
  footerCustom: '',
};

const BADGE_PRESETS = ['新番速递', '本月最强', '补番推荐', '完结吐槽', '冷门神作', '烂片警告', '私藏片单', '重温经典'];

/* 手机端折叠面板：只影响窄屏，桌面端始终全展开 */
const MOBILE_Q = '(max-width: 860px)';
const COLLAPSE_KEY = 'xhs-cover-studio-collapse';
const isMobile = () => window.matchMedia(MOBILE_Q).matches;

function loadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveCollapsed(set) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { }
}

/* ===========================================================
   状态
   =========================================================== */

/* 手机上把预览降到 720 宽：模糊底 + 大画布在中低端机上很吃力，
   导出时仍按用户选的尺寸全分辨率重绘，不影响成品清晰度。 */
function detectPreviewWidth() {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
  const lowMem = navigator.deviceMemory && navigator.deviceMemory <= 4;
  return (mobile || lowMem) ? 720 : 1080;
}

const state = {
  subject: null,
  posterImg: null,
  posterUrl: '',
  opts: { ...DEFAULTS },
  previewWidth: detectPreviewWidth(),
  scoreTouched: false,   // 用户是否手动改过评分
};

/** 是否正在取海报（用于决定骨架提示要不要收起来） */
let loadingPoster = false;

/* ===========================================================
   初始化
   =========================================================== */

function boot() {
  loadSettings();
  buildThemeGrid();
  buildPaletteRow();
  buildBadgePresets();
  setupAccordion();
  bindEvents();
  syncInputsFromState();
  updateCanvasSizeLabel();
  // 首次渲染的占位框本身就是最好的引导，骨架只用于"正在取图"的短暂过渡
  render();
  if (!state.posterImg && !loadingPoster) hideSkeleton('搜一部番，或者上传一张海报图开始');

  // 字体就位后重绘一次，避免首帧用系统字体
  if (document.fonts?.ready) document.fonts.ready.then(() => render());
}

/** 隐藏骨架并给一句引导 */
function hideSkeleton(tip) {
  const sk = $('skeleton');
  if (sk && !sk.hidden) {
    sk.hidden = true;
    if (tip) setMsg(tip);
  }
}

/* ---------- 手机端折叠 ---------- */
let collapsed = loadCollapsed();
function applyCollapse() {
  const mobile = isMobile();
  for (const sec of document.querySelectorAll('.card[data-card]')) {
    const id = sec.dataset.card;
    const hide = mobile && collapsed.has(id);
    sec.classList.toggle('collapsed', hide);
    const btn = sec.querySelector('.card-toggle');
    if (btn) btn.setAttribute('aria-expanded', String(!hide));
  }
  updateCardSummaries();
}
/** 折叠状态下在标题右侧显示当前选择，避免"看不见设置" */
function updateCardSummaries() {
  const o = state.opts;
  const name = state.subject?.displayTitle || state.subject?.nameCn || '';
  const set = (id, text) => {
    const h = document.querySelector(`.card[data-card="${id}"] .card-head`);
    if (h) h.dataset.summary = text || '';
  };
  set('1', name ? `《${name}》` : '未选择');
  set('2', `${themeById(o.theme).name}${o.palette ? ' · ' + paletteById(o.palette).name : ''}`);
  set('3', o.userScore === '' ? '未设置' : `${Number(o.userScore).toFixed(1)} 分` + (o.badge ? '' : ''));
  set('4', [o.badge, o.comment ? '已写吐槽' : ''].filter(Boolean).join(' · ') || '未填写');
  set('5', o.footerCustom || (o.watermark ? o.xhsId : '无署名') || '无署名');
}
function setupAccordion() {
  for (const head of document.querySelectorAll('.card-head')) {
    head.addEventListener('click', () => {
      if (!isMobile()) return;              // 桌面端不折叠
      const id = head.closest('.card').dataset.card;
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      saveCollapsed(collapsed);
      applyCollapse();
    });
  }
  // 换到窄屏时把没记录过的卡片默认收起，避免一屏看不到预览
  if (isMobile() && collapsed.size === 0) {
    collapsed = new Set(['3', '4', '5']);
    saveCollapsed(collapsed);
  }
  applyCollapse();
  let lastMobile = isMobile();
  window.addEventListener('resize', () => {
    if (isMobile() !== lastMobile) { lastMobile = isMobile(); applyCollapse(); }
  });
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      Object.assign(state.opts, JSON.parse(raw));
      state.scoreTouched = true; // 存过评分就说明是自己设过的
    }
  } catch { /* 忽略损坏的本地数据 */ }
  if (!state.opts.palette) state.opts.palette = '';
}

function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.opts)); } catch { }
}
/* ===========================================================
   UI 构建
   =========================================================== */

function buildThemeGrid() {
  const grid = $('themeGrid');
  grid.innerHTML = '';
  for (const t of THEMES) {
    const pal = paletteById(t.defaultPalette);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-chip';
    btn.dataset.theme = t.id;
    btn.innerHTML = `
      <span class="t-bar">
        <span style="background:${pal.bg}"></span>
        <span style="background:${pal.accent}"></span>
        <span style="background:${pal.accent2}"></span>
        <span style="background:${pal.ink}"></span>
      </span>
      <span class="t-name">${t.name}</span>
      <span class="t-desc">${t.desc}</span>`;
    btn.addEventListener('click', () => {
      state.opts.theme = t.id;
      // 换主题时把配色切回该主题默认，除非用户已手动选过别的
      state.opts.palette = t.defaultPalette;
      syncThemeUI();
      buildPaletteRow();
      scheduleRender();
    });
    grid.appendChild(btn);
  }
  syncThemeUI();
}

function syncThemeUI() {
  for (const b of document.querySelectorAll('.theme-chip')) {
    b.classList.toggle('active', b.dataset.theme === state.opts.theme);
  }
}

function buildPaletteRow() {
  const row = $('paletteRow');
  const theme = themeById(state.opts.theme);
  row.innerHTML = '';
  const active = state.opts.palette || theme.defaultPalette;
  for (const p of PALETTES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (p.id === active ? ' active' : '');
    b.title = p.name;
    b.style.background = `linear-gradient(135deg, ${p.bg} 0 50%, ${p.accent} 50% 100%)`;
    b.addEventListener('click', () => {
      state.opts.palette = p.id;
      buildPaletteRow();
      scheduleRender();
    });
    row.appendChild(b);
  }
}

function buildBadgePresets() {
  const box = $('badgePresets');
  box.innerHTML = '';
  for (const s of BADGE_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s;
    b.addEventListener('click', () => {
      state.opts.badge = s;
      $('badge').value = s;
      scheduleRender();
    });
    box.appendChild(b);
  }
}

/* ===========================================================
   事件绑定
   =========================================================== */

function bindEvents() {
  // 搜索
  $('btnSearch').addEventListener('click', doSearch);
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  $('btnLoadId').addEventListener('click', () => {
    const id = $('bgmId').value.trim();
    if (!/^\d+$/.test(id)) return setMsg('条目 ID 应该是纯数字，例如 400602', 'error');
    loadSubjectById(Number(id));
  });
  $('bgmId').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('btnLoadId').click(); }
  });

  // 上传
  const fileInput = $('fileInput');
  $('drop').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (f) await useUploadedFile(f);
    fileInput.value = '';
  });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', async e => {
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) await useUploadedFile(f);
  });

  // 主题相关
  $('ratio').addEventListener('change', e => { state.opts.ratio = e.target.value; updateCanvasSizeLabel(); scheduleRender(); });
  $('exportWidth').addEventListener('change', e => { state.opts.exportWidth = Number(e.target.value); updateCanvasSizeLabel(); scheduleRender(); });
  $('alignOverride').addEventListener('change', e => { state.opts.alignOverride = e.target.value; scheduleRender(); });
  $('grain').addEventListener('change', e => { state.opts.grain = e.target.checked; scheduleRender(); });

  // 评分
  const scoreEl = $('userScore'), rangeEl = $('scoreRange');
  scoreEl.addEventListener('input', () => {
    const v = clampScore(scoreEl.value);
    if (v !== null) rangeEl.value = String(v);
    state.opts.userScore = scoreEl.value === '' ? '' : v;
    state.scoreTouched = true;
    scheduleRender();
  });
  scoreEl.addEventListener('blur', () => {
    const v = clampScore(scoreEl.value);
    scoreEl.value = v === null ? '' : v.toFixed(1);
    state.opts.userScore = v === null ? '' : v;
    state.scoreTouched = true;
    scheduleRender();
  });
  rangeEl.addEventListener('input', () => {
    const v = Number(rangeEl.value);
    scoreEl.value = v.toFixed(1);
    state.opts.userScore = v;
    state.scoreTouched = true;
    scheduleRender();
  });
  for (const b of document.querySelectorAll('.quick-scores button')) {
    b.addEventListener('click', () => {
      const v = Number(b.dataset.score);
      state.opts.userScore = v;
      scoreEl.value = v.toFixed(1);
      rangeEl.value = String(v);
      state.scoreTouched = true;
      scheduleRender();
    });
  }
  $('btnUseBgm').addEventListener('click', () => {
    const s = state.subject?.score;
    if (s === null || s === undefined || !(s > 0)) return setMsg('当前条目还没有 Bangumi 评分（新番常见），先手填一个或用别的条目', 'error');
    state.opts.userScore = Number(s);
    scoreEl.value = Number(s).toFixed(1);
    rangeEl.value = String(s);
    state.scoreTouched = true;
    scheduleRender();
    setMsg(`已把 Bangumi 站内评分 ${Number(s).toFixed(1)} 填入你的评分`, 'ok');
  });
  $('scoreUnit').addEventListener('input', e => { state.opts.scoreUnit = e.target.value; scheduleRender(); });
  $('showTier').addEventListener('change', e => { state.opts.showTier = e.target.checked; scheduleRender(); });
  $('showBgm').addEventListener('change', e => { state.opts.showBgm = e.target.checked; scheduleRender(); });
  $('showRank').addEventListener('change', e => { state.opts.showRank = e.target.checked; scheduleRender(); });

  // 文案
  $('badge').addEventListener('input', e => { state.opts.badge = e.target.value; scheduleRender(); });
  $('comment').addEventListener('input', e => {
    state.opts.comment = e.target.value;
    $('commentCount').textContent = String(e.target.value.length);
    scheduleRender();
  });
  $('showTitle').addEventListener('change', e => { state.opts.showTitle = e.target.checked; scheduleRender(); });
  $('showMeta').addEventListener('change', e => { state.opts.showMeta = e.target.checked; scheduleRender(); });
  $('showTags').addEventListener('change', e => { state.opts.showTags = e.target.checked; scheduleRender(); });
  $('showComment').addEventListener('change', e => { state.opts.showComment = e.target.checked; scheduleRender(); });

  // 署名
  $('watermark').addEventListener('change', e => { state.opts.watermark = e.target.checked; scheduleRender(); });
  $('xhsId').addEventListener('input', e => { state.opts.xhsId = e.target.value; scheduleRender(); });
  $('footerCustom').addEventListener('input', e => { state.opts.footerCustom = e.target.value; scheduleRender(); });

  // 重置
  $('btnReset').addEventListener('click', () => {
    Object.assign(state.opts, DEFAULTS);
    state.scoreTouched = false;
    syncInputsFromState(); syncThemeUI(); buildPaletteRow();
    scheduleRender();
    setMsg('已恢复默认设置', 'ok');
  });

  // 导出
  $('btnExport').addEventListener('click', exportImage);
  $('btnExportTop').addEventListener('click', exportImage);
  $('btnExportM').addEventListener('click', exportImage);

  // 预览缩放
  $('btnFit').addEventListener('click', () => {
    const c = $('canvas');
    c.classList.toggle('zoomed');
    $('btnFit').textContent = c.classList.contains('zoomed') ? '缩小预览' : '适应窗口';
  });

  // 手机端：设置按钮滚动到面板
  $('btnPanel').addEventListener('click', () => {
    $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // 粘贴图片
  window.addEventListener('paste', async e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (!item) return;
    const f = item.getAsFile();
    if (f) await useUploadedFile(f);
  });
}

function syncInputsFromState() {
  const o = state.opts;
  $('ratio').value = o.ratio;
  $('exportWidth').value = String(o.exportWidth);
  $('alignOverride').value = o.alignOverride;
  $('grain').checked = o.grain;
  $('userScore').value = o.userScore === '' ? '' : Number(o.userScore).toFixed(1);
  $('scoreRange').value = String(o.userScore === '' ? 5 : o.userScore);
  $('scoreUnit').value = o.scoreUnit;
  $('showTier').checked = o.showTier;
  $('showBgm').checked = o.showBgm;
  $('showRank').checked = o.showRank;
  $('badge').value = o.badge;
  $('comment').value = o.comment;
  $('commentCount').textContent = String((o.comment || '').length);
  $('showTitle').checked = o.showTitle;
  $('showMeta').checked = o.showMeta;
  $('showTags').checked = o.showTags;
  $('showComment').checked = o.showComment;
  $('watermark').checked = o.watermark;
  $('xhsId').value = o.xhsId;
  $('footerCustom').value = o.footerCustom;
}

/* ===========================================================
   搜索与载入
   =========================================================== */

async function doSearch() {
  const kw = $('q').value.trim();
  if (!kw) { $('q').focus(); return; }
  const box = $('results');
  box.innerHTML = '';
  setMsg('正在向 Bangumi 搜索…');
  $('btnSearch').disabled = true;
  try {
    const { list, total } = await searchAnime(kw, { limit: 12 });
    if (!list.length) {
      setMsg(`没找到「${kw}」相关的动画条目`, 'error');
      return;
    }
    setMsg(`找到 ${total} 个结果，点一个载入`);
    for (const item of list) box.appendChild(buildResultRow(item));
  } catch (e) {
    setMsg(explainNetwork(e), 'error');
  } finally {
    $('btnSearch').disabled = false;
  }
}

function buildResultRow(item) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'result';
  const title = item.nameCn || item.name;
  const sub = item.nameCn ? item.name : '';
  b.innerHTML = `
    <img loading="lazy" alt="" src="${pickImage(item.images, 400)}" referrerpolicy="no-referrer">
    <span class="r-body">
      <span class="r-name">${esc(title)}</span>
      <span class="r-meta">${esc([item.year, sub].filter(Boolean).join(' · '))}</span>
    </span>
    <span class="r-score">${item.score != null ? Number(item.score).toFixed(1) : '—'}</span>`;
  b.addEventListener('click', () => loadSubjectById(item.id));
  return b;
}

async function loadSubjectById(id) {
  setMsg('正在读取条目详情…');
  try {
    const detail = await getSubject(id);
    await applySubject(detail);
    $('results').innerHTML = '';
    setMsg(`已载入《${detail.nameCn || detail.name}》`, 'ok');
  } catch (e) {
    setMsg(explainNetwork(e), 'error');
  }
}

async function applySubject(detail) {
  state.subject = detail;
  if (detail.nameCn || detail.name) {
    state.subject.displayTitle = detail.nameCn || detail.name;
  }
  // 评分（BGM 评分只在你没手动改过时自动填入；未评分条目 score 为 null）
  if (detail.score != null && detail.score > 0 && !state.scoreTouched) {
    state.opts.userScore = Number(detail.score);
    $('userScore').value = Number(detail.score).toFixed(1);
    $('scoreRange').value = String(detail.score);
  }
  renderSubjectCard();
  setMsg('正在下载海报…');
  loadingPoster = true;
  try {
    const { img, url } = await loadPoster(detail);
    state.posterImg = img;
    state.posterUrl = url;
    hideSkeleton();
    render();
    setMsg('海报已就绪', 'ok');
  } catch (e) {
    setMsg(explainNetwork(e), 'error');
  } finally {
    loadingPoster = false;
  }
}

/** 网络不通时给一句人话解释（bgm.tv 在国内需要代理才能直连） */
function explainNetwork(err) {
  const m = String(err?.message || '');
  if (/Failed to fetch|NetworkError|超时|timeout/i.test(m)) {
    return `${m}　—— 连不上 bgm.tv。国内直连会被墙，请打开代理后重试，或改用「上传自己的图片」。`;
  }
  return m;
}

function renderSubjectCard() {
  const s = state.subject;
  const card = $('subjectCard');
  if (!s) { card.hidden = true; return; }
  card.hidden = false;
  const rows = [];
  if (s.nameCn && s.name) rows.push(`原名：${s.name}`);
  if (s.date) rows.push(`首播：${s.date}`);
  if (s.eps) rows.push(`集数：${s.eps}`);
  if (s.studio) rows.push(`制作：${s.studio}`);
  if (s.score != null) rows.push(`BGM 评分：${Number(s.score).toFixed(1)}${s.rank ? '　排名 #' + s.rank : ''}`);
  card.innerHTML = `
    <img alt="" src="${pickImage(s.images, 400)}" referrerpolicy="no-referrer">
    <div class="s-body">
      <div class="s-name">${esc(s.nameCn || s.name)}</div>
      <div class="s-orig">${esc(s.nameCn ? s.name : '')}</div>
      <div class="s-line">${rows.map(esc).join('<br>')}</div>
    </div>`;
}

async function useUploadedFile(file) {
  if (file.size > 12 * 1024 * 1024) { setMsg('图片太大了（超过 12MB），换一张小一点的', 'error'); return; }
  setMsg('正在读取图片…');
  try {
    const url = URL.createObjectURL(file);
    // 本地 blob 不需要（也不该）设 crossOrigin
    const img = await loadImage(url, { crossOrigin: false });
    state.posterImg = img;
    state.posterUrl = url;
    if (!state.subject) state.subject = { displayTitle: '', name: '', nameCn: '', images: {} };
    hideSkeleton();
    render();
    setMsg('已使用你上传的图片（标题请在「文案」里用文件名以外的方式填写）', 'ok');
  } catch (e) {
    setMsg('图片读取失败：' + e.message, 'error');
  }
}

/* ===========================================================
   渲染
   =========================================================== */

let rafId = 0;
function scheduleRender() {
  saveSettings();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => { rafId = 0; render(); });
}

function render() {
  const canvas = $('canvas');
  try {
    state.opts.exportWidth = state.previewWidth;
    renderTheme(canvas, state);
    state.opts.exportWidth = Number($('exportWidth').value) || 1080;
    updateCanvasSizeLabel();
    updateCardSummaries();
  } catch (e) {
    console.error(e);
    setMsg('渲染出错：' + e.message, 'error');
  }
}

function updateCanvasSizeLabel() {
  const r = state.opts.ratio || '3:4';
  const h = { '3:4': 1440, '4:5': 1350, '9:16': 1920, '1:1': 1080 }[r] || 1440;
  const w = Number($('exportWidth')?.value) || 1080;
  $('canvasSize').textContent = `${w} × ${Math.round(h * w / 1080)}`;
}

/* ===========================================================
   导出
   =========================================================== */

async function exportImage() {
  if (!state.posterImg) { setMsg('先选一部番或上传一张图，再导出', 'error'); return; }
  const btns = [$('btnExport'), $('btnExportTop'), $('btnExportM')];
  btns.forEach(b => b.disabled = true);
  setMsg('正在生成高清图…');
  const canvas = document.createElement('canvas');
  try {
    const oldWidth = state.opts.exportWidth;
    renderTheme(canvas, { ...state, opts: { ...state.opts, exportWidth: Number($('exportWidth').value) || 1080 } });
    state.opts.exportWidth = oldWidth;
    const blob = await canvasToBlob(canvas, 'image/png');
    const name = buildFileName();
    downloadBlob(blob, name);
    const kb = Math.round(blob.size / 1024);
    setMsg(`已导出 ${name}（${kb} KB）`, 'ok');
    toast('图片已下载，去小红书发布吧 🎉');
  } catch (e) {
    console.error(e);
    // 跨域污染是最常见的失败原因
    if (/tainted|SecurityError/i.test(String(e.message))) {
      setMsg('导出失败：图片跨域受限，请换一张图或改用上传本地图片', 'error');
    } else {
      setMsg('导出失败：' + e.message, 'error');
    }
  } finally {
    btns.forEach(b => b.disabled = false);
    // 恢复预览尺寸
    render();
  }
}

function buildFileName() {
  const t = (state.subject?.displayTitle || state.subject?.nameCn || state.subject?.name || '番剧封面')
    .replace(/[\\/:*?"<>|]/g, '').slice(0, 24);
  const s = state.opts.userScore === '' ? '' : `_${Number(state.opts.userScore).toFixed(1)}分`;
  const th = themeById(state.opts.theme).name;
  const stamp = new Date().toISOString().slice(0, 10);
  return `${t}${s}_${th}_${stamp}.png`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ===========================================================
   小工具
   =========================================================== */

function clampScore(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let msgTimer = 0;
function setMsg(text, kind = '') {
  const el = $('stageMsg');
  el.textContent = text;
  el.className = 'stage-foot' + (kind ? ' ' + kind : '');
  clearTimeout(msgTimer);
  if (kind === 'ok') msgTimer = setTimeout(() => { el.textContent = ''; el.className = 'stage-foot'; }, 4000);
}

let toastTimer = 0;
function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

/* 把接口暴露出来，方便自动化测试与主题预览 */
window.__studio = { state, render, renderTheme, THEMES, PALETTES };

boot();

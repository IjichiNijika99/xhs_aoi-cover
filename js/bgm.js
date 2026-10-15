/* ===========================================================
   bgm.js —— Bangumi (bgm.tv) 数据接入
   两个必须处理的现实问题：
   1) 图片必须走 /r/ 端点，否则没有 CORS 头，画布被污染、导不出 PNG
   2) bgm.tv 在中国大陆无法直连（DNS 污染 + 被墙）。
      本工具按「浏览器直连」设计 —— 也就是依赖设备上的代理。
      代理确实不通时，错误提示会明确告诉用户该开代理或改用上传图片。
   =========================================================== */

const API = 'https://api.bgm.tv';
const UA = 'xhs-anime-cover/1.0 (https://bgm.tv; personal cover maker)';

/** 直连超时：给代理留足时间，也不要让用户等太久 */
const DIRECT_TIMEOUT = 12000;

/** 这些状态码说明是链路/网关层面的问题（例如代理挂了），不是业务响应 */
const GATEWAY_STATUS = [500, 502, 503, 504, 520, 521, 522, 523, 524];

function fetchWithTimeout(url, init, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal })
    .finally(() => clearTimeout(timer));
}

/** 统一的直连请求：网络异常与网关 5xx 都转成人话错误 */
async function smartFetch(target, init = {}, { timeout = DIRECT_TIMEOUT } = {}) {
  let res;
  try {
    res = await fetchWithTimeout(target, init, timeout);
  } catch (e) {
    const aborted = /abort|timeout/i.test(String(e.name) + String(e.message));
    const err = new Error(aborted
      ? `请求超时（${Math.round(timeout / 1000)} 秒没响应）`
      : `网络请求失败：${e.message}`);
    err.network = true;
    throw err;
  }
  if (GATEWAY_STATUS.includes(res.status)) {
    const err = new Error(`网络链路异常（HTTP ${res.status}）`);
    err.network = true;
    err.status = res.status;
    throw err;
  }
  return res;
}

/** 海报图必须带 CORS 头，否则画布会被污染、导不出 PNG。
 *  规则（来自 bgm 官方 img-proxy）：/r/{size}/ 只接受 100/200/400/600/800/1200，
 *  单边尺寸 = 等比缩放不裁剪；API 的 medium 就是 /r/800/、common 是 /r/400/。 */
export function corsImageUrl(rawUrl, size = 800) {
  if (!rawUrl) return '';
  if (rawUrl.includes('/r/')) return rawUrl;
  return rawUrl.replace(/^https?:\/\/lain\.bgm\.tv\/pic\//, `https://lain.bgm.tv/r/${size}/pic/`);
}

/** 优先用 API 已经给好的 /r/ 系列地址（它们本身就带 CORS 头） */
export function pickImage(images = {}, size = 800) {
  const bySize = size >= 800
    ? [images.medium, images.common, images.large, images.small, images.grid]
    : [images.common, images.medium, images.small, images.grid, images.large];
  const cand = bySize.find(Boolean) || '';
  return corsImageUrl(cand, size);
}

async function req(pathname, { method = 'GET', body = null } = {}) {
  const res = await smartFetch(API + pathname, {
    method,
    headers: {
      'User-Agent': UA,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`bgm.tv 返回 ${res.status}${txt ? '：' + txt.slice(0, 160) : ''}`);
  }
  return res.json();
}

/**
 * 按关键词搜动画条目（type=2 即动画；服务端 limit 上限 20）。
 * 注意：网络错误直接抛出，业务空结果才返回空列表。
 */
export async function searchAnime(keyword, { limit = 12, offset = 0, sort = 'match' } = {}) {
  const safeLimit = Math.min(20, Math.max(1, limit));
  const data = await req(`/v0/search/subjects?limit=${safeLimit}&offset=${offset}`, {
    method: 'POST',
    body: { keyword, sort, filter: { type: [2] } },
  });
  const list = Array.isArray(data.data) ? data.data : [];
  return {
    total: data.total ?? list.length,
    list: list.map(normalize),
  };
}

/** 取条目详情（含 infobox：制作公司 / 集数 / 别名等） */
export async function getSubject(id) {
  const data = await req('/v0/subjects/' + id);
  return normalize(data, true);
}

/**
 * infobox 的 value 有三种形态（官方 schema 确认）：
 *   裸字符串            → "押井守"
 *   多值数组 [{v}]      → "攻殻機動隊 / GHOST IN THE SHELL"
 *   带子标签 [{k,v}]    → "总导演: xxx"
 */
function infoboxValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    return v.map(x => {
      if (x === null || x === undefined) return '';
      if (typeof x === 'string' || typeof x === 'number') return String(x);
      if (x.k) return `${x.k}: ${x.v ?? ''}`;
      return String(x.v ?? '');
    }).filter(Boolean).join(' / ');
  }
  if (typeof v === 'object') return String(v.v ?? '');
  return String(v);
}

function normalize(s, withInfobox = false) {
  const info = {};
  if (Array.isArray(s.infobox)) {
    for (const item of s.infobox) {
      if (!item || !item.key) continue;
      const text = infoboxValue(item.value);
      if (text) info[item.key] = text;
    }
  }
  const tags = Array.isArray(s.tags) ? s.tags.map(t => t?.name).filter(Boolean) : [];
  // 未评分条目 API 返回 score: 0（不是 null），必须当成"无评分"，否则会显示 0.0
  const rawScore = s.rating?.score;
  const score = (typeof rawScore === 'number' && rawScore > 0) ? rawScore : null;
  const rank = (typeof s.rating?.rank === 'number' && s.rating.rank > 0) ? s.rating.rank : null;
  const eps = info['话数'] || info['集数'] || (s.total_episodes ? String(s.total_episodes) : '');
  return {
    id: s.id,
    name: s.name || '',
    nameCn: s.name_cn || '',
    date: s.date || '',
    year: (s.date || '').slice(0, 4),
    platform: s.platform || '',
    summary: (s.summary || '').replace(/\s+/g, ' ').trim(),
    score,
    rank,
    ratingTotal: s.rating?.total || null,
    images: s.images || {},
    poster: pickImage(s.images || {}, 800),
    posterFallback: pickImage(s.images || {}, 400),
    tags,
    info,
    eps,
    studio: info['动画制作'] || info['制作'] || info['制作公司'] || '',
    staff: info['导演'] || info['原作'] || '',
    alias: info['别名'] || '',
    withInfobox,
  };
}

/** 带超时的图片加载（远程图必须 crossOrigin，否则画布污染；本地 blob 则不需要） */
export function loadImage(url, { timeout = 25000, crossOrigin = true } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) {
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
    }
    const timer = setTimeout(() => { img.src = ''; reject(new Error('图片加载超时')); }, timeout);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

/**
 * 加载海报：先试 /r/800/，失败退 /r/400/。
 * 返回 { img, url }。
 */
export async function loadPoster(subject) {
  const tries = [subject.poster, subject.posterFallback].filter(Boolean);
  let lastErr = null;
  for (const url of tries) {
    try { return { img: await loadImage(url, { timeout: 15000 }), url }; }
    catch (e) { lastErr = e; }
  }
  const err = new Error(
    `海报下载失败（${lastErr?.message || '未知原因'}）。lain.bgm.tv 在国内需要代理才能访问，`
    + '也可以直接上传本地图片。'
  );
  err.network = true;
  throw err;
}


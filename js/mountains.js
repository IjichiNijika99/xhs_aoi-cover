/* ===========================================================
   mountains.js —— 《向山进发》里她们真的爬过/去过的山
   ---------------------------------------------------------------
   这是「雪村葵」主题系列的灵魂：每座山都带真实海拔、真实经纬度，
   主题会把其中一座的坐标与海拔印在画面上。

   数据经过核对：海拔与坐标按日本国土地理院（GSI）标高/DEM 逐点复核，
   出现季数按官方 story 与各话梗概对过，原作用但动画没出现的山已剔除
   （例如雲取山、甲武信ヶ岳、陣馬山、景信山、大菩薩嶺、木曽駒ヶ岳、
     蓼科山、妙義山、丹沢山・塔ノ岳、両神山等，均只在原作/未出现）。

   作品里没有 2024 年剧场版；唯一的"剧场"形态是 2017 年 OVA
   『おもいでプレゼント』。所以不要写"剧场版"。

   字段：
     id       稳定 id（会存进 localStorage，不要随意改）
     name     中文名（画面主用）
     jp       日文原名（画面副用）
     elev     海拔（米）
     coords   [纬度, 经度]，保留 3 位小数
     region   所在都道府县
     group    分组（用于界面归类）
     ep       出现在哪几话
     note     一句话：在作品里的意义
   =========================================================== */

export const MOUNTAINS = [
  /* ---------- 原点 ---------- */
  {
    id: 'takao',
    name: '高尾山',
    jp: '高尾山',
    elev: 599,
    coords: [35.625, 139.244],
    region: '东京都八王子市',
    group: '原点',
    ep: '第 1 季 #8-10 / 第 4 季 #7',
    note: '第一次真正意义上的登山，缆车、山顶食堂与那一眼城市远景',
  },
  {
    id: 'fuji',
    name: '富士山',
    jp: '富士山（剣ヶ峰）',
    elev: 3776,
    coords: [35.361, 138.728],
    region: '静冈县 / 山梨县',
    group: '原点',
    ep: '第 2 季 #9-11（八合目撤退）/ 第 4 季 #11-12（登顶御来光）',
    note: '第 2 季在八合目撤退，第 4 季终于站上山顶等到了御来光',
  },
  {
    id: 'tanigawa',
    name: '谷川岳',
    jp: '谷川岳（オキノ耳）',
    elev: 1977,
    coords: [36.837, 138.930],
    region: '群马县 / 新潟县',
    group: '原点',
    ep: '第 2 季 #22-23 / 第 4 季 #3',
    note: '幼时约定的那座日出之山，岩稜与锁场都很硬',
  },

  /* ---------- 饭能・奥武藏（家附近） ---------- */
  {
    id: 'tenran',
    name: '天览山',
    jp: '天覧山',
    elev: 197,
    coords: [35.862, 139.308],
    region: '埼玉县饭能市',
    group: '饭能・奥武藏',
    ep: '第 1 季 #3 / 第 2 季 #12 / 第 4 季 #3・#10',
    note: '家附近最先爬的那座低山，饭能的地标',
  },
  {
    id: 'tamoushi',
    name: '多峯主山',
    jp: '多峯主山',
    elev: 271,
    coords: [35.870, 139.300],
    region: '埼玉县饭能市',
    group: '饭能・奥武藏',
    ep: '第 2 季 #12',
    note: '和天览山连走的第二座，饭能三山之一',
  },
  {
    id: 'tengaku',
    name: '天觉山',
    jp: '天覚山',
    elev: 445,
    coords: [35.890, 139.250],
    region: '埼玉县饭能市',
    group: '饭能・奥武藏',
    ep: '第 3 季 #3',
    note: '饭能阿尔卑斯纵走的一段',
  },
  {
    id: 'odaka',
    name: '大高山',
    jp: '大高山',
    elev: 493,
    coords: [35.900, 139.230],
    region: '埼玉县饭能市',
    group: '饭能・奥武藏',
    ep: '第 3 季 #3',
    note: '与天觉山连走的纵走路段',
  },
  {
    id: 'hiwada',
    name: '日和田山',
    jp: '日和田山',
    elev: 305,
    coords: [35.894, 139.305],
    region: '埼玉县日高市',
    group: '饭能・奥武藏',
    ep: '第 4 季 #7',
    note: '第一次在山上看日出，就在家门口',
  },
  {
    id: 'kono',
    name: '子之权现',
    jp: '子の権現',
    elev: 640,
    coords: [35.910, 139.190],
    region: '埼玉县饭能市',
    group: '饭能・奥武藏',
    ep: '第 3 季 #3',
    note: '山上的寺院与那尊大草鞋，奥武藏的老参道',
  },
  {
    id: 'kanhasshu',
    name: '关八州见晴台',
    jp: '関八州見晴台',
    elev: 770,
    coords: [35.947, 139.222],
    region: '埼玉县饭能市',
    group: '饭能・奥武藏',
    ep: '第 3 季 #6',
    note: '山咖啡回：在山顶学者冲一杯咖啡，"山＝享受"的转折点',
  },
  {
    id: 'bukou',
    name: '武甲山',
    jp: '武甲山',
    elev: 1304,
    coords: [35.952, 139.098],
    region: '埼玉县秩父市',
    group: '饭能・奥武藏',
    ep: '第 4 季 #5',
    note: '秩父的象征，山体被石灰岩采掘切出巨大的剖面',
  },

  /* ---------- 关东近郊 ---------- */
  {
    id: 'tsukuba',
    name: '筑波山',
    jp: '筑波山（女体山）',
    elev: 877,
    coords: [36.226, 140.105],
    region: '茨城县筑波市',
    group: '关东近郊',
    ep: '第 3 季 #1',
    note: '「西之男体、东之女体」的双峰，山顶望关东平原',
  },
  {
    id: 'mitake',
    name: '御岳山',
    jp: '御岳山',
    elev: 929,
    coords: [35.783, 139.149],
    region: '东京都青梅市',
    group: '关东近郊',
    ep: '第 4 季 #8',
    note: '奥多摩的古道与武藏御岳神社，山脚有红色的桥',
  },
  {
    id: 'ohira',
    name: '大平山',
    jp: '大平山（鎌倉アルプス）',
    elev: 159,
    coords: [35.340, 139.570],
    region: '神奈川县镰仓市',
    group: '关东近郊',
    ep: '第 4 季 #9',
    note: '镰仓阿尔卑斯，低山也能走得很有味道',
  },

  /* ---------- 山梨・长野 ---------- */
  {
    id: 'mitsutoge',
    name: '三ツ峠山',
    jp: '三ツ峠山（開運山）',
    elev: 1785,
    coords: [35.549, 138.809],
    region: '山梨县都留市',
    group: '山梨・长野',
    ep: '第 2 季 #3-4',
    note: '正对富士山的展望台，山顶小屋与日出',
  },
  {
    id: 'kirigamine',
    name: '雾峰',
    jp: '霧ヶ峰（車山）',
    elev: 1925,
    coords: [36.103, 138.197],
    region: '长野县诹访市',
    group: '山梨・长野',
    ep: '第 2 季 #14',
    note: '第一次带妈妈登山；在车山山顶得知两人的"回忆之山"是谷川岳',
  },
  {
    id: 'mizugaki',
    name: '瑞墙山',
    jp: '瑞牆山',
    elev: 2230,
    coords: [35.893, 138.592],
    region: '山梨县北杜市',
    group: '山梨・长野',
    ep: '第 3 季 #11',
    note: '花岗岩的岩塔群，日本百名山里最"尖"的一座',
  },
  {
    id: 'kinpu',
    name: '金峰山',
    jp: '金峰山',
    elev: 2599,
    coords: [35.871, 138.625],
    region: '山梨县 / 长野县',
    group: '山梨・长野',
    ep: '第 3 季 #11-12',
    note: '五丈岩立在稜线上，第一次感受到"高山"的分量',
  },

  /* ---------- 群马・新潟 ---------- */
  {
    id: 'akagi',
    name: '赤城山',
    jp: '赤城山（地蔵岳）',
    elev: 1674,
    coords: [36.541, 139.177],
    region: '群马县前桥市',
    group: '群马・新潟',
    ep: '第 3 季 #8-9 / 第 4 季 #8（雪鞋）',
    note: '雪季穿雪鞋上山的那一集，冬天也有冬天的样子',
  },
];

/** 分组顺序（界面用它排版） */
export const MOUNTAIN_GROUPS = ['原点', '饭能・奥武藏', '关东近郊', '山梨・长野', '群马・新潟'];

export const MOUNTAIN_OPTIONS = MOUNTAINS;

export function mountainById(id) {
  return MOUNTAINS.find(m => m.id === id) || MOUNTAINS[0];
}

/** 纬度 35.625 + 经度 139.244 → "35.63°N 139.24°E" */
export function formatCoords(coords) {
  if (!coords || !coords.length) return '';
  const [lat, lon] = coords;
  const latStr = Math.abs(lat).toFixed(2) + '°' + (lat >= 0 ? 'N' : 'S');
  const lonStr = Math.abs(lon).toFixed(2) + '°' + (lon >= 0 ? 'E' : 'W');
  return `${latStr} ${lonStr}`;
}

/** 海拔显示：599 → "599m"；3776 → "3,776m" */
export function formatElev(m) {
  if (!m || !Number.isFinite(m)) return '';
  return m.toLocaleString('en-US') + 'm';
}

/** 一行完整的"山岳铭牌"文案 */
export function mountainLine(m) {
  if (!m) return '';
  const parts = [];
  const c = formatCoords(m.coords);
  if (c) parts.push(c);
  if (m.elev > 0) parts.push(formatElev(m.elev));
  if (m.name) parts.push(m.name);
  return parts.join('　');
}

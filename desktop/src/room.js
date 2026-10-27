// 像素小房间渲染器
// 纯函数式：往一个 RGBA 缓冲里画，浏览器里贴到 canvas，Node 里可以直接导出图片检查。
//
// 空间：小黑猫和小水母住在同一个 96×96 的房间里（2.5D 等距视角）。
// 房间里每个位置放什么由 catalog.mjs 的商店目录决定（equip：槽位 → 物品）。

import { looksOf } from './catalog.mjs';

export const W = 200;
export const H = 168;
const OX = 100; // 屏幕上墙角的 x
const OY = 60; // 屏幕上地面墙角的 y
const S = 96; // 房间边长
const WALL = 52; // 墙高
const OUTLINE = [38, 24, 26];

// ---------- 小工具 ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const P = (x, y, z) => [OX + x - y, OY + (x + y) / 2 - z];
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- 画布 ----------
class Px {
  constructor(buf) { this.b = buf; this.hit = new Uint8Array(W * H); this.emit = new Uint8Array(W * H); this.em = false; this.lights = []; }
  clear() { this.b.fill(0); this.hit.fill(0); this.emit.fill(0); this.lights.length = 0; }
  // 发光的东西（屏幕、灯泡）画的时候打开 em，压暗天色时它们不变暗
  glowing(fn) { this.em = true; try { fn(); } finally { this.em = false; } }
  set(x, y, c, a = 1, tag = 0) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    const b = this.b;
    if (a >= 1) { b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = 255; }
    else {
      const ba = b[i + 3] / 255, na = a + ba * (1 - a);
      if (na <= 0) return;
      for (let k = 0; k < 3; k++) b[i + k] = (c[k] * a + b[i + k] * ba * (1 - a)) / na;
      b[i + 3] = na * 255;
    }
    if (tag) this.hit[y * W + x] = tag;
    if (this.em) this.emit[y * W + x] = 1;
  }
  get(x, y) { const i = (y * W + x) * 4; return [this.b[i], this.b[i + 1], this.b[i + 2], this.b[i + 3]]; }
  // 扫描线填多边形，fn(px,py) 返回颜色或 null
  poly(pts, fn, a = 1, tag = 0) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
    const n = pts.length;
    for (let py = y0; py <= y1; py++) {
      const yc = py + 0.5;
      const xs = [];
      for (let i = 0; i < n; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
        for (let px = xa; px <= xb; px++) {
          const c = typeof fn === 'function' ? fn(px, py) : fn;
          if (c) this.set(px, py, c, c.length > 3 ? c[3] : a, tag);
        }
      }
    }
  }
  line(a, b, c, alpha = 1) {
    let [x0, y0] = a.map(Math.round), [x1, y1] = b.map(Math.round);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  rect(x, y, w, h, c, a = 1, tag = 0) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a, tag); }
  // 字符画精灵：pal 把字符映射到颜色
  sprite(rows, x, y, pal, { flip = false, alpha = 1, tag = 0 } = {}) {
    x = Math.round(x); y = Math.round(y);
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[flip ? row.length - 1 - c : c];
        const col = pal[ch];
        if (!col) continue;
        this.set(x + c, y + r, col, alpha, tag);
      }
    });
  }
  // 等距方块：mat = {top, left, right}，left 是朝左下的面（+y），right 是朝右下的面（+x）
  box(x, y, z, w, d, h, mat, tag = 0) {
    const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
    const left = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
    const right = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
    this.poly(left, mat.leftFn || mat.left, 1, tag);
    this.poly(right, mat.rightFn || mat.right, 1, tag);
    this.poly(top, mat.topFn || mat.top, 1, tag);
    if (mat.edge) { // 顶面前沿的高光线
      this.line(P(x, y + d, z + h), P(x + w, y + d, z + h), mat.edge);
      this.line(P(x + w, y, z + h), P(x + w, y + d, z + h), mat.edge);
      this.line(P(x + w, y + d, z), P(x + w, y + d, z + h), mat.edge, 0.5);
    }
    if (mat.outline !== false) { // 外轮廓描一圈深色，像素画的"线稿"
      const o = mat.outline || OUTLINE;
      const ring = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x, y + d, z + h)];
      for (let i = 0; i < ring.length; i++) this.line(ring[i], ring[(i + 1) % ring.length], o, 0.85);
    }
  }
  // 地上的接触阴影
  shadow(x, y, w, d, a = 0.22, grow = 2) {
    this.poly([P(x - grow, y - grow, 0), P(x + w + grow, y - grow, 0), P(x + w + grow, y + d + grow, 0), P(x - grow, y + d + grow, 0)], [20, 10, 20], a);
  }
}

// 从屏幕像素反算墙面/地面上的世界坐标
const floorAt = (px, py) => { const dx = px + 0.5 - OX, dy2 = 2 * (py + 0.5 - OY); return [(dx + dy2) / 2, (dy2 - dx) / 2]; };
const backWallAt = (px, py) => { const x = px + 0.5 - OX; return [x, OY + x / 2 - (py + 0.5)]; }; // y = 0 → [x, z]
const leftWallAt = (px, py) => { const y = OX - (px + 0.5); return [y, OY + y / 2 - (py + 0.5)]; }; // x = 0 → [y, z]

// ---------- 颜色 ----------
const C = {
  rim: hex('#4a3226'), rimTop: hex('#6b4a36'), rimDark: hex('#2e1f18'),
  stripeA: hex('#6f9f92'), stripeB: hex('#65958a'), base: hex('#5a3d2c'), baseTop: hex('#7a553c'),
  woodA: hex('#b07444'), woodB: hex('#a46a3d'), woodSeam: hex('#7d4e2c'), woodHi: hex('#c0854f'),
  slabL: hex('#6e4630'), slabR: hex('#5a3826'),
  tileA: hex('#2f6b84'), tileB: hex('#2b6479'), tileLine: hex('#22526a'),
  sand: hex('#d8bf8c'), sandDot: hex('#c2a876'), sandLite: hex('#ead7a8'),
  glassSide: hex('#3c7f99'), glassSideDk: hex('#2d6378'),
  water: hex('#2a8fbf'), waterTop: hex('#8fe0f5'), caustic: hex('#f2fbff'),
  k: hex('#17141d'), kRim: hex('#3a3346'), eye: hex('#f5d76e'), nose: hex('#e88fa8'),
  jelly: hex('#a8e4f2'), jellyDk: hex('#74bfd8'), jellyHi: hex('#effcff'), jellyEye: hex('#1c3446'), blush: hex('#f4a6c0'), tent: hex('#86cfe4'),
  zzz: hex('#e9e2f5'),
};
const CAT_PAL = { k: C.k, K: C.kRim, y: C.eye, p: C.nose };
const JELLY_PAL = { j: C.jelly, J: C.jellyDk, w: C.jellyHi, e: C.jellyEye, p: C.blush, l: C.tent };

// ---------- 精灵 ----------
const CAT_FRONT = [
  [
    '.K......K...',
    '.kK....Kk...',
    '.kpkkkkpk...',
    '.kkkkkkkk...',
    '.kykkkkyk...',
    '.kkkkpkkk...',
    '..kkkkkk....',
    '.kkkkkkkk...',
    '.kkkkkkkk.k.',
    '.kkkkkkkkkk.',
    '..kk..kk....',
  ],
  [
    '.K......K...',
    '.kK....Kk...',
    '.kpkkkkpk...',
    '.kkkkkkkk...',
    '.kykkkkyk...',
    '.kkkkpkkk...',
    '..kkkkkk....',
    '.kkkkkkkk.k.',
    '.kkkkkkkk.k.',
    '.kkkkkkkkk..',
    '..kk..kk....',
  ],
];
const CAT_BACK = [
  [
    '.K......K...',
    '.KK....KK...',
    '.KkkkkkkK...',
    '.kkkkkkkk...',
    '.kkkkkkkk...',
    '.kkkkkkkk...',
    '..kkkkkk....',
    '.Kkkkkkkk...',
    '.kkkkkkkk...',
    '.kkkkkkkkk..',
    '..kkkkkk.kk.',
  ],
  [
    '.K......K...',
    '.KK....KK...',
    '.KkkkkkkK...',
    '.kkkkkkkk...',
    '.kkkkkkkk...',
    '.kkkkkkkk...',
    '..kkkkkk....',
    '.Kkkkkkkk...',
    '.kkkkkkkk..k',
    '.kkkkkkkkkk.',
    '..kkkkkk....',
  ],
];
const CAT_SLEEP = [
  [
    '...K.K........',
    '..kkkkk.......',
    '.kkkkkkkkkk...',
    'kkkkkkkkkkkkk.',
    'kkkkkkkkkkkkkk',
    '.kkkkkkkkkkkkk',
    '..kkkkkkkkkkk.',
  ],
  [
    '...K.K........',
    '..kkkkk.......',
    '.kkkkkkkkkk...',
    'kkkkkkkkkkkkk.',
    'kkkkkkkkkkkkkk',
    'kkkkkkkkkkkkkk',
    '.kkkkkkkkkkkk.',
  ],
];
const JELLY_SPR = [
  [
    '...jjjjj...',
    '..jwwjjjj..',
    '.jwjjjjjjj.',
    '.jjjjjjjjj.',
    'jjjejjjejjj',
    'jjpjjjjjpjj',
    'JjjjjjjjjjJ',
    '.JJJJJJJJJ.',
    '..l.l.l.l..',
    '..l.l.l.l..',
    '.l..l.l..l.',
    '.l.l...l.l.',
    '..l.....l..',
  ],
  [
    '...........',
    '...jjjjj...',
    '.jjwwjjjjj.',
    'jjwjjjjjjjj',
    'jjjejjjejjj',
    'jjpjjjjjpjj',
    'JJjjjjjjjJJ',
    '.JJJJJJJJJ.',
    '.l.l.l.l.l.',
    '..l..l..l..',
    '..l.l.l.l..',
    '.l.l...l.l.',
    '.l.......l.',
  ],
];

// AI 住客
const NPC = {
  claude: {
    pal: { o: hex('#d97757'), O: hex('#b85c3f'), e: hex('#2a1a14') },
    frames: [
      ['.oooooooo.', '.oeooooeo.', 'oooooooooo', '.OOOOOOOO.', '.o.o..o.o.'],
      ['.oooooooo.', '.oeooooeo.', 'oooooooooo', '.OOOOOOOO.', 'o.o....o.o'],
    ],
  },
  gpt: {
    pal: { w: hex('#f4f4f4'), g: hex('#b9b9b9'), e: hex('#202020') },
    frames: [
      ['...www...', '.wwgwgww.', '.wgwwwgw.', 'wgwewewgw', '.wgwwwgw.', '.wwgwgww.', '...www...'],
      ['...www...', '.wwwgwww.', '.wgwwwgw.', 'wwgewegww', '.wgwwwgw.', '.wwwgwww.', '...www...'],
    ],
  },
  kimi: {
    pal: { n: hex('#22263a'), N: hex('#3a4160'), b: hex('#4f8dff') },
    frames: [
      ['..nnnn..', '.nNn....', 'nNn.....', 'nnn..b..', 'nNn.....', '.nNn....', '..nnnn..'],
      ['..nnnn..', '.nNn....', 'nNn...b.', 'nnn.....', 'nNn.....', '.nNn....', '..nnnn..'],
    ],
  },
  doubao: {
    pal: { w: hex('#fbf6ec'), v: hex('#dccfb6'), e: hex('#3a2c22'), p: hex('#f4a6c0') },
    frames: [
      ['...wwww...', '..wvwwvw..', '.wwwvvwww.', 'wwewwwweww', 'wpwwwwwwpw', '.wwwwwwww.'],
      ['..........', '...wwww...', '.wwvwwvww.', 'wwwwvvwwww', 'wwewwwwewp', '.wwwwwwww.'],
    ],
  },
};

// ---------- 新住客：剪映和微信 ----------
NPC.edit = { // 剪映：一块小场记板，咔嗒咔嗒
  pal: { k: hex('#22222a'), w: hex('#f2f2f2'), y: hex('#f7d046') },
  frames: [
    ['.wkwkwkw', 'kwkwkwk.', 'kkkkkkkk', 'kywwwwyk', 'kkkkkkkk'],
    ['........', 'wkwkwkwk', 'kkkkkkkk', 'kywwwwyk', 'kkkkkkkk'],
  ],
};
NPC.wechat = { // 微信：一个绿色的小聊天气泡
  pal: { g: hex('#2ac25b'), G: hex('#1f9e49'), w: hex('#ffffff') },
  frames: [
    ['.gggggg.', 'gggggggg', 'gwggwggw', 'gggggggg', '.gggggg.', '..G.....'],
    ['........', '.gggggg.', 'gggggggg', 'gwggwggw', 'gggggggg', '.ggggGg.'],
  ],
};

// 仰面躺着的小黑猫（按摩时）
const CAT_BELLY = [
  [
    '..k..k...k..k...',
    '..k..k...k..k...',
    '.kkkkkkkkkkkkkK.',
    'kkKKKKKKKKkkkkkK',
    'kkKKKKKKKKkkpkpk',
    '.kkkkkkkkkkkkkk.',
    'kk.........kk...',
  ],
  [
    '...k..k..k..k...',
    '..k..k...k..k...',
    '.kkkkkkkkkkkkkK.',
    'kkKKKKKKKKkkkkkK',
    'kkKKKKKKKKkkpkpk',
    '.kkkkkkkkkkkkkk.',
    '.kk........kk...',
  ],
];
// 软软的肉色硅胶圆柱
const TOY = ['.ss.', 'shss', 'shss', 'shss', 'shss', 'shss', 'shss', 'ssss', 'dddd'];
const TOY_UP = ['.sss.', 'shsss', 'shsss', 'shsss', 'shsss', 'shsss', 'shsss', 'shsss', 'shsss', 'shsss', 'sssss', '.ddd.'];
const TOY_PAL = { s: hex('#f1bfa4'), h: hex('#fbe0d0'), d: hex('#d49a80') };
// 猫粮袋
const BAG = [
  '.bbbbbb.',
  'bBBBBBBb',
  'bowwwwob',
  'bowfffwb',
  'bowwwwob',
  'boooooob',
  'boooooob',
  'bbbbbbbb',
];
const BAG_PAL = { b: hex('#8a4b2a'), B: hex('#b0663a'), o: hex('#e8914a'), w: hex('#fff4e0'), f: hex('#5d8fc9') };
const KIBBLE = [hex('#a8642f'), hex('#c47a3a'), hex('#8e5228')];
export const COMFY = ['呼噜噜…', '舒服～', '(=^･ω･^=)', 'ฅ^•ﻌ•^ฅ', '(ˊ˘ˋ*)♡', '再用力一点点…', '咕噜咕噜', '好舒服喵'];

// 命中区编号
export const TAG = { cat: 1, jelly: 2, npc: 3, tv: 4, drawer: 5, toy: 6, bag: 7, bowlCat: 8, bowlJelly: 9, piggy: 10 };
const TAG_NAME = Object.fromEntries(Object.entries(TAG).map(([k, v]) => [v, k]));

// ---------- 五个时段：同一个房间，光线和小物件不一样 ----------
export const PERIODS = {
  dawn: { name: '清晨', tint: [255, 196, 170], a: 0.1, lights: false, lamp: false, curtains: 'half', sky: 'dawn', mugSteam: true },
  day: { name: '白天', tint: null, a: 0, lights: false, lamp: false, curtains: 'open', sky: 'day', sun: true },
  dusk: { name: '黄昏', tint: [255, 140, 80], a: 0.14, lights: true, lamp: true, curtains: 'open', sky: 'dusk', sunset: true },
  night: { name: '夜晚', tint: [30, 30, 95], a: 0.32, lights: true, lamp: true, curtains: 'open', sky: 'night' },
  late: { name: '深夜', tint: [8, 10, 36], a: 0.55, lights: false, lamp: false, curtains: 'closed', sky: 'night', nightlight: true, moonbeam: true },
};
export function periodOf(h) {
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'dusk';
  if (h >= 19 && h < 23) return 'night';
  return 'late';
}

// ---------- 房间布局 ----------
// 一个 96×96 的房间。左墙 x = 0，后墙 y = 0，最里面的墙角放电视。
const SPOTS = {
  cat: { desk: [22, 55, 0], tv: [26, 38, 0], sleep: [24, 82, 3], idle: [42, 68, 0], eat: [34, 83, 0], massage: [36, 40, 0] },
  jelly: { desk: [55, 22, 9], tv: [38, 26, 10], sleep: [84, 40, 6], idle: [66, 50, 14], eat: [78, 12, 9], massage: [43.5, 32.5, 8] },
};
const BOWL = { cat: [38, 88], jelly: [76, 15] };
const DRAWER = { x: 0, y: 72, w: 10, d: 10, h: 12 };
const BAG_AT = [91, 5];

function stationFor(s, who, props) {
  if (!s.online || s.activity === 'away' || s.activity === 'gone') return null;
  if (props.massage) return 'massage';
  if (props.eating && props.eating[who]) return 'eat';
  if (s.together || props.tvWait) return 'tv';
  if (s.activity === 'sleep') return 'sleep';
  if (s.activity) return 'desk';
  return 'idle';
}

// 显示器内容
function screenColor(act, t, u, v) {
  const text = (fg, bg, k = 0.6) => (v * 8 % 2 < 1 && u < 0.2 + hash(Math.floor(v * 8), Math.floor(t / 700)) * k ? hex(fg) : hex(bg));
  switch (act) {
    case 'bili': {
      const f = Math.floor(t / 300) % 2;
      if (Math.abs(u - 0.5) < 0.12 && Math.abs(v - 0.5) < 0.18 - (u - 0.38) * 0.6 && u > 0.38) return hex('#ffffff');
      return f ? hex('#fb7299') : hex('#f2668b');
    }
    case 'game': {
      const cs = ['#ff5d73', '#ffd166', '#6ee7b7', '#60a5fa', '#c084fc'];
      return hex(cs[(Math.floor(t / 180) + Math.floor(u * 3) + Math.floor(v * 2)) % cs.length]);
    }
    case 'meeting':
      return (u * 2 | 0) + (v * 2 | 0) * 2 === Math.floor(t / 1200) % 4 ? hex('#8ee6a8') : hex('#3c5b74');
    case 'edit': { // 剪映：上面是预览画面，下面是彩色的剪辑轨道，播放头在走
      if (v < 0.45) return hash(Math.floor(u * 4), Math.floor(t / 900)) > 0.5 ? hex('#7fb6d9') : hex('#e9a0b8');
      const head = (t / 2500) % 1;
      if (Math.abs(u - head) < 0.06) return hex('#ffffff');
      const track = Math.floor((v - 0.45) / 0.18);
      const cols = ['#4fc3c8', '#f2a65a', '#b48ce6'];
      return (u * 5 + track) % 2 < 1.6 ? hex(cols[track % 3] || '#4fc3c8') : hex('#1c1c22');
    }
    case 'wechat': // 微信：一左一右的聊天气泡
      if (v * 6 % 2 < 1) {
        const row = Math.floor(v * 3);
        return row % 2 ? (u > 0.45 ? hex('#95ec69') : hex('#ededed')) : (u < 0.55 ? hex('#ffffff') : hex('#ededed'));
      }
      return hex('#ededed');
    case 'claude': return text('#f3c5a8', '#2b2421');
    case 'gpt': return text('#e8e8e8', '#262626', 0.7);
    case 'kimi': return text('#9cc0ff', '#1a1d2b', 0.7);
    case 'doubao': return text('#c9b8ff', '#24203a', 0.7);
    case 'sleep': case null: case undefined: case 'away': return null; // 关着
    default:
      return (v * 10 + t / 900) % 2 < 1 && u < 0.25 + hash(Math.floor(v * 10 + t / 900), 3) * 0.6 ? hex('#cfe3ee') : hex('#2b3a48');
  }
}

// ---------- 主渲染 ----------
export function createRoom() {
  const buf = new Uint8ClampedArray(W * H * 4);
  const px = new Px(buf);
  const pos = { cat: null, jelly: null };
  const heads = { cat: null, jelly: null };
  const spots = {}; // 道具在屏幕上的位置，给拖拽判断用

  function moveToward(who, target, dt) {
    if (!target) { pos[who] = null; return null; }
    if (!pos[who]) { pos[who] = [...target]; return pos[who]; }
    const p = pos[who];
    const speed = (who === 'cat' ? 40 : 26) * dt / 1000;
    const d = Math.hypot(target[0] - p[0], target[1] - p[1], target[2] - p[2]);
    if (d <= speed) { pos[who] = [...target]; return pos[who]; }
    for (let i = 0; i < 3; i++) p[i] += ((target[i] - p[i]) / d) * speed;
    return p;
  }

  let lastT = null;

  /**
   * state = {
   *   cat / jelly: { online, activity, together },
   *   hour: 0..23, period?: 'dawn'|'day'|'dusk'|'night'|'late'（不填就按 hour 自动）
   *   props: { drawerOpen, toy: 'drawer'|'jelly'|'drag', massage, fast, eating: {cat, jelly}, tvWait,
   *            drag: { item: 'toy'|'bag', x, y } }
   * }
   */
  function render(state, t) {
    const dt = lastT == null ? 0 : Math.min(200, t - lastT);
    lastT = t;
    px.clear();
    const hour = state.hour ?? 14;
    const per = PERIODS[state.period] || PERIODS[periodOf(hour)];
    const L = state.looks || looksOf(state.equip || {});
    const props = { eating: {}, ...(state.props || {}) };
    const together = !!(state.cat.together && state.jelly.together && state.cat.online && state.jelly.online);
    const cat = { ...state.cat, together };
    const jelly = { ...state.jelly, together };
    // 按摩需要两只都在
    if (props.massage && !(cat.online && jelly.online)) props.massage = false;

    drawShell(px, t, L);
    drawWalls(px, t, L, per);
    const objs = [];
    drawFurniture(px, t, L, cat, jelly, per, props, spots, objs);

    const cs = stationFor(cat, 'cat', props);
    const cp = moveToward('cat', cs ? SPOTS.cat[cs] : null, dt);
    const js = stationFor(jelly, 'jelly', props);
    const jp = moveToward('jelly', js ? SPOTS.jelly[js] : null, dt);
    heads.cat = heads.jelly = null;

    // 透视：离镜头越远（x + y 越小）越先画，近的盖住远的
    if (cp) objs.push({ d: cp[0] + cp[1], draw: () => drawCat(px, t, cp, cs, cat, heads) });
    if (jp) objs.push({ d: jp[0] + jp[1] + 0.01, draw: () => drawJelly(px, t, jp, js, jelly, heads, props) });
    // 按摩：硅胶棒竖着悬在小猫肚子上方，水母在右边用一根触手卷着它上下捶
    const catIn = cs === 'massage' && cp && dist(cp, SPOTS.cat.massage) < 0.5;
    const jellyIn = js === 'massage' && jp && dist(jp, SPOTS.jelly.massage) < 0.5;
    if (props.massage && catIn && jellyIn) {
      cat.squash = lift(t, props) < 0.6;
      objs.push({ d: 999, draw: () => drawMassage(px, t, cp, jp, props) });
    }
    objs.sort((a, b) => a.d - b.d);
    for (const o of objs) o.draw();
    drawTV(px, t, together || props.tvWait, together);

    // 天色：压暗不发光的地方，然后把灯光加回去
    if (per.tint) tintAll(px, per.tint, per.a);
    for (const [x, y, r, c, a] of px.lights) glow(px, x, y, r, c, a * (1 + per.a * 2.2));

    // 拖拽中的道具画在最上面
    if (props.drag) {
      const { item, x, y } = props.drag;
      if (item === 'toy') px.sprite(TOY, x - 2, y - 5, TOY_PAL);
      if (item === 'bag') px.sprite(BAG, x - 4, y - 5, BAG_PAL);
    }
    return buf;
  }

  function hitTest(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const tag = px.hit[y * W + x];
    if (tag && TAG_NAME[tag]) return TAG_NAME[tag];
    return buf[(y * W + x) * 4 + 3] > 20 ? 'room' : null;
  }

  return { render, hitTest, heads, spots, W, H };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------- 角色 ----------
function drawCat(px, t, cp, cs, cat, heads) {
  const [sx, sy] = P(cp[0], cp[1], cp[2]);
  const arrived = cs && dist(cp, SPOTS.cat[cs]) < 0.5;
  const fast = cat.activity === 'game' ? 3 : 1;
  const f = Math.floor((t * fast) / 600) % 2;
  let spr, w = 12, h = 11, flip = false, ox = 0;
  if (arrived && cs === 'massage') {
    spr = CAT_BELLY[Math.floor(t / 900) % 2];
    w = 16; h = 7;
    if (cat.squash) spr = [spr[0].replace(/k/g, '.'), ...spr.slice(1)]; // 被捶到：小爪子缩一下，身子扁一点
  }
  else if (arrived && cs === 'sleep') { spr = CAT_SLEEP[Math.floor(t / 1400) % 2]; w = 14; h = 7; }
  else if (arrived && (cs === 'desk' || cs === 'tv')) { spr = CAT_BACK[f]; flip = cs === 'tv'; }
  else if (arrived && cs === 'eat') { // 低头吃饭，一点一点
    spr = CAT_FRONT[0].map((r) => r.replace(/y/g, 'k'));
    ox = 0;
    h = 11 - (Math.floor(t / 300) % 2);
  } else {
    const blink = t % 3800 < 140;
    spr = CAT_FRONT[f].map((r) => (blink ? r.replace(/y/g, 'k') : r));
  }
  const hop = !arrived ? -Math.abs(Math.sin(t / 90)) * 2 : 0;
  const x0 = sx - w / 2 + ox, y0 = sy - h + hop;
  px.rect(Math.round(sx - 4), Math.round(sy) - 1, 8, 1, [0, 0, 0], 0.25);
  px.sprite(spr, x0, y0, CAT_PAL, { flip, tag: TAG.cat });
  if (arrived && cs === 'sleep') drawZ(px, sx + 5, sy - 10, t);
  if (arrived && cs === 'eat') drawCrumbs(px, t, ...P(BOWL.cat[0], BOWL.cat[1], 2));
  if (arrived && cs === 'massage' && t % 2600 < 1300) { // 舒服得冒小爱心
    const p = (t % 1300) / 1300;
    px.sprite(['r.r', 'rrr', '.r.'], sx + 5, sy - 8 - p * 6, { r: hex('#f05a78') }, { alpha: 1 - p });
  }
  heads.cat = [sx, y0 - 2];
  if (arrived && cs === 'desk') drawNpc(px, cat.activity, sx + 9, sy - 6, t);
}

function drawJelly(px, t, jp, js, jelly, heads, props) {
  const bob = Math.round(Math.sin(t / 650) * 1.5);
  const [sx, sy] = P(jp[0], jp[1], jp[2]);
  const arrived = js && dist(jp, SPOTS.jelly[js]) < 0.5;
  const sleeping = arrived && js === 'sleep';
  const massaging = js === 'massage';
  const fast = jelly.activity === 'game' ? 2.5 : 1;
  let spr = JELLY_SPR[Math.floor((t * fast) / (sleeping ? 1600 : 520)) % 2];
  if (sleeping) spr = spr.map((r) => r.replace(/e/g, 'J'));
  else if (arrived && (js === 'desk' || js === 'tv' || js === 'eat')) spr = spr.map((r) => r.replace(/[ep]/g, 'j'));
  else if (t % 4200 < 160) spr = spr.map((r) => r.replace(/e/g, 'J'));

  const x0 = sx - 5.5, y0 = sy - 13 + (sleeping ? 0 : massaging ? Math.round(lift(t, props) / 3) : bob);
  const [fx, fy] = P(jp[0], jp[1], 0);
  px.rect(Math.round(fx - 3), Math.round(fy), 7, 1, [0, 0, 0], Math.max(0.08, 0.25 - jp[2] / 80));
  px.lights.push([sx, sy - 7, 10, [170, 235, 250], sleeping ? 0.05 : 0.09]);
  px.glowing(() => px.sprite(spr, x0, y0, JELLY_PAL, { alpha: sleeping ? 0.8 : 0.95, tag: TAG.jelly }));
  if (props.toy === 'jelly' && !(massaging && arrived)) {
    // 硅胶棒抱在触手里：竖着，下端随动作往下捶
    const tx = sx + 4, ty = y0 + 9; // 走过去的路上先抱着
    px.sprite(TOY, tx, ty, TOY_PAL, { tag: TAG.toy });
  }
  if (sleeping) drawZ(px, sx + 6, sy - 16, t);
  if (arrived && js === 'eat') drawCrumbs(px, t, ...P(BOWL.jelly[0], BOWL.jelly[1], 2));
  heads.jelly = [sx, y0 - 2];
  if (arrived && js === 'desk') drawNpc(px, jelly.activity, sx + 13, sy - 1, t);
}

// 硅胶棒离小猫肚子有多高：0 = 正捶在肚子上，6 = 抬到最高
function lift(t, props) {
  const period = props.fast ? 420 : 1300;
  return Math.abs(Math.sin((t / period) * Math.PI)) * 6;
}

// 软硅胶：碰到肚子时变短、底部鼓出来；抬起时先弹长一点再回去
function softToy(squash, stretch) {
  const body = 9 - squash + stretch; // 中间段的行数
  const rows = ['..sss..', ...Array(body).fill('.shsss.')];
  if (squash >= 2) rows.push('sshssss', 'sssssss', '.ddddd.'); // 压扁：底下两行往外鼓
  else if (squash === 1) rows.push('.sssss.', 'sssssss', '..ddd..');
  else rows.push('.sssss.', '.sssss.', '..ddd..');
  return rows;
}

function drawMassage(px, t, cp, jp, props) {
  const [cx, cy] = P(cp[0], cp[1], cp[2]);
  const [jx, jy] = P(jp[0], jp[1], jp[2]);
  const period = props.fast ? 420 : 1300;
  const raw = Math.sin((t / period) * Math.PI);
  const rising = raw * Math.cos((t / period) * Math.PI) > 0; // 正在往上抬
  const upF = Math.abs(raw) * 6;
  const up = Math.round(upF);
  const squash = upF < 0.6 ? 2 : upF < 1.6 ? 1 : 0;
  const stretch = rising && upF > 1.6 && upF < 3.6 ? 1 : 0; // 刚弹起来那一下拉长
  const TOY_NOW = softToy(squash, stretch);
  // 硅胶棒：底端对着小猫肚子；捶到时底端压进肚子里一点
  const tx = Math.round(cx - 5), bottom = Math.round(cy - 3) - up;
  const ty = bottom - TOY_NOW.length;
  px.sprite(TOY_NOW, tx, ty, TOY_PAL, { tag: TAG.toy });
  // 一根触手从水母伞盖下面伸过来，卷在硅胶棒中间
  const sx = jx - 3, sy = jy - 4 + Math.round(up / 3); // 触手根部
  const ex = tx + 6, ey = ty + 5;                       // 卷住的地方
  for (let i = 0; i <= 12; i++) {
    const p = i / 12;
    const x = sx + (ex - sx) * p;
    const y = sy + (ey - sy) * p + Math.sin(p * Math.PI) * 3 + Math.sin(t / 250 + p * 4) * 0.6;
    px.set(Math.round(x), Math.round(y), C.tent);
  }
  // 卷住的一圈
  for (const [dx, dy] of [[0, -1], [-1, -1], [-2, -1], [-3, -1], [-4, -1], [-4, 0], [-4, 1], [-3, 1], [-1, 1]]) px.set(ex + dx, ey + dy, C.tent);
  // 捶到的瞬间：肚子上冒两颗小星星
  if (squash >= 2) {
    px.set(tx - 2, bottom, hex('#fff6c8'));
    px.set(tx + 8, bottom - 1, hex('#fff6c8'));
    px.set(tx + 3, bottom - 13, hex('#fff6c8'), 0.5);
  }
}

function drawCrumbs(px, t, bx, by) {
  // 吃饭时碗边蹦出来的小碎屑
  for (let i = 0; i < 3; i++) {
    const p = ((t + i * 400) % 1200) / 1200;
    px.set(Math.round(bx - 3 + i * 3 + Math.sin(p * 5 + i) * 2), Math.round(by - 3 - Math.sin(p * Math.PI) * 4), KIBBLE[i % 3], 1 - p);
  }
}

// ---------- 换装：颜色工具 ----------
const hx = (c) => (typeof c === 'string' ? hex(c) : c);
const mat = (l) => ({ top: hx(l.top), left: hx(l.left), right: hx(l.right), edge: hx(l.edge) });

// 商店缩略图：每个槽位在画面上大概在哪（屏幕像素，x, y, 宽, 高）
export const SLOT_VIEW = {
  floor: [40, 70, 120, 80], wall: [10, 10, 180, 80], rug: [56, 56, 88, 50], curtain: [6, 28, 40, 50], lights: [10, 8, 180, 40],
  catDesk: [30, 60, 46, 46], catPC: [34, 60, 36, 34], jellyDesk: [124, 50, 46, 46], jellyPC: [128, 50, 36, 34],
  shelf: [146, 40, 46, 60], bowls: [36, 104, 136, 30], catBed: [50, 106, 50, 34], jellyBed: [130, 102, 46, 44],
  lamp: [6, 94, 30, 50], plant: [116, 108, 40, 40], clock: [154, 38, 30, 28],
  wallL1: [48, 26, 40, 36], wallL2: [34, 30, 40, 36], wallB1: [110, 28, 40, 40], sill: [12, 72, 32, 30],
  cabinetTop: [78, 60, 40, 30], catDeskTop: [30, 64, 34, 30], jellyDeskTop: [140, 56, 34, 30], shelfTop: [154, 34, 34, 30],
  floorFront: [50, 118, 46, 38], floorRight: [92, 116, 46, 38], toys: [40, 110, 110, 40],
};

// ---------- 地板 ----------
function drawShell(px, t, L) {
  const f = L.floor;
  const A = hx(f.a), B = hx(f.b), seam = hx(f.seam), hi = hx(f.hi);
  px.poly([P(0, S, 0), P(S, S, 0), P(S, S, -6), P(0, S, -6)], C.slabL);
  px.poly([P(S, 0, 0), P(S, S, 0), P(S, S, -6), P(S, 0, -6)], C.slabR);
  px.poly([P(0, 0, 0), P(S, 0, 0), P(S, S, 0), P(0, S, 0)], (x, y) => {
    const [wx, wy] = floorAt(x, y);
    let c;
    if (f.kind === 'checker') {
      c = (Math.floor(wx / 8) + Math.floor(wy / 8)) % 2 ? A : B;
      if (wx % 8 < 0.7 || wy % 8 < 0.7) c = mix(c, seam, 0.6);
    } else if (f.kind === 'tatami') {
      // 一张张草席：16×8 横放，下一排竖着拼；边上是深绿的布边
      const row = Math.floor(wy / 16), col = Math.floor(wx / 16);
      const horiz = (row + col) % 2 === 0;
      const u = horiz ? wy % 16 : wx % 16;
      const edge = horiz ? (wx % 16 < 1 || wx % 16 > 15) : (wy % 16 < 1 || wy % 16 > 15);
      if (edge || u < 0.8) c = seam;
      else c = Math.floor((horiz ? wx : wy) / 1) % 2 ? A : B;
      if (!edge && hash(Math.floor(wx), Math.floor(wy)) > 0.97) c = hi;
    } else {
      const row = Math.floor(wy / 8);
      const seamX = (row * 13) % 24;
      if (wy % 8 < 1) c = seam;
      else if ((wx + seamX) % 24 < 1) c = seam;
      else if (wy % 8 < 2 && hash(Math.floor(wx / 3), row) > 0.6) c = hi;
      else c = row % 2 ? A : B;
      if (hash(Math.floor(wx), Math.floor(wy)) > 0.985) c = mix(c, seam, 0.5);
    }
    const edge = Math.min(wx, wy);
    if (edge < 4) c = mix(c, [40, 20, 20], ((4 - edge) / 4) * 0.35);
    return c;
  });
  px.line(P(0, S, 0), P(S, S, 0), hi, 0.5);
  px.line(P(S, 0, 0), P(S, S, 0), hi, 0.4);
}

// ---------- 墙、窗、墙上的东西 ----------
function wallColor(w, u, v, back) {
  const A = hx(back ? w.backA : w.a), B = hx(back ? w.backB : w.b);
  let c = Math.floor(u / 4) % 2 ? A : B;
  if (w.kind === 'plaid') {
    c = A;
    if (Math.floor(u / 6) % 2 === 0) c = mix(c, B, 0.6);
    if (Math.floor(v / 6) % 2 === 0) c = mix(c, B, 0.4);
    if (u % 12 < 0.6 || v % 12 < 0.6) c = hx(w.line);
  } else if (w.kind === 'stars') {
    const h = hash(Math.floor(u), Math.floor(v));
    if (h > 0.985) c = hex('#fff6c8');
    else if (h > 0.975) c = hex('#9fb6ff');
  } else if (w.kind === 'bats') {
    // 墙纸上一只只小蝙蝠
    const cu = Math.floor(u / 12), cv = Math.floor(v / 10);
    const ox = u - cu * 12 - 6 + (cv % 2) * 3, oy = v - cv * 10 - 5;
    if (hash(cu, cv) > 0.45 && Math.abs(oy) < 1.1 && Math.abs(ox) < 3 - Math.abs(oy)) c = mix(c, [20, 12, 30], 0.6);
    if (hash(cu, cv) > 0.45 && Math.abs(ox) < 0.8 && oy > 0 && oy < 2) c = mix(c, [20, 12, 30], 0.6);
  }
  return c;
}

function drawWalls(px, t, L, per) {
  const w = L.wall;
  px.poly([P(0, 0, 0), P(0, S, 0), P(0, S, WALL), P(0, 0, WALL)], (x, y) => {
    const [wy, wz] = leftWallAt(x, y);
    if (wz < 4) return wz < 1 ? C.baseTop : C.base;
    if (wz > WALL - 2) return C.baseTop;
    return wallColor(w, wy, wz, false);
  });
  px.poly([P(0, 0, 0), P(S, 0, 0), P(S, 0, WALL), P(0, 0, WALL)], (x, y) => {
    const [wx, wz] = backWallAt(x, y);
    if (wz < 4) return wz < 1 ? C.baseTop : C.base;
    if (wz > WALL - 2) return C.baseTop;
    return mix(wallColor(w, wx, wz, true), [30, 40, 50], 0.12);
  });
  px.poly([P(-4, -4, WALL), P(S, -4, WALL), P(S, 0, WALL), P(0, 0, WALL), P(0, S, WALL), P(-4, S, WALL)], C.rimTop);
  px.poly([P(-4, S, -6), P(0, S, -6), P(0, S, WALL), P(-4, S, WALL)], C.rim);
  px.poly([P(S, -4, -6), P(S, 0, -6), P(S, 0, WALL), P(S, -4, WALL)], C.rimDark);
  px.line(P(0, 0, 0), P(0, 0, WALL), mix(hx(w.b), [0, 0, 0], 0.3), 0.6);

  // ----- 左墙：窗户，窗外是对应时段的天 -----
  const sky = skyColor(per.sky);
  const W0 = 68, W1 = 88;
  px.glowing(() => px.poly([P(0, W0, 22), P(0, W1, 22), P(0, W1, 42), P(0, W0, 42)], (x, y) => {
    const [wy, wz] = leftWallAt(x, y);
    if (wy < W0 + 1.5 || wy > W1 - 1.5 || wz < 23 || wz > 41) return mix(hex('#e8dcc4'), [40, 40, 70], per.a);
    if (Math.abs(wy - (W0 + W1) / 2) < 0.7 || Math.abs(wz - 32) < 0.7) return mix(hex('#e8dcc4'), [40, 40, 70], per.a);
    let c = mix(sky.bottom, sky.top, (wz - 23) / 18);
    if (sky.stars && hash(Math.floor(wy), Math.floor(wz)) > 0.95) c = hex('#fff6d0');
    if (sky.moon && Math.hypot(wy - 82, wz - 37) < 1.8) c = hex('#fff2b8');
    if (sky.sunDisk && Math.hypot(wy - 74, wz - 26) < 2.5) c = hex('#ffcf6a');
    if (!sky.stars && hash(Math.floor(wy / 3), Math.floor(wz / 2)) > 0.93 && wz > 33) c = mix(c, [255, 255, 255], 0.6);
    return c;
  }));
  px.box(0, W0 - 1, 20, 3, W1 - W0 + 2, 2, { top: hex('#efe3cc'), left: hex('#cdbfa6'), right: hex('#d9cbb2'), outline: false });
  // 窗帘：开着 / 半拉 / 拉上
  const cu = L.curtain;
  const cw = per.curtains === 'closed' ? 10.5 : per.curtains === 'half' ? 6 : 4;
  const curtain = (y0, y1) => px.poly([P(0, y0, 18), P(0, y1, 18), P(0, y1, 45), P(0, y0, 45)], (x, y) => {
    const [wy, wz] = leftWallAt(x, y);
    let c = Math.floor(wy) % 2 ? hx(cu.a) : hx(cu.b);
    if (cu.web && ((wz + wy) % 7 < 0.6 || (wz - wy + 100) % 7 < 0.6)) c = mix(c, [235, 230, 245], 0.5);
    return c;
  });
  curtain(W0 - 3, W0 - 3 + cw);
  curtain(W1 + 3 - cw, W1 + 3);
  px.line(P(0, W0 - 4, 45.5), P(0, W1 + 4, 45.5), hex('#5a3d2c'));
  if (per.sun) px.poly([P(6, W0 + 6, 0), P(6, W1 - 2, 0), P(30, W1 + 6, 0), P(30, W0 + 14, 0)], [255, 240, 200, 0.14]);
  if (per.sunset) px.poly([P(6, W0 + 6, 0), P(6, W1 - 2, 0), P(40, W1 + 8, 0), P(40, W0 + 18, 0)], [255, 170, 100, 0.16]);
  if (per.moonbeam) {
    px.lights.push([...P(16, 78, 0), 12, [150, 170, 255], 0.06]);
    px.glowing(() => px.poly([P(10, 76, 0), P(10, 79.5, 0), P(40, 86, 0), P(40, 81, 0)], [180, 200, 255, 0.35]));
  }

  // ----- 左墙装饰位 -----
  if (L.wallL1) drawWallLeft1(px, t, L.wallL1, per);
  if (L.wallL2) drawWallLeft2(px, t, L.wallL2, per);

  // ----- 后墙：合照（不卖）、爱心贴纸、空墙装饰位、挂钟 -----
  px.poly([P(44, 0, 30), P(58, 0, 30), P(58, 0, 42), P(44, 0, 42)], (x, y) => {
    const [wx, wz] = backWallAt(x, y);
    if (wx < 45 || wx > 57 || wz < 31 || wz > 41) return hex('#8a5a38');
    const u = (wx - 45) / 12, v = (wz - 31) / 10;
    if (Math.hypot((u - 0.32) / 0.14, (v - 0.35) / 0.2) < 1) return C.k;
    if (u > 0.2 && u < 0.26 && v > 0.55 && v < 0.7) return C.k;
    if (u > 0.38 && u < 0.44 && v > 0.55 && v < 0.7) return C.k;
    if (Math.hypot((u - 0.7) / 0.14, (v - 0.55) / 0.13) < 1 && v > 0.45) return C.jelly;
    if (v < 0.45 && v > 0.15 && u > 0.6 && u < 0.8 && Math.floor(u * 30) % 2 === 0) return C.tent;
    return hex('#f6e7d0');
  });
  const [hx0, hy0] = P(60, 0, 42);
  px.sprite(['r.r', 'rrr', '.r.'], hx0 - 1, hy0 - 2, { r: hex('#f05a78') });
  if (L.wallB1) drawWallBack1(px, t, L.wallB1, per);
  drawClock(px, t, L.clock);

  // ----- 串灯：黄昏和夜晚才亮 -----
  const li = L.lights;
  const cols = li.colors.map(hx);
  const bulbs = [];
  for (let i = 0; i < 9; i++) bulbs.push([0, 6 + i * 10, WALL - 6 - Math.sin((i % 3) * 1.6) * 2]);
  for (let i = 0; i < 9; i++) bulbs.push([6 + i * 10, 0, WALL - 6 - Math.sin((i % 3) * 1.6 + 1) * 2]);
  for (let i = 0; i + 1 < bulbs.length; i++) {
    if (i === 8) continue;
    px.line(P(...bulbs[i]), P(...bulbs[i + 1]), hex('#2a2a2a'), 0.6);
  }
  bulbs.forEach((b, i) => {
    const [sx, sy] = P(...b);
    const col = cols[i % cols.length];
    const on = per.lights && (Math.floor(t / 900) + i) % 3 !== 0;
    const c = on ? col : mix(col, [70, 70, 70], 0.55);
    const paint = () => {
      if (li.kind === 'pumpkin') { // 小南瓜灯泡：2×2 加一点绿蒂
        px.set(sx, sy - 1, hex('#4f8a3a'));
        px.rect(sx - 1, sy, 3, 2, c);
        if (on) px.set(sx, sy, hex('#3a1a08'));
      } else px.set(sx, sy, c);
    };
    if (on) { px.glowing(paint); px.lights.push([sx, sy, 4, col, 0.12]); } else paint();
  });
}

// 左墙上的平面东西：在墙面 (y, z) 范围里按 u,v 画
function wallPatchL(px, y0, y1, z0, z1, fn) {
  px.poly([P(0, y0, z0), P(0, y1, z0), P(0, y1, z1), P(0, y0, z1)], (x, y) => {
    const [wy, wz] = leftWallAt(x, y);
    return fn((wy - y0) / (y1 - y0), (wz - z0) / (z1 - z0), wy, wz);
  });
}
function wallPatchB(px, x0, x1, z0, z1, fn) {
  px.poly([P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)], (x, y) => {
    const [wx, wz] = backWallAt(x, y);
    return fn((wx - x0) / (x1 - x0), (wz - z0) / (z1 - z0), wx, wz);
  });
}
const frame = (u, v, w = 0.08) => u < w || u > 1 - w || v < w * 1.2 || v > 1 - w * 1.2;

function drawWallLeft1(px, t, l) {
  if (l.kind === 'fishart') wallPatchL(px, 30, 42, 30, 40, (u, v) => {
    if (frame(u, v)) return hex('#d9b25a');
    const fish = Math.hypot((u - 0.45) / 0.28, (v - 0.5) / 0.2) < 1 || (u > 0.7 && u < 0.86 && Math.abs(v - 0.5) < (u - 0.7) * 2);
    return fish ? hex('#f0a35a') : hex('#f3ead7');
  });
  if (l.kind === 'vinyl') wallPatchL(px, 30, 42, 29, 41, (u, v) => {
    const r = Math.hypot((u - 0.5) * 1.15, v - 0.5);
    if (r > 0.48) return null;
    if (r < 0.06) return hex('#1a1a1a');
    if (r < 0.16) return hex('#e05a6f');
    return Math.floor(r * 40) % 2 ? hex('#1d1d22') : hex('#2c2c34');
  });
  if (l.kind === 'web') wallPatchL(px, 24, 44, 34, 50, (u, v) => {
    // 墙角的蜘蛛网：从右上角放射出去
    const dx = 1 - u, dy = 1 - v, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const spoke = Math.abs(((a / (Math.PI / 2)) * 4) % 1 - 0.5) > 0.46;
    const ring = Math.abs((r * 5) % 1 - 0.5) > 0.44 && r < 0.95;
    if (r < 0.95 && (spoke || ring)) return [235, 235, 245, 0.75];
    if (Math.hypot(u - 0.35, v - 0.45) < 0.05) return hex('#1a1a1a'); // 小蜘蛛
    return null;
  });
}

function drawWallLeft2(px, t, l) {
  if (l.kind === 'memo') wallPatchL(px, 56, 60, 34, 38, () => hex('#fff1a8'));
  if (l.kind === 'polaroids') {
    [[49, 33], [54, 35], [59, 32]].forEach(([y, z], i) => wallPatchL(px, y, y + 4.5, z, z + 5.5, (u, v) => {
      if (u < 0.15 || u > 0.85 || v < 0.3 || v > 0.9) return hex('#fbf8f0');
      return hex(['#7fb6d9', '#e9a0b8', '#a8d08d'][i]);
    }));
  }
  if (l.kind === 'ghostart') wallPatchL(px, 50, 61, 30, 41, (u, v) => {
    if (frame(u, v)) return hex('#2c2433');
    const body = Math.hypot((u - 0.5) / 0.26, (v - 0.55) / 0.32) < 1 || (v < 0.55 && v > 0.2 && Math.abs(u - 0.5) < 0.26 && Math.sin(u * 30) > -0.3);
    if (body) {
      if (Math.abs(v - 0.62) < 0.06 && (Math.abs(u - 0.42) < 0.05 || Math.abs(u - 0.58) < 0.05)) return hex('#2c2433');
      return hex('#f4f2ff');
    }
    return hex('#6a4a8a');
  });
}

function drawWallBack1(px, t, l) {
  if (l.kind === 'guitar') {
    // 吉他斜挂在墙上：琴身 + 琴颈
    wallPatchB(px, 22, 38, 24, 46, (u, v, wx, wz) => {
      const body = Math.hypot((u - 0.42) / 0.32, (v - 0.3) / 0.22) < 1 || Math.hypot((u - 0.48) / 0.24, (v - 0.52) / 0.15) < 1;
      if (Math.hypot((u - 0.45) / 0.09, (v - 0.36) / 0.06) < 1) return hex('#2a1a12'); // 音孔
      if (body) return Math.hypot((u - 0.42) / 0.3, (v - 0.3) / 0.2) > 0.9 ? hex('#7a3e1c') : hex('#d98a3a');
      const neck = Math.abs((u - 0.5) - (v - 0.6) * 0.45) < 0.05 && v > 0.55 && v < 0.95;
      if (neck) return hex('#5a3420');
      if (v > 0.93 && Math.abs(u - 0.66) < 0.07) return hex('#3a2418'); // 琴头
      return null;
    });
  }
  if (l.kind === 'poster') wallPatchB(px, 23, 37, 25, 44, (u, v) => {
    if (u < 0.06 || u > 0.94 || v < 0.05 || v > 0.95) return hex('#f3ead7');
    if (v > 0.72) return hex('#1c1c28');
    if (v > 0.6 && v < 0.68 && u > 0.15 && u < 0.85) return hex('#f2d36b'); // 标题
    const r = Math.hypot(u - 0.5, (v - 0.36) * 1.2);
    return r < 0.22 ? hex('#e05a6f') : hex('#2f2a4a');
  });
  if (l.kind === 'bats') {
    // 一根细线挂着一串小蝙蝠，翅膀一扇一扇
    px.line(P(20, 0, 44), P(40, 0, 44), hex('#2a2a2a'), 0.7);
    for (let i = 0; i < 4; i++) {
      const [bx, by] = P(22 + i * 5.5, 0, 41 - (i % 2) * 3);
      const f = (Math.floor(t / 300) + i) % 2;
      px.line([bx + 1, by - 4 + (i % 2) * 3], [bx + 1, by - 1], hex('#2a2a2a'), 0.5);
      px.sprite(f ? ['k.k.k', 'kkkkk', '.k.k.'] : ['.....', 'kkkkk', 'k.k.k'], bx - 1, by, { k: hex('#231a2e') });
    }
  }
}

function drawClock(px, t, l) {
  const [ccx, ccy] = P(76, 0, 40);
  if (l.kind === 'cat') { // 猫咪挂钟：耳朵 + 摆来摆去的尾巴
    px.sprite(['k...k', 'kk.kk'], ccx - 2, ccy - 8, { k: C.k });
    const sw = Math.round(Math.sin(t / 400) * 2);
    px.line([ccx, ccy + 5], [ccx + sw, ccy + 10], C.k);
  }
  if (l.kind === 'bat') { // 蝙蝠翅膀
    px.sprite(['kk.........kk', 'kkkk.....kkkk', '.kkkk...kkkk.', '..kk.....kk..'], ccx - 6, ccy - 3, { k: hex('#231a2e') });
  }
  const face = l.kind === 'cat' ? C.k : hex('#5a3d2c');
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const r = Math.hypot(i, j);
    if (r > 5) continue;
    px.set(Math.round(ccx + i), Math.round(ccy + j + i / 2), r > 4 ? face : l.kind === 'bat' ? hex('#ffb060') : hex('#f6efe0'));
  }
  if (l.kind === 'cat') { px.set(ccx - 2, ccy - 2, C.eye); px.set(ccx + 2, ccy, C.eye); }
  const now = new Date();
  const hAng = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2;
  const mAng = now.getMinutes() / 60 * Math.PI * 2;
  const hand = (ang, len, c) => px.line([ccx, ccy], [ccx + Math.sin(ang) * len, ccy - Math.cos(ang) * len + Math.sin(ang) * len / 2], c);
  hand(mAng, 3.5, hex('#3a2a22'));
  hand(hAng, 2.2, hex('#c45b6a'));
}

// ---------- 桌面上、柜子上的小东西 ----------
function drawSmall(px, t, l, x, y, per) {
  // (x, y) 是物品底部中心的屏幕坐标
  x = Math.round(x); y = Math.round(y);
  const S2 = (rows, pal, ox = 0, oy = 0) => px.sprite(rows, x - Math.floor(rows[0].length / 2) + ox, y - rows.length + oy, pal);
  switch (l.kind) {
    case 'console': px.box(5, 8, 9, 5, 4, 2, { top: hex('#e8e4ee'), left: hex('#c9c3d3'), right: hex('#b3adbf'), outline: false }); break;
    case 'records': S2(['rrrrrr', 'kkkkkk', 'bbbbbb', 'kkkkkk', 'yyyyyy'], { r: hex('#e05a6f'), k: hex('#1d1d22'), b: hex('#5d8fc9'), y: hex('#f2d36b') }); break;
    case 'pumpkinSmall': S2(['..g..', '.ooo.', 'ooOoo', 'ooooo', '.ooo.'], { g: hex('#4f8a3a'), o: hex('#e07a2e'), O: hex('#c4641c') }); break;
    case 'shell': S2(['..pp', '.pPp', 'pPpp', 'ppp.'], { p: hex('#f3b6c8'), P: hex('#d98aa4') }); break;
    case 'flower': S2(['.r.y.', 'rRryY', '.gGg.', '..b..', '.bbb.', '.bbb.'], { r: hex('#f05a78'), R: hex('#ffd0dc'), y: hex('#f2d36b'), Y: hex('#fff3b0'), g: hex('#5fae6b'), G: hex('#3f8a4f'), b: hex('#7cc4dc') }); break;
    case 'skull': S2(['.www.', 'wwwww', 'wkwkw', 'wwpww', '.w.w.'], { w: hex('#f6f0e6'), k: hex('#e05a6f'), p: hex('#4a9fd0') }); break;
    case 'headphones': S2(['.kkkk.', 'k....k', 'k....k', 'rr..rr', 'rr..rr'], { k: hex('#2b2b33'), r: hex('#e05a6f') }); break;
    case 'witchHat': S2(['...k..', '..kk..', '..kkk.', '.oooo.', 'kkkkkk'], { k: hex('#2c2433'), o: hex('#e07a2e') }); break;
    case 'plantSmall': px.rect(x - 2, y - 3, 4, 3, hex('#b5653a')); px.sprite(['.g.g.', 'ggGgg', '.gGg.'], x - 2.5, y - 6, { g: hex('#5fae6b'), G: hex('#3f8a4f') }); break;
    case 'globe': S2(['.bbb.', 'bgbbb', 'bbggb', 'bbbgb', '.bbb.', '..k..', '.kkk.'], { b: hex('#5d8fc9'), g: hex('#6fbf8e'), k: hex('#8a5a38') }); break;
    case 'candle': { // 黑猫蜡烛，火苗一跳一跳
      S2(['k...k', 'kkkkk', 'kykyk', 'kkkkk', 'kkkkk', '.kkk.'], { k: hex('#231a2e'), y: hex('#f5d76e') });
      const fl = Math.floor(t / 180) % 2;
      px.glowing(() => px.sprite(fl ? ['.o.', 'oyo'] : ['o..', 'oyo'], x - 1, y - 9, { o: hex('#ff9a3c'), y: hex('#fff3b0') }));
      px.lights.push([x, y - 8, 10, [255, 170, 90], 0.14]);
      break;
    }
    case 'cactusSmall': S2(['..g..', '.gGg.', 'g.G.g', 'ggGgg', '..G..', '.ppp.', '.ppp.'], { g: hex('#6fbf8e'), G: hex('#3f8a4f'), p: hex('#c9744a') }); break;
    case 'luckycat': S2(['w...w.w', 'wwwww.w', 'wkwkw.w', 'wwrww..', 'wwyww..', '.www...'], { w: hex('#fbf6ec'), k: hex('#2a2a2a'), r: hex('#e05a6f'), y: hex('#f2d36b') }); break;
    case 'ghost': { // 窗台小幽灵：飘着，发一点光
      const b = Math.round(Math.sin(t / 500) * 1.5);
      px.glowing(() => S2(['.www.', 'wwwww', 'wkwkw', 'wwwww', 'wwwww', 'w.w.w'], { w: hex('#f4f2ff'), k: hex('#2c2433') }, 0, -3 + b));
      px.lights.push([x, y - 6, 8, [220, 220, 255], 0.1]);
      break;
    }
  }
}

// ---------- 地上的大件装饰 ----------
function drawFloorDecor(px, t, l, wx, wy, per) {
  const [x, y] = P(wx, wy, 0);
  switch (l.kind) {
    case 'speaker':
      px.shadow(wx - 3, wy - 3, 6, 6);
      px.box(wx - 3, wy - 3, 0, 6, 6, 12, { top: hex('#3a3a44'), left: hex('#2b2b33'), right: hex('#22222a'), edge: hex('#55556a') });
      ellipse(px, ...P(wx - 3, wy + 0.5, 8), 2, 2, hex('#55556a'));
      ellipse(px, ...P(wx - 3, wy + 0.5, 3.5), 2, 2, hex('#55556a'));
      break;
    case 'jack': { // 大南瓜灯：里面的光一闪一闪
      px.rect(Math.round(x) - 6, Math.round(y) - 1, 13, 1, [0, 0, 0], 0.25);
      const flick = 0.8 + Math.sin(t / 130) * 0.2;
      px.sprite([
        '.....gg.....',
        '..oooOOooo..',
        '.oooooooooo.',
        'ooOyyooyyOoo',
        'ooOyoooyoOoo',
        'oooooyooooOo',
        'ooOyyyyyyOoo',
        '.oooyoyooooo',
        '..ooooooooo.',
      ], x - 6, y - 9, { g: hex('#4f8a3a'), o: hex('#e07a2e'), O: hex('#c4641c') });
      px.glowing(() => px.sprite([
        '............', '............', '............',
        '...yy..yy...', '...y...y....', '.....y......', '...yyyyyy...', '....y.y.....',
      ], x - 6, y - 9, { y: mix(hex('#ffd24a'), hex('#fff3b0'), flick - 0.6) }));
      px.lights.push([x, y - 5, 16, [255, 160, 60], 0.14 * flick]);
      break;
    }
    case 'candy':
      px.rect(Math.round(x) - 4, Math.round(y) - 1, 9, 1, [0, 0, 0], 0.25);
      px.sprite([
        '.r.b.y.',
        'rbyrbyr',
        'ooooooo',
        'oyyoyyo',
        'ooooooo',
        'oyyyyyo',
        '.ooooo.',
      ], x - 3.5, y - 7, { r: hex('#f05a78'), b: hex('#5d8fc9'), y: hex('#2c2433'), o: hex('#e07a2e') });
      break;
    case 'ukulele':
      px.sprite([
        '..........kk',
        '.........kk.',
        '..yyy..ww...',
        '.yyyyyww....',
        'yyykyyy.....',
        'yyyyyy......',
        '.yyyy.......',
      ], x - 6, y - 7, { y: hex('#d9a05a'), k: hex('#3a2418'), w: hex('#7a4a2a') });
      break;
  }
}

// ---------- 家具和道具 ----------
function drawFurniture(px, t, L, cat, jelly, per, props, spots, objs) {
  // 地上平铺的东西直接画；立起来的家具放进 objs，和小动物一起按远近排序再画
  // 电视前的大地毯
  const r = L.rug, rA = hx(r.a), rB = hx(r.b), rE = hx(r.edge);
  px.poly([P(16, 16, 0), P(48, 16, 0), P(48, 48, 0), P(16, 48, 0)], (x, y) => {
    const [wx, wy] = floorAt(x, y);
    if (wx < 17.5 || wx > 46.5 || wy < 17.5 || wy > 46.5) return rE;
    const u = wx - 32, v = wy - 32;
    switch (r.kind) {
      case 'plaid': {
        let c = Math.floor(wx / 4) % 2 ? rA : rB;
        if (Math.floor(wy / 4) % 2) c = mix(c, [255, 255, 255], 0.2);
        return c;
      }
      case 'fluffy': return hash(Math.floor(wx * 2), Math.floor(wy * 2)) > 0.6 ? rB : rA;
      case 'pumpkin': {
        // 南瓜脸：两个三角眼 + 锯齿嘴
        const eye = (cx) => v < -2 && v > -9 && Math.abs(u - cx) < (v + 9) * 0.5;
        if (eye(-6) || eye(6)) return hex('#2c2433');
        if (v > 3 && v < 7 && Math.abs(u) < 9 && !(Math.floor(u + 20) % 4 === 0 && v < 5)) return hex('#2c2433');
        return Math.floor((wx + 2) / 6) % 2 ? rA : rB;
      }
      default:
        if (Math.abs(u) + Math.abs(v) < 5) return rE;
        return Math.floor((wx + wy) / 4) % 2 ? rA : rB;
    }
  });

  objs.push({ d: 16, draw: () => {
    // 角落的电视柜（不卖）+ 柜顶装饰位
    const cab = { top: hex('#a0704a'), left: hex('#86593a'), right: hex('#6d462c'), edge: hex('#c38d60') };
    px.shadow(2, 2, 12, 12);
    px.box(2, 2, 0, 12, 12, 9, cab);
    if (L.cabinetTop) drawSmall(px, t, L.cabinetTop, ...P(8, 10, 9), per);
  } });

  objs.push({ d: 83, draw: () => {
    // 后墙：书架 + 书架顶装饰位
    const sh = L.shelf;
    px.shadow(70, 0, 16, 10);
    px.box(70, 0, 0, 16, 10, 30, mat(sh));
    const palette = ['#c95d5d', '#e2c26b', '#5d8fc9', '#6fbf8e', '#d9a1d4', '#f2a65a', '#4a3566', '#f3ead7'];
    for (let k = 0; k < 3; k++) {
      const z = 6 + k * 9;
      px.line(P(70, 10, z - 1), P(86, 10, z - 1), hx(sh.edge));
      const n = sh.books === 'manga' ? 10 : 6, wdt = sh.books === 'manga' ? 1.5 : 2.5;
      for (let b = 0; b < n; b++) {
        const col = hex(palette[(b * 3 + k * 2) % (sh.books === 'manga' ? 8 : 6)]);
        const [bx, by] = P(71 + b * wdt, 10, z);
        const hgt = sh.books === 'manga' ? 6 : 5 - (b % 2);
        px.rect(Math.round(bx), Math.round(by) - hgt + (sh.books === 'manga' ? 0 : b % 2), sh.books === 'manga' ? 1 : 2, hgt, col);
      }
    }
    if (L.shelfTop) drawSmall(px, t, L.shelfTop, ...P(80, 5, 30), per);
  } });

  objs.push({ d: 96, draw: () => {
    // 墙角的猫粮袋（可以拖，不卖）
    if (!(props.drag && props.drag.item === 'bag')) {
      const [gx, gy] = P(BAG_AT[0], BAG_AT[1], 0);
      px.rect(Math.round(gx) - 4, Math.round(gy) - 1, 9, 1, [0, 0, 0], 0.25);
      px.sprite(BAG, gx - 4, gy - 8, BAG_PAL, { tag: TAG.bag });
    }
  } });

  objs.push({ d: 61, draw: () => {
    // 水母的书桌 + 电脑（屏幕朝 +y）+ 桌角装饰位
    px.shadow(44, 0, 22, 12);
    px.box(44, 0, 0, 22, 12, 15, mat(L.jellyDesk));
    const pc = L.jellyPC, body = { top: hx(pc.body), left: hx(pc.dk), right: hx(pc.dk) };
    const Y = pc.kind === 'crt' ? 6.5 : 4;
    if (pc.kind === 'crt') px.box(49, 0.5, 15, 12, 6, 10, body);
    else { px.box(49, 1, 15, 12, 3, 10, body); px.box(54, 0, 15, 2, 2, 2, body); }
    const jAct = jelly.online && !jelly.together && !props.massage && !(props.eating && props.eating.jelly) ? jelly.activity : null;
    px.glowing(() => px.poly([P(50, Y, 16), P(60, Y, 16), P(60, Y, 24), P(50, Y, 24)], (x, y) => {
      const dx = x + 0.5 - OX;
      const wx = dx + Y, wz = OY + (wx + Y) / 2 - (y + 0.5);
      return screenColor(jAct, t, (wx - 50) / 10, 1 - (wz - 16) / 8) || hex('#151519');
    }));
    if (screenColor(jAct, t, 0.5, 0.5)) px.lights.push([...P(55, 10, 16), 12, [190, 220, 255], 0.07]);
    if (L.jellyDeskTop) drawSmall(px, t, L.jellyDeskTop, ...P(62, 8, 15), per);
  } });

  objs.push({ d: 61, draw: () => {
    // 猫的书桌 + 电脑（屏幕朝 +x）+ 马克杯 + 桌角装饰位
    px.shadow(0, 44, 12, 22);
    px.box(0, 44, 0, 12, 22, 16, mat(L.catDesk));
    for (const z of [4, 10]) {
      px.line(P(12, 46, z), P(12, 54, z), mix(hx(L.catDesk.right), [0, 0, 0], 0.25));
      const [hx2, hy2] = P(12, 50, z + 2.5);
      px.set(hx2, hy2, hex('#e2c26b'));
    }
    const pc = L.catPC, body = { top: hx(pc.body), left: hx(pc.dk), right: hx(pc.dk) };
    const X = pc.kind === 'crt' ? 6.5 : 4;
    if (pc.kind === 'crt') px.box(0.5, 49, 16, 6, 13, 11, body);
    else { px.box(1, 49, 16, 3, 13, 11, body); px.box(4, 55, 16, 2, 2, 2, body); }
    const cAct = cat.online && !cat.together && !props.massage && !(props.eating && props.eating.cat) ? cat.activity : null;
    px.glowing(() => px.poly([P(X, 50, 17), P(X, 61, 17), P(X, 61, 26), P(X, 50, 26)], (x, y) => {
      const dx = x + 0.5 - OX;
      const wy = X - dx, wz = OY + (X + wy) / 2 - (y + 0.5);
      return screenColor(cAct, t, (wy - 50) / 11, 1 - (wz - 17) / 9) || hex('#151519');
    }));
    if (screenColor(cAct, t, 0.5, 0.5)) px.lights.push([...P(10, 56, 18), 14, [190, 220, 255], 0.08]);
    const [mx, my] = P(8, 46, 16);
    px.sprite(['.www.', 'wwwwW', 'wwwwW', '.www.'], mx - 2, my - 4, { w: hex('#f1e7d3'), W: hex('#c8b89a') });
    if (per.mugSteam || t % 3000 < 2000) {
      for (let i = 0; i < (per.mugSteam ? 3 : 1); i++) {
        const p = ((t + i * 600) % 1800) / 1800;
        px.set(mx + Math.round(Math.sin(p * 6 + i)), my - 6 - Math.round(p * 6), hex('#ffffff'), 0.6 * (1 - p));
      }
    }
    if (L.catDeskTop) drawSmall(px, t, L.catDeskTop, ...P(9, 63, 16), per);
  } });

  objs.push({ d: 82, draw: () => {
    // 床头柜和抽屉（靠左墙、猫窝旁边；不卖，是互动道具）
    const D = DRAWER;
    const nst = { top: hex('#c08a5a'), left: hex('#a06e44'), right: hex('#8a5c36'), edge: hex('#dca676') };
    px.shadow(D.x, D.y, D.w, D.d);
    px.box(D.x, D.y, 0, D.w, D.d, D.h, nst, TAG.drawer);
    const slide = props.drawerOpen ? 7 : 0;
    const drw = { top: hex('#d9b48a'), left: hex('#b98e62'), right: hex('#a07a50'), edge: hex('#f0cfa4') };
    if (slide) {
      px.box(D.x + D.w, D.y + 1, 5, slide, D.d - 2, 4, { top: hex('#5a3a26'), left: drw.left, right: drw.right, edge: drw.edge }, TAG.drawer);
      if (props.toy === 'drawer' || !props.toy) {
        const [tx, ty] = P(D.x + D.w + slide / 2, D.y + D.d / 2, 9);
        px.sprite(['.ssssssd', 'shhhhhsd', '.ssssssd'], tx - 4, ty - 2, TOY_PAL, { tag: TAG.toy });
      }
    } else {
      px.line(P(D.x + D.w, D.y + 1, 6), P(D.x + D.w, D.y + D.d - 1, 6), hex('#6b4526'));
      const [kx, ky] = P(D.x + D.w, D.y + D.d / 2, 8);
      px.set(kx, ky, hex('#e2c26b'));
    }
    const [nlx, nly] = P(D.x + 5, D.y + 5, D.h);
    px.sprite(['.mmm.', 'mMmMm', '..s..', '..s..'], nlx - 2, nly - 4, { m: hex('#f28c8c'), M: hex('#fff0f0'), s: hex('#f3ead7') });
    if (per.nightlight) { px.glowing(() => px.sprite(['.mmm.', 'mMmMm'], nlx - 2, nly - 4, { m: hex('#ffb3a8'), M: hex('#fffbe8') })); px.lights.push([nlx, nly - 3, 24, [255, 190, 150], 0.2]); }
  } });

  // 小猪存钱罐：两个人的金币都在这里（点它打开小卖部）
  objs.push({ d: 39, draw: () => drawPiggy(px, t, props, spots) });

  // 窗台装饰位（窗台在左墙，算在墙后面）
  if (L.sill) objs.push({ d: 79, draw: () => drawSmall(px, t, L.sill, ...P(1.5, 80, 22), per) });

  // 猫窝
  drawCatBed(px, t, L.catBed, objs);

  // 两个小饭碗
  for (const who of ['cat', 'jelly']) objs.push({ d: BOWL[who][0] + BOWL[who][1], draw: () => {
    const [bx, by] = P(BOWL[who][0], BOWL[who][1], 0);
    const full = props.eating && props.eating[who];
    const bw = L.bowls;
    const [bandC, bandD] = (bw[who] || bw.cat).map(hx);
    px.rect(Math.round(bx) - 5, Math.round(by), 11, 1, [0, 0, 0], 0.22);
    const rows = bw.kind === 'pumpkin'
      ? ['.....g.....', '.wwwwwwwww.', 'wfffffffffw', 'bBbbBbbBbbb', 'bBbbBbbBbbB', '.bBbbBbbBb.', '..BBBBBBB..']
      : ['.wwwwwwwww.', 'wfffffffffw', 'WfffffffffW', 'bbbbpbbbbbb', '.bbbbbbbbB.', '..BBBBBBB..'];
    px.sprite(rows, bx - 5.5, by - rows.length, {
      w: hx(bw.rim), W: mix(hx(bw.rim), [0, 0, 0], 0.1),
      f: full ? KIBBLE[0] : hex('#5a4a44'),
      b: bandC, B: bandD, p: hex('#ffffff'), g: hex('#4f8a3a'),
    }, { tag: who === 'cat' ? TAG.bowlCat : TAG.bowlJelly });
    if (full) [[-3, -6, 1], [-1, -7, 2], [1, -6, 0], [3, -6, 2], [0, -6, 1], [-2, -6, 2], [2, -7, 0]].forEach(([dx, dy, c]) => px.set(Math.round(bx) + dx, Math.round(by) + dy, KIBBLE[c]));
    spots['bowl' + (who === 'cat' ? 'Cat' : 'Jelly')] = [bx, by - 2];
  } });

  // 水母的床（小凳子 + 鱼缸 / 贝壳）
  objs.push({ d: 123.9, draw: () => {
    const stool = { top: hex('#c8a07a'), left: hex('#a8825e'), right: hex('#8e6b4a'), edge: hex('#e0bb92') };
    px.shadow(78, 34, 12, 12);
    px.box(78, 34, 0, 12, 12, 5, stool);
    const [bcx, bcy] = P(84, 40, 5);
    if (L.jellyBed.kind === 'shell') { // 贝壳的上半片在后面立着
      px.sprite([
        '...pPpPpPp...',
        '..pPpPpPpPpp.',
        '.pPpPpPpPpPpp',
        'pPpPpPpPpPpPp',
      ], bcx - 6.5, bcy - 14, { p: hex('#f3b6c8'), P: hex('#e2a0b6') });
    } else {
      for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
        if (Math.hypot(i, j) > 7) continue;
        px.set(Math.round(bcx + i), Math.round(bcy - 7 + j), [150, 220, 240], j > -3 ? 0.3 : 0.12);
      }
    }
  } });
  objs.push({ d: 124.5, draw: () => drawBedFront(px, t, L.jellyBed) });

  // 落地灯
  objs.push({ d: 97, draw: () => {
    const [lx, ly] = P(5, 92, 0);
    const lm = L.lamp;
    if (lm.kind === 'mushroom') { // 矮矮的蘑菇灯
      px.rect(Math.round(lx) - 2, Math.round(ly) - 6, 4, 6, hex('#f3ead7'));
      const cap = ['..cccc..', '.cwccwc.', 'cccccccc', 'cwcccwcc'];
      const pal = per.lamp ? { c: hx(lm.shade), w: hex('#ffffff') } : { c: mix(hx(lm.shade), [60, 40, 40], 0.3), w: hex('#e8e0d8') };
      if (per.lamp) { px.glowing(() => px.sprite(cap, lx - 4, ly - 10, pal)); px.lights.push([lx, ly - 7, 22, [255, 190, 170], 0.13]); }
      else px.sprite(cap, lx - 4, ly - 10, pal);
      return;
    }
    px.rect(Math.round(lx) - 2, Math.round(ly) - 1, 5, 1, hex('#3a2a22'));
    px.rect(Math.round(lx), Math.round(ly) - 22, 1, 21, hex('#3a2a22'));
    const shade = ['..aaaa..', '.aAAAAa.', 'aAAAAAAa', 'aaaaaaaa'];
    if (per.lamp) {
      px.glowing(() => px.sprite(shade, lx - 3.5, ly - 27, { a: hex('#f6b46a'), A: hex('#fff0c8') }));
      px.lights.push([lx, ly - 22, 26, [255, 200, 130], 0.13]);
    } else px.sprite(shade, lx - 3.5, ly - 27, { a: hex('#c98a4a'), A: hex('#e8c08a') });
  } });

  // 大盆栽
  objs.push({ d: 152, draw: () => {
    const [gx2, gy2] = P(90, 62, 0);
    px.box(86, 58, 0, 8, 8, 7, { top: hex('#4a3226'), left: hex('#c9744a'), right: hex('#a95f3b'), edge: hex('#e08a5c') });
    const pk = L.plant.kind;
    if (pk === 'cactus') px.sprite([
      '....gg....', '...gGgg...', '...gGgg.g.', 'g..gGgg.gg', 'gg.gGgggg.', '.ggggGgg..', '...gGgg...', '...gGgg...', '...gGgg...',
    ], gx2 - 5, gy2 - 16, { g: hex('#6fbf8e'), G: hex('#3f8a4f') });
    else if (pk === 'sunflower') {
      px.sprite(['.yyy.', 'yybyy', 'ybbby', 'yybyy', '.yyy.'], gx2 - 2.5, gy2 - 24, { y: hex('#f2d36b'), b: hex('#7a4a2a') });
      px.rect(Math.round(gx2), Math.round(gy2) - 19, 1, 12, hex('#4f8a3a'));
      px.sprite(['gg...', '.gg..', '...gg'], gx2 - 2, gy2 - 15, { g: hex('#5fae6b') });
    } else px.sprite([
      '...g...g..', '..gGg.gGg.', '.gGGgggGGg', 'gGg.gGg.gG', '.g..gGg..g', '....gGg...',
    ], gx2 - 5, gy2 - 16, { g: hex('#5fae6b'), G: hex('#3f8a4f') });
  } });

  // 地上的装饰位
  if (L.floorFront) objs.push({ d: 150, draw: () => drawFloorDecor(px, t, L.floorFront, 62, 88, per) });
  if (L.floorRight) objs.push({ d: 172, draw: () => drawFloorDecor(px, t, L.floorRight, 88, 84, per) });
  if (L.toys) {
    const [yx, yy] = P(48, 88, 0);
    px.sprite(['.rr.', 'rRrr', 'rrRr', '.rr.'], yx - 2, yy - 4, { r: hex('#e87a7a'), R: hex('#c45b5b') });
    px.line([yx + 2, yy - 1], [yx + 7, yy + 1], hex('#e87a7a'));
    const [fx, fy] = P(60, 74, 0);
    px.sprite(['..ggg..g', '.gGgggGg', 'gegggg.g', '.ggggg..'], fx - 4, fy - 4, { g: hex('#9aa7b5'), G: hex('#c4ced8'), e: hex('#2a2a2a') });
    ellipse(px, ...P(70, 62, 0), 6, 3, hex('#5d8fc9'));
    ellipse(px, ...P(70, 62, 1), 5, 2, hex('#7aa6dd'));
  }
}

const PIGGY = [
  '...p.....p..',
  '..pPp...pPp.',
  '.pppppppppp.',
  'pppppppppppp',
  'pppkppppkppp',
  'ppppppppSSpp',
  'ppppppppSnSp',
  'pppppppppSS.',
  '.pppppppppp.',
  '..pd.pd.pd..',
];
function drawPiggy(px, t, props, spots) {
  const [x, y] = P(7, 32, 0);
  const since = props.coinAt != null ? t - props.coinAt : 1e9;
  const wiggle = since < 900 ? Math.round(Math.sin(since / 60) * (1 - since / 900)) : 0;
  const x0 = Math.round(x - 6) + wiggle, y0 = Math.round(y - 10);
  px.rect(Math.round(x) - 5, Math.round(y), 11, 1, [0, 0, 0], 0.22);
  px.sprite(PIGGY, x0, y0, { p: hex('#f4a6c0'), P: hex('#e07a9a'), k: hex('#3a2a2a'), S: hex('#e88aa8'), n: hex('#b85a7a'), d: hex('#c96e8e') }, { tag: TAG.piggy });
  px.rect(x0 + 4, y0 + 2, 3, 1, hex('#8a3a5a')); // 背上的投币口
  px.set(x0 + 3, y0 + 3, hex('#ffd0e0')); // 一点高光
  // 有金币进账：一枚金币从上面掉进投币口
  if (since < 600) {
    const p = since / 600;
    const cy = y0 - 10 + Math.round(p * 11);
    px.glowing(() => px.sprite(['.yy.', 'yYyy', 'yyyY', '.yy.'], x0 + 4, cy, { y: hex('#f2c14a'), Y: hex('#fff3b0') }));
  }
  spots.piggy = [x0 + 6, y0];
}

function drawCatBed(px, t, b, objs) {
  if (b.kind === 'box') {
    // 纸箱：箱底和里面两面是平的，外面两面在猫后面画（猫睡在里面只露出上半身）
    px.poly([P(16, 75, 0), P(32, 75, 0), P(32, 89, 0), P(16, 89, 0)], hex('#8a6038'));
    px.poly([P(16, 75, 0), P(32, 75, 0), P(32, 75, 6), P(16, 75, 6)], hex('#b98a52'));
    px.poly([P(16, 75, 0), P(16, 89, 0), P(16, 89, 6), P(16, 75, 6)], hex('#a87a46'));
    objs.push({ d: 107, draw: () => {
      px.poly([P(16, 89, 0), P(32, 89, 0), P(32, 89, 6), P(16, 89, 6)], hex('#c99a5e'));
      px.poly([P(32, 75, 0), P(32, 89, 0), P(32, 89, 6), P(32, 75, 6)], hex('#b08248'));
      px.line(P(16, 89, 6), P(32, 89, 6), hex('#e0b878'));
      px.line(P(32, 75, 6), P(32, 89, 6), hex('#e0b878'));
      px.poly([P(16, 89, 6), P(32, 89, 6), P(30, 92, 9), P(18, 92, 9)], hex('#d4a868')); // 前面的箱盖翻开
      px.line(P(24, 89, 1), P(24, 89, 5), hex('#8a6038'), 0.6);
    } });
    return;
  }
  if (b.kind === 'witch') {
    ellipse(px, ...P(24, 82, 0), 10, 5, hex('#2c2433'));
    ellipse(px, ...P(24, 82, 1), 8, 4, hex('#4a3566'));
    ellipse(px, ...P(24, 82, 2), 6, 3, hex('#e07a2e'));
    objs.push({ d: 80, draw: () => { // 后面立着一顶大巫师帽
      const [hx1, hy1] = P(18, 78, 2);
      px.sprite(['.....k..', '....kk..', '...kkk..', '...kkkk.', '..ooooo.', '.kkkkkkk', 'kkkkkkkkk'], hx1 - 4, hy1 - 9, { k: hex('#2c2433'), o: hex('#e07a2e') });
    } });
    return;
  }
  ellipse(px, ...P(24, 82, 0), 10, 5, hx(b.a));
  ellipse(px, ...P(24, 82, 1), 8, 4, hx(b.b));
  ellipse(px, ...P(24, 82, 2), 6, 3, hx(b.c));
}

function drawBedFront(px, t, b) {
  const [bcx, bcy] = P(84, 40, 5);
  if (b.kind === 'shell') { // 贝壳下半片 + 一颗珍珠
    px.sprite([
      'p...........p',
      'pPpPpPpPpPpPp',
      '.pPpPpPpPpPp.',
      '..ppppppppp..',
    ], bcx - 6.5, bcy - 4, { p: hex('#f3b6c8'), P: hex('#e2a0b6') });
    px.glowing(() => px.set(bcx + 4, bcy - 4, hex('#fffaf0')));
    return;
  }
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    if (Math.sin(a) < -0.85) continue;
    px.set(Math.round(bcx + Math.cos(a) * 7.5), Math.round(bcy - 7 - Math.sin(a) * 7.5), [225, 248, 255], 0.6);
  }
  px.line([bcx - 4, bcy - 14], [bcx + 4, bcy - 14], [225, 248, 255], 0.7);
  px.line([bcx - 5, bcy - 10], [bcx - 5, bcy - 6], [255, 255, 255], 0.7);
  px.line([bcx - 3, bcy - 4], [bcx + 3, bcy - 4], [120, 200, 230], 0.5);
  const p = (t % 2600) / 2600;
  px.set(Math.round(bcx + 3 + Math.sin(p * 6)), Math.round(bcy - 3 - p * 9), [240, 252, 255], 0.8 * (1 - p));
}

function drawTV(px, t, on, playing) {
  // 电视挂在墙角，正对着我们。双击可以叫上 TA 一起看 B 站。
  const x0 = OX - 15, y0 = OY - 34, w = 30, h = 19;
  px.rect(x0, y0, w, h, hex('#1d1b24'), 1, TAG.tv);
  px.rect(x0 + 1, y0 + h, w - 2, 1, hex('#0f0e14'));
  px.glowing(() => {
    for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) {
      if (!on) { px.set(x0 + i, y0 + j, (i + j) % 7 === 0 ? hex('#2a2834') : hex('#14131a'), 1, TAG.tv); continue; }
      const u = (i - 2) / (w - 4), v = (j - 2) / (h - 4);
      let c;
      if (playing) {
        const s = Math.sin(u * 6 + t / 400) + Math.sin(v * 5 - t / 500);
        c = s > 0.6 ? hex('#fb7299') : s > -0.4 ? hex('#4fb7e6') : hex('#2f7fb0');
        if ((j + Math.floor(t / 80)) % 9 === 0) c = mix(c, [255, 255, 255], 0.25);
      } else { // 等着开播：粉色底 + 转圈的小点
        c = hex('#fb7299');
        const a = t / 300;
        for (let k = 0; k < 3; k++) {
          const cx = 0.5 + Math.cos(a + k * 2.1) * 0.12, cy = 0.5 + Math.sin(a + k * 2.1) * 0.2;
          if (Math.hypot((u - cx) * 1.6, v - cy) < 0.07) c = hex('#ffffff');
        }
      }
      px.set(x0 + i, y0 + j, c, 1, TAG.tv);
    }
    px.set(x0 + w - 3, y0 + h - 2, on ? hex('#7ed491') : hex('#a04040'));
  });
  if (on) px.lights.push([OX, OY - 10, 40, [180, 220, 255], 0.08]);
}

// ---------- 小零件 ----------
function drawNpc(px, act, x, y, t, side) {
  const n = NPC[act];
  if (!n) return;
  const f = Math.floor(t / 450) % 2;
  const bob = act === 'gpt' || act === 'kimi' ? Math.round(Math.sin(t / 500) * 1.5) - 4 : act === 'doubao' ? -Math.abs(Math.round(Math.sin(t / 300) * 2)) : 0;
  const rows = n.frames[f];
  px.sprite(rows, x - rows[0].length / 2, y - rows.length + bob, n.pal, { tag: 3 });
  // Claude 搭积木：旁边的积木一块块往上摞
  if (act === 'claude') {
    const cols = ['#e2c26b', '#5d8fc9', '#c95d5d', '#6fbf8e'];
    const n2 = 1 + (Math.floor(t / 1300) % 4);
    for (let i = 0; i < n2; i++) {
      const bx = x + 7, by = y - 2 - i * 3;
      const c = hex(cols[i]);
      px.rect(bx, by, 4, 3, c);
      px.rect(bx, by, 4, 1, mix(c, [255, 255, 255], 0.35));
    }
  }
}

function drawZ(px, x, y, t) {
  const f = Math.floor(t / 700) % 3;
  for (let i = 0; i <= f; i++) {
    const zx = Math.round(x + i * 4), zy = Math.round(y - i * 5);
    px.rect(zx, zy, 4, 1, C.zzz); px.set(zx + 2, zy + 1, C.zzz); px.set(zx + 1, zy + 2, C.zzz); px.rect(zx, zy + 3, 4, 1, C.zzz);
  }
}
function drawBubblesZ(px, x, y, t) {
  for (let i = 0; i < 3; i++) {
    const p = ((t + i * 700) % 2100) / 2100;
    px.set(Math.round(x + Math.sin(p * 6 + i) * 1.5), Math.round(y - p * 12), hex('#e8fbff'), 1 - p);
  }
}

function ellipse(px, cx, cy, rx, ry, c) {
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) px.set(Math.round(cx + i), Math.round(cy + j), c);
  }
}
function glow(px, cx, cy, r, c, a) {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const d = Math.hypot(i, j * 1.4) / r;
    if (d >= 1) continue;
    const x = Math.round(cx + i), y = Math.round(cy + j);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (px.b[(y * W + x) * 4 + 3] === 0) continue;
    px.set(x, y, c, a * (1 - d));
  }
}
function tintAll(px, c, a) {
  const b = px.b;
  for (let i = 0; i < b.length; i += 4) {
    if (!b[i + 3] || px.emit[i >> 2]) continue; // 发光的东西不压暗
    b[i] += (c[0] - b[i]) * a; b[i + 1] += (c[1] - b[i + 1]) * a; b[i + 2] += (c[2] - b[i + 2]) * a;
  }
}
function dimHalf(px, side) {
  const b = px.b;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (side === 'left' ? x >= OX : x <= OX) continue;
    const i = (y * W + x) * 4;
    if (!b[i + 3]) continue;
    b[i] *= 0.45; b[i + 1] *= 0.45; b[i + 2] *= 0.55;
  }
}
function skyColor(name) {
  switch (name) {
    case 'dawn': return { top: hex('#a9c8ef'), bottom: hex('#ffc9a3'), sunDisk: true };
    case 'day': return { top: hex('#6fb8ec'), bottom: hex('#bfe4fb') };
    case 'dusk': return { top: hex('#6f74c9'), bottom: hex('#ff9e7a'), sunDisk: true };
    default: return { top: hex('#141a3a'), bottom: hex('#2a2f5e'), stars: true, moon: true };
  }
}

// ---------- 收到屏幕边缘：两只从边上探出半个脑袋 ----------
export const PW = 18;
export const PH = 30;
const PEEK_CAT = [
  '.........K......',
  '........kK.....K',
  '........kkk...kk',
  '.......kkkkkkkkk',
  '......kkkkkkkkkk',
  '......kywkkkkkkk',
  '......kyykkkkkkk',
  '......pkkkkkkkkk',
  '.......kkpkkkkkk',
  '........kkkkkkkk',
  '.....kk.kkkkkkkk',
  '.....kkk.kkkkkkk',
];
const PEEK_JELLY = [
  '..........jjjjjj',
  '........jjwwjjjj',
  '.......jjwjjjjjj',
  '......jjjjjjjjjj',
  '......jjejjjjjjj',
  '......jpjjjjjjjj',
  '......JJJJJJJJJJ',
  '.......l.l..l.l.',
  '......l..l.l..l.',
  '.....l..l...l...',
];
export function createPeek() {
  const buf = new Uint8ClampedArray(PW * PH * 4);
  const set = (x, y, c, a = 1) => {
    if (x < 0 || y < 0 || x >= PW || y >= PH) return;
    const i = (y * PW + x) * 4;
    const ba = buf[i + 3] / 255, na = a + ba * (1 - a);
    for (let k = 0; k < 3; k++) buf[i + k] = (c[k] * a + buf[i + k] * ba * (1 - a)) / na;
    buf[i + 3] = na * 255;
  };
  let mirror = false; // 收在左边时整幅镜像
  const sprite = (rows, x0, y0, pal, alpha = 1) => rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const col = pal[row[c]];
      if (!col) continue;
      const x = x0 + c;
      set(mirror ? PW - 1 - x : x, y0 + r, col, alpha);
    }
  });
  // state: { cat: {online, activity}, jelly: {...}, unread }
  function render(state, t) {
    buf.fill(0);
    mirror = state.side === 'left';
    // 每隔一会儿往外多探一点，再缩回去
    const lean = (phase) => { const p = ((t + phase) % 6000) / 6000; return p < 0.15 ? Math.round(Math.sin((p / 0.15) * Math.PI) * 2) : 0; };
    const jOn = state.jelly && state.jelly.online, cOn = state.cat && state.cat.online;
    // 水母（上面），轻轻上下飘
    let jr = PEEK_JELLY;
    const jBlink = !jOn || state.jelly.activity === 'sleep' || t % 4300 < 160;
    if (jBlink) jr = jr.map((r) => r.replace('e', 'J'));
    const jb = Math.round(Math.sin(t / 700));
    sprite(jr, PW - 16 - lean(0), 2 + jb, JELLY_PAL, jOn ? 0.95 : 0.55);
    // 小黑猫（下面），偶尔动一下耳朵
    let cr = PEEK_CAT;
    const cBlink = !cOn || state.cat.activity === 'sleep' || (t + 1700) % 3900 < 150;
    if (cBlink) cr = cr.map((r) => r.replace(/y/g, 'k').replace('w', 'k'));
    if ((t % 5000) < 200) cr = cr.map((r, i) => (i === 0 ? r.replace('K', '.') : r));
    sprite(cr, PW - 16 - lean(2500), 16, { ...CAT_PAL, w: hex('#ffffff') }, cOn ? 1 : 0.6);
    // 收起时 TA 发来了消息：一个小粉心一跳一跳
    if (state.unread) {
      const y0 = 13 + (Math.floor(t / 400) % 2);
      [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]].forEach(([x, y]) => set(mirror ? PW - 3 - x : 2 + x, y0 + y, hex('#f05a78')));
    }
    return buf;
  }
  return { render, buf };
}

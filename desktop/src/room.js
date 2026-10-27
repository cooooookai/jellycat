// 像素小房间渲染器
// 纯函数式：往一个 RGBA 缓冲里画，浏览器里贴到 canvas，Node 里可以直接导出图片检查。
//
// 空间：小黑猫和小水母住在同一个 96×96 的房间里（2.5D 等距视角）。
// 颜色和装饰由主题决定（THEMES），以后的节日房间、早中晚房间都是换一套主题。

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
export const TAG = { cat: 1, jelly: 2, npc: 3, tv: 4, drawer: 5, toy: 6, bag: 7, bowlCat: 8, bowlJelly: 9 };
const TAG_NAME = Object.fromEntries(Object.entries(TAG).map(([k, v]) => [v, k]));

// ---------- 主题：房间的基本配色 ----------
export const THEMES = {
  cozy: {
    name: '小家',
    wallA: hex('#6f9f92'), wallB: hex('#65958a'),
    backA: hex('#7aa69a'), backB: hex('#70998e'),
    base: hex('#5a3d2c'), baseTop: hex('#7a553c'),
    woodA: hex('#b07444'), woodB: hex('#a46a3d'), woodSeam: hex('#7d4e2c'), woodHi: hex('#c0854f'),
    rugA: hex('#8c5a8f'), rugB: hex('#7d4f80'), rugEdge: hex('#f0d9a8'),
    lights: [hex('#ffd98a'), hex('#ffb3c7'), hex('#bde8ff')],
  },
};

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
  jelly: { desk: [55, 22, 9], tv: [38, 26, 10], sleep: [84, 40, 6], idle: [66, 50, 14], eat: [80, 19, 6], massage: [43.5, 32.5, 8] },
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
    const th = THEMES[state.theme] || THEMES.cozy;
    const props = { eating: {}, ...(state.props || {}) };
    const together = !!(state.cat.together && state.jelly.together && state.cat.online && state.jelly.online);
    const cat = { ...state.cat, together };
    const jelly = { ...state.jelly, together };
    // 按摩需要两只都在
    if (props.massage && !(cat.online && jelly.online)) props.massage = false;

    drawShell(px, t, th);
    drawWalls(px, t, th, per);
    const objs = [];
    drawFurniture(px, t, th, cat, jelly, per, props, spots, objs);

    const cs = stationFor(cat, 'cat', props);
    const cp = moveToward('cat', cs ? SPOTS.cat[cs] : null, dt);
    const js = stationFor(jelly, 'jelly', props);
    const jp = moveToward('jelly', js ? SPOTS.jelly[js] : null, dt);
    heads.cat = heads.jelly = null;

    // 透视：离镜头越远（x + y 越小）越先画，近的盖住远的
    if (cp) objs.push({ d: cp[0] + cp[1], draw: () => drawCat(px, t, cp, cs, cat, heads) });
    if (jp) objs.push({ d: jp[0] + jp[1] + 0.01, draw: () => drawJelly(px, t, jp, js, jelly, heads, props) });
    objs.push({ d: 124.5, draw: () => drawBowlFront(px, t) }); // 鱼缸的玻璃在睡觉的水母前面
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

// ---------- 地板和外壳 ----------
function drawShell(px, t, th) {
  px.poly([P(0, S, 0), P(S, S, 0), P(S, S, -6), P(0, S, -6)], C.slabL);
  px.poly([P(S, 0, 0), P(S, S, 0), P(S, S, -6), P(S, 0, -6)], C.slabR);
  px.poly([P(0, 0, 0), P(S, 0, 0), P(S, S, 0), P(0, S, 0)], (x, y) => {
    const [wx, wy] = floorAt(x, y);
    const row = Math.floor(wy / 8);
    const seamX = (row * 13) % 24;
    let c;
    if (wy % 8 < 1) c = th.woodSeam;
    else if ((wx + seamX) % 24 < 1) c = th.woodSeam;
    else if (wy % 8 < 2 && hash(Math.floor(wx / 3), row) > 0.6) c = th.woodHi;
    else c = row % 2 ? th.woodA : th.woodB;
    if (hash(Math.floor(wx), Math.floor(wy)) > 0.985) c = mix(c, th.woodSeam, 0.5);
    const edge = Math.min(wx, wy);
    if (edge < 4) c = mix(c, [40, 20, 20], ((4 - edge) / 4) * 0.35);
    return c;
  });
  px.line(P(0, S, 0), P(S, S, 0), th.woodHi, 0.5);
  px.line(P(S, 0, 0), P(S, S, 0), th.woodHi, 0.4);
}

function drawWalls(px, t, th, per) {
  px.poly([P(0, 0, 0), P(0, S, 0), P(0, S, WALL), P(0, 0, WALL)], (x, y) => {
    const [wy, wz] = leftWallAt(x, y);
    if (wz < 4) return wz < 1 ? th.baseTop : th.base;
    if (wz > WALL - 2) return th.baseTop;
    return Math.floor(wy / 4) % 2 ? th.wallA : th.wallB;
  });
  px.poly([P(0, 0, 0), P(S, 0, 0), P(S, 0, WALL), P(0, 0, WALL)], (x, y) => {
    const [wx, wz] = backWallAt(x, y);
    if (wz < 4) return wz < 1 ? th.baseTop : th.base;
    if (wz > WALL - 2) return th.baseTop;
    const c = Math.floor(wx / 4) % 2 ? th.backA : th.backB;
    return mix(c, [30, 40, 50], 0.12);
  });
  px.poly([P(-4, -4, WALL), P(S, -4, WALL), P(S, 0, WALL), P(0, 0, WALL), P(0, S, WALL), P(-4, S, WALL)], C.rimTop);
  px.poly([P(-4, S, -6), P(0, S, -6), P(0, S, WALL), P(-4, S, WALL)], C.rim);
  px.poly([P(S, -4, -6), P(S, 0, -6), P(S, 0, WALL), P(S, -4, WALL)], C.rimDark);
  px.line(P(0, 0, 0), P(0, 0, WALL), mix(th.wallB, [0, 0, 0], 0.3), 0.6);

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
  const cw = per.curtains === 'closed' ? 10.5 : per.curtains === 'half' ? 6 : 4;
  const curtain = (y0, y1) => px.poly([P(0, y0, 18), P(0, y1, 18), P(0, y1, 45), P(0, y0, 45)], (x, y) => {
    const [wy] = leftWallAt(x, y);
    return Math.floor(wy) % 2 ? hex('#c45b6a') : hex('#b04e5e');
  });
  curtain(W0 - 3, W0 - 3 + cw);
  curtain(W1 + 3 - cw, W1 + 3);
  px.line(P(0, W0 - 4, 45.5), P(0, W1 + 4, 45.5), hex('#5a3d2c'));
  // 阳光 / 夕阳 / 月光从窗户洒到地板上
  if (per.sun) px.poly([P(6, W0 + 6, 0), P(6, W1 - 2, 0), P(30, W1 + 6, 0), P(30, W0 + 14, 0)], [255, 240, 200, 0.14]);
  if (per.sunset) px.poly([P(6, W0 + 6, 0), P(6, W1 - 2, 0), P(40, W1 + 8, 0), P(40, W0 + 18, 0)], [255, 170, 100, 0.16]);
  if (per.moonbeam) {
    px.lights.push([...P(16, 78, 0), 12, [150, 170, 255], 0.06]);
    px.glowing(() => px.poly([P(10, 76, 0), P(10, 79.5, 0), P(40, 86, 0), P(40, 81, 0)], [180, 200, 255, 0.35]));
  }

  // 左墙：一幅鱼的画、便签
  px.poly([P(0, 30, 30), P(0, 42, 30), P(0, 42, 40), P(0, 30, 40)], (x, y) => {
    const [wy, wz] = leftWallAt(x, y);
    if (wy < 31 || wy > 41 || wz < 31 || wz > 39) return hex('#d9b25a');
    const u = (wy - 31) / 10, v = (wz - 31) / 8;
    const fish = Math.hypot((u - 0.45) / 0.3, (v - 0.5) / 0.22) < 1 || (u > 0.72 && u < 0.88 && Math.abs(v - 0.5) < (u - 0.72) * 2);
    return fish ? hex('#f0a35a') : hex('#f3ead7');
  });
  px.poly([P(0, 56, 34), P(0, 60, 34), P(0, 60, 38), P(0, 56, 38)], hex('#fff1a8'));

  // ----- 后墙：合照、爱心贴纸、挂钟 -----
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
  const [hx, hy] = P(60, 0, 42);
  px.sprite(['r.r', 'rrr', '.r.'], hx - 1, hy - 2, { r: hex('#f05a78') });
  const [ccx, ccy] = P(76, 0, 40);
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    const r = Math.hypot(i, j);
    if (r > 5) continue;
    px.set(Math.round(ccx + i), Math.round(ccy + j + i / 2), r > 4 ? hex('#5a3d2c') : hex('#f6efe0'));
  }
  const now = new Date();
  const hAng = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2;
  const mAng = now.getMinutes() / 60 * Math.PI * 2;
  const hand = (ang, len, c) => px.line([ccx, ccy], [ccx + Math.sin(ang) * len, ccy - Math.cos(ang) * len + Math.sin(ang) * len / 2], c);
  hand(mAng, 3.5, hex('#3a2a22'));
  hand(hAng, 2.2, hex('#c45b6a'));

  // 串灯：黄昏和夜晚才亮
  const bulbs = [];
  for (let i = 0; i < 9; i++) bulbs.push([0, 6 + i * 10, WALL - 6 - Math.sin((i % 3) * 1.6) * 2]);
  for (let i = 0; i < 9; i++) bulbs.push([6 + i * 10, 0, WALL - 6 - Math.sin((i % 3) * 1.6 + 1) * 2]);
  for (let i = 0; i + 1 < bulbs.length; i++) {
    if (i === 8) continue;
    px.line(P(...bulbs[i]), P(...bulbs[i + 1]), hex('#2a2a2a'), 0.6);
  }
  bulbs.forEach((b, i) => {
    const [sx, sy] = P(...b);
    const col = th.lights[i % th.lights.length];
    const on = per.lights && (Math.floor(t / 900) + i) % 3 !== 0;
    if (on) { px.glowing(() => px.set(sx, sy, col)); px.lights.push([sx, sy, 4, col, 0.12]); }
    else px.set(sx, sy, mix(col, [70, 70, 70], 0.55));
  });
}

// ---------- 家具和道具 ----------
function drawFurniture(px, t, th, cat, jelly, per, props, spots, objs) {
  // 地上平铺的东西直接画；立起来的家具放进 objs，和小动物一起按远近排序再画
  // 电视前的大地毯
  px.poly([P(16, 16, 0), P(48, 16, 0), P(48, 48, 0), P(16, 48, 0)], (x, y) => {
    const [wx, wy] = floorAt(x, y);
    if (wx < 17.5 || wx > 46.5 || wy < 17.5 || wy > 46.5) return th.rugEdge;
    if (Math.abs(wx - 32) + Math.abs(wy - 32) < 5) return th.rugEdge;
    return Math.floor((wx + wy) / 4) % 2 ? th.rugA : th.rugB;
  });

  objs.push({ d: 16, draw: () => {
    // 角落的电视柜
    const cab = { top: hex('#a0704a'), left: hex('#86593a'), right: hex('#6d462c'), edge: hex('#c38d60') };
    px.shadow(2, 2, 12, 12);
    px.box(2, 2, 0, 12, 12, 9, cab);
    px.box(5, 8, 9, 5, 4, 2, { top: hex('#e8e4ee'), left: hex('#c9c3d3'), right: hex('#b3adbf'), outline: false });
  } });

  objs.push({ d: 83, draw: () => {
    // 后墙：书架
    const shelf = { top: hex('#8a5a38'), left: hex('#74482c'), right: hex('#5e3a24'), edge: hex('#a8744c') };
    px.shadow(70, 0, 16, 10);
    px.box(70, 0, 0, 16, 10, 30, shelf);
    for (let k = 0; k < 3; k++) {
      const z = 6 + k * 9;
      px.line(P(70, 10, z - 1), P(86, 10, z - 1), hex('#a8744c'));
      for (let b = 0; b < 6; b++) {
        const col = hex(['#c95d5d', '#e2c26b', '#5d8fc9', '#6fbf8e', '#d9a1d4', '#f2a65a'][(b + k * 2) % 6]);
        const [bx, by] = P(71 + b * 2.5, 10, z);
        px.rect(Math.round(bx), Math.round(by) - 5 + (b % 2), 2, 5 - (b % 2), col);
      }
    }
    const [ppx, ppy] = P(80, 5, 30);
    px.rect(Math.round(ppx) - 2, Math.round(ppy) - 3, 4, 3, hex('#b5653a'));
    px.sprite(['.g.g.', 'ggGgg', '.gGg.'], ppx - 2.5, ppy - 6, { g: hex('#5fae6b'), G: hex('#3f8a4f') });
  } });

  objs.push({ d: 96, draw: () => {
    // 墙角的猫粮袋（可以拖）
    if (!(props.drag && props.drag.item === 'bag')) {
      const [gx, gy] = P(BAG_AT[0], BAG_AT[1], 0);
      px.rect(Math.round(gx) - 4, Math.round(gy) - 1, 9, 1, [0, 0, 0], 0.25);
      px.sprite(BAG, gx - 4, gy - 8, BAG_PAL, { tag: TAG.bag });
    }
  } });

  objs.push({ d: 61, draw: () => {
    // 水母的书桌（屏幕朝 +y）
    const desk2 = { top: hex('#c8a07a'), left: hex('#a8825e'), right: hex('#8e6b4a'), edge: hex('#e0bb92') };
    px.shadow(44, 0, 22, 12);
    px.box(44, 0, 0, 22, 12, 15, desk2);
    px.box(49, 1, 15, 12, 3, 10, { top: hex('#3a3a44'), left: hex('#2b2b33'), right: hex('#2b2b33') });
    px.box(54, 0, 15, 2, 2, 2, { top: hex('#3a3a44'), left: hex('#2b2b33'), right: hex('#2b2b33') });
    const jAct = jelly.online && !jelly.together && !props.massage && !(props.eating && props.eating.jelly) ? jelly.activity : null;
    px.glowing(() => px.poly([P(50, 4, 16), P(60, 4, 16), P(60, 4, 24), P(50, 4, 24)], (x, y) => {
      const dx = x + 0.5 - OX;
      const wx = dx + 4, wz = OY + (wx + 4) / 2 - (y + 0.5);
      return screenColor(jAct, t, (wx - 50) / 10, 1 - (wz - 16) / 8) || hex('#151519');
    }));
    if (screenColor(jAct, t, 0.5, 0.5)) px.lights.push([...P(55, 10, 16), 12, [190, 220, 255], 0.07]);
    const [shx, shy] = P(62, 8, 15);
    px.sprite(['..pp', '.pPp', 'pPpp', 'ppp.'], shx - 2, shy - 4, { p: hex('#f3b6c8'), P: hex('#d98aa4') });
  } });

  objs.push({ d: 61, draw: () => {
    // 猫的书桌（屏幕朝 +x）
    const wood = { top: hex('#b98252'), left: hex('#9a6a42'), right: hex('#83582f'), edge: hex('#d39a66') };
    px.shadow(0, 44, 12, 22);
    px.box(0, 44, 0, 12, 22, 16, wood);
    for (const z of [4, 10]) {
      px.line(P(12, 46, z), P(12, 54, z), hex('#6b4526'));
      const [hx2, hy2] = P(12, 50, z + 2.5);
      px.set(hx2, hy2, hex('#e2c26b'));
    }
    px.box(1, 49, 16, 3, 13, 11, { top: hex('#3a3a44'), left: hex('#2b2b33'), right: hex('#2b2b33') });
    px.box(4, 55, 16, 2, 2, 2, { top: hex('#3a3a44'), left: hex('#2b2b33'), right: hex('#2b2b33') });
    const cAct = cat.online && !cat.together && !props.massage && !(props.eating && props.eating.cat) ? cat.activity : null;
    px.glowing(() => px.poly([P(4, 50, 17), P(4, 61, 17), P(4, 61, 26), P(4, 50, 26)], (x, y) => {
      const dx = x + 0.5 - OX;
      const wy = 4 - dx, wz = OY + (4 + wy) / 2 - (y + 0.5);
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
  } });

  objs.push({ d: 82, draw: () => {
    // 床头柜和抽屉（靠左墙、猫窝旁边）
    const D = DRAWER;
    const nst = { top: hex('#c08a5a'), left: hex('#a06e44'), right: hex('#8a5c36'), edge: hex('#dca676') };
    px.shadow(D.x, D.y, D.w, D.d);
    px.box(D.x, D.y, 0, D.w, D.d, D.h, nst, TAG.drawer);
    const slide = props.drawerOpen ? 7 : 0;
    // 抽屉本体（往 +x 方向拉出来）
    const drw = { top: hex('#d9b48a'), left: hex('#b98e62'), right: hex('#a07a50'), edge: hex('#f0cfa4') };
    if (slide) {
      px.box(D.x + D.w, D.y + 1, 5, slide, D.d - 2, 4, { top: hex('#5a3a26'), left: drw.left, right: drw.right, edge: drw.edge }, TAG.drawer);
      // 抽屉里的硅胶棒（横躺着）
      if (props.toy === 'drawer' || !props.toy) {
        const [tx, ty] = P(D.x + D.w + slide / 2, D.y + D.d / 2, 9);
        px.sprite(['.ssssssd', 'shhhhhsd', '.ssssssd'], tx - 4, ty - 2, TOY_PAL, { tag: TAG.toy });
      }
    } else {
      px.line(P(D.x + D.w, D.y + 1, 6), P(D.x + D.w, D.y + D.d - 1, 6), hex('#6b4526'));
      const [kx, ky] = P(D.x + D.w, D.y + D.d / 2, 8);
      px.set(kx, ky, hex('#e2c26b'));
    }
    // 床头柜上的小夜灯（深夜亮）
    const [nlx, nly] = P(D.x + 5, D.y + 5, D.h);
    px.sprite(['.mmm.', 'mMmMm', '..s..', '..s..'], nlx - 2, nly - 4, { m: hex('#f28c8c'), M: hex('#fff0f0'), s: hex('#f3ead7') });
    if (per.nightlight) { px.glowing(() => px.sprite(['.mmm.', 'mMmMm'], nlx - 2, nly - 4, { m: hex('#ffb3a8'), M: hex('#fffbe8') })); px.lights.push([nlx, nly - 3, 24, [255, 190, 150], 0.2]); }
  } });

  // 猫窝
  ellipse(px, ...P(24, 82, 0), 10, 5, hex('#4b3a5c'));
  ellipse(px, ...P(24, 82, 1), 8, 4, hex('#6c5785'));
  ellipse(px, ...P(24, 82, 2), 6, 3, hex('#8b75a6'));

  // 两个小饭碗
  for (const who of ['cat', 'jelly']) objs.push({ d: BOWL[who][0] + BOWL[who][1], draw: () => {
    const [bx, by] = P(BOWL[who][0], BOWL[who][1], 0);
    const full = props.eating && props.eating[who];
    const col = who === 'cat' ? hex('#e87a7a') : hex('#7cc4dc');
    px.sprite(['.wwwww.', 'wfffffw', 'ccccccc', '.ccccc.'], bx - 3.5, by - 4,
      { w: full ? KIBBLE[1] : hex('#3a2a22'), f: full ? KIBBLE[0] : hex('#2a1e18'), c: col }, { tag: who === 'cat' ? TAG.bowlCat : TAG.bowlJelly });
    if (full) { px.set(bx - 1, by - 5, KIBBLE[2]); px.set(bx + 1, by - 5, KIBBLE[0]); }
    spots['bowl' + (who === 'cat' ? 'Cat' : 'Jelly')] = [bx, by - 2];
  } });

  objs.push({ d: 123.9, draw: () => {
    // 水母的睡觉鱼缸
    const stool = { top: hex('#c8a07a'), left: hex('#a8825e'), right: hex('#8e6b4a'), edge: hex('#e0bb92') };
    px.shadow(78, 34, 12, 12);
    px.box(78, 34, 0, 12, 12, 5, stool);
    const [bcx, bcy] = P(84, 40, 5);
    for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
      if (Math.hypot(i, j) > 7) continue;
      px.set(Math.round(bcx + i), Math.round(bcy - 7 + j), [150, 220, 240], j > -3 ? 0.3 : 0.12);
    }
  } });

  objs.push({ d: 97, draw: () => {
    // 落地灯
    const [lx, ly] = P(5, 92, 0);
    px.rect(Math.round(lx) - 2, Math.round(ly) - 1, 5, 1, hex('#3a2a22'));
    px.rect(Math.round(lx), Math.round(ly) - 22, 1, 21, hex('#3a2a22'));
    if (per.lamp) {
      px.glowing(() => px.sprite(['..aaaa..', '.aAAAAa.', 'aAAAAAAa', 'aaaaaaaa'], lx - 3.5, ly - 27, { a: hex('#f6b46a'), A: hex('#fff0c8') }));
      px.lights.push([lx, ly - 22, 26, [255, 200, 130], 0.13]);
    } else {
      px.sprite(['..aaaa..', '.aAAAAa.', 'aAAAAAAa', 'aaaaaaaa'], lx - 3.5, ly - 27, { a: hex('#c98a4a'), A: hex('#e8c08a') });
    }
  } });

  objs.push({ d: 152, draw: () => {
    // 大盆栽
    const [gx2, gy2] = P(90, 62, 0);
    px.box(86, 58, 0, 8, 8, 7, { top: hex('#4a3226'), left: hex('#c9744a'), right: hex('#a95f3b'), edge: hex('#e08a5c') });
    px.sprite([
      '...g...g..',
      '..gGg.gGg.',
      '.gGGgggGGg',
      'gGg.gGg.gG',
      '.g..gGg..g',
      '....gGg...',
    ], gx2 - 5, gy2 - 16, { g: hex('#5fae6b'), G: hex('#3f8a4f') });
  } });

  // 地上的小东西
  const [yx, yy] = P(48, 88, 0);
  px.sprite(['.rr.', 'rRrr', 'rrRr', '.rr.'], yx - 2, yy - 4, { r: hex('#e87a7a'), R: hex('#c45b5b') });
  px.line([yx + 2, yy - 1], [yx + 7, yy + 1], hex('#e87a7a'));
  const [fx, fy] = P(60, 74, 0);
  px.sprite(['..ggg..g', '.gGgggGg', 'gegggg.g', '.ggggg..'], fx - 4, fy - 4, { g: hex('#9aa7b5'), G: hex('#c4ced8'), e: hex('#2a2a2a') });
  ellipse(px, ...P(70, 62, 0), 6, 3, hex('#5d8fc9'));
  ellipse(px, ...P(70, 62, 1), 5, 2, hex('#7aa6dd'));
}

function drawBowlFront(px, t) {
  const [bcx, bcy] = P(84, 40, 5);
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

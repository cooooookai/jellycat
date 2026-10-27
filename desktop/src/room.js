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
  constructor(buf) { this.b = buf; this.hit = new Uint8Array(W * H); }
  clear() { this.b.fill(0); this.hit.fill(0); }
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

// ---------- 主题（以后的节日房间、季节房间都在这里加一套颜色和装饰） ----------
export const THEMES = {
  cozy: {
    name: '小家',
    wallA: hex('#6f9f92'), wallB: hex('#65958a'), // 左墙竖条纹
    backA: hex('#7aa69a'), backB: hex('#70998e'), // 后墙
    base: hex('#5a3d2c'), baseTop: hex('#7a553c'),
    woodA: hex('#b07444'), woodB: hex('#a46a3d'), woodSeam: hex('#7d4e2c'), woodHi: hex('#c0854f'),
    rugA: hex('#8c5a8f'), rugB: hex('#7d4f80'), rugEdge: hex('#f0d9a8'),
    lights: [hex('#ffd98a'), hex('#ffb3c7'), hex('#bde8ff')],
  },
};

// ---------- 房间布局 ----------
// 一个 96×96 的房间。左墙 x = 0，后墙 y = 0，最里面的墙角放电视。
// 猫的书桌靠左墙，水母的书桌靠后墙；一起看的时候两只都挪到电视前的地毯上。
const SPOTS = {
  cat: { desk: [22, 55, 0], tv: [26, 38, 0], sleep: [24, 82, 3], idle: [42, 68, 0] },
  jelly: { desk: [55, 22, 9], tv: [38, 26, 10], sleep: [84, 40, 6], idle: [66, 50, 14] },
};

function stationFor(s) {
  if (!s.online || s.activity === 'away' || s.activity === 'gone') return null;
  if (s.together) return 'tv';
  if (s.activity === 'sleep') return 'sleep';
  if (s.activity) return 'desk';
  return 'idle';
}

// 显示器内容
function screenColor(act, t, u, v) {
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
    case 'claude': return v * 8 % 2 < 1 && u < 0.3 + hash(Math.floor(v * 8), Math.floor(t / 700)) * 0.6 ? hex('#f3c5a8') : hex('#2b2421');
    case 'gpt': return v * 8 % 2 < 1 && u < 0.2 + hash(Math.floor(v * 8), Math.floor(t / 700)) * 0.7 ? hex('#e8e8e8') : hex('#262626');
    case 'kimi': return v * 8 % 2 < 1 && u < 0.2 + hash(Math.floor(v * 8), Math.floor(t / 700)) * 0.7 ? hex('#9cc0ff') : hex('#1a1d2b');
    case 'doubao': return v * 8 % 2 < 1 && u < 0.2 + hash(Math.floor(v * 8), Math.floor(t / 700)) * 0.7 ? hex('#c9b8ff') : hex('#24203a');
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
   *   cat:   { online, activity, together },
   *   jelly: { online, activity, together },
   *   hour:  0..23 （本地时间，决定窗外的天色和房间明暗）
   *   theme: 'cozy' …
   * }
   */
  function render(state, t) {
    const dt = lastT == null ? 0 : Math.min(200, t - lastT);
    lastT = t;
    px.clear();
    const hour = state.hour ?? 14;
    const th = THEMES[state.theme] || THEMES.cozy;
    const together = !!(state.cat.together && state.jelly.together && state.cat.online && state.jelly.online);
    const cat = { ...state.cat, together };
    const jelly = { ...state.jelly, together };

    drawShell(px, t, th);
    drawWalls(px, t, th, hour);
    drawFurniture(px, t, th, cat, jelly);

    const cs = stationFor(cat);
    const cp = moveToward('cat', cs ? SPOTS.cat[cs] : null, dt);
    const js = stationFor(jelly);
    const jp = moveToward('jelly', js ? SPOTS.jelly[js] : null, dt);
    heads.cat = heads.jelly = null;

    // 按"离镜头远近"排序画：x + y 小的在后面
    const actors = [];
    if (cp) actors.push({ who: 'cat', p: cp, st: cs });
    if (jp) actors.push({ who: 'jelly', p: jp, st: js });
    actors.sort((a, b) => a.p[0] + a.p[1] - (b.p[0] + b.p[1]));
    for (const a of actors) {
      if (a.who === 'cat') drawCat(px, t, a.p, a.st, cat, heads);
      else drawJelly(px, t, a.p, a.st, jelly, heads);
    }
    // 水母的睡觉小玻璃碗画在水母前面
    drawBowlFront(px, t);

    drawTV(px, t, together);

    // 天色：清晨偏暖、傍晚偏橙、深夜偏蓝暗；台灯和屏幕的光留着
    const tint = hour >= 22 || hour < 5 ? [[20, 24, 70], 0.28] : hour >= 19 ? [[40, 30, 90], 0.16] : hour >= 17 ? [[255, 140, 80], 0.08] : hour < 8 ? [[255, 200, 150], 0.06] : null;
    if (tint) tintAll(px, tint[0], tint[1]);
    if (hour >= 19 || hour < 6) { // 夜里灯更亮
      const [lx, ly] = P(5, 92, 0);
      glow(px, lx, ly - 24, 30, [255, 200, 130], 0.14);
    }
    return buf;
  }

  function hitTest(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const tag = px.hit[y * W + x];
    if (tag === 1) return 'cat';
    if (tag === 2) return 'jelly';
    return buf[(y * W + x) * 4 + 3] > 20 ? 'room' : null;
  }

  return { render, hitTest, heads, W, H };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------- 角色 ----------
function drawCat(px, t, cp, cs, cat, heads) {
  const [sx, sy] = P(cp[0], cp[1], cp[2]);
  const arrived = cs && dist(cp, SPOTS.cat[cs]) < 0.5;
  const fast = cat.activity === 'game' ? 3 : 1;
  const f = Math.floor((t * fast) / 600) % 2;
  let spr, w = 12, h = 11, flip = false;
  if (arrived && cs === 'sleep') { spr = CAT_SLEEP[Math.floor(t / 1400) % 2]; w = 14; h = 7; }
  else if (arrived && (cs === 'desk' || cs === 'tv')) { spr = CAT_BACK[f]; flip = cs === 'tv'; }
  else {
    const blink = t % 3800 < 140;
    spr = CAT_FRONT[f].map((r) => (blink ? r.replace(/y/g, 'k') : r));
  }
  const hop = !arrived ? -Math.abs(Math.sin(t / 90)) * 2 : 0;
  const x0 = sx - w / 2, y0 = sy - h + hop;
  px.rect(Math.round(sx - 4), Math.round(sy) - 1, 8, 1, [0, 0, 0], 0.25);
  px.sprite(spr, x0, y0, CAT_PAL, { flip, tag: 1 });
  if (arrived && cs === 'sleep') drawZ(px, sx + 5, sy - 10, t);
  heads.cat = [sx, y0 - 2];
  if (arrived && cs === 'desk') drawNpc(px, cat.activity, sx + 9, sy - 6, t);
}

function drawJelly(px, t, jp, js, jelly, heads) {
  const bob = Math.round(Math.sin(t / 650) * 1.5);
  const [sx, sy] = P(jp[0], jp[1], jp[2]);
  const arrived = js && dist(jp, SPOTS.jelly[js]) < 0.5;
  const sleeping = arrived && js === 'sleep';
  const fast = jelly.activity === 'game' ? 2.5 : 1;
  let spr = JELLY_SPR[Math.floor((t * fast) / (sleeping ? 1600 : 520)) % 2];
  if (sleeping) spr = spr.map((r) => r.replace(/e/g, 'J'));
  else if (arrived && (js === 'desk' || js === 'tv')) spr = spr.map((r) => r.replace(/[ep]/g, 'j')); // 背对我们
  else if (t % 4200 < 160) spr = spr.map((r) => r.replace(/e/g, 'J'));
  const x0 = sx - 5.5, y0 = sy - 13 + (sleeping ? 0 : bob);
  // 地上的影子，飘得越高越淡
  const [fx, fy] = P(jp[0], jp[1], 0);
  px.rect(Math.round(fx - 3), Math.round(fy), 7, 1, [0, 0, 0], Math.max(0.08, 0.25 - jp[2] / 80));
  glow(px, sx, sy - 7, 10, [170, 235, 250], sleeping ? 0.06 : 0.1);
  px.sprite(spr, x0, y0, JELLY_PAL, { alpha: sleeping ? 0.8 : 0.95, tag: 2 });
  if (sleeping) drawZ(px, sx + 6, sy - 16, t);
  heads.jelly = [sx, y0 - 2];
  if (arrived && js === 'desk') drawNpc(px, jelly.activity, sx + 13, sy - 1, t);
}

// ---------- 地板和外壳 ----------
function drawShell(px, t, th) {
  // 地板厚度（前面两个侧面）
  px.poly([P(0, S, 0), P(S, S, 0), P(S, S, -6), P(0, S, -6)], C.slabL);
  px.poly([P(S, 0, 0), P(S, S, 0), P(S, S, -6), P(S, 0, -6)], C.slabR);
  // 木地板
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
    if (edge < 4) c = mix(c, [40, 20, 20], ((4 - edge) / 4) * 0.35); // 墙角阴影
    return c;
  });
  // 前沿高光
  px.line(P(0, S, 0), P(S, S, 0), th.woodHi, 0.5);
  px.line(P(S, 0, 0), P(S, S, 0), th.woodHi, 0.4);
}

function drawWalls(px, t, th, hour) {
  // 左墙：竖条纹
  px.poly([P(0, 0, 0), P(0, S, 0), P(0, S, WALL), P(0, 0, WALL)], (x, y) => {
    const [wy, wz] = leftWallAt(x, y);
    if (wz < 4) return wz < 1 ? th.baseTop : th.base;
    if (wz > WALL - 2) return th.baseTop;
    return Math.floor(wy / 4) % 2 ? th.wallA : th.wallB;
  });
  // 后墙：同色系，暗一点（背光面）
  px.poly([P(0, 0, 0), P(S, 0, 0), P(S, 0, WALL), P(0, 0, WALL)], (x, y) => {
    const [wx, wz] = backWallAt(x, y);
    if (wz < 4) return wz < 1 ? th.baseTop : th.base;
    if (wz > WALL - 2) return th.baseTop;
    const c = Math.floor(wx / 4) % 2 ? th.backA : th.backB;
    return mix(c, [30, 40, 50], 0.12);
  });
  // 墙顶厚度、外端面
  px.poly([P(-4, -4, WALL), P(S, -4, WALL), P(S, 0, WALL), P(0, 0, WALL), P(0, S, WALL), P(-4, S, WALL)], C.rimTop);
  px.poly([P(-4, S, -6), P(0, S, -6), P(0, S, WALL), P(-4, S, WALL)], C.rim);
  px.poly([P(S, -4, -6), P(S, 0, -6), P(S, 0, WALL), P(S, -4, WALL)], C.rimDark);
  // 墙角的竖线
  px.line(P(0, 0, 0), P(0, 0, WALL), mix(th.wallB, [0, 0, 0], 0.3), 0.6);

  // ----- 左墙：窗户（天色跟着真实时间） -----
  const sky = skyColor(hour);
  const W0 = 68, W1 = 88;
  px.poly([P(0, W0, 22), P(0, W1, 22), P(0, W1, 42), P(0, W0, 42)], (x, y) => {
    const [wy, wz] = leftWallAt(x, y);
    if (wy < W0 + 1.5 || wy > W1 - 1.5 || wz < 23 || wz > 41) return hex('#e8dcc4');
    if (Math.abs(wy - (W0 + W1) / 2) < 0.7 || Math.abs(wz - 32) < 0.7) return hex('#e8dcc4');
    let c = mix(sky.bottom, sky.top, (wz - 23) / 18);
    if (sky.stars && hash(Math.floor(wy), Math.floor(wz)) > 0.95) c = hex('#fff6d0');
    if (sky.moon && Math.hypot(wy - 82, wz - 37) < 1.8) c = hex('#fff2b8');
    if (!sky.stars && hash(Math.floor(wy / 3), Math.floor(wz / 2)) > 0.93 && wz > 33) c = mix(c, [255, 255, 255], 0.6);
    return c;
  });
  px.box(0, W0 - 1, 20, 3, W1 - W0 + 2, 2, { top: hex('#efe3cc'), left: hex('#cdbfa6'), right: hex('#d9cbb2'), outline: false });
  const curtain = (y0) => px.poly([P(0, y0, 18), P(0, y0 + 4, 18), P(0, y0 + 4, 45), P(0, y0, 45)], (x, y) => {
    const [wy] = leftWallAt(x, y);
    return Math.floor(wy) % 2 ? hex('#c45b6a') : hex('#b04e5e');
  });
  curtain(W0 - 3); curtain(W1 - 1);
  px.line(P(0, W0 - 4, 45.5), P(0, W1 + 4, 45.5), hex('#5a3d2c'));
  // 白天阳光从窗户斜着洒到地板上
  if (sky.sun) {
    px.poly([P(6, W0 + 6, 0), P(6, W1 - 2, 0), P(30, W1 + 6, 0), P(30, W0 + 14, 0)], [255, 240, 200, 0.12]);
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

  // ----- 后墙：两人的合照、水母的海报、挂钟 -----
  // 合照（一只猫一只水母）
  px.poly([P(44, 0, 30), P(58, 0, 30), P(58, 0, 42), P(44, 0, 42)], (x, y) => {
    const [wx, wz] = backWallAt(x, y);
    if (wx < 45 || wx > 57 || wz < 31 || wz > 41) return hex('#8a5a38');
    const u = (wx - 45) / 12, v = (wz - 31) / 10;
    if (Math.hypot((u - 0.32) / 0.14, (v - 0.35) / 0.2) < 1) return C.k; // 猫
    if (u > 0.2 && u < 0.26 && v > 0.55 && v < 0.7) return C.k; // 猫耳
    if (u > 0.38 && u < 0.44 && v > 0.55 && v < 0.7) return C.k;
    if (Math.hypot((u - 0.7) / 0.14, (v - 0.55) / 0.13) < 1 && v > 0.45) return C.jelly; // 水母
    if (v < 0.45 && v > 0.15 && u > 0.6 && u < 0.8 && Math.floor(u * 30) % 2 === 0) return C.tent;
    return hex('#f6e7d0');
  });
  // 一颗小爱心贴纸
  const [hx, hy] = P(60, 0, 42);
  px.sprite(['r.r', 'rrr', '.r.'], hx - 1, hy - 2, { r: hex('#f05a78') });
  // 挂钟（显示真实时间）
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

  // 串灯（沿着两面墙的顶）
  const bulbs = [];
  for (let i = 0; i < 9; i++) bulbs.push([0, 6 + i * 10, WALL - 6 - Math.sin((i % 3) * 1.6) * 2]);
  for (let i = 0; i < 9; i++) bulbs.push([6 + i * 10, 0, WALL - 6 - Math.sin((i % 3) * 1.6 + 1) * 2]);
  for (let i = 0; i + 1 < bulbs.length; i++) {
    if (i === 8) continue;
    px.line(P(...bulbs[i]), P(...bulbs[i + 1]), hex('#2a2a2a'), 0.6);
  }
  bulbs.forEach((b, i) => {
    const [sx, sy] = P(...b);
    const on = (Math.floor(t / 900) + i) % 3 !== 0;
    const col = th.lights[i % th.lights.length];
    px.set(sx, sy, on ? col : mix(col, [60, 60, 60], 0.5));
    if (on) glow(px, sx, sy, 3, col, 0.12);
  });
}

// ---------- 家具 ----------
function drawFurniture(px, t, th, cat, jelly) {
  // 电视前的大地毯
  px.poly([P(16, 16, 0), P(48, 16, 0), P(48, 48, 0), P(16, 48, 0)], (x, y) => {
    const [wx, wy] = floorAt(x, y);
    if (wx < 17.5 || wx > 46.5 || wy < 17.5 || wy > 46.5) return th.rugEdge;
    if (Math.abs(wx - 32) + Math.abs(wy - 32) < 5) return th.rugEdge; // 中间的小菱形花纹
    return Math.floor((wx + wy) / 4) % 2 ? th.rugA : th.rugB;
  });

  // 角落的电视柜
  const cab = { top: hex('#a0704a'), left: hex('#86593a'), right: hex('#6d462c'), edge: hex('#c38d60') };
  px.shadow(2, 2, 12, 12);
  px.box(2, 2, 0, 12, 12, 9, cab);
  // 电视柜上的小游戏机
  px.box(5, 8, 9, 5, 4, 2, { top: hex('#e8e4ee'), left: hex('#c9c3d3'), right: hex('#b3adbf'), outline: false });

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
  // 书架顶上的小盆栽
  const [ppx, ppy] = P(80, 5, 30);
  px.rect(Math.round(ppx) - 2, Math.round(ppy) - 3, 4, 3, hex('#b5653a'));
  px.sprite(['.g.g.', 'ggGgg', '.gGg.'], ppx - 2.5, ppy - 6, { g: hex('#5fae6b'), G: hex('#3f8a4f') });

  // 后墙：水母的书桌（屏幕朝 +y）
  const desk2 = { top: hex('#c8a07a'), left: hex('#a8825e'), right: hex('#8e6b4a'), edge: hex('#e0bb92') };
  px.shadow(44, 0, 22, 12);
  px.box(44, 0, 0, 22, 12, 15, desk2);
  px.box(49, 1, 15, 12, 3, 10, { top: hex('#3a3a44'), left: hex('#2b2b33'), right: hex('#2b2b33') });
  px.box(54, 0, 15, 2, 2, 2, { top: hex('#3a3a44'), left: hex('#2b2b33'), right: hex('#2b2b33') });
  const jAct = jelly.online && !jelly.together ? jelly.activity : null;
  px.poly([P(50, 4, 16), P(60, 4, 16), P(60, 4, 24), P(50, 4, 24)], (x, y) => {
    const dx = x + 0.5 - OX;
    const wx = dx + 4, wz = OY + (wx + 4) / 2 - (y + 0.5);
    return screenColor(jAct, t, (wx - 50) / 10, 1 - (wz - 16) / 8) || hex('#151519');
  });
  if (screenColor(jAct, t, 0.5, 0.5)) { const [gx, gy] = P(55, 10, 16); glow(px, gx, gy, 12, [190, 220, 255], 0.07); }
  // 水母桌上的小海螺
  const [shx, shy] = P(62, 8, 15);
  px.sprite(['..pp', '.pPp', 'pPpp', 'ppp.'], shx - 2, shy - 4, { p: hex('#f3b6c8'), P: hex('#d98aa4') });

  // 左墙：猫的书桌（屏幕朝 +x）
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
  const cAct = cat.online && !cat.together ? cat.activity : null;
  px.poly([P(4, 50, 17), P(4, 61, 17), P(4, 61, 26), P(4, 50, 26)], (x, y) => {
    const dx = x + 0.5 - OX;
    const wy = 4 - dx, wz = OY + (4 + wy) / 2 - (y + 0.5);
    return screenColor(cAct, t, (wy - 50) / 11, 1 - (wz - 17) / 9) || hex('#151519');
  });
  if (screenColor(cAct, t, 0.5, 0.5)) { const [gx, gy] = P(10, 56, 18); glow(px, gx, gy, 14, [190, 220, 255], 0.08); }
  // 猫桌上的马克杯
  const [mx, my] = P(8, 46, 16);
  px.sprite(['.www.', 'wwwwW', 'wwwwW', '.www.'], mx - 2, my - 4, { w: hex('#f1e7d3'), W: hex('#c8b89a') });
  if (t % 3000 < 2000) px.set(mx, my - 6 - Math.floor(t / 500) % 2, hex('#ffffff'), 0.5);

  // 猫窝
  ellipse(px, ...P(24, 82, 0), 10, 5, hex('#4b3a5c'));
  ellipse(px, ...P(24, 82, 1), 8, 4, hex('#6c5785'));
  ellipse(px, ...P(24, 82, 2), 6, 3, hex('#8b75a6'));

  // 水母的睡觉玻璃碗：小凳子 + 碗的后半边（前半边在角色之后画）
  const stool = { top: hex('#c8a07a'), left: hex('#a8825e'), right: hex('#8e6b4a'), edge: hex('#e0bb92') };
  px.shadow(78, 34, 12, 12);
  px.box(78, 34, 0, 12, 12, 5, stool);
  const [bcx, bcy] = P(84, 40, 5);
  for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
    if (Math.hypot(i, j) > 7) continue;
    px.set(Math.round(bcx + i), Math.round(bcy - 7 + j), [150, 220, 240], j > -3 ? 0.3 : 0.12); // 碗里的水
  }

  // 落地灯
  const [lx, ly] = P(5, 92, 0);
  px.rect(Math.round(lx) - 2, Math.round(ly) - 1, 5, 1, hex('#3a2a22'));
  px.rect(Math.round(lx), Math.round(ly) - 22, 1, 21, hex('#3a2a22'));
  px.sprite(['..aaaa..', '.aAAAAa.', 'aAAAAAAa', 'aaaaaaaa'], lx - 3.5, ly - 27, { a: hex('#e8a25a'), A: hex('#ffd59a') });
  glow(px, lx, ly - 22, 22, [255, 200, 130], 0.1);

  // 右边角落的大盆栽
  const [gx2, gy2] = P(90, 62, 0);
  px.box(86, 58, 0, 8, 8, 7, { top: hex('#4a3226'), left: hex('#c9744a'), right: hex('#a95f3b'), edge: hex('#e08a5c') });
  px.sprite([
    '...g...g..',
    '..gGg.gGg.',
    '.gGGgggGGg',
    'gGg.gGg.gG',
    '.g..gGg..g',
    '....gGg...',
  ], gx2 - 5, gy2 - 19, { g: hex('#5fae6b'), G: hex('#3f8a4f') });

  // 地上的小东西：毛线球、小鱼玩具、坐垫
  const [yx, yy] = P(48, 88, 0);
  px.sprite(['.rr.', 'rRrr', 'rrRr', '.rr.'], yx - 2, yy - 4, { r: hex('#e87a7a'), R: hex('#c45b5b') });
  px.line([yx + 2, yy - 1], [yx + 7, yy + 1], hex('#e87a7a'));
  const [fx, fy] = P(60, 74, 0);
  px.sprite(['..ggg..g', '.gGgggGg', 'gegggg.g', '.ggggg..'], fx - 4, fy - 4, { g: hex('#9aa7b5'), G: hex('#c4ced8'), e: hex('#2a2a2a') });
  ellipse(px, ...P(70, 62, 0), 6, 3, hex('#5d8fc9'));
  ellipse(px, ...P(70, 62, 1), 5, 2, hex('#7aa6dd'));
}

function drawBowlFront(px, t) {
  // 圆圆的玻璃鱼缸，盖在睡觉的水母前面
  const [bcx, bcy] = P(84, 40, 5);
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    if (Math.sin(a) < -0.85) continue; // 顶上开口
    px.set(Math.round(bcx + Math.cos(a) * 7.5), Math.round(bcy - 7 - Math.sin(a) * 7.5), [225, 248, 255], 0.6);
  }
  px.line([bcx - 4, bcy - 14], [bcx + 4, bcy - 14], [225, 248, 255], 0.7); // 缸口
  px.line([bcx - 5, bcy - 10], [bcx - 5, bcy - 6], [255, 255, 255], 0.7); // 高光
  px.line([bcx - 3, bcy - 4], [bcx + 3, bcy - 4], [120, 200, 230], 0.5); // 水面
  const p = (t % 2600) / 2600;
  px.set(Math.round(bcx + 3 + Math.sin(p * 6)), Math.round(bcy - 3 - p * 9), [240, 252, 255], 0.8 * (1 - p));
}

function drawTV(px, t, on) {
  // 电视挂在墙角，正对着我们：在屏幕上是一个正矩形
  const x0 = OX - 15, y0 = OY - 34, w = 30, h = 19;
  px.rect(x0, y0, w, h, hex('#1d1b24'));
  px.rect(x0 + 1, y0 + h, w - 2, 1, hex('#0f0e14'));
  for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) {
    if (!on) { px.set(x0 + i, y0 + j, (i + j) % 7 === 0 ? hex('#2a2834') : hex('#14131a')); continue; }
    const u = (i - 2) / (w - 4), v = (j - 2) / (h - 4);
    const s = Math.sin(u * 6 + t / 400) + Math.sin(v * 5 - t / 500);
    let c = s > 0.6 ? hex('#fb7299') : s > -0.4 ? hex('#4fb7e6') : hex('#2f7fb0');
    if ((j + Math.floor(t / 80)) % 9 === 0) c = mix(c, [255, 255, 255], 0.25);
    px.set(x0 + i, y0 + j, c);
  }
  px.set(x0 + w - 3, y0 + h - 2, on ? hex('#7ed491') : hex('#a04040'));
  if (on) px.poly([[OX - 15, OY - 15], [OX + 15, OY - 15], [OX + 45, OY + 35], [OX - 45, OY + 35]], [180, 220, 255, 0.07]);
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
    if (!b[i + 3]) continue;
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
function skyColor(h) {
  if (h >= 6 && h < 9) return { top: hex('#9fd3f0'), bottom: hex('#ffd9a8'), sun: true };
  if (h >= 9 && h < 17) return { top: hex('#6fb8ec'), bottom: hex('#bfe4fb'), sun: true };
  if (h >= 17 && h < 19) return { top: hex('#6f74c9'), bottom: hex('#ff9e7a') };
  return { top: hex('#141a3a'), bottom: hex('#2a2f5e'), stars: true, moon: true };
}

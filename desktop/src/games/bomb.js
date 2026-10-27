// 拆弹：一个人看得到炸弹但没有说明书，另一个人只有说明书。开着微信电话一边说一边拆。
// 炸弹由拆弹的人那边生成、判断；看说明书的人只收到倒计时、错误次数、拆了几个。
// 说明书的规则是 JellyCat 自己写的。

export const META = { name: '拆弹', icon: '💣', desc: '一个人拆，一个人看说明书。最好开着微信电话玩。' };

const TIME = 300; // 秒
const MAX_STRIKES = 3;

// ---------- 随机数 ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffle(r, arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- 序列号 ----------
const SER = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeSerial(r) {
  let s = '';
  for (let i = 0; i < 5; i++) s += SER[Math.floor(r() * SER.length)];
  return s + Math.floor(r() * 10);
}
const lastOdd = (serial) => Number(serial.slice(-1)) % 2 === 1;

// ---------- 模块：剪线 ----------
const WIRE = { 红: '#e0484f', 蓝: '#4a8fe0', 黄: '#f2c14a', 白: '#f3f3ee', 黑: '#202020' };
const WIRE_NAMES = Object.keys(WIRE);
function wiresSolve(w, serial) {
  const n = w.length;
  const count = (c) => w.filter((x) => x === c).length;
  const firstOf = (c) => w.indexOf(c);
  const lastOf = (c) => w.lastIndexOf(c);
  if (n === 3) {
    const counts = WIRE_NAMES.map(count);
    if (counts.includes(2)) { const odd = w.find((c) => count(c) === 1); return w.indexOf(odd); }
    if (count('黑')) return firstOf('黑');
    return 1;
  }
  if (n === 4) {
    if (!lastOdd(serial) && count('白')) return firstOf('白');
    if (count('蓝') === 2) return lastOf('蓝');
    if (w[0] === '黄') return 3;
    return 2;
  }
  if (n === 5) {
    if (!count('红')) return 0;
    if (count('红') > count('蓝')) return lastOf('红');
    if (serial.includes('J')) return 4;
    return 1;
  }
  if (count('黄') > 2) return 3;
  if (w[5] === '白') return 0;
  if (lastOdd(serial) && count('黑')) return lastOf('黑');
  return 4;
}
const WIRES_MANUAL = `
<h3>✂️ 剪线</h3>
<p>炸弹上有 3～6 根线，<b>从上往下数</b>。只剪一根。按线的根数找到下面那一段，<b>从第一条规则开始看，第一条符合的就照做</b>。</p>
<h4>3 根</h4><ol>
<li>恰好有两根颜色一样 → 剪颜色不一样的那根。</li>
<li>有黑线 → 剪第一根黑线。</li>
<li>否则 → 剪第 2 根。</li></ol>
<h4>4 根</h4><ol>
<li>序列号最后一位是<b>偶数</b>，并且有白线 → 剪第一根白线。</li>
<li>恰好有两根蓝线 → 剪最后一根蓝线。</li>
<li>第 1 根是黄线 → 剪第 4 根。</li>
<li>否则 → 剪第 3 根。</li></ol>
<h4>5 根</h4><ol>
<li>没有红线 → 剪第 1 根。</li>
<li>红线比蓝线多 → 剪最后一根红线。</li>
<li>序列号里有字母 J → 剪第 5 根。</li>
<li>否则 → 剪第 2 根。</li></ol>
<h4>6 根</h4><ol>
<li>黄线超过两根 → 剪第 4 根。</li>
<li>第 6 根是白线 → 剪第 1 根。</li>
<li>序列号最后一位是<b>奇数</b>，并且有黑线 → 剪最后一根黑线。</li>
<li>否则 → 剪第 5 根。</li></ol>`;

// ---------- 模块：按钮 ----------
const BTN_COLORS = { 红: '#e0484f', 蓝: '#4a8fe0', 白: '#f3f3ee', 黄: '#f2c14a' };
const BTN_LABELS = ['按住', '引爆', '放开', '别碰'];
const STRIP = { 蓝: '#4a8fe0', 黄: '#f2c14a', 白: '#f3f3ee', 红: '#e0484f' };
function buttonAction(color, label, serial) {
  if (color === '蓝' && label === '别碰') return 'hold';
  if (label === '引爆' && !lastOdd(serial)) return 'tap';
  if (color === '红') return 'hold';
  if (color === '白' && label === '按住') return 'tap';
  return 'hold';
}
const releaseDigit = (strip) => (strip === '蓝' ? '4' : strip === '黄' ? '5' : '1');
const BUTTON_MANUAL = `
<h3>🔴 按钮</h3>
<p>一个大按钮，有颜色，上面写着字。<b>从第一条开始看，第一条符合的就照做</b>：</p><ol>
<li>蓝色，写着「别碰」 → <b>按住</b>。</li>
<li>写着「引爆」，并且序列号最后一位是<b>偶数</b> → <b>按一下马上松开</b>。</li>
<li>红色 → <b>按住</b>。</li>
<li>白色，写着「按住」 → <b>按一下马上松开</b>。</li>
<li>其他情况 → <b>按住</b>。</li></ol>
<h4>按住之后</h4>
<p>按钮右边会亮起一条灯。看灯的颜色，等<b>倒计时里任意一位数字</b>出现下面的数字时松手：</p>
<ul><li>蓝灯 → 4</li><li>黄灯 → 5</li><li>其他颜色 → 1</li></ul>
<p class="hint">比如倒计时显示 3:41，里面有 4 也有 1。</p>`;

// ---------- 模块：符号 ----------
const KEY_COLS = [
  ['Ϙ', 'Ѧ', 'ƛ', 'Ϟ', 'Ѭ', 'ϗ', 'Ͽ'],
  ['Ӭ', 'Ϙ', 'Ͽ', 'Ҩ', '☆', 'ϗ', '¿'],
  ['©', 'Ѽ', 'Ҩ', 'Ж', 'Ԇ', 'ƛ', '☆'],
  ['б', '¶', 'Ѣ', 'Ѭ', 'Ж', '¿', 'ټ'],
  ['ψ', 'ټ', 'Ѣ', 'Ͼ', '¶', 'Ѯ', '★'],
  ['б', 'Ӭ', '҂', 'æ', 'ψ', 'Ҋ', 'Ω'],
];
function makeKeypad(r) {
  for (let tries = 0; tries < 200; tries++) {
    const c = Math.floor(r() * KEY_COLS.length);
    const syms = shuffle(r, KEY_COLS[c]).slice(0, 4);
    const others = KEY_COLS.filter((col, i) => i !== c && syms.every((s) => col.includes(s)));
    if (!others.length) {
      const order = [...syms].sort((a, b) => KEY_COLS[c].indexOf(a) - KEY_COLS[c].indexOf(b));
      return { syms, order };
    }
  }
}
const KEYPAD_MANUAL = `
<h3>🔣 符号</h3>
<p>四个按键，每个上面一个奇怪的符号。下面六列里，<b>只有一列同时包含这四个符号</b>。找到那一列，<b>按这一列从上到下的顺序</b>依次按下去。按错一个算一次错误。</p>
<div class="cols">${KEY_COLS.map((col, i) => `<div class="col"><div class="hint">第${i + 1}列</div>${col.map((s) => `<div class="sym">${s}</div>`).join('')}</div>`).join('')}</div>`;

// ---------- 模块：迷宫 ----------
const MZ = 6;
const MAZE_SEEDS = [7, 23, 41, 59];
function genMaze(seed) {
  const r = rng(seed);
  // walls[y][x] = { r: 右边有墙, d: 下边有墙 }
  const walls = Array.from({ length: MZ }, () => Array.from({ length: MZ }, () => ({ r: true, d: true })));
  const seen = Array.from({ length: MZ }, () => Array(MZ).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < MZ && b < MZ && !seen[b][a]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = pick(r, nb);
    if (nx > x) walls[y][x].r = false;
    if (nx < x) walls[y][nx].r = false;
    if (ny > y) walls[y][x].d = false;
    if (ny < y) walls[ny][x].d = false;
    seen[ny][nx] = true;
    stack.push([nx, ny]);
  }
  // 再打通几面墙，路不那么唯一
  for (let i = 0; i < 4; i++) { const x = Math.floor(r() * (MZ - 1)), y = Math.floor(r() * MZ); walls[y][x].r = false; }
  return walls;
}
const MAZES = MAZE_SEEDS.map((s, i) => ({ walls: genMaze(s), marks: [[[0, 1], [5, 2]], [[4, 1], [1, 3]], [[3, 3], [5, 3]], [[0, 0], [0, 3]]][i] }));
function canMove(walls, x, y, dx, dy) {
  const nx = x + dx, ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= MZ || ny >= MZ) return false;
  if (dx === 1) return !walls[y][x].r;
  if (dx === -1) return !walls[y][nx].r;
  if (dy === 1) return !walls[y][x].d;
  return !walls[ny][x].d;
}
function drawMaze(cv, maze, opts = {}) {
  const c = cv.getContext('2d');
  const S = cv.width / MZ;
  c.fillStyle = '#14131a';
  c.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < MZ; y++) for (let x = 0; x < MZ; x++) {
    c.fillStyle = '#3a3647';
    c.fillRect(x * S + S / 2 - 1.5, y * S + S / 2 - 1.5, 3, 3);
  }
  if (opts.walls) {
    c.strokeStyle = '#f3ead7';
    c.lineWidth = 2;
    c.strokeRect(1, 1, cv.width - 2, cv.height - 2);
    c.beginPath();
    for (let y = 0; y < MZ; y++) for (let x = 0; x < MZ; x++) {
      const w = maze.walls[y][x];
      if (w.r && x < MZ - 1) { c.moveTo((x + 1) * S, y * S); c.lineTo((x + 1) * S, (y + 1) * S); }
      if (w.d && y < MZ - 1) { c.moveTo(x * S, (y + 1) * S); c.lineTo((x + 1) * S, (y + 1) * S); }
    }
    c.stroke();
  }
  c.strokeStyle = '#7ed491';
  c.lineWidth = 2;
  for (const [x, y] of maze.marks) { c.beginPath(); c.arc(x * S + S / 2, y * S + S / 2, S * 0.32, 0, Math.PI * 2); c.stroke(); }
  if (opts.goal) {
    const [x, y] = opts.goal;
    c.fillStyle = '#e0484f';
    c.beginPath(); c.moveTo(x * S + S / 2, y * S + S * 0.22); c.lineTo(x * S + S * 0.78, y * S + S * 0.74); c.lineTo(x * S + S * 0.22, y * S + S * 0.74); c.closePath(); c.fill();
  }
  if (opts.me) {
    const [x, y] = opts.me;
    c.fillStyle = '#ffffff';
    c.fillRect(x * S + S * 0.32, y * S + S * 0.32, S * 0.36, S * 0.36);
  }
}
const MAZE_MANUAL = `
<h3>🧭 迷宫</h3>
<p>拆的人只看得到一个 6×6 的点阵：两个<b style="color:#7ed491">绿圈</b>、一个<b>白色方块</b>（自己）、一个<b style="color:#e0484f">红色三角</b>（终点），<b>看不到墙</b>。</p>
<p>问清楚两个绿圈在哪（第几行第几列），在下面找到绿圈位置一样的那张图，然后指挥 TA 用方向键把白方块走到红三角。撞墙算一次错误（不会动）。</p>
<div class="mazes" id="manualMazes"></div>`;

// ---------- 生成一颗炸弹 ----------
function makeBomb(seed) {
  const r = rng(seed);
  const serial = makeSerial(r);
  const types = shuffle(r, ['wires', 'button', 'keypad', 'maze']).slice(0, 3);
  const mods = types.map((t) => {
    if (t === 'wires') {
      const n = 3 + Math.floor(r() * 4);
      const w = Array.from({ length: n }, () => pick(r, WIRE_NAMES));
      return { t, w, ans: wiresSolve(w, serial) };
    }
    if (t === 'button') {
      const color = pick(r, Object.keys(BTN_COLORS));
      const label = pick(r, BTN_LABELS);
      return { t, color, label, strip: pick(r, Object.keys(STRIP)), act: buttonAction(color, label, serial) };
    }
    if (t === 'keypad') return { t, ...makeKeypad(r) };
    const mi = Math.floor(r() * MAZES.length);
    let me, goal;
    do { me = [Math.floor(r() * MZ), Math.floor(r() * MZ)]; goal = [Math.floor(r() * MZ), Math.floor(r() * MZ)]; } while (Math.abs(me[0] - goal[0]) + Math.abs(me[1] - goal[1]) < 5);
    return { t, mi, me, goal };
  });
  return { serial, mods };
}

// ---------- 界面 ----------
const STYLE = `
.bomb { background:#2b2a2f; border:3px solid #111; padding:10px; box-shadow:4px 4px 0 #000; }
.bombtop { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.clock { font:700 26px ui-monospace,Menlo,monospace; color:#ff4d4d; background:#0d0d0d; padding:2px 10px; border:2px solid #444; letter-spacing:2px; }
.strikes { font:700 18px ui-monospace,Menlo,monospace; color:#ff4d4d; min-width:60px; }
.serial { font:700 12px ui-monospace,Menlo,monospace; color:#111; background:#f3ead7; padding:2px 6px; }
.mods { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.mod { position:relative; background:#3b3a42; border:2px solid #111; padding:10px; min-height:170px; }
.mod .led { position:absolute; right:6px; top:6px; width:10px; height:10px; background:#222; border:2px solid #111; }
.mod.done .led { background:#7ed491; }
.mod.done { opacity:.75; }
.mod.flash { animation: flash .3s steps(2) 2; }
@keyframes flash { 50% { background:#7a2a2a; } }
.wire { height:12px; margin:9px 0; cursor:pointer; border:2px solid #111; position:relative; }
.wire.cut { background-image:linear-gradient(90deg, transparent 45%, #3b3a42 45%, #3b3a42 55%, transparent 55%) !important; cursor:default; }
.bigbtn { width:96px; height:96px; border-radius:50%; border:4px solid #111; font:700 15px -apple-system,"PingFang SC",sans-serif; cursor:pointer; box-shadow:0 5px 0 #111; }
.bigbtn:active { transform:translateY(3px); box-shadow:0 2px 0 #111; }
.strip { width:14px; height:96px; border:2px solid #111; background:#222; }
.keys { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.key { height:62px; background:#e9e1cf; border:2px solid #111; font:30px/58px "Times New Roman",serif; text-align:center; color:#111; cursor:pointer; position:relative; }
.key.on::after { content:''; position:absolute; right:4px; top:4px; width:8px; height:8px; background:#7ed491; }
.arrows { display:grid; grid-template-columns:repeat(3,26px); gap:3px; justify-content:center; margin-top:6px; }
.arrows button { padding:2px 0; box-shadow:2px 2px 0 #000; }
.manual { background:#efe6cf; color:#2a2030; padding:14px 16px; border:3px solid #111; box-shadow:4px 4px 0 #000; font-size:13px; user-select:text; }
.manual h3 { margin:16px 0 6px; font-size:16px; border-bottom:2px solid #2a2030; }
.manual h3:first-child { margin-top:0; }
.manual h4 { margin:10px 0 2px; }
.manual ol, .manual ul { margin:4px 0; padding-left:22px; }
.manual .hint { color:#7a6f80; }
.manual .cols { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin-top:6px; }
.manual .col { background:#fff8e6; border:2px solid #2a2030; text-align:center; padding:4px 0; }
.manual .sym { font:24px/34px "Times New Roman",serif; }
.manual .mazes { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px; }
.manual .mazes canvas { width:100%; display:block; border:2px solid #2a2030; image-rendering:pixelated; }
.mtabs { display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap; }
.status { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:6px 10px; background:var(--panel); border:2px solid var(--line); }
.chat { display:flex; gap:6px; margin-top:10px; }
.chatlog { margin-top:6px; font-size:12px; color:var(--dim); max-height:60px; overflow:auto; }
`;

export function mount(root, ctx) {
  let defuser = ctx.host ? ctx.me : ctx.partner;
  let bomb = null;
  let left = TIME;
  let strikes = 0;
  let solved = 0;
  let timer = null;
  let state = 'intro'; // intro | live | end
  let remote = null; // 看说明书那边：{ left, strikes, solved, total, serial? }
  const chat = [];

  const st = document.createElement('style');
  st.textContent = STYLE;
  root.appendChild(st);
  const body = document.createElement('div');
  root.appendChild(body);

  const iDefuse = () => defuser === ctx.me;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function intro() {
    state = 'intro';
    clearInterval(timer);
    body.innerHTML = `<div class="card center" style="padding:22px">
      <div style="font-size:40px">${iDefuse() ? '💣' : '📖'}</div>
      <h2 style="margin:6px 0">${iDefuse() ? '你来拆' : '你看说明书'}</h2>
      <p class="hint">${iDefuse()
        ? '你看得到炸弹，但没有说明书。把看到的告诉 TA：几根线、什么颜色、按钮上写着什么……'
        : 'TA 看得到炸弹，你看不到。问清楚 TA 看到了什么，照说明书告诉 TA 怎么拆。'}<br>倒计时 ${fmt(TIME)}，错 ${MAX_STRIKES} 次就炸。开着微信电话最好玩。</p>
      ${iDefuse() ? '<button class="pink" id="bGo">准备好了，开始！</button>' : '<p>等 TA 按开始…</p><button class="ghost" id="bPeek">先翻翻说明书</button>'}
    </div>`;
    if (iDefuse()) body.querySelector('#bGo').onclick = () => start((Math.random() * 2 ** 31) | 0);
    else body.querySelector('#bPeek').onclick = () => expertView(true);
  }

  // ---------- 拆的人 ----------
  function start(seed) {
    bomb = makeBomb(seed);
    left = TIME;
    strikes = 0;
    solved = 0;
    state = 'live';
    ctx.send('start', { total: bomb.mods.length });
    defuserView();
    clearInterval(timer);
    timer = setInterval(() => {
      left--;
      renderClock();
      sendTick();
      if (left <= 0) boom('时间到了');
    }, 1000);
    sendTick();
  }
  function sendTick() { ctx.send('tick', { left, strikes, solved, total: bomb.mods.length }); }
  function strike(modEl) {
    strikes++;
    if (modEl) { modEl.classList.remove('flash'); void modEl.offsetWidth; modEl.classList.add('flash'); }
    renderClock();
    sendTick();
    if (strikes >= MAX_STRIKES) boom('错了三次');
  }
  function solve(modEl) {
    modEl.classList.add('done');
    solved++;
    sendTick();
    if (solved >= bomb.mods.length) win();
  }
  function boom(why) { if (state !== 'live') return; state = 'end'; clearInterval(timer); ctx.send('end', { ok: false, why }); endView(false, why); }
  function win() { if (state !== 'live') return; state = 'end'; clearInterval(timer); ctx.send('end', { ok: true, left }); endView(true); ctx.earn(); }

  function renderClock() {
    const c = body.querySelector('.clock');
    if (c) c.textContent = fmt(Math.max(0, left));
    const s = body.querySelector('.strikes');
    if (s) s.textContent = '✗'.repeat(strikes) + '·'.repeat(MAX_STRIKES - strikes);
  }

  function defuserView() {
    body.innerHTML = `<div class="bomb">
      <div class="bombtop"><span class="strikes"></span><span class="clock"></span><span class="serial">序列号 ${bomb.serial}</span></div>
      <div class="mods"></div>
    </div>${chatHtml()}`;
    const mods = body.querySelector('.mods');
    for (const m of bomb.mods) {
      const el = document.createElement('div');
      el.className = 'mod';
      el.innerHTML = '<div class="led"></div>';
      mods.appendChild(el);
      if (m.t === 'wires') modWires(el, m);
      if (m.t === 'button') modButton(el, m);
      if (m.t === 'keypad') modKeypad(el, m);
      if (m.t === 'maze') modMaze(el, m);
    }
    renderClock();
    bindChat();
  }

  function modWires(el, m) {
    m.w.forEach((c, i) => {
      const w = document.createElement('div');
      w.className = 'wire';
      w.style.background = WIRE[c];
      w.title = `第 ${i + 1} 根`;
      w.onclick = () => {
        if (el.classList.contains('done') || w.classList.contains('cut') || state !== 'live') return;
        w.classList.add('cut');
        if (i === m.ans) solve(el); else strike(el);
      };
      el.appendChild(w);
    });
  }

  function modButton(el, m) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:14px;align-items:center;justify-content:center;height:150px';
    const b = document.createElement('button');
    b.className = 'bigbtn';
    b.style.background = BTN_COLORS[m.color];
    b.style.color = m.color === '白' || m.color === '黄' ? '#111' : '#fff';
    b.textContent = m.label;
    const strip = document.createElement('div');
    strip.className = 'strip';
    wrap.append(b, strip);
    el.appendChild(wrap);
    let downAt = 0;
    let holdT = null;
    b.addEventListener('pointerdown', () => {
      if (el.classList.contains('done') || state !== 'live') return;
      downAt = Date.now();
      holdT = setTimeout(() => { strip.style.background = STRIP[m.strip]; }, 400);
    });
    const release = () => {
      if (!downAt) return;
      clearTimeout(holdT);
      const held = Date.now() - downAt > 400;
      downAt = 0;
      strip.style.background = '#222';
      if (state !== 'live') return;
      if (!held) { if (m.act === 'tap') solve(el); else strike(el); return; }
      if (m.act === 'tap') { strike(el); return; }
      if (fmt(Math.max(0, left)).includes(releaseDigit(m.strip))) solve(el); else strike(el);
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointerleave', release);
  }

  function modKeypad(el, m) {
    const g = document.createElement('div');
    g.className = 'keys';
    g.style.marginTop = '14px';
    let step = 0;
    for (const s of m.syms) {
      const k = document.createElement('div');
      k.className = 'key';
      k.textContent = s;
      k.onclick = () => {
        if (el.classList.contains('done') || k.classList.contains('on') || state !== 'live') return;
        if (s === m.order[step]) { k.classList.add('on'); step++; if (step === 4) solve(el); }
        else strike(el);
      };
      g.appendChild(k);
    }
    el.appendChild(g);
  }

  function modMaze(el, m) {
    const maze = MAZES[m.mi];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 120;
    cv.style.cssText = 'display:block;margin:4px auto 0;width:120px;height:120px';
    el.appendChild(cv);
    const pos = [...m.me];
    const redraw = () => drawMaze(cv, maze, { me: pos, goal: m.goal });
    redraw();
    const ar = document.createElement('div');
    ar.className = 'arrows';
    const btn = (label, dx, dy, col, row) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.gridColumn = col;
      b.style.gridRow = row;
      b.onclick = () => {
        if (el.classList.contains('done') || state !== 'live') return;
        if (!canMove(maze.walls, pos[0], pos[1], dx, dy)) { strike(el); return; }
        pos[0] += dx; pos[1] += dy;
        redraw();
        if (pos[0] === m.goal[0] && pos[1] === m.goal[1]) solve(el);
      };
      ar.appendChild(b);
    };
    btn('↑', 0, -1, 2, 1); btn('←', -1, 0, 1, 2); btn('↓', 0, 1, 2, 2); btn('→', 1, 0, 3, 2);
    el.appendChild(ar);
  }

  // ---------- 看说明书的人 ----------
  function expertView(preview) {
    body.innerHTML = `${preview ? '<div class="status"><span>还没开始，先熟悉一下</span><button class="ghost" id="bBack">返回</button></div>'
      : `<div class="status"><span class="strikes" id="eStrikes"></span><span class="clock" id="eClock" style="font-size:18px"></span><span id="eSolved"></span></div>`}
      <div class="mtabs" id="mTabs"></div>
      <div class="manual" id="manual"></div>${preview ? '' : chatHtml()}`;
    if (preview) body.querySelector('#bBack').onclick = intro;
    const pages = [
      ['先看这里', `<h3>📖 说明书</h3><p>你看不到炸弹。炸弹上有 <b>3 个模块</b>，可能是：剪线、按钮、符号、迷宫。先问 TA 有哪几个。</p><p>有些规则要看<b>序列号</b>（炸弹右上角的 6 位，最后一位一定是数字），先问清楚记下来。</p><p>错一次，TA 那边会亮一个 ✗。错 ${MAX_STRIKES} 次或者倒计时到 0 就炸了。</p>`],
      ['剪线', WIRES_MANUAL], ['按钮', BUTTON_MANUAL], ['符号', KEYPAD_MANUAL], ['迷宫', MAZE_MANUAL],
    ];
    const tabs = body.querySelector('#mTabs');
    const man = body.querySelector('#manual');
    const show = (i) => {
      man.innerHTML = pages[i][1];
      [...tabs.children].forEach((b, j) => { b.className = j === i ? '' : 'ghost'; });
      const mz = man.querySelector('#manualMazes');
      if (mz) MAZES.forEach((maze) => { const c = document.createElement('canvas'); c.width = c.height = 150; drawMaze(c, maze, { walls: true }); mz.appendChild(c); });
    };
    pages.forEach(([name], i) => { const b = document.createElement('button'); b.textContent = name; b.onclick = () => show(i); tabs.appendChild(b); });
    show(0);
    if (!preview) { renderRemote(); bindChat(); }
  }
  function renderRemote() {
    if (!remote) return;
    const c = body.querySelector('#eClock');
    if (!c) return;
    c.textContent = fmt(Math.max(0, remote.left));
    body.querySelector('#eStrikes').textContent = '✗'.repeat(remote.strikes) + '·'.repeat(MAX_STRIKES - remote.strikes);
    body.querySelector('#eSolved').textContent = `拆了 ${remote.solved} / ${remote.total}`;
  }

  // ---------- 文字聊天（没开电话的时候用） ----------
  function chatHtml() {
    return `<div class="chat"><input type="text" id="cIn" placeholder="没开电话的话在这里说" style="flex:1" maxlength="80"><button id="cSend">说</button></div><div class="chatlog" id="cLog"></div>`;
  }
  function bindChat() {
    const inp = body.querySelector('#cIn');
    if (!inp) return;
    const go = () => { const v = inp.value.trim(); inp.value = ''; if (!v) return; ctx.send('say', { text: v }); pushChat(ctx.me, v); };
    body.querySelector('#cSend').onclick = go;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) go(); });
    renderChat();
  }
  function pushChat(who, text) { chat.push({ who, text }); renderChat(); }
  function renderChat() {
    const log = body.querySelector('#cLog');
    if (!log) return;
    log.innerHTML = '';
    for (const c of chat.slice(-20)) { const d = document.createElement('div'); d.textContent = `${ctx.icon[c.who]} ${c.text}`; log.appendChild(d); }
    log.scrollTop = log.scrollHeight;
  }

  // ---------- 结束 ----------
  function endView(ok, why) {
    clearInterval(timer);
    body.innerHTML = `<div class="result"><div class="big">${ok ? '🎉' : '💥'}</div><h2>${ok ? '拆掉了！' : '炸了……'}</h2>
      <p class="hint">${ok ? `还剩 ${fmt(Math.max(0, iDefuse() ? left : remote ? remote.left : 0))}` : why || ''}</p>
      <button class="gold" id="bAgain">再来一颗（换人拆）</button></div>`;
    body.querySelector('#bAgain').onclick = () => { ctx.send('again'); again(); };
  }
  function again() {
    defuser = defuser === ctx.me ? ctx.partner : ctx.me;
    bomb = null;
    remote = null;
    chat.length = 0;
    intro();
  }

  intro();

  return {
    onMsg(m) {
      switch (m.op) {
        case 'start': if (!iDefuse()) { state = 'live'; remote = { left: TIME, strikes: 0, solved: 0, total: m.total }; expertView(false); } break;
        case 'tick': if (!iDefuse()) { if (state !== 'live') { state = 'live'; expertView(false); } remote = m; renderRemote(); } break;
        case 'end': if (!iDefuse() && state !== 'end') { state = 'end'; if (m.ok && remote) remote.left = m.left; endView(m.ok, m.why); if (m.ok) ctx.earn(); } break;
        case 'again': if (state === 'end') again(); break;
        case 'say': pushChat(m.from, String(m.text || '').slice(0, 80)); break;
      }
    },
    destroy() { clearInterval(timer); },
  };
}

// 给测试用：检查每颗炸弹都有唯一解
export const __test = { makeBomb, wiresSolve, buttonAction, makeKeypad, MAZES, KEY_COLS };

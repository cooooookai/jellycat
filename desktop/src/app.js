import { createRoom, createPeek, W, H, PW, PH, COMFY } from './room.js';

const jc = window.jc;
const room = createRoom();
const cv = document.getElementById('room');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
const img = ctx.createImageData(W, H);
const peekR = createPeek();
const peekImg = ctx.createImageData(PW, PH);
let peek = false; // 收在屏幕边缘：false / 'left' / 'right'
let unread = null; // 收起时收到的最后一条消息
const input = document.getElementById('input');
const badge = document.getElementById('badge');

let scale = 2;
let inputOpen = false; // 输入框开着吗
let inputMode = 'msg';
let period = 'auto'; // 房间时间：auto 或者手动指定
let econ = { balance: 0, equip: {} }; // 两人共用的金币和房间里摆的东西
let preview = null; // 商店里正在预览的 { slot, item }
let k = 2; // 每个原始像素在页面上占多少 CSS 像素
let st = {
  me: 'cat', connected: false, configured: false, hour: new Date().getHours(),
  cat: { online: true, activity: null, together: false },
  jelly: { online: false, activity: null, together: false },
};
const partner = () => (st.me === 'cat' ? 'jelly' : 'cat');

// ---------- 两个人共享的房间状态（抽屉、玩具、吃饭、电视），改了就同步给对方 ----------
// 每一项单独记时间：两个人同时动不同的东西，谁也不会把谁的改动盖掉
let shared = {
  drawerOpen: false, toy: 'drawer', massage: false,
  fastUntil: 0, tvWaitUntil: 0,
  eat_cat: false, eat_jelly: false,
};
const stamp = {}; // 每一项最后修改的时间
function updateShared(patch) {
  const now = Date.now();
  const entries = Object.entries(patch).map(([key, v]) => [key, v, now]);
  applyEntries(entries);
  jc.sendAct({ kind: 'props', entries });
}
function applyEntries(entries) {
  for (const [key, v, ts] of entries || []) {
    if (!(key in shared) || (stamp[key] || 0) > ts) continue;
    shared[key] = v;
    stamp[key] = ts;
  }
}
const eating = () => ({ cat: shared.eat_cat, jelly: shared.eat_jelly });
function sendAllShared() {
  const entries = Object.keys(stamp).map((key) => [key, shared[key], stamp[key]]);
  if (entries.length) jc.sendAct({ kind: 'props', entries });
}

// ---------- 尺寸：保证每个像素在屏幕上是整数个物理像素 ----------
function layout() {
  const dpr = window.devicePixelRatio || 1;
  const phys = Math.max(1, Math.round(scale * dpr));
  k = phys / dpr;
  const w = peek ? PW : W, h = peek ? PH : H;
  cv.width = w; cv.height = h;
  cv.style.width = w * k + 'px';
  cv.style.height = h * k + 'px';
  for (const b of bubbles) b.el.style.display = peek ? 'none' : '';
  coinEl.style.display = 'none';
  jc.resize(Math.round(w * k), Math.round(h * k));
}
jc.onPeek((side) => {
  peek = side || false;
  if (peek) closeInput();
  layout();
  if (!peek && unread) { const u = unread; unread = null; setTimeout(() => bubble(u.who, u.text, u.url), 300); }
});
jc.getConfig().then((c) => { scale = c.scale || 2; period = c.period || 'auto'; layout(); });
jc.onScale((s) => { scale = s; layout(); });
jc.onPeriod((p) => { period = p || 'auto'; });
window.matchMedia('(resolution: 1dppx)').addEventListener?.('change', layout);

// ---------- 状态 ----------
jc.onState((s) => {
  st = s;
  if (!s.configured) showBadge('右键 → 设置');
  else if (!s.connected) showBadge(s.error || '连接中…');
  else showBadge(null);
});
function showBadge(t) { badge.style.display = t ? 'block' : 'none'; badge.textContent = t || ''; }

// ---------- 金币 ----------
const coinEl = document.getElementById('coins'); // 鼠标停在小猪上时显示的金币数
let coinAt = null; // 最近一次进账的时间（小猪身上掉金币）
const previewEl = document.getElementById('previewTag');
function renderCoins() { coinEl.querySelector('b').textContent = econ.balance; }
jc.econGet().then((v) => { if (v) { econ = v; renderCoins(); } });
jc.onEcon((v) => { econ = v; renderCoins(); });
jc.onPreview((p) => { preview = p; previewEl.style.display = p ? 'block' : 'none'; });
jc.onEarned(({ who, amt }) => {
  // 头上飘一个 +N
  const el = document.createElement('div');
  el.className = 'earn';
  el.textContent = '+' + amt;
  document.body.appendChild(el);
  const [x, y] = anchor(who);
  el.style.left = x * k + 'px';
  el.style.top = (y - 2) * k + 'px';
  setTimeout(() => el.remove(), 1600);
  setTimeout(() => { coinAt = performance.now(); }, 500); // 飘一会儿再掉进小猪里
});

// ---------- 咕嘟声：发消息、收消息时轻轻响一下 ----------
let audio = null;
function gudu(volume = 0.07) {
  try {
    audio = audio || new AudioContext();
    const now = audio.currentTime;
    // 两个小水泡：音高从低滑到高，很短，很轻
    [[0, 260, 620], [0.13, 340, 820]].forEach(([at, f0, f1]) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, now + at);
      o.frequency.exponentialRampToValueAtTime(f1, now + at + 0.09);
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(volume, now + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.12);
      o.connect(g).connect(audio.destination);
      o.start(now + at);
      o.stop(now + at + 0.14);
    });
  } catch {}
}

// ---------- 气泡 ----------
const bubbles = []; // { who, el, until, url }
function bubble(who, text, url, ms) {
  for (const b of bubbles.filter((b) => b.who === who)) removeBubble(b);
  const el = document.createElement('div');
  el.className = 'bubble' + (url ? ' link' : '');
  el.textContent = text;
  if (url) el.onclick = () => jc.openUrl(url);
  document.body.appendChild(el);
  const life = ms || Math.min(20000, 5000 + text.length * 250);
  const b = { who, el, until: performance.now() + life, url };
  bubbles.push(b);
  placeBubbles();
}
function removeBubble(b) {
  const i = bubbles.indexOf(b);
  if (i >= 0) bubbles.splice(i, 1);
  b.el.classList.add('fade');
  setTimeout(() => b.el.remove(), 300);
}
const FALLBACK = { cat: [74, 95], jelly: [116, 85] };
function anchor(who) { return room.heads[who] || FALLBACK[who]; }
function placeBubbles() {
  const now = performance.now();
  for (const b of [...bubbles]) {
    if (now > b.until) { removeBubble(b); continue; }
    let [x, y] = anchor(b.who);
    if ((st.cat.together || shared.massage) && room.heads[b.who]) x += b.who === 'cat' ? -10 : 10;
    const r = b.el.getBoundingClientRect();
    const half = r.width / 2;
    const left = Math.min(Math.max(x * k, half + 2), W * k - half - 2);
    b.el.style.left = left + 'px';
    b.el.style.top = Math.max(r.height + 2, y * k - 4) + 'px';
  }
  if (inputOpen) {
    const [x, y] = anchor(st.me);
    input.style.left = Math.min(Math.max(x * k, 84), W * k - 84) + 'px';
    input.style.top = Math.max(34, y * k - 4) + 'px';
  }
}

jc.onMsg((m) => {
  if (m.poke) { hearts.push({ who: m.target || st.me, t0: performance.now() }); return; }
  if (m.text) {
    if (peek && m.who !== st.me) unread = m; // 收着的时候先记下，展开再冒出来
    else bubble(m.who, m.text, m.url);
    if (m.who !== st.me) gudu();
  }
});
jc.onLocalBubble((m) => bubble(m.who, m.text));
jc.onAct((a) => {
  if (a.kind === 'props') applyEntries(a.entries);
  if (a.kind === 'comfy') bubble('cat', a.text, null, 2500);
  if (a.kind === 'tv' && a.from !== st.me) bubble(a.from, '📺 一起看 B 站吧', null, 4000);
});
// TA 刚上线：把房间现在的样子告诉 TA
jc.onPeerOnline(sendAllShared);

// ---------- 戳一戳的小爱心 ----------
const hearts = [];
const HEART = ['.rr.rr.', 'rRrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
function drawHearts(buf, now) {
  for (const h of [...hearts]) {
    const p = (now - h.t0) / 1400;
    if (p >= 1) { hearts.splice(hearts.indexOf(h), 1); continue; }
    const [hx, hy] = anchor(h.who);
    const x0 = Math.round(hx - 3), y0 = Math.round(hy - 4 - p * 14);
    HEART.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '.') continue;
        const x = x0 + c, y = y0 + r;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4;
        const col = row[c] === 'R' ? [255, 220, 230] : [240, 90, 120];
        const a = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        buf[i] = buf[i] * (1 - a) + col[0] * a; buf[i + 1] = buf[i + 1] * (1 - a) + col[1] * a; buf[i + 2] = buf[i + 2] * (1 - a) + col[2] * a;
        buf[i + 3] = Math.max(buf[i + 3], 255 * a);
      }
    });
  }
}

// ---------- 画 ----------
let drag = null; // 正在拖的道具 { item, x, y }
function frame() {
  const now = performance.now();
  if (peek) {
    peekImg.data.set(peekR.render({ cat: st.cat, jelly: st.jelly, unread: !!unread, side: peek }, now));
    ctx.putImageData(peekImg, 0, 0);
    return;
  }
  const wall = Date.now();
  st.hour = new Date().getHours();
  const props = {
    drawerOpen: shared.drawerOpen,
    toy: drag && drag.item === 'toy' ? 'drag' : shared.toy,
    massage: shared.massage,
    fast: wall < shared.fastUntil,
    eating: eating(),
    tvWait: wall < shared.tvWaitUntil && !st.cat.together,
    drag,
    coinAt,
  };
  const equip = preview ? { ...econ.equip, [preview.slot]: preview.item } : econ.equip;
  const buf = room.render({ ...st, period: period === 'auto' ? null : period, props, equip }, now);
  drawHearts(buf, now);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  placeBubbles();
}
setInterval(frame, 50);
frame();

// ---------- 鼠标 ----------
// 透明的地方点穿；房间上可以拖动窗口；道具（猫粮、硅胶棒）可以拖着走
let solid = null;
function setSolid(s) { if (s !== solid) { solid = s; jc.setSolid(s); } }
let down = null;

const px = (e) => [e.clientX / k, e.clientY / k];
function hitAt(e) {
  const [x, y] = px(e);
  if (peek) { // 收起时：碰到小脑袋就算
    const xi = x | 0, yi = y | 0;
    return xi >= 0 && yi >= 0 && xi < PW && yi < PH && peekR.buf[(yi * PW + xi) * 4 + 3] > 20 ? 'peek' : null;
  }
  return room.hitTest(x, y);
}
const myBowl = () => (st.me === 'cat' ? 'bowlCat' : 'bowlJelly');

window.addEventListener('mousemove', (e) => {
  if (down) {
    if (down.peekOnly) return; // 收起时只能点，不能拖
    const moved = Math.hypot(e.screenX - down.x, e.screenY - down.y) > 3;
    if (down.prop) {
      if (moved || drag) { const [x, y] = px(e); drag = { item: down.prop, x, y }; }
      return;
    }
    if (!down.dragging && moved) { down.dragging = true; jc.dragStart(); }
    if (down.dragging) jc.dragMove();
    return;
  }
  const overUi = e.target !== cv && e.target !== document.body && e.target !== document.documentElement;
  const hit = hitAt(e);
  setSolid(!!hit || overUi || inputOpen);
  const pig = hit === 'piggy' && room.spots.piggy;
  coinEl.style.display = pig && !peek ? 'flex' : 'none';
  if (pig) { coinEl.style.left = room.spots.piggy[0] * k + 'px'; coinEl.style.top = (room.spots.piggy[1] - 3) * k + 'px'; }
  const clicky = ['cat', 'jelly', 'tv', 'drawer', 'toy', 'bag', 'bowlCat', 'bowlJelly', 'piggy'];
  cv.style.cursor = clicky.includes(hit) ? 'pointer' : hit ? 'grab' : 'default';
});
document.addEventListener('mouseleave', () => { if (!down && !inputOpen) setSolid(false); });

cv.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const hit = hitAt(e);
  if (!hit) return;
  let prop = null;
  if (peek) { down = { x: e.screenX, y: e.screenY, hit, prop: null, dragging: false, peekOnly: true }; return; }
  if (hit === 'bag') prop = 'bag';
  if (hit === 'toy' && shared.drawerOpen && shared.toy === 'drawer') prop = 'toy';
  down = { x: e.screenX, y: e.screenY, hit, prop, dragging: false };
});

window.addEventListener('mouseup', (e) => {
  if (!down) return;
  const d = down;
  down = null;
  if (d.prop && drag) { dropProp(drag, e); drag = null; return; }
  drag = null;
  if (d.dragging) { jc.dragEnd(); return; }
  if (d.hit === 'peek') { jc.unpeek(); return; } // 点一下展开
  // 正在吃饭：点一下自己的小动物，或者点碗附近，就吃完了
  if (shared['eat_' + st.me]) {
    const [x, y] = px(e);
    const bowl = room.spots[myBowl()];
    const nearBowl = bowl && Math.hypot(x - bowl[0], y - bowl[1]) < 12;
    if (d.hit === st.me || d.hit === myBowl() || nearBowl) { finishMeal(); return; }
  }
  click(d.hit);
});

function finishMeal() {
  updateShared({ ['eat_' + st.me]: false });
  bubble(st.me, '吃饱啦～', null, 2500);
}

function dropProp(dr, e) {
  const hit = hitAt(e);
  if (dr.item === 'bag') {
    // 只能倒进自己的碗
    const spot = room.spots[myBowl()];
    const near = spot && Math.hypot(dr.x - spot[0], dr.y - spot[1]) < 9;
    if (hit === myBowl() || near) {
      updateShared({ ['eat_' + st.me]: true });
      bubble(st.me, '🍚 去吃饭啦', null, 3000);
      jc.earnFirst('meal');
    }
    return;
  }
  if (dr.item === 'toy') {
    const j = room.heads.jelly;
    const nearJelly = j && Math.hypot(dr.x - j[0], dr.y - (j[1] + 8)) < 12;
    if (hit === 'jelly' || nearJelly) {
      if (!(st.cat.online && st.jelly.online)) { bubble(st.me, '要等 TA 也在线哦', null, 2500); return; }
      updateShared({ toy: 'jelly', massage: true, eat_cat: false, eat_jelly: false });
      jc.earnFirst('massage');
    }
  }
}

function click(hit) {
  if (hit === 'piggy') { jc.openShop(); return; } // 小猪存钱罐 = 小卖部
  if (hit === 'drawer') {
    // 抽屉：开着的时候再点一下，一切恢复原样
    if (shared.drawerOpen) updateShared({ drawerOpen: false, toy: 'drawer', massage: false });
    else { updateShared({ drawerOpen: true }); jc.earnFirst('drawer'); }
    return;
  }
  if (shared.massage && (hit === 'jelly' || hit === 'toy')) {
    updateShared({ fastUntil: Date.now() + 3000 }); // 加速一会儿
    return;
  }
  if (shared.massage && hit === 'cat') {
    const text = COMFY[Math.floor(Math.random() * COMFY.length)];
    bubble('cat', text, null, 2500);
    jc.sendAct({ kind: 'comfy', text });
    jc.earnFirst('comfy');
    return;
  }
  if (hit === st.me) openInput('msg');
  else if (hit === partner() && st[partner()].online) {
    hearts.push({ who: partner(), t0: performance.now() });
    jc.poke();
    jc.earnFirst('poke');
  }
}

cv.addEventListener('dblclick', (e) => {
  const hit = hitAt(e);
  if (hit === 'tv') {
    // 双击电视：两个人的 Chrome 都打开 B 站，两只先去电视前等着
    updateShared({ tvWaitUntil: Date.now() + 120000 });
    jc.tvTogether();
    bubble(st.me, '📺 一起看 B 站吧', null, 4000);
    jc.earnFirst('tv');
  }
  if (hit === myBowl() && shared['eat_' + st.me]) finishMeal();
});
window.addEventListener('contextmenu', (e) => { e.preventDefault(); jc.menu(); });

// ---------- 输入框 ----------
function openInput(mode, prefill = '') {
  inputMode = mode;
  inputOpen = true;
  input.value = prefill;
  input.placeholder = mode === 'meeting' ? '粘贴会议链接，回车发送' : '说点什么，回车发送';
  input.style.display = 'block';
  setSolid(true);
  placeBubbles();
  setTimeout(() => input.focus(), 0);
}
function closeInput() {
  inputOpen = false;
  input.style.display = 'none';
  input.blur();
}
jc.onInput(({ mode, prefill }) => openInput(mode, prefill));
input.addEventListener('keydown', (e) => {
  if (e.isComposing) return; // 中文输入法选字时的回车不算
  if (e.key === 'Escape') { closeInput(); return; }
  if (e.key !== 'Enter') return;
  const v = input.value.trim();
  if (v) {
    if (inputMode === 'meeting') {
      if (/^https?:\/\//.test(v)) { jc.sendMeeting(v); bubble(st.me, '📞 叫 TA 开会'); }
      else { input.value = ''; input.placeholder = '要以 http 开头的链接'; return; }
    } else {
      jc.sendMsg(v);
      bubble(st.me, v);
      gudu(0.04);
      jc.earnFirst('msg');
    }
  }
  closeInput();
});
input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) closeInput(); }, 100));

// 给自动化测试用的入口（不影响正常使用）
window.__jc = { click, dropProp, updateShared, shared: () => shared, room, st: () => st, peek: () => peek };

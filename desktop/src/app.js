import { createRoom, W, H } from './room.js';

const jc = window.jc;
const room = createRoom();
const cv = document.getElementById('room');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
const img = ctx.createImageData(W, H);
const input = document.getElementById('input');
const badge = document.getElementById('badge');

let scale = 2;
let inputOpen = false; // 输入框开着吗
let inputMode = 'msg';
let k = 2; // 每个原始像素在页面上占多少 CSS 像素
let st = {
  me: 'cat', connected: false, configured: false, hour: new Date().getHours(),
  cat: { online: true, activity: null, together: false },
  jelly: { online: false, activity: null, together: false },
};
const partner = () => (st.me === 'cat' ? 'jelly' : 'cat');

// ---------- 尺寸：保证每个像素在屏幕上是整数个物理像素 ----------
function layout() {
  const dpr = window.devicePixelRatio || 1;
  const phys = Math.max(1, Math.round(scale * dpr));
  k = phys / dpr;
  cv.style.width = W * k + 'px';
  cv.style.height = H * k + 'px';
  jc.resize(Math.round(W * k), Math.round(H * k));
}
jc.getConfig().then((c) => { scale = c.scale || 2; layout(); });
jc.onScale((s) => { scale = s; layout(); });
window.matchMedia('(resolution: 1dppx)').addEventListener?.('change', layout);

// ---------- 状态 ----------
jc.onState((s) => {
  st = s;
  if (!s.configured) showBadge('右键 → 设置');
  else if (!s.connected) showBadge(s.error || '连接中…');
  else showBadge(null);
});
function showBadge(t) { badge.style.display = t ? 'block' : 'none'; badge.textContent = t || ''; }

// ---------- 气泡 ----------
const bubbles = []; // { who, el, until, url }
function bubble(who, text, url, ms) {
  // 同一个人只留最新的一个
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
// 角色不在家时，气泡挂在它房间的中间
const FALLBACK = { cat: [74, 95], jelly: [116, 85] };
function anchor(who) { return room.heads[who] || FALLBACK[who]; }
function placeBubbles() {
  const now = performance.now();
  for (const b of [...bubbles]) {
    if (now > b.until) { removeBubble(b); continue; }
    let [x, y] = anchor(b.who);
    // 一起看电视时两只挨得很近，气泡往各自外侧让一让，别挡住电视
    if (st.cat.together && room.heads[b.who]) x += b.who === 'cat' ? -10 : 10;
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
  if (m.text) bubble(m.who, m.text, m.url);
});
jc.onLocalBubble((m) => bubble(m.who, m.text));

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
function frame() {
  const now = performance.now();
  st.hour = new Date().getHours();
  const buf = room.render(st, now);
  drawHearts(buf, now);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  placeBubbles();
}
setInterval(frame, 50); // 20 帧，像素画够了，也省电
frame();

// ---------- 鼠标：只在房间上接住鼠标，透明的地方点穿 ----------
let solid = null;
function setSolid(s) { if (s !== solid) { solid = s; jc.setSolid(s); } }
let down = null;

function hitAt(e) { return room.hitTest(e.clientX / k, e.clientY / k); }

window.addEventListener('mousemove', (e) => {
  if (down) {
    if (!down.dragging && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 3) { down.dragging = true; jc.dragStart(); }
    if (down.dragging) jc.dragMove();
    return;
  }
  const overUi = e.target !== cv && e.target !== document.body && e.target !== document.documentElement;
  const hit = hitAt(e);
  setSolid(!!hit || overUi || inputOpen);
  cv.style.cursor = hit === st.me || hit === partner() ? 'pointer' : hit ? 'grab' : 'default';
});
document.addEventListener('mouseleave', () => { if (!down && !inputOpen) setSolid(false); });

cv.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const hit = hitAt(e);
  if (!hit) return;
  down = { x: e.screenX, y: e.screenY, hit, dragging: false };
});
window.addEventListener('mouseup', (e) => {
  if (!down) return;
  const d = down;
  down = null;
  if (d.dragging) { jc.dragEnd(); return; }
  if (d.hit === st.me) openInput('msg');
  else if (d.hit === partner() && st[partner()].online) {
    hearts.push({ who: partner(), t0: performance.now() });
    jc.poke();
  }
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
    }
  }
  closeInput();
});
input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) closeInput(); }, 100));

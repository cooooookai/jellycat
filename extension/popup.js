// 弹窗：一个小场景 + 两张卡片 + 设置
const $ = (id) => document.getElementById(id);
const ICON = { cat: '🐈‍⬛', jelly: '🪼' };
let st = null;

// ================= 像素小场景（占位美术，以后换成正式的） =================
const PAL = {
  k: '#0b0a0f', K: '#2a2733', y: '#f5d76e', p: '#e78fa8',
  j: '#9fd8e8', J: '#6fb3cc', w: '#eafaff', e: '#1b2a3a', l: '#7cc4dc',
  b: '#6b4a32', B: '#8a6342', s: '#14131b',
  z: '#cfc8e0',
};
const CAT = [
  [
    '.k.....k..',
    '.kk...kk..',
    '.kkkkkkk..',
    '.kykkkyk..',
    '.kkkpkkk..',
    '..kkkkk...',
    '.kkkkkkk..',
    '.kkkkkkk.k',
    '.kkkkkkkk.',
    '..kk.kk...',
  ],
  [
    '.k.....k..',
    '.kk...kk..',
    '.kkkkkkk..',
    '.kykkkyk..',
    '.kkkpkkk..',
    '..kkkkk...',
    '.kkkkkkk.k',
    '.kkkkkkk.k',
    '.kkkkkkkk.',
    '..kk.kk...',
  ],
];
const JELLY = [
  [
    '..jjjjj..',
    '.jjwjjjj.',
    'jjwjjjjjj',
    'jjejjjejj',
    'JjjjjjjjJ',
    '.l.l.l.l.',
    '.l.l.l.l.',
    'l..l.l..l',
    '..l...l..',
  ],
  [
    '.........',
    '..jjjjj..',
    '.jjwjjjj.',
    'jjejjjejj',
    'JJjjjjjJJ',
    'l.l.l.l.l',
    '.l..l..l.',
    '.l.l.l.l.',
    '..l...l..',
  ],
];
const NPC = [
  'o.ooo.o',
  '.ooooo.',
  'ooeoeoo',
  '.ooooo.',
  '.o.o.o.',
];
// AI 住客的颜色（占位）
const NPC_COLOR = { claude: '#d97757', gpt: '#e9e9e9', kimi: '#4c7dff', doubao: '#7b6cff' };

function blit(ctx, rows, x, y, pal = PAL, alpha = 1, flip = false) {
  ctx.globalAlpha = alpha;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[flip ? row.length - 1 - c : c];
      if (ch === '.') continue;
      ctx.fillStyle = pal[ch] || ch;
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  });
  ctx.globalAlpha = 1;
}

function drawNpc(ctx, kind, x, y, t) {
  const color = NPC_COLOR[kind];
  if (!color) return;
  const bob = Math.floor(t / 400) % 2;
  blit(ctx, NPC, x, y + bob, { o: color, e: '#111' });
}

function drawZ(ctx, x, y, t) {
  const f = Math.floor(t / 600) % 3;
  ctx.fillStyle = PAL.z;
  for (let i = 0; i <= f; i++) {
    const zx = x + i * 4, zy = y - i * 5;
    ctx.fillRect(zx, zy, 4, 1); ctx.fillRect(zx + 2, zy + 1, 1, 1); ctx.fillRect(zx + 1, zy + 2, 1, 1); ctx.fillRect(zx, zy + 3, 4, 1);
  }
}

function drawScene(t) {
  const c = $('scene');
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0f0e14';
  ctx.fillRect(0, 0, 112, 64);

  // 墙和地板
  ctx.fillStyle = '#2e2b3f'; ctx.fillRect(0, 0, 112, 44);
  ctx.fillStyle = '#4a3c55'; ctx.fillRect(0, 44, 112, 20);
  ctx.fillStyle = '#5c4b69'; ctx.fillRect(0, 44, 112, 1);
  // 地毯
  ctx.fillStyle = '#6a4f73'; ctx.fillRect(22, 52, 68, 8);
  ctx.fillStyle = '#7d5f86'; ctx.fillRect(24, 54, 64, 4);

  const meWho = (st && st.cfg.who) || 'cat';
  const pWho = meWho === 'cat' ? 'jelly' : 'cat';
  const acts = {
    [meWho]: st ? st.me.activity : null,
    [pWho]: st && st.partner.online ? st.partner.activity : 'gone',
  };
  const together = !!(st && st.me.page && st.partner.page && st.me.page.key === st.partner.page.key);
  const anyBili = together || acts.cat === 'bili' || acts.jelly === 'bili';

  // 电视
  const tx = 47, ty = 22;
  ctx.fillStyle = PAL.b; ctx.fillRect(tx - 2, ty + 14, 22, 8);
  ctx.fillStyle = PAL.B; ctx.fillRect(tx - 2, ty + 14, 22, 1);
  ctx.fillStyle = '#26232f'; ctx.fillRect(tx, ty, 18, 14);
  if (anyBili) {
    const f = Math.floor(t / 250) % 4;
    const screens = ['#4fb7e6', '#5cc6ef', '#e78fa8', '#6ad0f0'];
    ctx.fillStyle = together ? screens[f] : '#3a6a85';
    ctx.fillRect(tx + 2, ty + 2, 14, 10);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(tx + 2, ty + 2 + (f * 3) % 10, 14, 1);
    if (together) { // 屏幕光洒到地上
      ctx.fillStyle = 'rgba(110,200,240,.08)'; ctx.fillRect(tx - 18, 44, 54, 20);
    }
  } else {
    ctx.fillStyle = '#121119'; ctx.fillRect(tx + 2, ty + 2, 14, 10);
  }
  ctx.fillStyle = '#26232f'; ctx.fillRect(tx + 8, ty - 3, 1, 3); ctx.fillRect(tx + 5, ty - 4, 2, 1); ctx.fillRect(tx + 10, ty - 4, 2, 1);

  // 小黑猫（左）
  const ca = acts.cat;
  if (ca !== 'gone') {
    const frame = CAT[Math.floor(t / 700) % 2].slice();
    const blink = (t % 4000) < 150 || ca === 'sleep';
    const rows = blink ? frame.map((r) => r.replace(/y/g, 'k')) : frame;
    const cx = together ? 30 : 18;
    blit(ctx, rows, cx, 42, PAL, ca === 'away' ? 0.45 : 1);
    if (ca === 'sleep') drawZ(ctx, cx + 9, 38, t);
    drawNpc(ctx, ca, cx - 9, 47, t);
  }

  // 小水母（右）
  const ja = acts.jelly;
  if (ja !== 'gone') {
    const frame = JELLY[Math.floor(t / 500) % 2];
    const float = Math.round(Math.sin(t / 700) * 2);
    const jx = together ? 72 : 84;
    blit(ctx, frame, jx, 36 + float, PAL, ja === 'away' ? 0.45 : ja === 'sleep' ? 0.7 : 1);
    if (ja === 'sleep') drawZ(ctx, jx + 9, 32, t);
    drawNpc(ctx, ja, jx + 11, 47, t);
  }
}

function loop(t) { drawScene(t); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

// ================= 状态 =================
const ACT_TEXT = { gpt: '在和 GPT 干活', claude: '在和 Claude 搭积木', kimi: '在和 Kimi 聊', doubao: '在和豆包聊天', bili: '在逛 B 站', web: '在上网', away: '在浏览器外面忙', sleep: '睡着了', game: '在打游戏', meeting: '在开会', work: '在电脑前忙' };

function render(s) {
  st = s;
  const meWho = s.cfg.who, pWho = meWho === 'cat' ? 'jelly' : 'cat';
  $('meIcon').textContent = ICON[meWho];
  $('partnerIcon').textContent = ICON[pWho];

  const ok = s.connected;
  $('status').classList.toggle('ok', ok);
  $('statusText').textContent = !s.configured ? '打开桌面小房间会自动配好'
    : ok ? `已连上${s.rtt != null ? ' · ' + s.rtt + 'ms' : ''}${s.partner.online ? ' · TA 在线' : ' · TA 不在线'}`
    : (s.error || '连接中…');

  const pp = s.partner.page;
  const msg = s.partner.msg && Date.now() - s.partner.msg.at < 10 * 60 * 1000 ? s.partner.msg.text : null;
  $('partnerTitle').textContent = !s.partner.online ? '不在线'
    : pp ? pp.title || pp.url
    : msg ? '💬 ' + msg
    : ACT_TEXT[s.partner.activity] || '—';
  const together = pp && s.me.page && pp.key === s.me.page.key;
  $('btnGoto').disabled = !(ok && pp) || together;
  $('btnGoto').textContent = together ? '正在一起看 ♡' : '去 TA 那里 →';

  $('meTitle').textContent = s.me.page ? s.me.page.title || s.me.page.url : '没在看视频';
  $('btnCall').disabled = !(ok && s.partner.online && s.me.page) || together;

  const inv = s.partner.invite;
  const showInv = inv && inv.page && Date.now() - inv.at < 10 * 60 * 1000 && !(s.me.page && s.me.page.key === inv.page.key);
  $('inviteBox').hidden = !showInv;
  if (showInv) {
    $('inviteWho').textContent = ICON[pWho];
    $('inviteTitle').textContent = inv.page.title || inv.page.url;
  }

  
}

async function fillSettings() {
  const c = await chrome.storage.local.get(['server', 'room', 'secret', 'who']);
  $('server').value = c.server || 'ws://localhost:8787';
  $('room').value = c.room || '';
  $('secret').value = c.secret || '';
  const who = c.who || 'cat';
  document.querySelector(`input[name=who][value=${who}]`).checked = true;
}

$('btnSave').onclick = async () => {
  const who = document.querySelector('input[name=who]:checked').value;
  await chrome.storage.local.set({
    server: $('server').value.trim(),
    room: $('room').value.trim(),
    secret: $('secret').value,
    who,
  });
  $('settings').open = false;
};
$('btnGoto').onclick = () => chrome.runtime.sendMessage({ t: 'goto' }).then(() => window.close());
$('btnInvite').onclick = () => chrome.runtime.sendMessage({ t: 'gotoInvite' }).then(() => window.close());
$('btnCall').onclick = async () => {
  const sent = await chrome.runtime.sendMessage({ t: 'invite' });
  $('btnCall').textContent = sent ? '已叫 ♡' : '没发出去';
  setTimeout(() => ($('btnCall').textContent = '叫 TA 来看'), 2000);
};

chrome.runtime.onMessage.addListener((m) => { if (m.t === 'status') render(m.status); });
chrome.runtime.sendMessage({ t: 'getStatus' }).then((s) => s && render(s));
fillSettings();

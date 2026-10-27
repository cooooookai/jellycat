// 游戏厅：大厅 + 邀请 / 接受，具体的游戏在 games/ 里。
// 所有消息都走 { t:'act', kind:'game', g, op, sid, ... }，两个人的窗口各自跑一份逻辑。
import * as draw from './games/draw.js';
import * as bomb from './games/bomb.js';
import * as luck from './games/luck.js';

const api = window.jc;
const $ = (id) => document.getElementById(id);
export const ICON = { cat: '🐈‍⬛', jelly: '🪼' };
const NAME = { cat: '小黑猫', jelly: '小水母' };
const GAMES = { draw, bomb, luck };

let status = { me: 'cat', connected: false, partnerOnline: false };
const partnerOf = (w) => (w === 'cat' ? 'jelly' : 'cat');

let view = 'lobby'; // lobby | waiting | game
let outgoing = null; // 我发出的邀请 { g, sid }
let incoming = null; // TA 发来的邀请 { g, sid }
let current = null; // { g, sid, host, inst }

const newSid = () => Math.random().toString(36).slice(2, 10);
function send(g, op, data = {}) { api.gameSend({ g, op, ...data }); }

// ---------- 顶部 ----------
function renderHeader() {
  const p = partnerOf(status.me);
  $('meTag').textContent = `我是 ${ICON[status.me]}`;
  $('pTag').textContent = `${ICON[p]} ${status.partnerOnline ? '在线' : '不在线'}`;
  $('pDot').className = 'dot' + (status.partnerOnline ? ' on' : '');
}

// ---------- 大厅 ----------
function renderLobby() {
  view = 'lobby';
  const m = $('main');
  m.innerHTML = '';
  if (incoming) {
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = `<span>${ICON[partnerOf(status.me)]} 想和你玩 <b></b></span><span class="row"><button class="gold">来！</button><button class="ghost">下次</button></span>`;
    b.querySelector('b').textContent = GAMES[incoming.g].META.name;
    const [yes, no] = b.querySelectorAll('button');
    yes.onclick = () => { const inv = incoming; incoming = null; send(inv.g, 'accept', { sid: inv.sid }); startGame(inv.g, inv.sid, false); };
    no.onclick = () => { send(incoming.g, 'decline', { sid: incoming.sid }); incoming = null; renderLobby(); };
    m.appendChild(b);
  }
  const list = document.createElement('div');
  list.className = 'machines';
  for (const [id, mod] of Object.entries(GAMES)) {
    const el = document.createElement('div');
    el.className = 'machine';
    el.innerHTML = `<div class="icon">${mod.META.icon}</div><div><b></b><p></p></div>`;
    el.querySelector('b').textContent = mod.META.name;
    el.querySelector('p').textContent = mod.META.desc;
    el.onclick = () => invite(id);
    list.appendChild(el);
  }
  m.appendChild(list);
  const tip = document.createElement('p');
  tip.className = 'hint';
  tip.style.marginTop = '14px';
  tip.textContent = status.partnerOnline
    ? '点一台机器叫 TA 来玩。TA 那边会收到邀请，点「来！」就开始。'
    : 'TA 现在不在线。三个游戏都要两个人同时在线才能玩。';
  m.appendChild(tip);
}

function invite(g) {
  if (!status.partnerOnline) { toast('TA 现在不在线'); return; }
  outgoing = { g, sid: newSid() };
  send(g, 'invite', { sid: outgoing.sid });
  renderWaiting();
}

function renderWaiting() {
  view = 'waiting';
  const m = $('main');
  m.innerHTML = `<div class="waiting"><div class="big">${ICON[partnerOf(status.me)]}</div><p>等 TA 来玩 <b></b>…</p><button class="ghost">不等了</button></div>`;
  m.querySelector('b').textContent = GAMES[outgoing.g].META.name;
  m.querySelector('button').onclick = () => { send(outgoing.g, 'cancel', { sid: outgoing.sid }); outgoing = null; renderLobby(); };
}

// ---------- 游戏 ----------
function startGame(g, sid, host) {
  outgoing = null;
  view = 'game';
  const m = $('main');
  m.innerHTML = '';
  const ctx = {
    me: status.me,
    partner: partnerOf(status.me),
    host,
    icon: ICON,
    name: NAME,
    send: (op, data = {}) => send(g, op, { sid, ...data }),
    exit: () => leaveGame(true),
    toast,
    earn: () => api.earnGame(g),
  };
  const bar = document.createElement('div');
  bar.className = 'gamebar';
  bar.innerHTML = `<span class="title">${GAMES[g].META.icon} </span><button class="ghost">← 回大厅</button>`;
  bar.querySelector('.title').append(GAMES[g].META.name);
  bar.querySelector('button').onclick = () => leaveGame(true);
  m.appendChild(bar);
  const box = document.createElement('div');
  m.appendChild(box);
  current = { g, sid, host, inst: GAMES[g].mount(box, ctx) };
}

function leaveGame(tell) {
  if (current) {
    if (tell) send(current.g, 'leave', { sid: current.sid });
    try { current.inst && current.inst.destroy && current.inst.destroy(); } catch {}
    current = null;
  }
  renderLobby();
}

// ---------- 收消息 ----------
api.onGame((m) => {
  if (m.from === status.me) return;
  if (m.g === 'hall') {
    // TA 刚打开游戏厅：我有没回应的邀请就再发一次
    if (m.op === 'hello' && outgoing) send(outgoing.g, 'invite', { sid: outgoing.sid });
    return;
  }
  if (!GAMES[m.g]) return;
  switch (m.op) {
    case 'invite':
      if (current) return; // 正在玩别的
      if (outgoing && outgoing.g === m.g) {
        // 两个人同时点了同一台机器：直接开始，sid 小的那个算数
        const sid = outgoing.sid < m.sid ? outgoing.sid : m.sid;
        const host = sid === outgoing.sid;
        send(m.g, 'accept', { sid });
        startGame(m.g, sid, host);
        return;
      }
      incoming = { g: m.g, sid: m.sid };
      if (view === 'lobby') renderLobby();
      return;
    case 'accept':
      if (current && current.sid === m.sid) return;
      if (outgoing && outgoing.sid === m.sid) startGame(m.g, m.sid, true);
      return;
    case 'decline':
      if (outgoing && outgoing.sid === m.sid) { outgoing = null; renderLobby(); toast('TA 说下次再玩'); }
      return;
    case 'cancel':
      if (incoming && incoming.sid === m.sid) { incoming = null; if (view === 'lobby') renderLobby(); }
      return;
    case 'leave':
      if (current && current.sid === m.sid) { leaveGame(false); toast('TA 回大厅了'); }
      return;
  }
  if (current && current.sid === m.sid && current.inst && current.inst.onMsg) current.inst.onMsg(m);
});

api.onGameStatus((s) => {
  const wasOnline = status.partnerOnline;
  status = s;
  renderHeader();
  if (wasOnline && !s.partnerOnline) {
    if (current) { leaveGame(false); toast('TA 掉线了'); }
    else if (outgoing) { outgoing = null; renderLobby(); }
    incoming = null;
    if (view === 'lobby') renderLobby();
  } else if (!wasOnline && s.partnerOnline && view === 'lobby') renderLobby();
});

window.addEventListener('beforeunload', () => {
  if (current) send(current.g, 'leave', { sid: current.sid });
  if (outgoing) send(outgoing.g, 'cancel', { sid: outgoing.sid });
});

// ---------- 小提示 ----------
let toastTimer = null;
function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2200);
}

api.gameStatus().then((s) => {
  status = s;
  renderHeader();
  renderLobby();
  api.gameSend({ g: 'hall', op: 'hello' });
});

// 给自动化测试用
window.__games = { startGame, status: () => status, current: () => current };

// 后台：保持和中继服务器的连接，在你的 B 站标签页和 TA 之间传话。
const DEFAULTS = { server: 'ws://localhost:8787', room: '', secret: '', who: 'cat' };

let cfg = { ...DEFAULTS };
let ws = null;
let connected = false;
let lastError = '';
let rtt = null; // 毫秒
let retryDelay = 1000;
let retryTimer = null;
let pingTimer = null;
const pending = new Map(); // ping id -> 发送时间

const ports = new Map(); // tabId -> { port, key, page }
let myTabId = null; // 我"正在看"的标签页
let myPage = null;
let myActivity = null;
const partner = { online: false, who: null, page: null, activity: null, invite: null, msg: null };
// TA 的每台设备：ext = 插件，desk = 桌面小房间
const partnerDevs = new Map(); // dev -> { page, activity }

function recomputePartner() {
  const ext = partnerDevs.get('ext');
  const desk = partnerDevs.get('desk');
  partner.online = partnerDevs.size > 0;
  partner.page = ext ? ext.page : null;
  // 桌面端知道 TA 在不在浏览器里，所以它说的更准
  partner.activity = (desk && desk.activity) || (ext && ext.activity) || null;
}

// ---------- 配置 ----------
async function loadCfg() {
  cfg = { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (!Object.keys(changes).some((k) => k in DEFAULTS)) return;
  await loadCfg();
  reconnect();
});

// ---------- 连接 ----------
function configured() { return !!(cfg.server && cfg.room && cfg.secret); }

function connect() {
  if (!configured()) { lastError = '还没填设置'; pushStatus(); return; }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(retryTimer);
  let sock;
  try { sock = new WebSocket(cfg.server); } catch (e) { lastError = '服务器地址不对'; pushStatus(); return scheduleRetry(); }
  ws = sock;
  sock.onopen = () => {
    retryDelay = 1000;
    lastError = '';
    sendRaw({ t: 'hello', room: cfg.room, secret: cfg.secret, who: cfg.who, dev: 'ext' });
  };
  sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onServer(m); };
  sock.onerror = () => { lastError = '连不上服务器'; };
  sock.onclose = () => {
    if (ws !== sock) return;
    connected = false;
    partnerDevs.clear();
    recomputePartner();
    clearInterval(pingTimer);
    pushStatus();
    scheduleRetry();
  };
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30000);
}

function reconnect() {
  if (ws) { const old = ws; ws = null; try { old.close(); } catch {} }
  connected = false;
  retryDelay = 1000;
  connect();
}

function sendRaw(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(obj)); return true; }
  return false;
}

// 发给 TA，带上我这边的单程延迟估计
function toPartner(obj) {
  return sendRaw({ ...obj, lat: rtt == null ? 100 : rtt / 2 });
}

function ping() {
  const id = Math.random().toString(36).slice(2, 8);
  pending.set(id, performance.now());
  sendRaw({ t: 'ping', id });
  // 太久没回的 ping 清掉
  for (const [k, t] of pending) if (performance.now() - t > 20000) pending.delete(k);
}

function onServer(m) {
  switch (m.t) {
    case 'welcome': {
      connected = true;
      partnerDevs.clear();
      for (const p of m.peers || []) {
        if (p.who === cfg.who) continue; // 我自己的桌面端
        partner.who = p.who;
        partnerDevs.set(p.dev, { page: p.page, activity: p.activity });
      }
      recomputePartner();
      clearInterval(pingTimer);
      pingTimer = setInterval(ping, 10000); // 顺便让 service worker 保持清醒
      ping();
      // 告诉 TA 我现在在哪
      if (myPage) toPartner({ t: 'page', page: myPage });
      if (myActivity) toPartner({ t: 'activity', activity: myActivity });
      pushStatus();
      break;
    }
    case 'error':
      lastError = m.msg || '服务器拒绝了';
      pushStatus();
      break;
    case 'pong': {
      const t0 = pending.get(m.id);
      if (t0 != null) {
        pending.delete(m.id);
        const sample = performance.now() - t0;
        rtt = Math.round(rtt == null ? sample : rtt * 0.7 + sample * 0.3);
        pushStatus();
      }
      break;
    }
    case 'peer':
      if (m.who === cfg.who) break;
      partner.who = m.who;
      if (m.online) partnerDevs.set(m.dev, { page: m.page || null, activity: m.activity || null });
      else partnerDevs.delete(m.dev);
      recomputePartner();
      pushStatus();
      break;
    case 'page':
    case 'activity': {
      if (m.from === cfg.who) break;
      const d = partnerDevs.get(m.dev) || {};
      d[m.t] = m[m.t] || null;
      partnerDevs.set(m.dev, d);
      recomputePartner();
      pushStatus();
      break;
    }
    case 'msg':
      if (m.from !== cfg.who) { partner.msg = { text: String(m.text || '').slice(0, 200), at: Date.now() }; pushStatus(); }
      break;
    case 'act':
      if (m.kind === 'tv') openTv(); // 有人双击了小房间里的电视
      break;
    case 'invite':
      if (m.kind === 'auto') { // TA 那边开播了：一起看模式下直接跟过去
        if (Date.now() < watchUntil && !(myPage && m.page && myPage.key === m.page.key)) gotoPage(m.page, m.time, true);
        break;
      }
      if (m.kind && m.kind !== 'watch') break; // 开会邀请交给桌面端
      partner.invite = { page: m.page, at: Date.now() };
      // TA 叫我一起看：我没在放别的视频，就直接跟过去；正在看别的就只弹通知，不打断
      if (m.page && !(myPage && myPage.key === m.page.key) && !amPlaying()) { gotoPage(m.page, m.time); pushStatus(); break; }
      if (m.page) {
        chrome.notifications.create('invite', {
          type: 'basic',
          iconUrl: 'icons/128.png',
          title: (m.from === 'jelly' ? '🪼 小水母' : '🐈‍⬛ 小黑猫') + ' 叫你一起看',
          message: m.page.title || m.page.url,
          priority: 2,
        });
      }
      pushStatus();
      break;
    case 'ctl':
    case 'hb':
    case 'buf':
    case 'need':
      // 只转给正在看同一个视频的标签页
      for (const { port, key } of ports.values()) {
        if (key && key === m.key) port.postMessage({ ...m, rlat: rtt == null ? 100 : rtt / 2 });
      }
      break;
  }
}

// ---------- 和 B 站页面通信 ----------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sync' || !port.sender || !port.sender.tab) return;
  const tabId = port.sender.tab.id;
  ports.set(tabId, { port, key: null, page: null });

  port.onMessage.addListener((m) => {
    const entry = ports.get(tabId);
    if (!entry) return;
    switch (m.t) {
      case 'page': {
        if ((m.page ? m.page.key : null) !== entry.key) entry.pageAt = Date.now();
        entry.key = m.page ? m.page.key : null;
        entry.page = m.page;
        // 当前标签页、正在播放、或者我原来那个标签页换了视频 → 它就是"我在看的"
        if (m.active || m.playing || myTabId === tabId || myTabId == null) setMyTab(tabId);
        // 如果 TA 正在看同一个视频，要一下进度
        if (entry.key && partner.page && partner.page.key === entry.key && m.fresh) toPartner({ t: 'need', key: entry.key });
        break;
      }
      case 'ctl':
      case 'hb':
      case 'buf':
        if (m.t === 'ctl' && myTabId !== tabId) setMyTab(tabId);
        toPartner(m);
        break;
      case 'state': // 这个标签页的播放状态（只留在本地）
        entry.last = { playing: m.playing, time: m.time, at: Date.now() };
        if (m.playing && Date.now() < watchUntil) maybeShare(tabId, m);
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    ports.delete(tabId);
    if (myTabId === tabId) {
      // 换成剩下的某个 B 站标签页，没有就是"不在看"
      const rest = [...ports.entries()].find(([, e]) => e.page);
      setMyTab(rest ? rest[0] : null);
    }
  });
});

function setMyTab(tabId) {
  myTabId = tabId;
  const page = tabId != null && ports.get(tabId) ? ports.get(tabId).page : null;
  const changed = JSON.stringify(page) !== JSON.stringify(myPage);
  myPage = page;
  if (changed) { toPartner({ t: 'page', page: myPage }); pushStatus(); }
}

// ---------- 双击电视 → 一起看模式 ----------
// 两边的浏览器都打开 B 站；谁先播放一个视频满 3 秒，对方就自动打开同一个视频、同一个进度
let watchUntil = 0;
let watchStart = 0;
let tvTabId = null;
let sharedKey = null;
let shareTimer = null;

function amPlaying() {
  for (const e of ports.values()) if (e.last && e.last.playing && Date.now() - e.last.at < 3000) return true;
  return false;
}
function saveTv() { chrome.storage.session?.set({ tv: { watchStart, watchUntil, tvTabId } }).catch?.(() => {}); }
chrome.storage.session?.get('tv').then((d) => {
  const tv = d && d.tv;
  if (tv && tv.watchUntil > Date.now() && !watchUntil) ({ watchStart, watchUntil, tvTabId } = tv);
}).catch(() => {});

async function openTv() {
  watchStart = Date.now();
  watchUntil = watchStart + 10 * 60 * 1000;
  sharedKey = null;
  saveTv();
  try {
    const tab = await chrome.tabs.create({ url: 'https://www.bilibili.com/', active: true });
    tvTabId = tab.id;
    saveTv();
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {}
}

function maybeShare(tabId, m) {
  const entry = ports.get(tabId);
  if (!entry || !entry.page || !m.key || m.key === sharedKey || shareTimer) return;
  if (!(entry.pageAt >= watchStart)) return; // 只看双击电视之后新打开的视频，旧标签页里在放的不算
  if (partner.page && partner.page.key === m.key) { sharedKey = m.key; return; } // TA 已经在看这个了
  const key = m.key;
  shareTimer = setTimeout(() => {
    shareTimer = null;
    const e = ports.get(tabId);
    if (!e || !e.page || e.page.key !== key || !e.last || !e.last.playing || Date.now() - e.last.at > 2500) return;
    sharedKey = key;
    if (myTabId !== tabId) setMyTab(tabId);
    toPartner({ t: 'invite', kind: 'auto', page: e.page, time: e.last.time });
  }, 3000);
}

// 一键去 TA 那里（time：从第几秒开始；useTv：用一起看模式打开的那个标签页）
async function gotoPage(page, time, useTv) {
  if (!page || !page.url) return;
  let url = page.url;
  if (time != null) { try { const u = new URL(url); u.searchParams.set('t', String(Math.floor(time))); url = u.toString(); } catch {} }
  if (useTv) sharedKey = page.key;
  // 已经开着同一个视频就直接切过去
  for (const [tabId, e] of ports) {
    if (e.key && e.key === page.key) {
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      toPartner({ t: 'need', key: page.key });
      return;
    }
  }
  if (useTv && tvTabId != null) {
    try {
      const tab = await chrome.tabs.update(tvTabId, { url, active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    } catch { tvTabId = null; }
  }
  const tab = await chrome.tabs.create({ url, active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  // 页面加载后，内容脚本会自己来要进度（fresh=true）
}

chrome.notifications.onClicked.addListener((id) => {
  if (id === 'invite' && partner.invite) gotoPage(partner.invite.page);
  chrome.notifications.clear(id);
});

// ---------- 活动识别（以后桌面房间里的 NPC 用） ----------
const ACTIVITY_RULES = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, 'gpt'],
  [/(^|\.)claude\.ai$/, 'claude'],
  [/(^|\.)kimi\.com$|(^|\.)kimi\.moonshot\.cn$/, 'kimi'],
  [/(^|\.)doubao\.com$/, 'doubao'],
  [/(^|\.)bilibili\.com$/, 'bili'],
];
let activityTimer = null;
let idleState = 'active';
let chromeFocused = true;

function classify(url) {
  try {
    const host = new URL(url).hostname;
    for (const [re, name] of ACTIVITY_RULES) if (re.test(host)) return name;
    return 'web';
  } catch { return 'web'; }
}

async function refreshActivity() {
  let act;
  if (idleState !== 'active') act = 'sleep';
  else if (!chromeFocused) act = 'away'; // 在浏览器外面忙
  else {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    act = tab && tab.url ? classify(tab.url) : 'web';
  }
  if (act !== myActivity) {
    myActivity = act;
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => { toPartner({ t: 'activity', activity: myActivity }); pushStatus(); }, 1500);
  }
}
chrome.tabs.onActivated.addListener(refreshActivity);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url) refreshActivity(); });
chrome.windows.onFocusChanged.addListener((winId) => {
  chromeFocused = winId !== chrome.windows.WINDOW_ID_NONE;
  refreshActivity();
});
if (chrome.idle) {
  chrome.idle.setDetectionInterval(300);
  chrome.idle.onStateChanged.addListener((s) => { idleState = s; refreshActivity(); });
}

// ---------- 弹窗 ----------
function status() {
  return {
    configured: configured(),
    connected,
    error: lastError,
    rtt,
    cfg: { server: cfg.server, room: cfg.room, who: cfg.who, hasSecret: !!cfg.secret },
    me: { who: cfg.who, page: myPage, activity: myActivity },
    partner: { ...partner },
  };
}
function pushStatus() {
  chrome.runtime.sendMessage({ t: 'status', status: status() }).catch(() => {});
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.tab) return; // 只处理弹窗的消息
  (async () => {
    if (m.t === 'getStatus') return reply(status());
    if (m.t === 'goto') { await gotoPage(partner.page); return reply(true); }
    if (m.t === 'gotoInvite') { await gotoPage(partner.invite && partner.invite.page); return reply(true); }
    if (m.t === 'invite') {
      const e = myTabId != null && ports.get(myTabId);
      const time = e && e.last && Date.now() - e.last.at < 5000 ? e.last.time : undefined;
      reply(toPartner({ t: 'invite', kind: 'watch', page: myPage, time }));
      return;
    }
    if (m.t === 'reconnect') { reconnect(); return reply(true); }
    reply(null);
  })();
  return true;
});

// ---------- 启动 ----------
chrome.alarms.create('keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'keepalive') { pullDesktopCfg(); connect(); } });

// 桌面小房间开着的话，直接用它的设置（配对一次，两边都好了）
async function pullDesktopCfg() {
  try {
    const r = await fetch('http://127.0.0.1:28787/config', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (!d || !d.room || !d.secret || !d.server) return;
    if (d.server === cfg.server && d.room === cfg.room && d.secret === cfg.secret && d.who === cfg.who) return;
    await chrome.storage.local.set({ server: d.server, room: d.room, secret: d.secret, who: d.who === 'jelly' ? 'jelly' : 'cat', fromDesktop: true });
  } catch {} // 桌面端没开，就用插件自己的设置
}
chrome.runtime.onStartup.addListener(() => {});
chrome.runtime.onInstalled.addListener(async () => {
  // 已经开着的 B 站页面重新注入内容脚本，省得要刷新
  const tabs = await chrome.tabs.query({ url: '*://www.bilibili.com/*' });
  for (const t of tabs) chrome.scripting?.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).catch(() => {});
});

loadCfg().then(async () => { await pullDesktopCfg(); connect(); refreshActivity(); });

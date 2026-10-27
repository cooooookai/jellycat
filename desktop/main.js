// 桌面小房间：一个透明、置顶、镂空的小窗口
const { app, BrowserWindow, ipcMain, screen, Menu, Tray, Notification, shell, powerMonitor, nativeImage, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { startRelay } = require('./relay.cjs');
const { Link } = require('./net');
const { Econ } = require('./econ');
const { pathToFileURL } = require('node:url');
const { classify, watchForeground } = require('./activity');

// 测试用：指定一个独立的配置目录，可以在一台电脑上同时开"猫"和"水母"
if (process.env.JC_PROFILE) app.setPath('userData', path.resolve(process.env.JC_PROFILE));
// 只允许开一个（同一个配置目录下）
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const NAME = { cat: '🐈‍⬛ 小黑猫', jelly: '🪼 小水母' };
const other = (w) => (w === 'cat' ? 'jelly' : 'cat');

// ---------- 配置 ----------
const CFG_FILE = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CFG = {
  server: '', room: '', secret: '', who: 'cat',
  hostServer: false, // 这台电脑自己当服务器（同一个 Wi-Fi 下用）
  scale: 2, hideInGame: true, games: [], x: null, y: null, period: 'auto',
};
let cfg = { ...DEFAULT_CFG };
function loadCfg() { try { cfg = { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')) }; } catch {} }
function saveCfg() { try { fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true }); fs.writeFileSync(CFG_FILE(), JSON.stringify(cfg, null, 2)); } catch {} }

// ---------- 内置服务器 ----------
const RELAY_PORT = 8787;
let relay = null;
let relayError = '';

function lanIp() {
  const nets = os.networkInterfaces();
  const all = [];
  for (const [name, list] of Object.entries(nets)) for (const n of list || []) {
    if (n.family === 'IPv4' && !n.internal) all.push({ name, addr: n.address });
  }
  // 优先家里常见的局域网地址
  const pick = all.find((a) => /^192\.168\./.test(a.addr)) || all.find((a) => /^10\./.test(a.addr)) || all.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a.addr)) || all[0];
  return pick ? pick.addr : '127.0.0.1';
}

async function syncRelay() {
  if (cfg.hostServer && !relay) {
    try { relay = await startRelay({ port: RELAY_PORT, host: '0.0.0.0', log: () => {} }); relayError = ''; }
    catch (e) { relay = null; relayError = e.code === 'EADDRINUSE' ? '端口 8787 被占用了' : '服务器没开起来'; }
  } else if (!cfg.hostServer && relay) {
    await relay.close(); relay = null;
  }
}

// 自己连哪里；配对码里给对方的又是哪里
const myServer = () => (cfg.hostServer ? `ws://127.0.0.1:${RELAY_PORT}` : cfg.server);
const sharedServer = () => (cfg.hostServer ? `ws://${lanIp()}:${RELAY_PORT}` : cfg.server);

// ---------- 配对码 ----------
// 一串文字里装着：服务器地址、房间号、密钥、生成的人是谁。对方粘贴就配好了。
const rand = (n) => crypto.randomBytes(n).toString('base64url').slice(0, n);
function makeCode() {
  if (!cfg.room || !cfg.secret) { cfg.room = rand(8); cfg.secret = rand(16); saveCfg(); }
  const payload = { v: 1, s: sharedServer(), r: cfg.room, k: cfg.secret, w: cfg.who };
  return 'JC-' + Buffer.from(JSON.stringify(payload)).toString('base64url');
}
function parseCode(code) {
  const m = String(code || '').trim().match(/JC-([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
    if (!p.s || !p.r || !p.k) return null;
    return p;
  } catch { return null; }
}

// ---------- 给 Chrome 插件的本机配置接口 ----------
// 插件启动时来问一下，就不用在插件里再填一遍。只回应 Chrome 插件的请求，网页拿不到。
const LOCAL_PORT = 28787;
function startLocalConfig() {
  const srv = http.createServer((req, res) => {
    const origin = req.headers.origin || '';
    // 有些浏览器的插件后台请求不带 Origin。允许：插件来源，或者完全没有 Origin 且 Host 就是本机这个端口
    //（网页跨站请求一定带 Origin；DNS 重绑定攻击的 Host 会是攻击者的域名，过不了这一关）
    const okOrigin = origin.startsWith('chrome-extension://') || (!origin && req.headers.host === `127.0.0.1:${LOCAL_PORT}`);
    if (!okOrigin || req.url !== '/config') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json', ...(origin ? { 'access-control-allow-origin': origin } : {}) });
    res.end(JSON.stringify(cfg.room && cfg.secret ? { server: myServer(), room: cfg.room, secret: cfg.secret, who: cfg.who } : {}));
  });
  srv.on('error', () => {});
  srv.listen(LOCAL_PORT, '127.0.0.1');
}

// ---------- 状态 ----------
const link = new Link();
let win = null;
let settingsWin = null;
let tray = null;
let fgClass = null;
let idle = false;
let myActivity = null;
let hiddenForGame = false;

function computeMine() {
  if (idle) return 'sleep';
  let c = fgClass;
  if (c === 'browser') {
    // 浏览器在最前面：插件知道你在看哪个网站
    const ext = link.dev(cfg.who, 'ext');
    c = ext && ext.activity && !['away', 'sleep'].includes(ext.activity) ? ext.activity : 'web';
  }
  return c || 'work';
}

function refreshMine() {
  const a = computeMine();
  if (a !== myActivity) {
    myActivity = a;
    link.send({ t: 'activity', activity: a });
    applyGameHide();
    if (a && a !== 'away') earnFirst('act:' + a);
  }
  pushState();
}

// ---------- 金币 ----------
let econ = null;
let catalog = null;
let shopWin = null;
const ymd = (d = new Date(), tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const paired = () => !!(cfg.room && cfg.secret);
function earnFirst(kind) {
  // 每天每种行动 / 状态第一次：随机 1～3 枚
  if (!econ || !paired()) return;
  const amt = catalog.EARN.firstMin + Math.floor(Math.random() * (catalog.EARN.firstMax - catalog.EARN.firstMin + 1));
  econ.earn(`first:${cfg.who}:${ymd()}:${kind}`, amt, cfg.who, kind);
}
function checkDaily() {
  if (!econ || !paired() || !link.connected) return;
  econ.earn('gift:welcome', catalog.EARN.welcome, cfg.who, 'welcome'); // 开张礼：两边算出来是同一笔
  econ.earn(`login:${cfg.who}:${ymd()}`, catalog.EARN.login, cfg.who, 'login');
  // 两个人当天都在线：用东京的日期算，两边算出来是同一笔，不会重复
  if (side(other(cfg.who)).online) econ.earn(`together:${ymd(new Date(), 'Asia/Tokyo')}`, catalog.EARN.together, cfg.who, 'together');
}
let econSyncTimer = null;
function pushEcon() {
  if (!econ) return;
  const v = econ.view();
  if (win && !win.isDestroyed()) win.webContents.send('econ', v);
  if (shopWin && !shopWin.isDestroyed()) shopWin.webContents.send('econ', v);
  clearTimeout(econSyncTimer);
  econSyncTimer = setTimeout(() => link.send({ t: 'act', kind: 'econ', state: econ.snapshot() }), 300);
}
async function initEcon() {
  catalog = await import(pathToFileURL(path.join(__dirname, 'src', 'catalog.mjs')).href);
  econ = new Econ(path.join(app.getPath('userData'), 'econ.json'), catalog);
  econ.on('change', pushEcon);
  econ.on('earned', (e) => { if (win && !win.isDestroyed()) win.webContents.send('earned', { who: e.who, amt: e.amt }); });
  pushEcon();
  checkDaily();
  setInterval(checkDaily, 60 * 1000);
}
function openShop() {
  if (shopWin && !shopWin.isDestroyed()) { shopWin.focus(); return; }
  shopWin = new BrowserWindow({
    width: 560, height: 680, minWidth: 460, minHeight: 500, title: '小卖部', backgroundColor: '#16151d',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  shopWin.loadFile(path.join(__dirname, 'src', 'shop.html'));
  shopWin.on('closed', () => { shopWin = null; if (win && !win.isDestroyed()) win.webContents.send('preview', null); });
}

function side(who) {
  const ext = link.dev(who, 'ext');
  const desk = link.dev(who, 'desk');
  if (who === cfg.who) return { online: true, activity: myActivity, page: ext ? ext.page : null };
  const online = link.connected && !!(ext || desk);
  return {
    online,
    activity: online ? (desk && desk.activity) || (ext && ext.activity) || null : null,
    page: ext ? ext.page : null,
  };
}

function state() {
  const cat = side('cat'), jelly = side('jelly');
  const together = !!(cat.page && jelly.page && cat.page.key === jelly.page.key && cat.online && jelly.online);
  return {
    me: cfg.who,
    connected: link.connected,
    error: link.error,
    rtt: link.rtt,
    configured: !!(cfg.room && cfg.secret),
    hour: new Date().getHours(),
    cat: { ...cat, together },
    jelly: { ...jelly, together },
  };
}

function pushState() {
  if (win && !win.isDestroyed()) win.webContents.send('state', state());
  updateTray();
}

function applyGameHide() {
  if (!win) return;
  const should = cfg.hideInGame && myActivity === 'game';
  if (should && !hiddenForGame) { hiddenForGame = true; win.hide(); }
  else if (!should && hiddenForGame) { hiddenForGame = false; win.showInactive(); }
}

// ---------- 窗口 ----------
function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.round(200 * cfg.scale), h = Math.round(168 * cfg.scale);
  const x = cfg.x != null ? cfg.x : wa.x + wa.width - w - 24;
  const y = cfg.y != null ? cfg.y : wa.y + wa.height - h - 12;

  win = new BrowserWindow({
    width: w, height: h, x, y,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, maximizable: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setIgnoreMouseEvents(true, { forward: true }); // 默认点穿，鼠标移到房间上才接住
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.on('did-finish-load', pushState);
  win.on('moved', () => { const [nx, ny] = win.getPosition(); cfg.x = nx; cfg.y = ny; saveCfg(); });
  // 窗口不在屏幕内了就挪回来
  ensureOnScreen();
}

function ensureOnScreen() {
  if (!win) return;
  const b = win.getBounds();
  const d = screen.getDisplayMatching(b).workArea;
  const nx = Math.min(Math.max(b.x, d.x - b.width / 2), d.x + d.width - b.width / 2);
  const ny = Math.min(Math.max(b.y, d.y), d.y + d.height - b.height / 2);
  if (nx !== b.x || ny !== b.y) win.setPosition(Math.round(nx), Math.round(ny));
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 400, height: 700, resizable: false, title: '设置', backgroundColor: '#16151d',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  settingsWin.loadFile(path.join(__dirname, 'src', 'settings.html'));
}

// ---------- 菜单 ----------
function menuTemplate() {
  const mine = link.dev(cfg.who, 'ext');
  const page = mine && mine.page;
  return [
    { label: link.connected ? `已连上${link.rtt != null ? ' · ' + link.rtt + 'ms' : ''}` : (link.error || '连接中…'), enabled: false },
    { type: 'separator' },
    { label: '发消息…', click: () => win && win.webContents.send('input', { mode: 'msg' }) },
    { label: page ? `叫 TA 一起看：${trim(page.title || page.url, 18)}` : '叫 TA 一起看（先在 Chrome 打开 B 站视频）', enabled: !!page && link.connected, click: () => inviteWatch() },
    { label: '叫 TA 开会…', enabled: link.connected, click: () => win && win.webContents.send('input', { mode: 'meeting', prefill: meetingFromClipboard() }) },
    { type: 'separator' },
    { label: '🪙 小卖部…', click: openShop },
    { label: '房间时间', submenu: [['auto', '跟着真实时间'], ['dawn', '清晨'], ['day', '白天'], ['dusk', '黄昏'], ['night', '夜晚'], ['late', '深夜']]
      .map(([v, l]) => ({ label: l, type: 'radio', checked: (cfg.period || 'auto') === v, click: () => { cfg.period = v; saveCfg(); win && win.webContents.send('period', v); } })) },
    { label: '大小', submenu: [1, 1.5, 2, 3].map((s) => ({ label: s + '×', type: 'radio', checked: cfg.scale === s, click: () => setScale(s) })) },
    { label: '打游戏时自动藏起来', type: 'checkbox', checked: cfg.hideInGame, click: (i) => { cfg.hideInGame = i.checked; saveCfg(); applyGameHide(); } },
    { label: '设置…', click: openSettings },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ];
}
const trim = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

function updateTray() {
  if (!tray) return;
  const s = state();
  const p = s[other(cfg.who)];
  tray.setToolTip(`小水母和小黑猫 · ${s.connected ? (p.online ? 'TA 在线' : 'TA 不在线') : '没连上'}`);
}

function setScale(s) {
  cfg.scale = s;
  saveCfg();
  if (win) win.webContents.send('scale', s);
}

function meetingFromClipboard() {
  const t = (clipboard.readText() || '').trim();
  const m = t.match(/https?:\/\/\S+/);
  return m ? m[0] : '';
}

function inviteWatch() {
  const mine = link.dev(cfg.who, 'ext');
  if (!mine || !mine.page) return;
  link.send({ t: 'invite', kind: 'watch', page: mine.page });
  win && win.webContents.send('local-bubble', { who: cfg.who, text: '📺 来一起看？' });
}

// ---------- 收到消息 ----------
link.on('change', () => { refreshMine(); });
link.on('welcome', () => { link.send({ t: 'activity', activity: myActivity }); });
link.on('msg', (m) => {
  if (!win) return;
  win.webContents.send('msg', { who: m.from, text: m.text, poke: m.poke, target: m.target });
  if (m.from !== cfg.who && !m.poke && !win.isVisible()) notify(`${NAME[m.from]}`, m.text);
});
// 房间里的互动（抽屉、吃饭、电视……）：两个人的小房间保持一样
link.on('act', (m) => {
  if (m.kind === 'econ') { if (econ) econ.merge(m.state); return; }
  if (win) win.webContents.send('act', m);
  if (m.kind === 'tv') openBiliIfNoExtension();
});
link.on('peer-online', (who) => {
  if (who !== cfg.who && win) win.webContents.send('peer-online');
  if (who !== cfg.who && econ) { link.send({ t: 'act', kind: 'econ', state: econ.snapshot() }); checkDaily(); }
});
link.on('welcome', () => { if (econ) { link.send({ t: 'act', kind: 'econ', state: econ.snapshot() }); checkDaily(); } });

// 双击电视：插件开着就交给插件打开 B 站；没装插件就用默认浏览器打开
function openBiliIfNoExtension() {
  if (!link.dev(cfg.who, 'ext')) shell.openExternal('https://www.bilibili.com/');
}

link.on('invite', (m) => {
  if (m.from === cfg.who) return;
  if (m.kind === 'meeting' && m.url) {
    notify(`${NAME[m.from]} 叫你开会`, m.url, () => shell.openExternal(m.url));
    win && win.webContents.send('msg', { who: m.from, text: '📞 开会！点我进', url: m.url });
  } else if (m.page && m.page.url) {
    // 插件在线的话由插件弹通知，这里只冒个气泡
    if (!link.dev(cfg.who, 'ext')) notify(`${NAME[m.from]} 叫你一起看`, m.page.title || m.page.url, () => shell.openExternal(m.page.url));
    win && win.webContents.send('msg', { who: m.from, text: '📺 来一起看？', url: m.page.url });
  }
});

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body: String(body || '').slice(0, 120), silent: false });
  if (onClick) n.on('click', onClick);
  n.show();
}

// ---------- 和页面通信 ----------
ipcMain.on('solid', (e, solid) => { if (win) win.setIgnoreMouseEvents(!solid, { forward: true }); });
let drag = null;
ipcMain.on('drag-start', () => {
  if (!win) return;
  const c = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  drag = { dx: c.x - x, dy: c.y - y };
});
ipcMain.on('drag-move', () => {
  if (!win || !drag) return;
  const c = screen.getCursorScreenPoint();
  win.setPosition(Math.round(c.x - drag.dx), Math.round(c.y - drag.dy));
});
ipcMain.on('drag-end', () => {
  drag = null;
  // 拖到屏幕右边缘：收起来，只剩两只从边上探头
  if (win && !peeking) {
    const b = win.getBounds();
    const d = screen.getDisplayMatching(b).workArea;
    if (b.x + b.width >= d.x + d.width - 6) { collapse(b, 'right'); return; }
    if (b.x <= d.x + 6) { collapse(b, 'left'); return; }
  }
  ensureOnScreen();
});

// ---------- 收到屏幕边缘 ----------
let peeking = false;
let peekFrom = null; // 收起前的位置
let restoreTo = null;
function collapse(b, side) {
  peeking = side;
  peekFrom = b;
  win.webContents.send('peek', side);
}
ipcMain.on('unpeek', () => {
  if (!win || !peeking) return;
  peeking = false;
  const d = screen.getDisplayMatching(win.getBounds()).workArea;
  const from = peekFrom || win.getBounds();
  // 展开回原来的高度，离右边留一点空，不会又立刻收起来
  restoreTo = { x: Math.min(Math.max(from.x, d.x + 16), d.x + d.width - from.width - 16), y: from.y };
  win.webContents.send('peek', false);
});
ipcMain.on('menu', () => { if (win) Menu.buildFromTemplate(menuTemplate()).popup({ window: win }); });
ipcMain.on('resize', (e, { w, h }) => {
  if (!win) return;
  const b = win.getBounds();
  // 以右下角为锚点缩放，房间不会"跳走"
  let nx = b.x + b.width - w, ny = b.y + b.height - h;
  if (peeking) { // 收起：贴着屏幕右边，高度对着原来房间的中间
    const d = screen.getDisplayMatching(b).workArea;
    const from = peekFrom || b;
    nx = peeking === 'left' ? d.x : d.x + d.width - w;
    ny = Math.min(Math.max(from.y + from.height / 2 - h / 2, d.y), d.y + d.height - h);
  } else if (restoreTo) {
    nx = restoreTo.x; ny = restoreTo.y; restoreTo = null;
  }
  win.setResizable(true);
  win.setBounds({ x: Math.round(nx), y: Math.round(ny), width: Math.round(w), height: Math.round(h) });
  win.setResizable(false);
});
ipcMain.on('send-msg', (e, text) => {
  text = String(text || '').trim().slice(0, 200);
  if (text) link.send({ t: 'msg', text });
});
ipcMain.handle('econ-get', () => (econ ? econ.view() : null));
ipcMain.handle('econ-buy', (e, id) => (econ ? econ.buy(id, cfg.who) : { error: '还没准备好' }));
ipcMain.handle('econ-equip', (e, { slot, item }) => (econ ? econ.equip(slot, item) : { error: '还没准备好' }));
ipcMain.on('shop-preview', (e, p) => { if (win && !win.isDestroyed()) win.webContents.send('preview', p); });
ipcMain.on('open-shop', openShop);
ipcMain.on('earn-first', (e, kind) => { if (/^[a-z]{2,12}$/.test(String(kind))) earnFirst('do:' + kind); });
ipcMain.on('send-act', (e, a) => { if (a && typeof a.kind === 'string') link.send({ t: 'act', ...a }); });
ipcMain.on('tv-together', () => { link.send({ t: 'act', kind: 'tv' }); openBiliIfNoExtension(); });
ipcMain.on('poke', () => link.send({ t: 'msg', poke: true, target: other(cfg.who), text: '' }));
ipcMain.on('send-meeting', (e, url) => {
  url = String(url || '').trim();
  if (!/^https?:\/\//.test(url)) return;
  link.send({ t: 'invite', kind: 'meeting', url });
});
ipcMain.on('open-url', (e, url) => { if (/^https?:\/\//.test(String(url))) shell.openExternal(url); });
ipcMain.handle('get-config', () => ({ ...cfg }));
ipcMain.handle('save-config', async (e, c) => {
  const prevScale = cfg.scale;
  cfg = { ...cfg, ...c };
  cfg.who = cfg.who === 'jelly' ? 'jelly' : 'cat';
  saveCfg();
  await restart();
  if (cfg.scale !== prevScale) setScale(cfg.scale);
  return true;
});
ipcMain.handle('get-status', () => ({
  connected: link.connected,
  error: relayError || link.error,
  rtt: link.rtt,
  partnerOnline: side(other(cfg.who)).online,
  hosting: !!relay,
  lan: cfg.hostServer ? `ws://${lanIp()}:${RELAY_PORT}` : null,
  configured: !!(cfg.room && cfg.secret && myServer()),
}));
ipcMain.handle('make-code', async (e, opts = {}) => {
  if (opts.who) cfg.who = opts.who === 'jelly' ? 'jelly' : 'cat';
  if (typeof opts.hostServer === 'boolean') cfg.hostServer = opts.hostServer;
  if (typeof opts.server === 'string' && !cfg.hostServer) cfg.server = opts.server.trim();
  if (!cfg.hostServer && !cfg.server) return { error: '先填服务器地址，或者勾选"这台电脑当服务器"' };
  const code = makeCode();
  saveCfg();
  await restart();
  clipboard.writeText(code);
  return { code };
});
ipcMain.handle('apply-code', async (e, code) => {
  const p = parseCode(code);
  if (!p) return { error: '配对码不对，确认一下有没有复制完整' };
  Object.assign(cfg, { server: p.s, room: p.r, secret: p.k, who: other(p.w), hostServer: false });
  saveCfg();
  await restart();
  return { ok: true, who: cfg.who };
});

async function restart() {
  await syncRelay();
  link.start({ ...cfg, server: myServer() });
  refreshMine();
}
ipcMain.on('close-settings', () => { if (settingsWin) settingsWin.close(); });

// ---------- 启动 ----------
app.whenReady().then(() => {
  loadCfg();
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();

  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
    tray = new Tray(icon);
    tray.on('click', () => { if (win) { win.isVisible() ? win.hide() : win.showInactive(); } });
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示 / 隐藏', click: () => win && (win.isVisible() ? win.hide() : win.showInactive()) },
      { label: '设置…', click: openSettings },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]));
    updateTray();
  } catch {}

  // 前台程序
  const selfNames = new Set(['electron', 'jellycat', app.getName().toLowerCase(), '小水母和小黑猫']);
  watchForeground(({ name, bundle }) => {
    if (selfNames.has((name || '').toLowerCase())) return; // 点了小房间本身，不算换活动
    fgClass = classify(name, bundle, cfg.games);
    refreshMine();
  });
  // 发呆 5 分钟 = 睡着
  setInterval(() => {
    const was = idle;
    idle = powerMonitor.getSystemIdleTime() >= 300;
    if (idle !== was) refreshMine();
  }, 5000);
  powerMonitor.on('lock-screen', () => { idle = true; refreshMine(); });
  powerMonitor.on('unlock-screen', () => { idle = false; refreshMine(); });
  // 天色跟着时间变
  setInterval(pushState, 60 * 1000);

  startLocalConfig();
  initEcon().catch((e) => console.error('金币系统没启动：', e));
  restart();
  if (!cfg.room || !cfg.secret) openSettings();

  // 测试用：自动收到边缘
  if (process.env.JC_TEST_PEEK) setTimeout(() => collapse(win.getBounds(), process.env.JC_TEST_PEEK), 2500);
  // 测试用：过几秒截一张图就退出
  if (process.env.JC_SNAPSHOT) {
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.JC_SNAPSHOT, img.toPNG());
      app.exit(0);
    }, Number(process.env.JC_SNAPSHOT_MS || 6000));
  }
});

app.on('second-instance', () => { if (win) win.showInactive(); });
app.on('window-all-closed', (e) => e.preventDefault());

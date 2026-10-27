// 小水母 & 小黑猫 —— 两人中继服务器的核心（服务器版和桌面端内置版共用这一份）
// 只做一件事：传话。房间里有两个人（cat / jelly），每个人可以有两台"设备"：
//   ext  = Chrome 插件
//   desk = 桌面小房间
const http = require('node:http');
const { WebSocketServer } = require('ws');

function startRelay({ port = 8787, host, fixedSecret = '', log: logFn } = {}) {
const FIXED_SECRET = fixedSecret;
const PORT = port;
const rooms = new Map(); // room -> { secret, clients: Map<"who:dev", ws> }

// 只发给"另一个人"的消息（看视频同步、邀请）
const TO_PARTNER = new Set(['ctl', 'hb', 'buf', 'need', 'invite']);
// 发给房间里所有其他设备的消息（包括自己的另一台设备）
const TO_ALL = new Set(['page', 'activity', 'msg']);

const server = http.createServer((req, res) => {
  // 健康检查：在浏览器里打开 http(s)://你的服务器/ 能看到 ok，说明网络通
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end('ok 🐈‍⬛🪼\n');
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function roomOf(ws) { return rooms.get(ws.room); }
function othersIn(ws) {
  const room = roomOf(ws);
  return room ? [...room.clients.values()].filter((c) => c !== ws) : [];
}
const info = (c) => ({ who: c.who, dev: c.dev, page: c.page, activity: c.activity });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'ping') return send(ws, { t: 'pong', id: m.id });

    if (m.t === 'hello') {
      const roomId = String(m.room || '').slice(0, 64);
      const secret = String(m.secret || '');
      const who = m.who === 'jelly' ? 'jelly' : 'cat';
      const dev = m.dev === 'desk' ? 'desk' : 'ext';
      if (!roomId || !secret) return send(ws, { t: 'error', msg: '缺少房间号或密钥' }), ws.close();
      if (FIXED_SECRET && secret !== FIXED_SECRET) return send(ws, { t: 'error', msg: '密钥不对' }), ws.close();

      let room = rooms.get(roomId);
      if (!room) rooms.set(roomId, (room = { secret, clients: new Map() }));
      if (room.secret !== secret) return send(ws, { t: 'error', msg: '密钥不对' }), ws.close();

      // 同一台设备重连：踢掉旧连接
      const id = `${who}:${dev}`;
      const old = room.clients.get(id);
      if (old && old !== ws) { old.replaced = true; old.close(4000, 'replaced'); }

      Object.assign(ws, { room: roomId, id, who, dev, page: null, activity: null });
      room.clients.set(id, ws);

      send(ws, { t: 'welcome', who, dev, peers: othersIn(ws).map(info) });
      for (const c of othersIn(ws)) send(c, { t: 'peer', online: true, ...info(ws) });
      log(`${id} 进入房间 ${roomId}（在线设备 ${room.clients.size}）`);
      return;
    }

    if (!ws.room) return; // 没 hello 的不转发

    if (m.t === 'page') ws.page = m.page || null;
    if (m.t === 'activity') ws.activity = m.activity || null;

    m.from = ws.who;
    m.dev = ws.dev;
    if (TO_PARTNER.has(m.t)) {
      for (const c of othersIn(ws)) if (c.who !== ws.who) send(c, m);
    } else if (TO_ALL.has(m.t)) {
      for (const c of othersIn(ws)) send(c, m);
    }
  });

  ws.on('close', () => {
    const room = roomOf(ws);
    if (!room) return;
    if (room.clients.get(ws.id) === ws) {
      room.clients.delete(ws.id);
      if (!ws.replaced) for (const c of room.clients.values()) send(c, { t: 'peer', online: false, who: ws.who, dev: ws.dev });
      log(`${ws.id} 离开房间 ${ws.room}`);
    }
    if (room.clients.size === 0) rooms.delete(ws.room);
  });
});

// 每 30 秒清理掉线的连接
const sweeper = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000);
sweeper.unref();

function log(s) { (logFn || ((x) => console.log(new Date().toISOString(), x)))(s); }


return new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, host, () => {
    log(`中继服务器已启动：端口 ${PORT}`);
    resolve({
      server, wss, port: PORT,
      close: () => new Promise((r) => { clearInterval(sweeper); for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); }),
    });
  });
});
}

module.exports = { startRelay };

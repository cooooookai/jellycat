// 桌面端和中继服务器的连接。和插件用同一个服务器、同一个房间，身份是 dev = 'desk'。
const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

class Link extends EventEmitter {
  constructor() {
    super();
    this.cfg = null;
    this.ws = null;
    this.connected = false;
    this.error = '';
    this.rtt = null;
    this.retry = 1000;
    this.devices = new Map(); // "who:dev" -> { who, dev, page, activity }
    this.pending = new Map();
  }

  start(cfg) {
    this.cfg = cfg;
    this.stop();
    this.retry = 1000;
    this.connect();
  }

  stop() {
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    if (this.ws) { const w = this.ws; this.ws = null; try { w.terminate(); } catch {} }
    this.connected = false;
    this.devices.clear();
  }

  connect() {
    const c = this.cfg;
    if (!c || !c.server || !c.room || !c.secret) { this.error = '还没填设置'; this.emit('change'); return; }
    let ws;
    try { ws = new WebSocket(c.server, { handshakeTimeout: 8000 }); } catch { this.error = '服务器地址不对'; this.emit('change'); return this.later(); }
    this.ws = ws;
    ws.on('open', () => {
      this.retry = 1000;
      this.error = '';
      this.raw({ t: 'hello', room: c.room, secret: c.secret, who: c.who, dev: 'desk' });
    });
    ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch { return; } this.onMsg(m); });
    ws.on('error', () => { this.error = '连不上服务器'; });
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.connected = false;
      this.devices.clear();
      clearInterval(this.pingTimer);
      this.emit('change');
      this.later();
    });
  }

  later() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.retry);
    this.retry = Math.min(this.retry * 2, 30000);
  }

  raw(o) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) { this.ws.send(JSON.stringify(o)); return true; }
    return false;
  }
  send(o) { return this.raw({ ...o, lat: this.rtt == null ? 100 : this.rtt / 2 }); }

  ping() {
    const id = Math.random().toString(36).slice(2, 8);
    this.pending.set(id, Date.now());
    this.raw({ t: 'ping', id });
  }

  onMsg(m) {
    switch (m.t) {
      case 'welcome':
        this.connected = true;
        this.devices.clear();
        for (const p of m.peers || []) this.devices.set(`${p.who}:${p.dev}`, { ...p });
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.ping(), 10000);
        this.ping();
        this.emit('welcome');
        this.emit('change');
        break;
      case 'error':
        this.error = m.msg || '服务器拒绝了';
        this.emit('change');
        break;
      case 'pong': {
        const t0 = this.pending.get(m.id);
        if (t0) { this.pending.delete(m.id); const s = Date.now() - t0; this.rtt = Math.round(this.rtt == null ? s : this.rtt * 0.7 + s * 0.3); this.emit('change'); }
        break;
      }
      case 'peer': {
        const id = `${m.who}:${m.dev}`;
        if (m.online) this.devices.set(id, { who: m.who, dev: m.dev, page: m.page || null, activity: m.activity || null });
        else this.devices.delete(id);
        if (m.online && m.dev === 'desk') this.emit('peer-online', m.who);
        this.emit('change');
        break;
      }
      case 'page':
      case 'activity': {
        const id = `${m.from}:${m.dev}`;
        const d = this.devices.get(id) || { who: m.from, dev: m.dev };
        d[m.t] = m[m.t] || null;
        this.devices.set(id, d);
        this.emit('change');
        break;
      }
      case 'msg':
        this.emit('msg', m);
        break;
      case 'invite':
        this.emit('invite', m);
        break;
      case 'act':
        this.emit('act', m);
        break;
    }
  }

  dev(who, dev) { return this.devices.get(`${who}:${dev}`) || null; }
}

module.exports = { Link };

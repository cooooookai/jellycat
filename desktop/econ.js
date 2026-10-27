// 两个人共用的金币账本
//
// 不放在服务器上（免费服务器重启会丢数据），而是两台电脑各存一份完整账本，
// 连上的时候互相合并：
//   earns  —— 每一笔收入都有固定的 id（比如 "login:cat:2026-10-27"），同一笔只会算一次
//   buys   —— 每件东西买一次；两边同时花钱把余额花超了，按购买时间先后，后买的那件作废（钱自动退回）
//   equip  —— 每个位置放什么，以最后一次修改为准
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

class Econ extends EventEmitter {
  constructor(file, catalog) {
    super();
    this.file = file;
    this.cat = catalog; // { ITEM, DEFAULTS, SLOTS }
    this.s = { earns: {}, buys: {}, equip: {} };
    try { this.s = { ...this.s, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}
  }

  save() {
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.s)); } catch {}
  }

  // ---------- 算账 ----------
  totalEarned() { return Object.values(this.s.earns).reduce((a, e) => a + (e.amt || 0), 0); }

  // 按购买时间重放：钱够才算买成
  ledger() {
    const total = this.totalEarned();
    let spent = 0;
    const owned = new Set();
    const buys = Object.entries(this.s.buys).sort((a, b) => a[1].ts - b[1].ts || (a[0] < b[0] ? -1 : 1));
    for (const [id, b] of buys) {
      const it = this.cat.ITEM[id];
      if (!it) continue;
      if (spent + it.price <= total) { spent += it.price; owned.add(id); }
    }
    for (const it of Object.values(this.cat.ITEM)) if (it.price === 0) owned.add(it.id);
    return { balance: total - spent, owned };
  }

  equipMap(owned = this.ledger().owned) {
    const out = { ...this.cat.DEFAULTS };
    for (const [slot, e] of Object.entries(this.s.equip)) {
      if (!(slot in out)) continue;
      if (e.item === null) { out[slot] = null; continue; }
      const it = this.cat.ITEM[e.item];
      if (it && it.slot === slot && owned.has(e.item)) out[slot] = e.item;
    }
    return out;
  }

  view() {
    const { balance, owned } = this.ledger();
    return { balance, owned: [...owned], equip: this.equipMap(owned) };
  }

  // ---------- 改账 ----------
  earn(id, amt, who, kind) {
    if (this.s.earns[id]) return false;
    this.s.earns[id] = { amt, who, kind, ts: Date.now() };
    this.save();
    this.emit('earned', { id, amt, who, kind, local: true });
    this.emit('change');
    return true;
  }

  buy(itemId, who) {
    const it = this.cat.ITEM[itemId];
    if (!it) return { error: '没有这件东西' };
    const { balance, owned } = this.ledger();
    if (owned.has(itemId)) return { error: '已经有了' };
    if (balance < it.price) return { error: `金币不够，还差 ${it.price - balance}` };
    this.s.buys[itemId] = { who, ts: Date.now() };
    this.s.equip[it.slot] = { item: itemId, ts: Date.now() }; // 买了就直接装上
    this.save();
    this.emit('change');
    return { ok: true };
  }

  equip(slot, itemId) {
    if (!(slot in this.cat.DEFAULTS)) return { error: '没有这个位置' };
    if (itemId !== null) {
      const it = this.cat.ITEM[itemId];
      if (!it || it.slot !== slot) return { error: '放不进这个位置' };
      if (!this.ledger().owned.has(itemId)) return { error: '还没买' };
    } else if (this.cat.SLOTS.find((s) => s.id === slot).type === 'base') {
      itemId = this.cat.DEFAULTS[slot]; // 家具位不能空着，卸下就是换回默认款
    }
    this.s.equip[slot] = { item: itemId, ts: Date.now() };
    this.save();
    this.emit('change');
    return { ok: true };
  }

  // ---------- 合并对方的账本 ----------
  merge(remote) {
    if (!remote) return false;
    let changed = false;
    for (const [id, e] of Object.entries(remote.earns || {})) {
      if (!this.s.earns[id]) { this.s.earns[id] = e; changed = true; this.emit('earned', { id, ...e, local: false }); }
    }
    for (const [id, b] of Object.entries(remote.buys || {})) {
      const mine = this.s.buys[id];
      if (!mine || b.ts < mine.ts) { this.s.buys[id] = b; changed = true; }
    }
    for (const [slot, e] of Object.entries(remote.equip || {})) {
      const mine = this.s.equip[slot];
      if (!mine || e.ts > mine.ts || (e.ts === mine.ts && String(e.item) > String(mine.item))) { this.s.equip[slot] = e; changed = true; }
    }
    if (changed) { this.save(); this.emit('change'); }
    return changed;
  }

  snapshot() { return this.s; }
}

module.exports = { Econ };

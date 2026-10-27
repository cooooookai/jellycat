import { SLOTS, GROUPS, ITEMS, ITEM, DEFAULTS } from './catalog.mjs';
import { createRoom, SLOT_VIEW, W, H } from './room.js';

const api = window.jc;
const $ = (id) => document.getElementById(id);
const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

let econ = { balance: 0, owned: [], equip: { ...DEFAULTS } };
let tab = 'furniture';
let sel = null; // 选中的物品 id

// ---------- 缩略图：把这件东西放进房间里画一遍，裁出它所在的那一块 ----------
const thumbRoom = createRoom();
const thumbCache = new Map();
function thumb(item) {
  const key = item.id + '|' + JSON.stringify(econ.equip);
  if (thumbCache.has(key)) return thumbCache.get(key);
  const equip = { ...econ.equip, [item.slot]: item.id };
  const off = { online: false, activity: null };
  const buf = thumbRoom.render({ period: item.set === 'halloween' ? 'dusk' : 'day', cat: off, jelly: off, equip, props: {} }, 5000);
  const [x, y, w, h] = SLOT_VIEW[item.slot];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = x + i, sy = y + j;
    const o = (j * w + i) * 4;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const s = (sy * W + sx) * 4;
    img.data[o] = buf[s]; img.data[o + 1] = buf[s + 1]; img.data[o + 2] = buf[s + 2]; img.data[o + 3] = buf[s + 3];
  }
  ctx.putImageData(img, 0, 0);
  thumbCache.set(key, c);
  return c;
}

// ---------- 列表 ----------
function itemsOfTab() {
  if (tab === 'halloween') return ITEMS.filter((it) => it.set === 'halloween');
  return ITEMS.filter((it) => !it.set && SLOT[it.slot].group === tab);
}

function render() {
  $('coins').textContent = econ.balance;
  $('tabs').innerHTML = '';
  for (const g of GROUPS) {
    const b = document.createElement('button');
    b.textContent = g.name;
    b.className = g.id === tab ? 'on' : '';
    b.onclick = () => { tab = g.id; render(); };
    $('tabs').appendChild(b);
  }
  const list = $('list');
  list.innerHTML = '';
  // 按位置分组：同一个位置的东西放在一起，一眼看出它们会互相替换
  const bySlot = new Map();
  if (tab === 'halloween') bySlot.set('_all', itemsOfTab()); // 节日套装：一整片，卡片上写位置
  else for (const it of itemsOfTab()) { if (!bySlot.has(it.slot)) bySlot.set(it.slot, []); bySlot.get(it.slot).push(it); }
  for (const [slot, items] of bySlot) {
    const t = document.createElement('div');
    t.className = 'slotTitle';
    t.textContent = slot === '_all' ? '整套换上就是万圣节房间 🎃　每件都有自己的位置，不会互相挡住'
      : `${SLOT[slot].name}　·　${SLOT[slot].type === 'decor' ? '装饰位，同一位置只放一件' : '同一位置换着用'}`;
    list.appendChild(t);
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const it of items) grid.appendChild(card(it));
    list.appendChild(grid);
  }
  footer();
}

function card(it) {
  const owned = econ.owned.includes(it.id);
  const using = econ.equip[it.slot] === it.id;
  const el = document.createElement('div');
  el.className = 'card' + (sel === it.id ? ' sel' : '');
  el.appendChild(thumb(it));
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = it.name;
  el.appendChild(name);
  const meta = document.createElement('div');
  meta.className = 'meta';
  const state = using ? '<span class="tag use">使用中</span>' : owned ? '<span class="tag own">已拥有</span>' : `<span class="price">🪙 ${it.price}</span>`;
  meta.innerHTML = `<span>${SLOT[it.slot].name}</span>${state}`;
  el.appendChild(meta);
  el.onclick = () => select(it.id === sel ? null : it.id);
  return el;
}

function select(id) {
  sel = id;
  $('msg').textContent = '';
  const it = id && ITEM[id];
  api.shopPreview(it && econ.equip[it.slot] !== it.id ? { slot: it.slot, item: it.id } : null);
  render();
}

function footer() {
  const it = sel && ITEM[sel];
  const act = $('act'), un = $('unequip'), cancel = $('cancel');
  if (!it) {
    $('what').innerHTML = '选一件东西看看';
    act.hidden = un.hidden = cancel.hidden = true;
    return;
  }
  const slot = SLOT[it.slot];
  const cur = econ.equip[it.slot];
  const owned = econ.owned.includes(it.id);
  const using = cur === it.id;
  const replaces = cur && cur !== it.id ? `，会换掉「${ITEM[cur].name}」` : '';
  $('what').innerHTML = `<b>${it.name}</b>　放在：${slot.name}${using ? '（正在用）' : replaces}`;
  cancel.hidden = using;
  act.hidden = using;
  un.hidden = !(using && (slot.type === 'decor' || it.price > 0));
  un.textContent = slot.type === 'decor' ? '收起来' : '换回默认';
  if (!using) {
    if (owned) { act.className = ''; act.textContent = '摆上'; act.disabled = false; }
    else {
      act.className = 'buy';
      const short = it.price - econ.balance;
      act.textContent = short > 0 ? `还差 ${short} 🪙` : `买下 · 🪙 ${it.price}`;
      act.disabled = short > 0;
    }
  }
}

$('act').onclick = async () => {
  const it = ITEM[sel];
  const owned = econ.owned.includes(it.id);
  const r = owned ? await api.econEquip(it.slot, it.id) : await api.econBuy(it.id);
  if (r.error) { $('msg').className = 'msg'; $('msg').textContent = r.error; return; }
  $('msg').className = 'msg ok';
  $('msg').textContent = owned ? '摆好啦' : '买到啦！TA 那边也会看到';
  api.shopPreview(null);
};
$('unequip').onclick = async () => {
  const it = ITEM[sel];
  const r = await api.econEquip(it.slot, null);
  if (r.error) { $('msg').textContent = r.error; return; }
  $('msg').className = 'msg ok';
  $('msg').textContent = '收好了';
};
$('cancel').onclick = () => select(null);

api.onEcon((v) => { econ = v; render(); });
api.econGet().then((v) => { if (v) econ = v; render(); });
render();

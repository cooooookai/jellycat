// 决定权：猜拳（三局两胜，可以先写好赌什么）和转盘（两个人看到同一个转盘转到同一格）。
// 猜拳先各自"锁定"，两边都锁定了才亮出来，谁也偷看不到。

export const META = { name: '决定权', icon: '✊', desc: '猜拳、转盘。今晚谁先挂电话、吃什么、谁去找谁。' };

const HANDS = { rock: '✊', scissors: '✌️', paper: '✋' };
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const PRESETS = {
  吃什么: ['火锅', '烤肉', '日料', '麻辣烫', '外卖随便', '你决定'],
  谁去找谁: ['🐈‍⬛ 去找 🪼', '🪼 去找 🐈‍⬛', '中间见', '这次先视频'],
  今晚看什么: ['电影', '综艺', '番剧', 'B 站随便刷', '纪录片'],
  小惩罚: ['唱一首歌', '说三句情话', '发一张丑照', '学猫叫', '明天先说早安', '请喝奶茶'],
};
const SEG_COLORS = ['#e05a6f', '#f2c14a', '#6aa8f0', '#7ed491', '#c58af0', '#f09a5a', '#5fd0c8', '#f3ead7'];

export function mount(root, ctx) {
  let tab = 'rps';
  // 猜拳
  let topic = '';
  let score = { me: 0, them: 0 };
  let mine = null; // 我出的
  let theirLocked = false;
  let theirs = null;
  let revealedMine = false;
  let lastRound = null;
  // 转盘
  let options = [...PRESETS.吃什么];
  let angle = 0;
  let spinning = false;
  let wheelResult = null;
  let raf = null;

  root.innerHTML = `<div class="row" id="lTabs" style="margin-bottom:12px"></div><div id="lBody"></div>`;
  const tabs = root.querySelector('#lTabs');
  const body = root.querySelector('#lBody');
  function renderTabs() {
    tabs.innerHTML = '';
    for (const [id, name] of [['rps', '✊ 猜拳'], ['wheel', '🎡 转盘']]) {
      const b = document.createElement('button');
      b.className = id === tab ? '' : 'ghost';
      b.textContent = name;
      b.onclick = () => { if (tab !== id) { tab = id; ctx.send('tab', { tab }); render(); } };
      tabs.appendChild(b);
    }
  }
  function render() { renderTabs(); tab === 'rps' ? renderRps() : renderWheel(); }

  // ---------- 猜拳 ----------
  const winner = () => (score.me >= 2 ? ctx.me : score.them >= 2 ? ctx.partner : null);
  function renderRps() {
    const w = winner();
    body.innerHTML = `
      <div class="card" style="margin-bottom:10px">
        <div class="row"><span>赌什么：</span><input type="text" id="rTopic" placeholder="比如：今晚谁先挂电话（输的人）" style="flex:1" maxlength="30"></div>
        <div class="hint" style="margin-top:4px">三局两胜，平局不算。两个人都能改。</div>
      </div>
      <div class="card center" style="padding:18px">
        <div style="font:700 22px ui-monospace,Menlo,monospace">${ctx.icon[ctx.me]} ${score.me} : ${score.them} ${ctx.icon[ctx.partner]}</div>
        <div id="rArena" style="font-size:54px;margin:14px 0;min-height:70px"></div>
        <div id="rMsg" class="hint" style="min-height:20px"></div>
        <div class="row" id="rHands" style="justify-content:center;margin-top:10px"></div>
      </div>`;
    const ti = body.querySelector('#rTopic');
    ti.value = topic;
    ti.addEventListener('input', () => { topic = ti.value; ctx.send('topic', { text: topic }); });
    const arena = body.querySelector('#rArena');
    const msg = body.querySelector('#rMsg');
    const hands = body.querySelector('#rHands');
    if (w) {
      arena.textContent = w === ctx.me ? '🏆' : '🙈';
      msg.innerHTML = '';
      const t = document.createElement('div');
      t.style.cssText = 'font-size:15px;color:var(--ink);font-weight:700';
      const loser = w === ctx.me ? ctx.partner : ctx.me;
      t.textContent = `${ctx.icon[w]} 赢了！${topic ? `${ctx.icon[loser]}：${topic}` : ''}`;
      msg.appendChild(t);
      const again = document.createElement('button');
      again.className = 'gold';
      again.textContent = '再来一轮';
      again.onclick = () => { ctx.send('rpsReset'); resetRps(); };
      hands.appendChild(again);
      return;
    }
    if (lastRound) {
      arena.textContent = `${HANDS[lastRound.mine]}  ${HANDS[lastRound.theirs]}`;
      msg.textContent = lastRound.res === 0 ? '平局，再来' : lastRound.res > 0 ? '这局你赢' : '这局 TA 赢';
    }
    if (!mine) {
      if (!lastRound) msg.textContent = theirLocked ? 'TA 已经出好了，到你了' : '出一个吧';
      for (const [k, e] of Object.entries(HANDS)) {
        const b = document.createElement('button');
        b.style.cssText = 'font-size:30px;padding:6px 14px';
        b.textContent = e;
        b.onclick = () => lock(k);
        hands.appendChild(b);
      }
    } else {
      arena.textContent = `${HANDS[mine]}  ${theirLocked ? '🤜' : '…'}`;
      msg.textContent = theirLocked ? '亮！' : '等 TA 出…';
    }
  }
  function lock(k) {
    mine = k;
    lastRound = null;
    ctx.send('lock');
    renderRps();
    maybeReveal();
  }
  function maybeReveal() {
    if (mine && theirLocked && !revealedMine) { revealedMine = true; ctx.send('reveal', { hand: mine }); }
    if (mine && theirs) settle();
  }
  function settle() {
    const res = mine === theirs ? 0 : BEATS[mine] === theirs ? 1 : -1;
    if (res > 0) score.me++;
    if (res < 0) score.them++;
    lastRound = { mine, theirs, res };
    mine = null; theirs = null; theirLocked = false; revealedMine = false;
    if (winner() === ctx.me || winner() === ctx.partner) ctx.earn();
    renderRps();
  }
  function resetRps() {
    score = { me: 0, them: 0 };
    mine = null; theirs = null; theirLocked = false; revealedMine = false; lastRound = null;
    renderRps();
  }

  // ---------- 转盘 ----------
  function renderWheel() {
    body.innerHTML = `
      <div class="row" id="wPresets" style="margin-bottom:8px"></div>
      <div class="card center" style="position:relative">
        <div style="position:absolute;left:50%;top:6px;transform:translateX(-50%);font-size:22px;z-index:1">🔻</div>
        <canvas id="wCv" width="300" height="300" style="width:300px;max-width:100%;margin-top:14px"></canvas>
        <div id="wRes" style="min-height:28px;font-size:18px;font-weight:700;margin-top:6px"></div>
        <button class="gold" id="wSpin">转！</button>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="hint" style="margin-bottom:6px">选项（一行一个，两个人都能改）</div>
        <textarea id="wOpts" rows="5" style="width:100%;font:inherit;color:var(--ink);background:var(--bg);border:2px solid var(--line);padding:6px;resize:vertical;user-select:text"></textarea>
      </div>`;
    const pre = body.querySelector('#wPresets');
    for (const name of Object.keys(PRESETS)) {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = name;
      b.onclick = () => setOptions(PRESETS[name], true);
      pre.appendChild(b);
    }
    const ta = body.querySelector('#wOpts');
    ta.value = options.join('\n');
    ta.addEventListener('input', () => {
      const list = ta.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12);
      if (list.length >= 2) setOptions(list, false, true);
    });
    body.querySelector('#wSpin').onclick = () => {
      if (spinning || options.length < 2) return;
      const idx = Math.floor(Math.random() * options.length);
      const turns = 5 + Math.floor(Math.random() * 3);
      const jitter = 0.15 + Math.random() * 0.7; // 落在格子里的位置
      ctx.send('spin', { idx, turns, jitter, options });
      spin(idx, turns, jitter);
    };
    wheelResult && (body.querySelector('#wRes').textContent = `👉 ${wheelResult}`);
    drawWheel();
  }
  function setOptions(list, rerender, fromTyping) {
    options = list;
    wheelResult = null;
    ctx.send('opts', { options });
    if (rerender) renderWheel();
    else { drawWheel(); if (!fromTyping) renderWheel(); }
  }
  function drawWheel() {
    const cv = body.querySelector('#wCv');
    if (!cv) return;
    const c = cv.getContext('2d');
    const R = 140, cx = 150, cy = 150;
    c.clearRect(0, 0, 300, 300);
    const n = options.length;
    const seg = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      // 指针在正上方；angle 是转盘转过的角度
      const a0 = -Math.PI / 2 + angle + i * seg;
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, R, a0, a0 + seg);
      c.closePath();
      c.fillStyle = SEG_COLORS[i % SEG_COLORS.length];
      c.fill();
      c.strokeStyle = '#16151d';
      c.lineWidth = 3;
      c.stroke();
      c.save();
      c.translate(cx, cy);
      c.rotate(a0 + seg / 2);
      c.fillStyle = '#16151d';
      c.font = '700 14px -apple-system, "PingFang SC", sans-serif';
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      const t = options[i].length > 7 ? options[i].slice(0, 7) + '…' : options[i];
      c.fillText(t, R - 12, 0);
      c.restore();
    }
    c.beginPath();
    c.arc(cx, cy, 16, 0, Math.PI * 2);
    c.fillStyle = '#16151d';
    c.fill();
  }
  function spin(idx, turns, jitter) {
    spinning = true;
    wheelResult = null;
    const res = body.querySelector('#wRes');
    if (res) res.textContent = '';
    const n = options.length;
    const seg = (Math.PI * 2) / n;
    // 让第 idx 格的 jitter 位置停在正上方：-π/2 + angle + (idx + jitter) * seg = -π/2 (mod 2π)
    const base = -((idx + jitter) * seg);
    const start = angle % (Math.PI * 2);
    let target = base - Math.PI * 2 * turns;
    while (target > start - Math.PI * 2 * turns) target -= Math.PI * 2;
    const from = start;
    const dur = 4200;
    const t0 = performance.now();
    cancelAnimationFrame(raf);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 4);
      angle = from + (target - from) * e;
      drawWheel();
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        spinning = false;
        wheelResult = options[idx];
        const r = body.querySelector('#wRes');
        if (r) r.textContent = `👉 ${wheelResult}`;
      }
    };
    raf = requestAnimationFrame(step);
  }

  render();

  return {
    onMsg(m) {
      switch (m.op) {
        case 'tab': if (m.tab !== tab && (m.tab === 'rps' || m.tab === 'wheel')) { tab = m.tab; render(); } break;
        case 'topic': topic = String(m.text || '').slice(0, 30); if (tab === 'rps') { const t = body.querySelector('#rTopic'); if (t && document.activeElement !== t) t.value = topic; } break;
        case 'lock': theirLocked = true; if (tab === 'rps') renderRps(); maybeReveal(); break;
        case 'reveal': theirs = HANDS[m.hand] ? m.hand : null; theirLocked = true; maybeReveal(); if (tab === 'rps' && theirs && !mine) renderRps(); break;
        case 'rpsReset': resetRps(); break;
        case 'opts':
          if (Array.isArray(m.options) && m.options.length >= 2) {
            options = m.options.map(String).slice(0, 12);
            wheelResult = null;
            if (tab === 'wheel') { const ta = body.querySelector('#wOpts'); if (ta && document.activeElement !== ta) ta.value = options.join('\n'); drawWheel(); }
          }
          break;
        case 'spin':
          if (Array.isArray(m.options)) options = m.options.map(String).slice(0, 12);
          if (tab !== 'wheel') { tab = 'wheel'; render(); }
          spin(m.idx, m.turns, m.jitter);
          break;
      }
    },
    destroy() { cancelAnimationFrame(raf); },
  };
}

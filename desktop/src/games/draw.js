// 你画我猜：一个人画，另一个人看着笔画一笔一笔出来，猜。猜中了换人。
// 题目只在画的人那边，猜的对不对也由画的人那边判断。

export const META = { name: '你画我猜', icon: '🎨', desc: '一个人画，一个人猜。笔画是实时出现的，像在背上写字。' };

const WORDS = {
  食物: ['火锅', '西瓜', '冰淇淋', '饺子', '奶茶', '寿司', '拉面', '汉堡', '煎蛋', '月饼', '烤串', '草莓', '香蕉', '小笼包', '薯条', '蛋糕', '爆米花', '可乐', '粽子', '包子', '披萨', '咖啡', '烤鸭', '章鱼烧'],
  动物: ['猫', '水母', '兔子', '企鹅', '长颈鹿', '章鱼', '蜗牛', '熊猫', '金鱼', '刺猬', '恐龙', '螃蟹', '狗', '蝴蝶', '鲸鱼', '猫头鹰', '乌龟', '小鸡', '蛇', '狮子'],
  东西: ['雨伞', '眼镜', '手机', '耳机', '牙刷', '枕头', '台灯', '钥匙', '剪刀', '吉他', '帽子', '袜子', '镜子', '气球', '风筝', '电视', '闹钟', '口红', '书包', '自行车', '飞机', '帐篷', '蜡烛', '相机'],
  地方: ['海边', '电影院', '机场', '游乐园', '图书馆', '便利店', '医院', '学校', '厨房', '山顶', '地铁', '寺庙'],
  动作: ['跳绳', '游泳', '睡觉', '打哈欠', '跳舞', '钓鱼', '打喷嚏', '刷牙', '放风筝', '滑雪', '照镜子', '打电话'],
  我们俩: ['牵手', '拥抱', '视频通话', '行李箱', '机票', '晚安', '戒指', '情书', '吃醋', '撒娇', '约会', '亲亲', '比心', '烟花', '摩天轮', '求婚', '早安', '想你'],
};
const ALL = Object.entries(WORDS).flatMap(([cat, ws]) => ws.map((w) => ({ cat, w })));

const COLORS = ['#2a2030', '#e05a6f', '#4a8fe0', '#f2c14a', '#5fbf6a', '#8a5a3a', '#ffffff'];
const CW = 480, CH = 360; // 画布逻辑尺寸
const ROUND = 90; // 秒

const norm = (s) => String(s || '').replace(/[\s,，.。!！?？~～、]/g, '').toLowerCase();

export function mount(root, ctx) {
  let drawer = ctx.host ? ctx.me : ctx.partner; // 先画的是发起的人
  let word = null; // 只有画的人知道
  let hint = '';
  let endsAt = 0;
  let timer = null;
  let phase = 'pick'; // pick | draw | end
  let score = { ok: 0, total: 0 };
  let guesses = [];
  let revealed = '';
  let color = COLORS[0];
  let size = 4;
  const strokes = new Map(); // 猜的人这边：stroke id -> 最后一个点
  let strokeId = 0;
  let outBuf = null;
  let flushTimer = null;
  let lastEnd = null;

  const iDraw = () => drawer === ctx.me;

  root.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <span id="dRole" style="font-weight:700"></span>
      <span class="row"><span id="dTime" style="font:700 15px ui-monospace,Menlo,monospace;color:var(--gold)"></span><span class="hint" id="dScore"></span></span>
    </div>
    <div id="dHint" style="margin-bottom:8px;font-size:15px"></div>
    <div style="position:relative">
      <canvas id="dCv" width="${CW}" height="${CH}" style="width:100%;display:block;background:#fffaf0;border:2px solid var(--line);touch-action:none;cursor:crosshair"></canvas>
      <div id="dOver" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(22,21,29,.86)"></div>
    </div>
    <div id="dTools" class="row" style="margin-top:8px"></div>
    <div id="dGuessRow" class="row" style="margin-top:8px">
      <input type="text" id="dGuess" placeholder="猜是什么，回车" style="flex:1" maxlength="20">
      <button id="dSend" class="gold">猜</button>
    </div>
    <div id="dLog" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>
  `;
  const $ = (id) => root.querySelector('#' + id);
  const cv = $('dCv');
  const g2 = cv.getContext('2d');
  g2.lineCap = 'round';
  g2.lineJoin = 'round';

  function clearCanvas() { g2.fillStyle = '#fffaf0'; g2.fillRect(0, 0, CW, CH); }
  clearCanvas();

  // ---------- 工具栏 ----------
  function renderTools() {
    const t = $('dTools');
    t.innerHTML = '';
    if (!iDraw() || phase !== 'draw') return;
    for (const c of COLORS) {
      const b = document.createElement('div');
      b.style.cssText = `width:24px;height:24px;background:${c};border:2px solid ${c === color ? 'var(--gold)' : 'var(--line)'};cursor:pointer;${c === '#ffffff' ? 'display:grid;place-items:center;font-size:12px;color:#888' : ''}`;
      if (c === '#ffffff') b.textContent = '擦';
      b.onclick = () => { color = c; renderTools(); };
      t.appendChild(b);
    }
    for (const [s, label] of [[4, '细'], [10, '粗']]) {
      const b = document.createElement('button');
      b.className = s === size ? '' : 'ghost';
      b.textContent = label;
      b.onclick = () => { size = s; renderTools(); };
      t.appendChild(b);
    }
    const clr = document.createElement('button');
    clr.className = 'ghost';
    clr.textContent = '清空';
    clr.onclick = () => { clearCanvas(); ctx.send('clear'); };
    t.appendChild(clr);
    const skip = document.createElement('button');
    skip.className = 'ghost';
    skip.textContent = '跳过这题';
    skip.onclick = () => finish(false);
    t.appendChild(skip);
  }

  // ---------- 画 ----------
  let drawing = false;
  let last = null;
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * CW), Math.round(((e.clientY - r.top) / r.height) * CH)];
  }
  function seg(a, b, c, w) {
    g2.strokeStyle = c;
    g2.lineWidth = w;
    g2.beginPath();
    g2.moveTo(a[0], a[1]);
    g2.lineTo(b[0], b[1]);
    g2.stroke();
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!iDraw() || phase !== 'draw') return;
    cv.setPointerCapture(e.pointerId);
    drawing = true;
    strokeId++;
    last = pos(e);
    seg(last, last, color, color === '#ffffff' ? size * 3 : size);
    outBuf = { s: strokeId, c: color, w: color === '#ffffff' ? size * 3 : size, p: [...last], first: true };
    flush();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 2) return;
    seg(last, p, color, color === '#ffffff' ? size * 3 : size);
    last = p;
    if (!outBuf) outBuf = { s: strokeId, c: color, w: color === '#ffffff' ? size * 3 : size, p: [] };
    outBuf.p.push(p[0], p[1]);
    if (!flushTimer) flushTimer = setTimeout(flush, 50);
  });
  const up = () => { if (drawing) { drawing = false; flush(); } };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (outBuf && outBuf.p.length) ctx.send('pts', outBuf);
    outBuf = null;
  }
  function onPts(m) {
    const p = m.p || [];
    let prev = m.first ? null : strokes.get(m.s);
    for (let i = 0; i + 1 < p.length; i += 2) {
      const pt = [p[i], p[i + 1]];
      seg(prev || pt, pt, m.c, m.w);
      prev = pt;
    }
    if (prev) strokes.set(m.s, prev);
  }

  // ---------- 回合 ----------
  function overlay(html) {
    const o = $('dOver');
    if (!html) { o.style.display = 'none'; o.innerHTML = ''; return o; }
    o.style.display = 'flex';
    o.innerHTML = `<div class="center" style="padding:16px">${html}</div>`;
    return o;
  }

  function pickScreen() {
    phase = 'pick';
    word = null;
    hint = '';
    guesses = [];
    revealed = '';
    clearCanvas();
    strokes.clear();
    renderTop();
    renderLog();
    renderTools();
    if (iDraw()) {
      const opts = [];
      while (opts.length < 3) { const w = ALL[Math.floor(Math.random() * ALL.length)]; if (!opts.some((o) => o.w === w.w)) opts.push(w); }
      const o = overlay(`<div style="font-weight:700;margin-bottom:10px">轮到你画了，选一个 👇</div><div class="row" style="justify-content:center"></div>${lastEndHtml()}`);
      const row = o.querySelector('.row');
      for (const it of opts) {
        const b = document.createElement('button');
        b.className = 'gold';
        b.textContent = it.w;
        b.onclick = () => startRound(it);
        row.appendChild(b);
      }
    } else {
      overlay(`<div style="font-size:30px">${ctx.icon[drawer]}</div><div style="margin-top:6px">TA 在选题…</div>${lastEndHtml()}`);
    }
  }
  function lastEndHtml() {
    if (!lastEnd) return '';
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<div class="hint" style="margin-top:14px">上一题是「${esc(lastEnd.word)}」${lastEnd.ok ? '，猜中了 🎉' : '，没猜出来'}</div>`;
  }

  function startRound(it) {
    word = it.w;
    hint = `${[...word].length} 个字 · ${it.cat}`;
    ctx.send('round', { hint, dur: ROUND });
    beginDraw(ROUND);
  }
  function beginDraw(dur) {
    phase = 'draw';
    endsAt = Date.now() + dur * 1000;
    revealed = '';
    overlay(null);
    renderTop();
    renderTools();
    renderLog();
    clearInterval(timer);
    timer = setInterval(tickTime, 250);
    tickTime();
    if (!iDraw()) setTimeout(() => $('dGuess').focus(), 50);
  }
  let hinted = false;
  function tickTime() {
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    $('dTime').textContent = phase === 'draw' ? `⏱ ${left}` : '';
    if (!iDraw() || phase !== 'draw') return;
    // 过了一半时间，送一个字的提示
    if (!hinted && left <= ROUND / 2 && [...word].length > 1) {
      hinted = true;
      const chars = [...word];
      const i = Math.floor(Math.random() * chars.length);
      ctx.send('hint', { text: chars.map((c, j) => (j === i ? c : '＿')).join(' ') });
      revealed = chars.map((c, j) => (j === i ? c : '＿')).join(' ');
      renderTop();
    }
    if (left <= 0) finish(false);
  }

  function finish(ok, by) {
    if (phase !== 'draw') return;
    flush();
    ctx.send('end', { word, ok, by });
    onEnd({ word, ok });
  }
  function onEnd(m) {
    phase = 'end';
    clearInterval(timer);
    hinted = false;
    score.total++;
    if (m.ok) { score.ok++; ctx.earn(); }
    lastEnd = { word: m.word, ok: m.ok };
    drawer = drawer === ctx.me ? ctx.partner : ctx.me; // 换人
    const esc = String(m.word).replace(/[&<>]/g, '');
    overlay(`<div style="font-size:40px">${m.ok ? '🎉' : '🤔'}</div><h2 style="margin:6px 0">${esc}</h2><div class="hint">${m.ok ? '猜中了！' : '没猜出来'}　下一题换${drawer === ctx.me ? '你' : ' TA '}画</div>`);
    renderTools();
    renderTop();
    setTimeout(() => { if (phase === 'end') pickScreen(); }, 2600);
  }

  // ---------- 猜 ----------
  function guess() {
    const inp = $('dGuess');
    const v = inp.value.trim();
    inp.value = '';
    if (!v || iDraw() || phase !== 'draw') return;
    guesses.push({ text: v, ok: null });
    renderLog();
    ctx.send('guess', { text: v });
  }
  $('dSend').onclick = guess;
  $('dGuess').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) guess(); });

  function renderLog() {
    const log = $('dLog');
    log.innerHTML = '';
    for (const g of guesses.slice(-12)) {
      const s = document.createElement('span');
      s.style.cssText = `padding:2px 8px;background:var(--panel2);border:2px solid ${g.ok ? 'var(--ok)' : 'var(--line)'};${g.ok === false ? 'text-decoration:line-through;color:var(--dim)' : ''}`;
      s.textContent = `${ctx.icon[iDraw() ? ctx.partner : ctx.me]} ${g.text}`;
      log.appendChild(s);
    }
  }

  function renderTop() {
    $('dRole').textContent = phase === 'end' ? '' : iDraw() ? (word ? `你在画：${word}` : '你来画') : `${ctx.icon[drawer]} 在画，你来猜`;
    $('dHint').textContent = phase === 'draw' ? (revealed || (iDraw() ? '' : hint)) : '';
    if (phase === 'draw' && iDraw()) $('dHint').textContent = `TA 看到的提示：${revealed || hint}`;
    $('dScore').textContent = score.total ? `猜中 ${score.ok} / ${score.total}` : '';
    $('dGuessRow').style.display = !iDraw() && phase === 'draw' ? '' : 'none';
  }

  pickScreen();

  return {
    onMsg(m) {
      switch (m.op) {
        case 'round': if (!iDraw()) { hint = m.hint; clearCanvas(); strokes.clear(); guesses = []; beginDraw(m.dur || ROUND); } break;
        case 'pts': if (!iDraw()) onPts(m); break;
        case 'clear': if (!iDraw()) { clearCanvas(); strokes.clear(); } break;
        case 'hint': if (!iDraw()) { revealed = m.text; renderTop(); } break;
        case 'guess':
          if (iDraw() && phase === 'draw') {
            const ok = norm(m.text) === norm(word);
            guesses.push({ text: m.text, ok });
            renderLog();
            ctx.send('judge', { text: m.text, ok });
            if (ok) finish(true, 'guess');
          }
          break;
        case 'judge': {
          const g = [...guesses].reverse().find((x) => x.text === m.text && x.ok == null);
          if (g) { g.ok = m.ok; renderLog(); }
          break;
        }
        case 'end': if (!iDraw() && phase === 'draw') onEnd(m); break;
      }
    },
    destroy() { clearInterval(timer); clearTimeout(flushTimer); },
  };
}

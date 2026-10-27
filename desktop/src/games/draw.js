// 你画我猜：一个人画，另一个人看着笔画一笔一笔出来，猜。猜中了换人。
// 题目只在画的人那边，猜的对不对也由画的人那边判断。

export const META = { name: '你画我猜', icon: '🎨', desc: '一个人画，一个人猜。笔画是实时出现的，像在背上写字。' };

// 每次给画的人三个选项：一个「日常」（好画），一个「有梗」（画出来就好笑），一个「我们俩」（或者 TA 出的题）。
// 有梗的那一档是节目效果的来源：成语和俗语只能照字面画（对牛弹琴就得真画一头牛在听琴），
// 网络梗和倒霉瞬间要靠表情和动作，画的过程本身就是笑点。
const LANES = {
  日常: {
    食物: ['火锅', '西瓜', '冰淇淋', '饺子', '奶茶', '寿司', '拉面', '汉堡', '煎蛋', '月饼', '烤串', '草莓', '榴莲', '小笼包', '薯条', '蛋糕', '爆米花', '粽子', '披萨', '烤鸭', '章鱼烧', '冰糖葫芦', '螺蛳粉', '方便面', '饭团'],
    动物: ['水母', '黑猫', '兔子', '企鹅', '长颈鹿', '章鱼', '蜗牛', '熊猫', '金鱼', '刺猬', '恐龙', '螃蟹', '柯基', '鲸鱼', '猫头鹰', '乌龟', '羊驼', '树懒', '火烈鸟', '袋鼠', '仓鼠', '海豹'],
    东西: ['雨伞', '眼镜', '耳机', '牙刷', '枕头', '台灯', '钥匙', '吉他', '袜子', '气球', '风筝', '闹钟', '口红', '自行车', '帐篷', '蜡烛', '相机', '保温杯', '插排', '拖把', '充电宝', '电风扇', '马桶', '体重秤', '自拍杆'],
    地方: ['海边', '电影院', '机场', '游乐园', '便利店', 'KTV', '厨房', '山顶', '地铁', '温泉', '监狱', '健身房'],
  },
  有梗: {
    成语: ['对牛弹琴', '画蛇添足', '守株待兔', '掩耳盗铃', '井底之蛙', '狐假虎威', '鸡飞狗跳', '七上八下', '三头六臂', '胸有成竹', '火上浇油', '打草惊蛇', '一石二鸟', '鸡同鸭讲', '望穿秋水', '对酒当歌', '狼吞虎咽', '见钱眼开', '张牙舞爪', '亡羊补牢', '杯弓蛇影', '画饼充饥', '盲人摸象', '如坐针毡'],
    俗语: ['瞎猫碰上死耗子', '天上掉馅饼', '热锅上的蚂蚁', '落汤鸡', '拍马屁', '吹牛', '背锅', '放鸽子', '打脸', '一根筋', '纸老虎', '癞蛤蟆想吃天鹅肉', '猪队友', '铁饭碗'],
    网络梗: ['躺平', '摸鱼', '内卷', '社恐', '画饼', '吃瓜', '柠檬精', '戏精', '破防', '摆烂', '社死', '大冤种', '显眼包', '打工人', '干饭', '早八', '秃头', '熬夜', '断舍离', '电子榨菜', '发疯文学', '已读不回'],
    倒霉瞬间: ['踩到乐高', '被蚊子咬', '撞玻璃门', '落枕', '打嗝停不下来', '腿麻了', '手机砸脸', '鬼压床', '抢红包', '晕车', '起床气', '跪地求饶', '偷吃被抓', '头发打结', '脚趾踢到桌角'],
    人物: ['孙悟空', '猪八戒', '哪吒', '贞子', '圣诞老人', '美人鱼', '嫦娥', '月老', '财神爷', '孟婆', '外星人', '僵尸', '木乃伊'],
  },
  我们俩: {
    恋爱: ['牵手', '拥抱', '公主抱', '壁咚', '摸头杀', '亲亲', '比心', '一见钟情', '暗送秋波', '花前月下', '吃醋', '撒娇', '冷战', '哄人', '恋爱脑', '狗粮', '情侣装', '查岗', '秒回', '晚安吻', '抢被子', '剥虾', '求婚', '戒指', '情书', '纪念日', '床头吵架床尾和'],
    异地: ['视频通话', '异地恋', '机票', '行李箱', '接机', '送机', '想你', '晚安', '早安', '时差', '新干线', '高铁', '牛郎织女', '鹊桥', '快递', '一起看电影'],
    东京广州: ['东京塔', '广州塔', '富士山', '早茶', '肠粉', '拉面', '樱花', '烟花大会', '便利店饭团', '珍珠奶茶', '小蛮腰'],
  },
};
const POOL = Object.fromEntries(Object.entries(LANES).map(([lane, cats]) => [lane, Object.entries(cats).flatMap(([cat, ws]) => ws.map((w) => ({ lane, cat, w })))]));
const rand = (a) => a[Math.floor(Math.random() * a.length)];

// TA 出的题：存在自己电脑上，开局时发给 TA，TA 画的时候会抽到
const CUSTOM_KEY = 'jc_draw_custom';
function loadCustom() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]').filter((x) => typeof x === 'string').slice(0, 200); } catch { return []; } }
function saveCustom(list) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.slice(0, 200))); } catch {} }

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
  let fromPartner = []; // TA 出给我画的题
  const usedCustom = new Set();
  let myCustom = loadCustom(); // 我出给 TA 画的题

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
    <details id="dCustom" style="margin-top:12px">
      <summary class="hint" style="cursor:pointer">💌 给 TA 出题（只有 TA 画的时候会抽到，你们俩的梗写在这里最好笑）</summary>
      <div class="row" style="margin-top:6px"><input type="text" id="dCIn" placeholder="比如：你上次在机场睡着" style="flex:1" maxlength="16"><button id="dCAdd">加</button></div>
      <div id="dCList" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"></div>
    </details>
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
      const o = overlay(`<div style="font-weight:700;margin-bottom:10px">轮到你画了，选一个 👇</div><div class="grid4" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:300px;margin:0 auto"></div><button class="ghost" style="margin-top:12px">🎲 再随机 4 个</button>${lastEndHtml()}`);
      const grid = o.querySelector('.grid4');
      const deal = () => {
        // 四个：日常、有梗、我们俩（或者 TA 出的题），再加一个随便哪档
        const opts = [];
        const add = (it) => { if (it && !opts.some((x) => x.w === it.w)) { opts.push(it); return true; } return false; };
        add(rand(POOL.日常));
        add(rand(POOL.有梗));
        const fresh = fromPartner.filter((w) => !usedCustom.has(w));
        if (fresh.length && Math.random() < 0.6) add({ lane: '我们俩', cat: 'TA 出的题', w: rand(fresh), custom: true });
        else add(rand(POOL.我们俩));
        while (opts.length < 4) add(rand(rand([POOL.日常, POOL.有梗, POOL.有梗, POOL.我们俩])));
        grid.innerHTML = '';
        for (const it of opts) {
          const b = document.createElement('button');
          b.className = 'gold';
          b.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px';
          b.innerHTML = '<span></span><small style="font-weight:400;font-size:10px;opacity:.7"></small>';
          b.firstChild.textContent = it.w;
          b.lastChild.textContent = it.custom ? '💌 TA 出的题' : `${it.lane} · ${it.cat}`;
          b.onclick = () => { if (it.custom) usedCustom.add(it.w); startRound(it); };
          grid.appendChild(b);
        }
      };
      o.querySelector('button.ghost').onclick = deal;
      deal();
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
    hint = `${[...word].length} 个字 · ${it.custom ? 'TA 出的题' : it.cat}`;
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

  function renderCustom() {
    const list = $('dCList');
    list.innerHTML = '';
    for (const w of myCustom) {
      const t = document.createElement('span');
      t.style.cssText = 'padding:2px 6px;background:var(--panel2);border:2px solid var(--line);cursor:pointer';
      t.title = '点一下删掉';
      t.textContent = w + ' ✕';
      t.onclick = () => { myCustom = myCustom.filter((x) => x !== w); saveCustom(myCustom); ctx.send('custom', { words: myCustom }); renderCustom(); };
      list.appendChild(t);
    }
    if (!myCustom.length) list.innerHTML = '<span class="hint">还没有</span>';
  }
  function addCustom() {
    const inp = $('dCIn');
    const v = inp.value.trim().slice(0, 16);
    inp.value = '';
    if (!v || myCustom.includes(v)) return;
    myCustom = [v, ...myCustom];
    saveCustom(myCustom);
    ctx.send('custom', { words: myCustom });
    renderCustom();
  }
  $('dCAdd').onclick = addCustom;
  $('dCIn').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) addCustom(); });
  renderCustom();
  ctx.send('custom', { words: myCustom });

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
        case 'custom':
          if (Array.isArray(m.words)) {
            const had = fromPartner.length;
            fromPartner = m.words.map((w) => String(w).slice(0, 16)).filter(Boolean).slice(0, 200);
            // TA 刚出了新题，而我正在选题：刷新一下选项
            if (!had && fromPartner.length && phase === 'pick' && iDraw()) pickScreen();
          }
          break;
      }
    },
    destroy() { clearInterval(timer); clearTimeout(flushTimer); },
  };
}

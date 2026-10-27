// 在 B 站页面里运行：盯着播放器，把你的操作告诉 TA，把 TA 的操作照做。
(() => {
  if (window.__jellyCatSync) return;
  window.__jellyCatSync = true;

  const DRIFT = 1.5; // 误差超过这么多秒才拉齐
  const HB_MS = 2000; // 心跳间隔

  let port = null;
  let video = null;
  let key = null;
  let href = null;
  let me = 'cat';
  let leader = false; // 最后动手的人是"领头的"，只有领头的发心跳
  let autoPaused = false; // 因为 TA 在缓冲而暂停
  let myBuffering = false;
  let bufTimer = null;
  let loadedAt = Date.now();
  const expect = { seek: 0, pause: 0, play: 0, rate: 0 }; // 自己触发的事件，不当成用户操作

  chrome.storage.local.get('who').then((r) => { if (r.who) me = r.who; });
  chrome.storage.onChanged.addListener((c) => { if (c.who) me = c.who.newValue; });
  const partnerIcon = () => (me === 'cat' ? '🪼' : '🐈‍⬛');

  // ---------- 识别是哪个视频 ----------
  function keyOf(u) {
    let url;
    try { url = new URL(u); } catch { return null; }
    const m = url.pathname.match(/\/video\/(BV\w+|av\d+)/i);
    const bvid = url.searchParams.get('bvid') || (m && m[1]);
    if (bvid) return `v:${bvid}:${url.searchParams.get('p') || '1'}`;
    const ep = url.pathname.match(/\/bangumi\/play\/((?:ep|ss)\d+)/);
    if (ep) return `b:${ep[1]}`;
    return null;
  }

  function cleanUrl(u) {
    const url = new URL(u);
    for (const p of ['t', 'spm_id_from', 'vd_source', 'from_spmid', 'share_source', 'share_medium', 'bbid', 'ts', 'unique_k', 'from', 'seid']) url.searchParams.delete(p);
    return url.toString();
  }

  function cleanTitle() {
    return document.title.replace(/[_-]\s*哔哩哔哩.*$/, '').replace(/_bilibili$/i, '').trim();
  }

  // ---------- 和后台连接 ----------
  function connectPort() {
    try { port = chrome.runtime.connect({ name: 'sync' }); } catch { return; } // 插件被重载了
    port.onMessage.addListener(onRemote);
    port.onDisconnect.addListener(() => { port = null; setTimeout(() => { connectPort(); reportPage(false); }, 1000); });
  }
  function post(m) { if (port) try { port.postMessage(m); } catch {} }

  function reportPage(fresh, extra = {}) {
    post({
      t: 'page',
      fresh,
      active: !document.hidden,
      playing: !!(video && !video.paused),
      page: key ? { key, url: cleanUrl(location.href), title: cleanTitle() } : null,
      ...extra,
    });
  }

  // ---------- 找播放器 ----------
  function findVideo() {
    return document.querySelector('#bilibili-player video, #bilibili-player bwp-video, .bpx-player-video-wrap video, .bpx-player-video-wrap bwp-video, video, bwp-video');
  }

  const EVENTS = ['play', 'pause', 'seeked', 'ratechange', 'waiting', 'playing', 'canplay'];
  function bind(v) {
    if (video === v) return;
    if (video) for (const ev of EVENTS) video.removeEventListener(ev, onLocal);
    video = v;
    if (video) {
      for (const ev of EVENTS) video.addEventListener(ev, onLocal);
      if (key) reportPage(true); // 播放器刚出现 → 再问一次 TA 的进度
    }
  }

  const snap = () => ({ time: video.currentTime, paused: video.paused, rate: video.playbackRate });

  // ---------- 我这边发生了什么 ----------
  function consumeExpected(kind) {
    if (expect[kind] > Date.now()) { expect[kind] = 0; return true; }
    return false;
  }

  function onLocal(e) {
    if (!key || !video) return;
    const t = e.type;

    if (t === 'waiting') {
      clearTimeout(bufTimer);
      bufTimer = setTimeout(() => {
        if (video && video.readyState < 3 && !video.paused) {
          myBuffering = true;
          post({ t: 'buf', key, on: true, time: video.currentTime });
        }
      }, 400); // 一闪而过的卡顿不算
      return;
    }
    if (t === 'playing' || t === 'canplay') {
      clearTimeout(bufTimer);
      if (myBuffering) { myBuffering = false; post({ t: 'buf', key, on: false, time: video.currentTime }); }
      return;
    }

    const kind = t === 'seeked' ? 'seek' : t === 'ratechange' ? 'rate' : t;
    if (consumeExpected(kind)) return; // 这是我们照着 TA 做的，不是你按的
    if (t === 'pause' && autoPaused) return;
    // 刚打开页面时 B 站会自己播放、自己跳到"上次看到"，这些不是你按的，别把 TA 带回去
    if (Date.now() - loadedAt < 4000) return;

    leader = true;
    if (t === 'play' && autoPaused) autoPaused = false;
    post({ t: 'ctl', key, action: kind, ...snap() });
  }

  // ---------- 照着 TA 做 ----------
  function setTime(target) {
    if (Math.abs(video.currentTime - target) > 0.5) {
      expect.seek = Date.now() + 5000;
      video.currentTime = target;
    }
  }
  function doPause() {
    if (video.paused) return;
    expect.pause = Date.now() + 1500;
    video.pause();
  }
  function doPlay() {
    if (!video.paused) return;
    expect.play = Date.now() + 3000;
    Promise.resolve(video.play()).catch(() => {
      expect.play = 0;
      // 浏览器不让自动播放：给一个点一下就跟上的小按钮
      toast(`${partnerIcon()} 开始播了，点我跟上`, () => video.play(), 8000);
    });
  }
  function setRate(r) {
    if (r && video.playbackRate !== r) { expect.rate = Date.now() + 1500; video.playbackRate = r; }
  }

  function applyState(m) {
    const lat = ((m.lat || 0) + (m.rlat || 0)) / 1000;
    const target = m.time + (m.paused ? 0 : lat * (m.rate || 1));
    setRate(m.rate);
    setTime(target);
    if (m.paused) doPause(); else doPlay();
  }

  function onRemote(m) {
    if (!video || !key) return;

    if (m.t === 'ctl' && m.action === 'nav') {
      // TA 切到了下一集，我还停在上一集 → 跟过去
      if (m.key === key && m.url && keyOf(m.url) !== key) location.href = m.url;
      return;
    }
    if (m.key !== key) return;

    if (m.t === 'need') {
      // 刚打开页面的那一方不回答，避免两边互相跳
      if (Date.now() - loadedAt < 3000 && !leader) return;
      leader = true;
      post({ t: 'ctl', key, action: 'seek', ...snap() });
      return;
    }

    if (m.t === 'ctl') {
      leader = false;
      autoPaused = false;
      applyState(m);
      if (m.action === 'pause') toast(`${partnerIcon()} ⏸`);
      else if (m.action === 'play') toast(`${partnerIcon()} ▶`);
      else if (m.action === 'seek') toast(`${partnerIcon()} ⇥ ${fmt(m.time)}`);
      return;
    }

    if (m.t === 'buf') {
      const lat = ((m.lat || 0) + (m.rlat || 0)) / 1000;
      if (m.on) {
        if (!video.paused) { autoPaused = true; doPause(); toast(`${partnerIcon()} 在缓冲…`, null, 60000, 'buf'); }
      } else if (autoPaused) {
        autoPaused = false;
        setTime(m.time + lat);
        doPlay();
        hideToast('buf');
      }
      return;
    }

    if (m.t === 'hb') {
      if (leader) {
        // 两个人同时觉得自己领头：按名字定一个
        if (m.from && me > m.from) leader = false;
        else return;
      }
      if (autoPaused || myBuffering) return;
      const lat = ((m.lat || 0) + (m.rlat || 0)) / 1000;
      setRate(m.rate);
      if (m.paused !== video.paused) { applyState(m); return; }
      if (!m.paused) {
        const expected = m.time + lat * (m.rate || 1);
        if (Math.abs(video.currentTime - expected) > DRIFT) setTime(expected);
      }
    }
  }

  // ---------- 轮询：换视频、换集、播放器重建 ----------
  function tick() {
    const v = findVideo();
    if (v !== video) bind(v);

    if (location.href !== href) {
      const oldKey = key;
      href = location.href;
      const newKey = keyOf(href);
      if (newKey !== oldKey) {
        if (oldKey && newKey) post({ t: 'ctl', key: oldKey, action: 'nav', url: cleanUrl(href) });
        key = newKey;
        leader = false;
        autoPaused = false;
        loadedAt = Date.now();
        reportPage(true);
      }
    }
  }

  setInterval(tick, 1000);
  setInterval(() => {
    if (leader && video && key && !myBuffering) post({ t: 'hb', key, ...snap() });
  }, HB_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reportPage(false); });

  // ---------- 小提示 ----------
  let toastEl = null;
  let toastTimer = null;
  let toastTag = null;
  function toast(text, onClick = null, ms = 1800, tag = null) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('style', [
        'position:fixed', 'left:16px', 'bottom:16px', 'z-index:2147483647',
        'background:#1b1a24', 'color:#f3ead7', 'font:600 13px/1.2 ui-monospace,Menlo,monospace',
        'padding:8px 12px', 'border:2px solid #f3ead7', 'box-shadow:4px 4px 0 #000',
        'image-rendering:pixelated', 'transition:opacity .2s', 'opacity:0', 'pointer-events:none',
      ].join(';'));
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    toastEl.style.cursor = onClick ? 'pointer' : 'default';
    toastEl.style.pointerEvents = onClick ? 'auto' : 'none';
    toastEl.onclick = onClick ? () => { onClick(); hideToast(); } : null;
    toastTag = tag;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hideToast(), ms);
  }
  function hideToast(tag) {
    if (tag && tag !== toastTag) return;
    if (toastEl) { toastEl.style.opacity = '0'; toastEl.style.pointerEvents = 'none'; }
  }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }

  connectPort();
  tick();
})();

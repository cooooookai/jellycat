const $ = (id) => document.getElementById(id);
const api = window.jc;
const SCALES = [1, 1.5, 2, 3];
const who = () => document.querySelector('input[name=who]:checked').value;

async function load() {
  const c = await api.getConfig();
  document.querySelector(`input[name=who][value=${c.who === 'jelly' ? 'jelly' : 'cat'}]`).checked = true;
  $('hostServer').checked = !!c.hostServer;
  $('server').value = c.server || '';
  $('room').value = c.room || '';
  $('secret').value = c.secret || '';
  $('hideInGame').checked = c.hideInGame !== false;
  $('games').value = (c.games || []).join(', ');
  $('scales').innerHTML = SCALES.map((s) => `<label><input type="radio" name="scale" value="${s}" ${c.scale === s ? 'checked' : ''}> ${s}×</label>`).join('');
  syncHost();
}
function syncHost() { $('serverBox').hidden = $('hostServer').checked; }
$('hostServer').onchange = syncHost;

// 选身份立刻生效
for (const r of document.querySelectorAll('input[name=who]')) r.onchange = () => api.saveConfig({ who: who() });

$('btnMake').onclick = async () => {
  $('makeErr').textContent = '';
  const r = await api.makeCode({ who: who(), hostServer: $('hostServer').checked, server: $('server').value });
  if (r.error) { $('makeErr').textContent = r.error; return; }
  $('code').value = r.code;
  $('code').hidden = false;
  $('madeMsg').hidden = false;
  load();
};
$('code').onclick = () => $('code').select();

$('btnApply').onclick = async () => {
  $('applyErr').textContent = '';
  const r = await api.applyCode($('paste').value);
  if (r.error) { $('applyErr').textContent = r.error; return; }
  $('applyOk').hidden = false;
  $('applyOk').textContent = `配好了！你是 ${r.who === 'cat' ? '🐈‍⬛ 小黑猫' : '🪼 小水母'}。`;
  load();
};

$('btnSave').onclick = async () => {
  await api.saveConfig({
    who: who(),
    room: $('room').value.trim(),
    secret: $('secret').value,
    scale: Number((document.querySelector('input[name=scale]:checked') || {}).value || 2),
    hideInGame: $('hideInGame').checked,
    games: $('games').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
  });
};

async function poll() {
  const s = await api.getStatus();
  const el = $('status');
  el.classList.toggle('ok', s.connected);
  $('statusText').textContent = !s.configured ? '还没配对'
    : s.connected ? `已连上${s.rtt != null ? ' · ' + s.rtt + 'ms' : ''} · ${s.partnerOnline ? 'TA 也在线 ♡' : '等 TA 上线'}`
    : (s.error || '连接中…');
  if (s.lan) $('hostHint').textContent = `服务器开着：${s.lan}。TA 的电脑要和你在同一个 Wi-Fi 下。`;
}
setInterval(poll, 1500);
load();
poll();

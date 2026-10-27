// 识别"现在电脑最前面是什么程序"，翻译成小房间里的活动。
// 不需要装任何原生模块：Windows 用一个常驻的 PowerShell，Mac 用系统自带的 osascript。
const { spawn, execFile } = require('node:child_process');

const BROWSERS = ['chrome', 'google chrome', 'msedge', 'microsoft edge', 'firefox', 'arc', 'safari', 'brave', 'brave browser', 'opera', 'vivaldi'];
const AI_APPS = [
  [/chatgpt/i, 'gpt'],
  [/^claude$/i, 'claude'],
  [/kimi/i, 'kimi'],
  [/doubao|豆包/i, 'doubao'],
];
const EDIT = [/剪映|capcut|jianying|videofusion|^com\.lemon\.lv/i];
const WECHAT = [/^wechat$|微信|^weixin$|com\.tencent\.xinwechat/i];
const MEETING = [/wemeet|腾讯会议|tencentmeeting|voovmeeting|zoom|teams|lark|feishu|飞书/i];
const GAMES = [
  /-win64-shipping/i, // 虚幻引擎游戏的通用进程名
  /yuanshen|genshin|starrail|zenless|honkai|bh3/i,
  /league of legends|leagueclient|valorant|riot/i,
  /overwatch|dota2|cs2|csgo|tslgame|pubg|r5apex|fortnite|apex/i,
  /minecraft|javaw|osu!?|terraria|stardew|hollow knight|eldenring|steam_app|bf\d|battlefield/i,
  /wuthering|naraka|永劫|原神|崩坏|绝区零|鸣潮|王者|和平精英/i,
  /^com\.riotgames|^com\.mojang|^com\.valvesoftware\.(?!steam$)/i,
];

function classify(name, bundle, extraGames = []) {
  const n = (name || '').trim();
  const lower = n.toLowerCase();
  if (!n) return null;
  if (BROWSERS.includes(lower) || /chrome|edge|firefox/i.test(bundle || '')) return 'browser';
  for (const [re, act] of AI_APPS) if (re.test(n)) return act;
  if (EDIT.some((re) => re.test(n) || re.test(bundle || ''))) return 'edit';
  if (WECHAT.some((re) => re.test(n) || re.test(bundle || ''))) return 'wechat';
  if (MEETING.some((re) => re.test(n) || re.test(bundle || ''))) return 'meeting';
  if (extraGames.some((g) => g && lower.includes(String(g).toLowerCase()))) return 'game';
  if (GAMES.some((re) => re.test(n) || re.test(bundle || ''))) return 'game';
  return 'work';
}

// Windows：常驻 PowerShell，每 2 秒输出一次最前面窗口的进程名
const WIN_SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class JcFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);
}
"@
$last = ""
while ($true) {
  try {
    $h = [JcFg]::GetForegroundWindow(); $p = 0
    [void][JcFg]::GetWindowThreadProcessId($h, [ref]$p)
    $name = (Get-Process -Id $p -ErrorAction Stop).ProcessName
  } catch { $name = "" }
  if ($name -ne $last) { [Console]::Out.WriteLine($name); [Console]::Out.Flush(); $last = $name }
  Start-Sleep -Milliseconds 2000
}
`;

// Mac：每次问一下系统最前面的 app，不需要任何权限
const MAC_SCRIPT = "ObjC.import('AppKit'); var a = $.NSWorkspace.sharedWorkspace.frontmostApplication; (a.localizedName.js || '') + '|' + (a.bundleIdentifier.js || '')";

function watchForeground(onChange) {
  let stopped = false;
  let last = null;
  const emit = (name, bundle) => {
    const key = name + '|' + (bundle || '');
    if (key === last) return;
    last = key;
    onChange({ name, bundle });
  };

  if (process.platform === 'win32') {
    let ps;
    const start = () => {
      if (stopped) return;
      ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true });
      ps.stdin.write(WIN_SCRIPT);
      ps.stdin.end();
      let buf = '';
      ps.stdout.on('data', (d) => {
        buf += d.toString('utf8');
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          emit(line, '');
        }
      });
      ps.on('exit', () => setTimeout(start, 5000)); // 挂了就重启
      ps.on('error', () => {});
    };
    start();
    return () => { stopped = true; try { ps && ps.kill(); } catch {} };
  }

  if (process.platform === 'darwin') {
    const tick = () => {
      if (stopped) return;
      execFile('osascript', ['-l', 'JavaScript', '-e', MAC_SCRIPT], { timeout: 4000 }, (err, out) => {
        if (!err && out) {
          const [name, bundle] = out.trim().split('|');
          emit(name, bundle);
        }
        setTimeout(tick, 2500);
      });
    };
    tick();
    return () => { stopped = true; };
  }

  // Linux：有 xdotool 就用，没有就算了
  const tick = () => {
    if (stopped) return;
    execFile('sh', ['-c', 'cat /proc/$(xdotool getactivewindow getwindowpid)/comm'], { timeout: 3000 }, (err, out) => {
      if (!err && out) emit(out.trim(), '');
      setTimeout(tick, 2500);
    });
  };
  tick();
  return () => { stopped = true; };
}

module.exports = { classify, watchForeground };

# AGENT_SETUP · 给 AI 助手的安装任务书

> 这份文件写给帮人安装 JellyCat 的 AI 助手（Claude、Codex、Cursor 等）。人类读者请看 [README](README.md)。

## 目标

在用户的 Mac 上：

1. 安装并打开 JellyCat 桌面小房间；
2. 用对方发来的**配对码**完成配对，看到「已连上 · TA 也在线 ♡」；
3. （可选）安装 Chrome 插件，用来一起看 B 站。

**用户不需要部署服务器。** 服务器由生成配对码的一方负责，地址已经包含在配对码里。

## 开始前向用户确认

- 你是 🐈‍⬛ 小黑猫 还是 🪼 小水母？（配对时会自动设成和对方相反的那只，一般不用手动选。）
- 对方发来的配对码：一串以 `JC-` 开头的文字。没有的话先让用户去要。
- 用户手上是否已经有 `JellyCat-mac-…zip`（比如对方用微信发来的）。国内网络下载 GitHub 可能很慢，有本地文件优先用本地文件。

## 第 1 步：安装 App

有终端权限的话，运行：

```bash
curl -fsSL https://raw.githubusercontent.com/cooooookai/jellycat/main/scripts/install-mac.sh | bash
```

如果用户已经有本地 zip（注意选对芯片：Apple M 系列 → arm64 / `Apple芯片`，Intel → x64 / `Intel芯片`）：

```bash
curl -fsSL https://raw.githubusercontent.com/cooooookai/jellycat/main/scripts/install-mac.sh -o /tmp/install-mac.sh
bash /tmp/install-mac.sh "/完整路径/JellyCat-mac-Apple芯片.zip"
```

**终端连不上 GitHub（比如"无法解析 github.com"），但用户的浏览器能打开时**——很常见：浏览器走了代理，终端或 AI 的沙盒没走。请用户用浏览器打开 https://github.com/cooooookai/jellycat/releases/latest ，点 `JellyCat-mac-arm64.zip`（Intel 选 x64）下载。Safari 可能会自动解压，在「下载」里得到 `JellyCat.app`，这时用：

```bash
ditto ~/Downloads/JellyCat.app /Applications/JellyCat.app
xattr -cr /Applications/JellyCat.app
open /Applications/JellyCat.app
```

连 raw.githubusercontent.com 也打不开、手上只有 zip 时，手动做脚本里的事：

```bash
ditto -x -k "/完整路径/JellyCat-mac-Apple芯片.zip" /Applications
xattr -cr /Applications/JellyCat.app
open /Applications/JellyCat.app
```

注意事项：

- **不要用 `unzip` 解压**，它会破坏 App 里的符号链接，导致打不开。用 `ditto` 或在访达里双击 zip。
- App 没有苹果付费签名，`xattr -cr` 是必须的，否则会提示"已损坏"。
- 如果系统弹出「允许查找本地网络上的设备」或「接受传入网络连接」，请用户点**允许**。
- 打开后屏幕右下角会出现像素小房间，同时弹出设置窗口。

## 第 2 步：配对

在 JellyCat 的设置窗口里（没弹出的话：右键小房间 → 设置…）：

1. 把对方的配对码粘贴到「收到了 TA 的配对码」框里；
2. 点「配对」；
3. 等几秒，窗口顶部显示「已连上 · TA 也在线 ♡」即成功（对方不在线时显示「等 TA 上线」，也算连上了）。

**不要**勾选「这台电脑当服务器」，也不要点「生成配对码」——那是对方的步骤。

### 配对后连不上时

| 现象 | 原因和处理 |
|---|---|
| 「连接中…」一直不变 | 服务器在 Render 免费方案上，没人在线时会睡眠，第一次连接要等 30～60 秒；耐心等一分钟 |
| 一分钟后还连不上 | 在浏览器打开配对码对应的服务器地址（把 `wss://` 换成 `https://`），看到 `ok 🐈‍⬛🪼` 说明服务器正常，问题在网络；看不到就让对方检查服务器 |
| 显示「密钥不对」 | 配对码没复制完整，或对方重新生成过配对码，请对方重发 |

## 第 3 步（可选）：Chrome 插件

安装脚本会把插件放在 `~/Documents/JellyCat-Chrome插件/extension`；或者用对方发来的 `Chrome插件.zip` 解压。

1. Chrome 地址栏打开 `chrome://extensions`；
2. 右上角打开「开发者模式」；
3. 点「加载已解压的扩展程序」，选 `extension` 文件夹；
4. **不需要填任何设置**：只要 JellyCat 桌面端开着，插件会自动使用同一套配对。

## 完成后告诉用户

- 点自己 = 发消息，点 TA = 戳一下；右键小房间有更多功能。
- 一起看 B 站：打开 B 站视频，点插件图标 →「去 TA 那里」。
- 小房间可以拖到任何位置，透明的地方鼠标会直接点穿。

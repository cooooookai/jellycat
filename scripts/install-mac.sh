#!/bin/bash
# JellyCat · Mac 一键安装
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/cooooookai/jellycat/main/scripts/install-mac.sh | bash
# 或者已经有下载好的 zip：
#   bash install-mac.sh /路径/JellyCat-mac-arm64.zip
set -euo pipefail

REPO="cooooookai/jellycat"
BASE="https://github.com/$REPO/releases/latest/download"
APPS="/Applications"
[ -w "$APPS" ] || APPS="$HOME/Applications"
mkdir -p "$APPS"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say() { printf '\n🐈‍⬛🪼 %s\n' "$1"; }

# 1. 选对芯片
case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  *)     ARCH=x64 ;;
esac

# 2. 拿到安装包：用参数给的本地 zip，或者从 GitHub 下载
if [ "${1:-}" != "" ] && [ -f "$1" ]; then
  ZIP="$1"
  say "用本地安装包：$ZIP"
else
  ZIP="$TMP/JellyCat.zip"
  say "从 GitHub 下载（芯片：$ARCH）…"
  if ! curl -fL --retry 3 --connect-timeout 20 -o "$ZIP" "$BASE/JellyCat-mac-$ARCH.zip"; then
    echo "下载失败。国内网络连 GitHub 可能不稳定：让对方把 zip 发给你，然后运行"
    echo "  bash install-mac.sh /路径/JellyCat-mac-$ARCH.zip"
    exit 1
  fi
fi

# 3. 关掉正在运行的旧版本
pkill -x JellyCat 2>/dev/null || true
sleep 1

# 4. 解压（ditto 能正确保留 App 里的链接和签名）
say "安装到 $APPS …"
rm -rf "$APPS/JellyCat.app"
ditto -x -k "$ZIP" "$APPS"

# 5. 放行（这个 App 没有付费签名，不放行 Mac 会说它"已损坏"）
xattr -cr "$APPS/JellyCat.app"

# 6. Chrome 插件（可选）
EXT_DIR="$HOME/Documents/JellyCat-Chrome插件"
if curl -fsSL --retry 2 --connect-timeout 15 -o "$TMP/ext.zip" "$BASE/JellyCat-chrome-extension.zip" 2>/dev/null; then
  rm -rf "$EXT_DIR" && mkdir -p "$EXT_DIR"
  ditto -x -k "$TMP/ext.zip" "$EXT_DIR"
  say "Chrome 插件放在：$EXT_DIR/extension"
fi

# 7. 打开
open "$APPS/JellyCat.app"
say "装好了！小房间在屏幕右下角，设置窗口里粘贴配对码就能连上。"

#!/usr/bin/env bash
# MarkText 开发模式启动脚本（WSL 环境）。
# 用途：切到 node 22 隔离环境 + 关闭执行环境注入的 safe-delete 钩子 + 启动 fcitx5 中文输入。
set -e
cd "$(dirname "$0")"

unset NODE_OPTIONS BASH_ENV CODEBUDDY_SAFE_DELETE_ENABLED
export PATH="/home/liucy/.workbuddy/binaries/node/versions/22.12.0/bin:$PATH"
export DISPLAY="${DISPLAY:-:0}"

# 中文输入：WSLg 下的 Linux GUI 应用用 Linux 自己的输入法框架（fcitx5），
# Windows 输入法不透传。必须 --disable=wayland,waylandim，否则 fcitx5 会
# 尝试 Wayland input_method 协议、被 Weston 拒绝后崩溃退出。
export GTK_IM_MODULE=fcitx
export QT_IM_MODULE=fcitx
export XMODIFIERS=@im=fcitx
if command -v fcitx5 >/dev/null 2>&1 && ! pgrep -x fcitx5 >/dev/null 2>&1; then
  fcitx5 -d --disable=wayland,waylandim >/dev/null 2>&1 || true
fi

exec pnpm run dev

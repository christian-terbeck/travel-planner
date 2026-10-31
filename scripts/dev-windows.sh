#!/usr/bin/env bash
# Development loop from WSL: runs the Vite dev server here, cross-compiles a debug build of the
# Tauri app and starts it on Windows. Debug builds load the UI from http://localhost:1420, which
# WSL forwards to Windows, so UI changes hot-reload; Rust changes need this script again.
#   bash scripts/dev-windows.sh           build + start
#   DEST=/mnt/c/dev/tp bash scripts/...   other folder on the Windows side
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${WINCROSS:-$HOME/.local/opt/wincross}"
export PATH="$TOOLS/bin:$HOME/.cargo/bin:$PATH"
TARGET=x86_64-pc-windows-msvc
DEST="${DEST:-/mnt/c/dev/travel-planner-dev}"

cd "$ROOT"
cargo xwin build -p travel-planner --target "$TARGET"
mkdir -p "$DEST"
cp "target/$TARGET/debug/travel-planner.exe" "$DEST/"

if ! curl -s -o /dev/null http://localhost:1420; then
  npx vite --port 1420 --strictPort >/tmp/travel-planner-vite.log 2>&1 &
  echo "Vite dev server started (log: /tmp/travel-planner-vite.log)"
  sleep 2
fi
(cd "$DEST" && cmd.exe /c start "" travel-planner.exe)
echo "Started $DEST/travel-planner.exe"

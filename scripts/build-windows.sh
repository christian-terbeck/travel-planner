#!/usr/bin/env bash
# Builds the Windows app – natively in Git Bash on Windows, cross-compiled from WSL/Linux – and produces:
#   release/Travel-Planner-<version>-setup.exe     installer (per user, no admin rights)
#   release/Travel-Planner-<version>-portable.zip  unzip and run, data stays in the folder
#
# Windows: Rust (rustup) and the Visual Studio Build Tools with the C++ workload.
# Linux (no root needed): see scripts/setup-wincross.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${WINCROSS:-$HOME/.local/opt/wincross}"
export PATH="$TOOLS/bin:$HOME/.cargo/bin:$PATH"
TARGET=x86_64-pc-windows-msvc
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) NATIVE=1 ;; *) NATIVE= ;; esac
# The Tauri CLI looks up the Linux tray library (for Linux bundles) whenever the tray is enabled,
# even when bundling for Windows. A stub pkg-config entry answers that lookup; nothing is linked.
STUB_PC="$TOOLS/pkgconfig"
if [ -z "$NATIVE" ] && ! pkg-config --exists ayatana-appindicator3-0.1 appindicator3-0.1 2>/dev/null; then
  mkdir -p "$STUB_PC"
  printf 'libdir=/nonexistent\nName: ayatana-appindicator3-0.1\nDescription: stub for cross bundling\nVersion: 0.5\nLibs: -L${libdir}\n' \
    > "$STUB_PC/ayatana-appindicator3-0.1.pc"
  export PKG_CONFIG_PATH="$STUB_PC${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
fi

cd "$ROOT"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
if [ -n "$NATIVE" ]; then
  npm run tauri build -- --target "$TARGET"
else
  npm run tauri build -- --runner cargo-xwin --target "$TARGET"
fi

OUT="$ROOT/release"
rm -rf "$OUT" && mkdir -p "$OUT"
cp target/$TARGET/release/bundle/nsis/*_"$VERSION"_*-setup.exe "$OUT/Travel-Planner-$VERSION-setup.exe"

STAGE="$(mktemp -d)"
DIR="$STAGE/Travel Planner"
mkdir -p "$DIR"
cp "target/$TARGET/release/travel-planner.exe" "$DIR/Travel Planner.exe"
cat > "$DIR/portable.txt" <<'EOF'
Travel Planner – portable version

As long as this file sits next to "Travel Planner.exe", the app keeps its database,
documents and backups in the "data" folder next to it. You can move the whole folder
or copy it to a USB stick.

Requires Microsoft Edge WebView2 (already installed on Windows 10/11).
EOF
ZIP="$OUT/Travel-Planner-$VERSION-portable.zip"
if [ -n "$NATIVE" ]; then
  # Windows' own bsdtar; PowerShell 5's Compress-Archive writes backslash paths other unzippers mangle.
  (cd "$STAGE" && "$SYSTEMROOT/System32/tar.exe" -a -cf "$(cygpath -w "$ZIP")" "Travel Planner")
else
  (cd "$STAGE" && python3 -c "
import os, zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk('Travel Planner'):
        for f in files:
            z.write(os.path.join(base, f))
" "$ZIP")
fi
rm -rf "$STAGE"

ls -lh "$OUT"

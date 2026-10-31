#!/usr/bin/env bash
# Installs a Windows cross-compilation toolchain into ~/.local/opt/wincross without root:
# LLVM/Clang 18 + LLD (Ubuntu packages, extracted locally), NSIS for the installer, cargo-xwin.
# cargo-xwin downloads the Microsoft CRT and Windows SDK on first build (Microsoft license applies).
set -euo pipefail

T="${WINCROSS:-$HOME/.local/opt/wincross}"
mkdir -p "$T/debs" "$T/root" "$T/bin"
cd "$T/debs"
apt-get download clang-18 lld-18 llvm-18 libllvm18 libclang-cpp18 libclang1-18 libclang-common-18-dev \
  libclang-rt-18-dev llvm-18-linker-tools liblld-18 nsis nsis-common
for d in *.deb; do dpkg -x "$d" "$T/root"; done

L="$T/root/usr/lib/llvm-18/bin"
LIBS="$T/root/usr/lib/x86_64-linux-gnu:$T/root/usr/lib/llvm-18/lib"
wrap() {
  printf '#!/bin/sh\nexport LD_LIBRARY_PATH="%s${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"\nexec %s "$@"\n' "$LIBS" "$2" >"$T/bin/$1"
  chmod +x "$T/bin/$1"
}
wrap clang "$L/clang"
wrap clang-cl "$L/clang --driver-mode=cl"
for t in lld lld-link llvm-lib llvm-rc llvm-ar llvm-dlltool; do wrap "$t" "$L/$t"; done
printf '#!/bin/sh\nexport NSISDIR="%s"\nexec %s "$@"\n' "$T/root/usr/share/nsis" "$T/root/usr/bin/makensis" >"$T/bin/makensis"
chmod +x "$T/bin/makensis"

XWIN=v0.23.1
# Built from source on purpose: the prebuilt musl binary takes ages to unpack the Windows SDK
# (musl's allocator), the glibc build does it in a minute or two.
cargo install cargo-xwin --locked --version "${XWIN#v}" --root "$T/xwin-gnu"
cp "$T/xwin-gnu/bin/cargo-xwin" "$T/bin/"
rustup target add x86_64-pc-windows-msvc
echo "Toolchain bereit in $T"

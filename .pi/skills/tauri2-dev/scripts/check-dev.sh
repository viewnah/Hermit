#!/usr/bin/env bash
# 开发前快速自检：依赖、rust 编译、tauri 配置一致性
# 用法: bash .pi/skills/tauri2-dev/scripts/check-dev.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "== 1. node/rust 版本 =="
node -v; rustc --version 2>/dev/null || echo "(rustc 未安装)"
echo
echo "== 2. tauri 环境 =="
npm run tauri -- info 2>&1 | head -20 || echo "(tauri info 失败)"
echo
echo "== 3. 前端 TypeScript 检查 =="
npx tsc --noEmit && echo "tsc OK" || echo "tsc 有错误 ↑"
echo
echo "== 4. Rust cargo check (可跳过, 较慢) =="
if [ "${SKIP_CARGO:-0}" != "1" ]; then
  (cd src-tauri && cargo check 2>&1 | tail -15)
else
  echo "SKIP_CARGO=1，跳过"
fi
echo
echo "== 5. devUrl 端口一致性检查 =="
VITE_PORT=$(grep -oE "port: [0-9]+" vite.config.ts 2>/dev/null | grep -oE "[0-9]+" | head -1)
TAURI_URL=$(grep -oE "devUrl\": *\"[^\"]+\"" src-tauri/tauri.conf.json 2>/dev/null | grep -oE "http[^\"]+")
echo "vite.config.ts port  = ${VITE_PORT:-未找到}"
echo "tauri.conf.json devUrl = ${TAURI_URL:-未找到}"
echo "(两者应一致，通常为 http://localhost:5188)"

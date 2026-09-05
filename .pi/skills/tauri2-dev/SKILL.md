---
name: tauri2-dev
description: Tauri 2 + Rust 桌面应用开发指南，适用于本仓库（Hermit/clip-reader）。提供构建/运行/打包命令、src-tauri 配置解读、capabilities 权限模型、Rust 命令注册与 invoke 前后端通信的规范。当任务涉及 src-tauri/、tauri.conf.json、Cargo.toml、Rust 后端、capabilities/ 权限、npm run tauri、前后端 invoke 通信、打包发布时使用。
---

# Tauri 2 开发指南（Hermit / clip-reader）

本仓库是 Tauri 2 + React 19 + TypeScript 的桌面 EPUB 阅读器。前端在仓库根（Vite），Rust 后端在 `src-tauri/`。

## 目录与配置速览

- `src-tauri/tauri.conf.json` — 主配置。`build.frontendDist` = `../dist`，`build.devUrl` = `http://localhost:5188`（注意不是默认 5173），`productName` = `clip-reader`，窗口标题「简阅」。
- `src-tauri/Cargo.toml` — Rust crate 名 `app`，lib 名 `app_lib`。当前依赖：`tauri 2.11.x`、`tauri-plugin-log 2`、`serde`、`serde_json`、`log`。
- `src-tauri/src/main.rs` 与 `lib.rs` — Rust 入口（当前很薄，仅 22 行）。
- `src-tauri/capabilities/` — Tauri 2 的权限模型目录（capability 文件）。
- `src-tauri/gen/` — 生成产物（android/、schemas/ 等），**已 gitignore，勿手改**。

## 常用命令

```bash
npm run tauri dev          # 开发（内部会先跑 vite dev）
npm run tauri build        # 打包（内部先跑 npm run build 产出 dist）
npm run tauri -- info      # 环境诊断（tauri、rust、node 版本）
cd src-tauri && cargo check # 只查 Rust 编译错误，比全量 build 快
cd src-tauri && cargo build
```

> 开发端口是 **5188**。若改了 `vite.config.ts` 的 port，记得同步 `tauri.conf.json` 的 `devUrl`。

## 前后端通信（invoke）

前端用 `@tauri-apps/api`：

```ts
import { invoke } from "@tauri-apps/api/core";
const r = await invoke<string>("my_command", { argName: 42 });
// 注意：Rust 端 snake_case 参数会自动映射为前端 camelCase
```

Rust 端在 `lib.rs` 注册命令并绑定：

```rust
#[tauri::command]
fn my_command(arg_name: i32) -> Result<String, String> {
    Ok(format!("got {arg_name}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![my_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Capabilities 权限模型（重要）

Tauri 2 中，前端要调用插件/系统 API（如文件系统、窗口、shell），必须在 `src-tauri/capabilities/*.json` 中声明权限，否则 invoke 会被拒绝。

- 每个 capability 有 `identifier`、`windows`（作用于哪些窗口）、`permissions` 列表。
- 常见权限写法：`"core:default"`、`"fs:allow-read-file"`、`"shell:allow-open"`。
- **新增插件 API 后若前端报 permission denied，先检查 capabilities**，别急着在 Rust 里绕权限。
- 若完全不需要安全限制（如本仓库 `csp: null`），仍建议按需最小化授权。

## 本仓库架构提醒

- 当前 Rust 后端极薄：书库、进度、笔记都在前端（Dexie/IndexedDB + localStorage + foliate-js 解析 EPUB），通过 WebDAV/ko-sync 做同步。
- 需要新增系统能力时（读文件、通知、系统主题、开机自启、托盘…），优先选官方 `@tauri-apps/plugin-*` + npm 端 `@tauri-apps/plugin-*`，并记得：Cargo 加依赖 → `lib.rs` 注册 plugin → capabilities 加权限 → 前端 npm 安装对应包。
- 改 `tauri.conf.json` / capabilities 后需重启 dev 进程（不会热更新）。
- Rust 错误信息多为英文，排查时留意 `cargo check` 输出；涉及前端 invoke 失败优先看 devtools console + 是否缺 capability。

## 打包/发布

- `npm run tauri build` 产出到 `src-tauri/target/release/bundle/`。
- 图标在 `src-tauri/icons/`（icns/ico/png），替换需用 `tauri icon <源图>` 重新生成。
- 版本号在 `tauri.conf.json` 的 `version` 与 `Cargo.toml` 的 `package.version`，发布前需同步。

## 参考脚本

`scripts/` 下的辅助脚本说明见各脚本头部注释。使用相对路径调用：

```bash
bash .pi/skills/tauri2-dev/scripts/check-dev.sh
```

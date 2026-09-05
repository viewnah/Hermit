---
name: react-ts-dev
description: React 19 + TypeScript 前端开发指南（适用于本仓库 Hermit/clip-reader 的 src/ 目录）。涵盖组件分层、页面结构、状态管理约定、foliate-js 阅读器集成、样式体系（CSS 变量主题）、性能注意点。当修改 src/components、src/pages、src/lib 下 React 组件或 UI 逻辑时使用。
---

# React 19 + TypeScript 开发指南（Hermit / clip-reader）

## 技术栈与结构

- React 19 + TypeScript + Vite 6；UI 无组件库，全部自研组件。
- 全局状态用 **Zustand**（见 zustand-state skill）；本地持久化用 **Dexie/IndexedDB**（见 dexie-db skill）。
- EPUB 解析与渲染基于 **foliate-js**（`vendor/foliate-js`，本地 file 依赖，勿随意升级）。

```
src/
├── App.tsx               # 根组件/路由
├── main.tsx
├── pages/                # 页面级：Library.tsx LibraryBrowse.tsx Reader.tsx
├── components/           # 通用组件：SectionCard SettingsSheet SyncPanel TocPanel ui.tsx
├── lib/                  # 业务逻辑：bookService assetService syncService webdav kosync themeCss digest ...
├── store/settings.ts     # Zustand store
├── db.ts                 # Dexie 数据库定义
└── styles/global.css     # 全局样式 + CSS 变量
```

## 代码约定

- **页面组件**放在 `pages/`，被多个页面/功能复用的 UI 放 `components/`，纯逻辑放 `lib/`。
- 组件文件内先类型后实现；props 用 interface，命名以组件名开头（如 `ReaderProps`）。
- 事件处理：阅读器内部事件（页翻、进度、主题）优先走 store/订阅，避免层层 prop drilling。
- 文件末尾常导出默认组件，命名与文件名一致。

## 主题与样式体系

- 主题通过 **CSS 变量**驱动（阅读背景、文字色、字体等），运行时由 JS 切换/自定义（见 `themeCss.ts`）。
- 自定义主题/字体偏好等设置在 `SettingsSheet.tsx`。
- 新增 UI 时优先复用 CSS 变量，而不是硬编码色值；否则夜间模式/自定义主题下会突兀。

## foliate-js 阅读器注意点

- 阅读器核心逻辑在 `pages/Reader.tsx`，通过 `getContents()` 等 API 操作章节文档。
- foliate-js 操作的是 iframe/content 文档的 DOM 与 CSS，改动需经其视图刷新机制才生效。
- 目录（TOC）、进度、书签数据存在 Dexie；阅读位置用 CFI 或章节+百分比记录。
- 若改 foliate 调用方式，先读 `vendor/foliate-js` 对应源码与类型声明 `src/foliate.d.ts`，别凭记忆猜 API。

## 性能注意

- 书章节内容大，Reader 渲染避免在每次滚动/翻页时重建大对象。
- Dexie 查询结果若量大（书库、章节列表），避免在 render 里重复查，用 store 缓存。
- 主题/字体切换会触发整页重排，注意防抖。

## 构建与检查

```bash
npm run build     # tsc --noEmit && vite build
npx tsc --noEmit  # 单独类型检查
```

- 保持 `tsc --noEmit` 通过；不要用 `any` 掩盖类型问题。
- 新增依赖需同步 `package.json` 与 lockfile（用 `npm i <pkg>`，勿手改 lock）。

## 常见任务指引

- **改阅读器 UI/翻页/进度** → `pages/Reader.tsx` + 相关 store。
- **改书库/浏览** → `pages/Library.tsx` / `LibraryBrowse.tsx`。
- **改同步（WebDAV / ko-sync）** → `lib/syncService.ts`、`lib/webdav.ts`、`lib/kosync.ts`、`lib/syncSources.ts`。
- **改设置面板** → `components/SettingsSheet.tsx` + `store/settings.ts`。

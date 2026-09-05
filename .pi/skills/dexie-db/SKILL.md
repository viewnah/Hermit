---
name: dexie-db
description: Dexie/IndexedDB 本地数据库指南（本仓库 Hermit/clip-reader）。涵盖 src/db.ts 的表结构与版本迁移、书籍/进度/书签/字体/壁纸的增删改查、kv 键值工具、与同步逻辑的配合。当任务涉及书库数据、阅读进度、书签、本地持久化、数据库迁移或 db.ts 修改时使用。
---

# Dexie 本地数据库指南（Hermit / clip-reader）

数据库定义在 `src/db.ts`，库名 `clip-reader`。用于存放书库、进度、书签、字体、壁纸等**大对象数据**（轻量偏好设置走 Zustand persist，见 zustand-state skill）。

## 表结构（当前版本 v2）

| 表 | 主键/索引 | 说明 |
|---|---|---|
| `books` | `++id, digest, title, lastReadAt, addedAt` | 书籍元数据（digest 为内容摘要，用于去重） |
| `progress` | `bookId, updatedAt` | 阅读进度 |
| `bookmarks` | `++id, bookId, createdAt` | 书签（v2 新增） |
| `fonts` | `++id, family` | 自定义字体资产 |
| `wallpapers` | `++id, addedAt` | 自定义壁纸资产 |
| `kv` | `key` | 通用键值对 |

类型定义在 `src/types.ts`（`BookRecord`、`ProgressRecord`、`BookmarkRecord`、`FontAsset`、`WallpaperAsset`）。

## 基本用法

```ts
import { db, kvGet, kvSet } from "./db";

// 增
await db.books.add({ digest, title, lastReadAt: Date.now(), addedAt: Date.now() });
// 查（按索引）
const b = await db.books.where("digest").equals(digest).first();
const recent = await db.books.orderBy("lastReadAt").reverse().toArray();
// 改
await db.books.update(id, { title: "新标题" });
// 删
await db.books.delete(id);
// kv 工具（封装好，直接用）
await kvSet("someKey", { any: "json" });
const v = await kvGet<{ any: string }>("someKey");
```

## 版本迁移（重要）

`db.ts` 用 `this.version(n).stores({...})` 声明式迁移，已到 v2。

- **新增表**：在最新版本对象的 `stores` 里加 `表名: '主键, 索引1, 索引2'`。
- **已有表加索引**：仅当新增字段需要被查询/排序时加索引，否则会白白增大写入成本。
- 旧版本对象**不要删除**（Dexie 靠它们做增量迁移）；迁移逻辑放 `version(n).upgrade(tx => ...)`。
- 改表结构后务必清空或保留旧库测试一遍升级路径，IndexedDB 结构变更不可轻易回滚（浏览器里可删库重来，但用户数据不能丢）。
- 加表/改索引若影响导出导入、同步逻辑，需同步检查 `lib/syncService.ts` 等。

## 与业务代码的配合

- 书籍导入去重靠 `digest`（见 `lib/digest.ts`、`lib/bookService.ts`）。
- 阅读进度在阅读器里高频更新，注意节流/防抖写入，避免每页都写 IndexedDB。
- 同步（WebDAV / ko-sync）会读写这些表，注意并发与事务边界（Dexie 支持 `db.transaction`）。
- 查询结果别直接在 React render 里反复执行；用 store/缓存承接。

## 排错提示

- IndexedDB 报 `NoSuchDatabaseError` / 结构不符：检查 `db.version(n)` 是否与线上数据匹配。
- 出现 `ConstraintError`：主键/唯一索引冲突（如重复 digest 导入同一书）。
- 调试可用浏览器 devtools → Application → IndexedDB 查看 `clip-reader` 库。

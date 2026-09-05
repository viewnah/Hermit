---
name: zustand-state
description: Zustand 状态管理指南（本仓库 Hermit/clip-reader 的 src/store/settings.ts）。说明 store 结构、持久化中间件用法、selector 最佳实践、如何在 React 组件外读写状态。当任务涉及全局设置、阅读器状态、store 读写、跨组件共享状态时使用。
---

# Zustand 状态管理指南（Hermit / clip-reader）

本仓库用 Zustand（v5）管理全局状态，store 集中在 `src/store/`，当前主要是 `settings.ts`。

## 基本模式

```ts
import { create } from "zustand";

interface SettingsState {
  fontSize: number;
  theme: string;
  setFontSize: (v: number) => void;
  setTheme: (t: string) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  fontSize: 16,
  theme: "light",
  setFontSize: (fontSize) => set({ fontSize }),
  setTheme: (theme) => set({ theme }),
}));
```

## 持久化（重要）

本仓库偏好设置需跨会话保存，用 `persist` 中间件：

```ts
import { persist } from "zustand/middleware";

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({ /* 初始值 */ }),
    { name: "clip-reader-settings" } // localStorage key
  )
);
```

- `name` 应带项目前缀（如 `clip-reader-*`），避免与其它应用冲突。
- 修改持久化字段结构时要考虑旧数据兼容（读旧 key 迁移或重置）。
- 若某状态**不该**持久化（会话级），别放进 persist 的 state，或单独 store。

## Selector 最佳实践

- 组件里用 selector 精确取字段，避免整对象订阅导致多余重渲染：

```tsx
const fontSize = useSettings((s) => s.fontSize);
```

- 若 selector 返回新对象/数组（如 `(s) => ({a: s.a, b: s.b})`），Zustand v5 默认浅比较，可能频繁触发渲染；可用 `useShallow` 或拆成多个 selector。
- 不要在组件里直接调用返回整个 store 的 `useSettings()` 去读多个字段，除非确实需要全部。

## 组件外读写（非 React 环境）

在 `lib/`、事件回调、service 层可用：

```ts
import { useSettings } from "../store/settings";

// 读当前值
const s = useSettings.getState();
// 写
useSettings.getState().setFontSize(18);
// 订阅变化
const unsub = useSettings.subscribe((state, prev) => { /* ... */ });
// 手动合并多个字段（不触发多余通知用 partialize 或直接 set）
useSettings.setState({ fontSize: 18 });
```

## 本仓库约定

- 阅读器当前进度、章节、主题、字号等应存 store；书库条目/笔记/书签等大对象数据存 Dexie（见 dexie-db skill）。
- 新增 store 先问：是否需要跨组件共享？是否需持久化？都不是就放组件 state 即可，别过度设计。
- 字段命名用 camelCase，setter 命名 `set<Field>` 风格与现有代码保持一致。

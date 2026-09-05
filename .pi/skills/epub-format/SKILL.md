---
name: epub-format
description: EPUB 格式与 foliate-js 解析渲染指南（本仓库 Hermit/clip-reader 处理 EPUB 电子书）。涵盖 EPUB 容器结构（META-INF/container.xml、OPF、NCX/TOC、spine）、CFI 定位、metadata、内嵌字体/图片资源，以及本仓库 vendor/foliate-js 的 API 使用要点。当任务涉及解析 EPUB、目录/章节、书内资源、CFI 进度定位、测试书籍或阅读渲染时使用。
---

# EPUB 格式与 foliate-js 指南（Hermit / clip-reader）

本仓库是 EPUB 阅读器，解析渲染基于本地 vendor 的 **foliate-js**（file 依赖，源码在 `vendor/foliate-js/`，类型声明在 `src/foliate.d.ts`）。

## EPUB 容器结构速览

EPUB 本质是 zip，关键成员：

```
META-INF/container.xml   # 指向 OPF 的入口
OEBPS/content.opf        # 元数据 + manifest + spine（章节顺序）
OEBPS/toc.ncx            # 旧式目录（NCX）
OEBPS/nav.xhtml          # 新式导航文档（EPUB3，含 toc）
OEBPS/*.xhtml            # 正文章节（spine 按序引用）
OEBPS/*.css / 图片 / 字体 # 资源
```

- **spine** 决定线性阅读顺序；**nav/toc** 决定目录树。
- 书籍内部路径均以 OPF 所在目录为基准，资源引用可能是相对路径，需按 OPF 位置解析。
- `META-INF/container.xml` 的 `rootfile` 决定找哪个 OPF（部分书有多 OPF，如主书+词典）。

## foliate-js 常用概念

- 由 zip 读入 → 解析为 Book → 通过 `spine` 获取章节 → 渲染进 iframe。
- 阅读位置用 **CFI**（EPUB Canonical Fragment Identifier）表达，形如 `epubcfi(/6/4[chap]!/4/2/1:0)`。进度保存/恢复、跨章节跳转依赖它。
- 目录条目通常带 `href` + 可转成 CFI 的定位。
- 章节正文是普通 HTML，foliate 会注入自己的视图与 CSS，直接操作 iframe 内 DOM 前先确认是同一文档实例（Reader 中通过 `getContents()` 拿当前文档）。

## 本仓库工作流

- 导入：`lib/bookService.ts` 读取 EPUB（含 `西游记.epub` 这类测试书）→ 计算 digest → 入库。
- 渲染/翻页/进度：`pages/Reader.tsx` + foliate 视图。
- 目录面板：`components/TocPanel.tsx` 展示 TOC 树。
- 导出/脚本：`scripts/make_test_epub.py` 可生成测试 EPUB（改脚本看它构造了哪些成员，能快速理解最小合法 EPUB 结构）。

## 常见任务要点

- **解析特定字段**（书名/作者/封面）：读 OPF 的 `<metadata>`；封面通常在 manifest 里 `properties="cover-image"`。
- **TOC 取不到**：该书可能只有 NCX 无 nav，或反之；两种都要兼容。
- **图片/字体缺失**：多为相对路径解析错误，检查 manifest `href` 与 OPF 基准目录。
- **CFI 失效/回退**：排版或章节改动会让旧 CFI 失配，需有回退逻辑（如按章节序 + 文本近似匹配）。
- 改 foliate 相关代码前，先查 `src/foliate.d.ts` 与 `vendor/foliate-js` 源码确认 API，勿臆测。

## 测试资源

- 仓库根 `西游记.epub`（已被 gitignore，本地生成/导入测试用）。
- `scripts/make_test_epub.py`：生成小型测试书，可改造成你要的畸形/边界用例（无 TOC、多 OPF、坏引用等）。

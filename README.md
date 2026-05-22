# PaperPilot Pro

**一体化学术科研智能助手 | All-in-One Academic Research Smart Assistant**

> 打通谷歌学术与期刊页的闭环检索与直链工具，内置自然指数高亮、智能去重、排序过滤、跨域 PDF 探测、影响因子与分区展示及本地 AI 文献总结。
>
> A closed-loop academic search & direct-link assistant for Google Scholar and journal abstract pages — featuring Nature Index highlighting, smart deduplication, sorting & filtering, cross-origin PDF sniffing, impact factor & partition display, and local AI literature summarization.

---

## 目录 | Table of Contents

- [功能特性 | Features](#功能特性--features)
- [安装方法 | Installation](#安装方法--installation)
- [使用指南 | Usage Guide](#使用指南--usage-guide)
- [项目结构 | Project Structure](#项目结构--project-structure)
- [配置说明 | Configuration](#配置说明--configuration)
- [技术架构 | Architecture](#技术架构--architecture)
- [许可 | License](#许可--license)

---

## 功能特性 | Features

### 谷歌学术增强 | Google Scholar Enhancements

| 功能 | Feature | 说明 |
|------|---------|------|
| 自然指数高亮 | Nature Index Highlight | 对 Nature Index 核心期刊论文左侧翠绿边框高亮标注 |
| 预印本折叠去重 | Preprint Deduplication | 基于 Levenshtein 编辑距离智能识别同篇论文的 Preprint/会议版本并折叠 |
| 高级排序 | Advanced Sorting | 顶部注入「默认 / 按引用量降序 / 按发表年份降序」排序按钮 |
| 侧边过滤面板 | Sidebar Filtering | 左侧生成引用量与年份双滑块过滤器，支持期刊来源多选筛选 |
| 学术指标徽章 | Academic Badges | 标题旁高亮标注 IF、中科院分区、JCR 四分位、CCF 等级、CSSCI/北大核心、SCI 预警、被引量、PDF 直链 |
| 一键 BibTeX | BibTeX Copy | 工具栏一键复制 BibTeX 引用格式 |
| 复制 DOI | Copy DOI | 快速复制论文 DOI 标识符 |
| Markdown 笔记 | Markdown Note | 一键提取文献完整引用及元信息生成读书笔记大纲 |

### 期刊摘要页增强 | Journal Abstract Page Enhancements

| 功能 | Feature | 说明 |
|------|---------|------|
| 悬浮元卡 | Floating Metacard | 智能识别期刊摘要页，右侧注入悬浮窗展示影响因子、分区及操作按钮 |
| PDF 嗅探直链 | PDF Sniffing | 跨域 HEAD/Range 探测论文 PDF 全文链接 |
| 自动跳转 | Auto Redirect | 嗅探成功后可选自动跳转至 PDF 全文 |
| AI 一键总结 | AI Summary | 支持 Gemini / OpenAI / DeepSeek 大模型对文献进行要点提炼 |
| 元卡拖拽 | Draggable Metacard | 悬浮卡片支持自由拖拽定位，可最小化为圆形胶囊 |

### 通用功能 | General Features

| 功能 | Feature | 说明 |
|------|---------|------|
| 学人足迹 | Research Footprints | 自动记录浏览过的论文历史，支持模糊搜索与 BibTeX 批量导出 |
| 外观模式 | Theme Modes | 支持白天 / 夜间 / 跟随系统三种配色方案 |
| easyScholar 集成 | easyScholar Integration | 配置 SecretKey 后获取真实官方 IF、中科院/JCR 分区及 CCF 等级 |
| 20+ 独立开关 | 20+ Toggle Switches | 每项功能均可独立开启/关闭，灵活定制 |

---

## 安装方法 | Installation

### 方式一：开发者模式加载（推荐）| Method 1: Developer Mode (Recommended)

1. 下载或克隆本仓库到本地
   Download or clone this repository to your local machine

   ```bash
   git clone https://github.com/your-username/paperpilot-pro-extension.git
   ```

2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
   Open Chrome browser and navigate to `chrome://extensions/`

3. 开启右上角「开发者模式」
   Enable "Developer mode" in the top-right corner

4. 点击「加载已解压的扩展程序」，选择 `paperpilot-pro-extension` 文件夹
   Click "Load unpacked" and select the `paperpilot-pro-extension` folder

5. 扩展图标将出现在浏览器工具栏中
   The extension icon will appear in your browser toolbar

### 方式二：打包安装 | Method 2: Packed Installation

1. 在 Chrome 扩展管理页面点击「打包扩展程序」
   Click "Pack extension" on the Chrome extensions management page

2. 选择 `paperpilot-pro-extension` 文件夹生成 `.crx` 文件
   Select the `paperpilot-pro-extension` folder to generate a `.crx` file

3. 拖拽 `.crx` 文件到 Chrome 完成安装
   Drag the `.crx` file into Chrome to complete installation

---

## 使用指南 | Usage Guide

### 谷歌学术搜索 | Google Scholar Search

1. 访问 [Google Scholar](https://scholar.google.com/) 并输入关键词搜索
   Visit [Google Scholar](https://scholar.google.com/) and search for keywords

2. 扩展自动激活，搜索结果将被增强：
   The extension activates automatically, and search results will be enhanced:

   - **排序按钮**：点击搜索结果顶部的「默认排序 / 按引用量降序 / 按发表年份降序」切换排序方式
     **Sorting buttons**: Click "Default / By Citations / By Year" at the top of results to switch sorting

   - **侧边过滤**：左侧面板使用滑块按引用量和年份范围过滤结果
     **Sidebar filtering**: Use sliders in the left panel to filter by citation count and year range

   - **徽章标注**：标题旁显示影响因子、分区、被引量等学术指标
     **Badges**: Academic metrics (IF, partition, citations) displayed next to titles

   - **工具栏操作**：每篇论文下方的工具栏支持 BibTeX 复制、DOI 复制、Markdown 笔记
     **Action toolbar**: BibTeX copy, DOI copy, and Markdown note buttons under each paper

### 期刊摘要页 | Journal Abstract Pages

1. 浏览任意英文学术期刊的论文摘要页
   Browse any English academic journal's abstract page

2. 右侧自动弹出悬浮元卡，展示：
   A floating metacard automatically appears on the right, showing:

   - 影响因子、中科院分区、JCR 四分位
     Impact factor, CAS partition, JCR quartile
   - 操作按钮：下载 PDF、复制 BibTeX、复制 DOI、AI 总结
     Action buttons: Download PDF, Copy BibTeX, Copy DOI, AI Summary

3. 元卡支持拖拽移动和最小化
   The metacard supports drag-to-move and minimize

### 学人足迹 | Research Footprints

1. 点击浏览器工具栏中的扩展图标
   Click the extension icon in the browser toolbar

2. 在「学人足迹」标签页查看浏览历史
   View browsing history in the "Footprints" tab

3. 支持按标题、期刊、DOI 模糊搜索
   Supports fuzzy search by title, journal, or DOI

4. 点击「一键导出全部足迹」批量导出 BibTeX
   Click "Export All Footprints" to batch-export BibTeX

---

## 项目结构 | Project Structure

```
paperpilot-pro-extension/
├── manifest.json                # Manifest V3 扩展配置 | MV3 extension config
├── icons/
│   ├── icon16.png               # 16x16 图标 | 16x16 icon
│   ├── icon48.png               # 48x48 图标 | 48x48 icon
│   └── icon128.png              # 128x128 图标 | 128x128 icon
├── lib/
│   └── svg-icons.js             # Feather SVG 图标库 | Feather SVG icon library
├── background/
│   └── background.js            # Service Worker：API 调用、PDF 探测、历史、AI 总结
│                                # Service Worker: API calls, PDF verification, history, AI summarize
├── content/
│   ├── scholar.js               # 谷歌学术内容脚本 | Google Scholar content script
│   ├── scholar.css              # 谷歌学术样式 | Google Scholar styles
│   ├── journal.js               # 期刊页内容脚本 | Journal page content script
│   └── journal.css              # 期刊页样式 | Journal page styles
└── popup/
    ├── popup.html               # 弹窗 UI | Popup UI
    ├── popup.js                 # 弹窗逻辑 | Popup logic
    └── popup.css                # 弹窗样式 | Popup styles
```

---

## 配置说明 | Configuration

点击浏览器工具栏中的扩展图标 → 「全局配置」标签页，可调整以下设置：

Click the extension icon in the toolbar → "Settings" tab to configure:

### 核心模块 | Core Modules

| 设置项 | Setting | 默认值 | 说明 |
|--------|---------|--------|------|
| 自然指数期刊高亮 | Nature Index Highlight | 开启 | Nature Index 核心期刊左侧翠绿边框 |
| 预印本折叠去重 | Preprint Deduplication | 开启 | 智能识别并折叠同篇论文的 Preprint 版本 |
| 检索高级重排与侧边过滤 | Advanced Sorting & Filtering | 开启 | 排序按钮 + 侧边滑块过滤器 |
| 学术指标与状态徽章 | Academic Badges | 开启 | IF、分区、被引量等徽章 |
| 期刊详情悬浮元卡 | Journal Metacard | 开启 | 期刊页悬浮详情卡 |
| Markdown 笔记卡片复制 | Markdown Note Copy | 开启 | 一键生成读书笔记 |
| 显示期刊分区与影响因子 | Show Partition & IF | 开启 | 检索结果中展示 IF 与分区 |

### 按钮显示开关 | Button Toggles

| 设置项 | Setting | 默认值 |
|--------|---------|--------|
| 一键 BibTeX 复制按钮 | BibTeX Copy Button | 开启 |
| 谷歌学术页复制 DOI 按钮 | Scholar Copy DOI Button | 开启 |
| 详情悬浮卡复制 DOI 按钮 | Metacard Copy DOI Button | 开启 |
| 一键下载 PDF 全文按钮 | PDF Download Button | 开启 |
| AI 一键精简总结按钮 | AI Summary Button | 开启 |

### easyScholar 数据集成 | easyScholar Integration

配置 [easyScholar 开放平台](https://www.easyscholar.cc/console/user/open) 的 SecretKey 后，可获取：

Configure your [easyScholar Open Platform](https://www.easyscholar.cc/console/user/open) SecretKey to access:

- 真实官方影响因子 (IF)
  Official Impact Factor
- 中科院大类分区
  CAS partition classification
- JCR 四分位指标
  JCR quartile metrics
- CCF 推荐等级 (A/B/C)
  CCF recommended rank (A/B/C)
- CSSCI / 北大核心收录
  CSSCI / PKU Core journals
- 中科院预警期刊级别
  CAS early warning journal level

### AI 总结引擎 | AI Summarization Engine

| 提供商 | Provider | 模型 | Model |
|--------|----------|------|-------|
| Google Gemini | Google Gemini | Gemini Pro (推荐 Recommended) | Gemini Pro |
| OpenAI | OpenAI | GPT-3.5-Turbo | GPT-3.5-Turbo |
| DeepSeek | DeepSeek | DeepSeek-V3 Chat | DeepSeek-V3 Chat |

API 密钥保存在浏览器本地 storage 中，不会上传至任何第三方服务器。

API keys are stored in local browser storage and are never uploaded to any third-party server.

---

## 技术架构 | Architecture

### 设计原则 | Design Principles

- **非破坏性排序**：使用 CSS Flexbox `order` 属性重排，不移动 DOM 节点
  **Non-destructive sorting**: Uses CSS Flexbox `order` property to reorder without moving DOM nodes
- **纯客户端运行**：所有处理在浏览器本地完成，不经过代理服务器，避免触发 CAPTCHA
  **Pure client-side**: All processing happens locally in the browser, no proxy servers, avoids triggering CAPTCHAs
- **响应式状态管理**：MutationObserver 监听 DOM 变化，自动恢复被 Scholar JS 覆盖的增强元素
  **Reactive state management**: MutationObserver watches for DOM changes and auto-restores enhanced elements overwritten by Scholar's JS
- **模块化功能开关**：20+ 独立开关，每项功能可单独启用/禁用
  **Modular feature toggles**: 20+ independent switches, each feature can be individually enabled/disabled

### 技术栈 | Tech Stack

- Chrome Manifest V3
- Vanilla JavaScript (无框架依赖 | No framework dependencies)
- CSS Custom Properties (主题变量 | Theme variables)
- MutationObserver (DOM 变更监听 | DOM change monitoring)
- Chrome Storage API (设置持久化 | Settings persistence)
- localStorage (查询状态持久化 | Query state persistence)

---

## 许可 | License

MIT License

Copyright (c) 2025 PaperPilot Pro

本项目基于 MIT 许可证开源，详情请参阅 [LICENSE](LICENSE) 文件。

This project is open-sourced under the MIT License. See [LICENSE](LICENSE) for details.

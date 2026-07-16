# PaperPilot Pro

**一体化学术科研智能助手 | All-in-One Academic Research Smart Assistant**

> 打通谷歌学术与期刊页的闭环检索与直链工具，内置自然指数高亮、智能去重、排序过滤、跨域 PDF 探测、影响因子与分区展示及本地 AI 文献总结。
>
> A closed-loop academic search & direct-link assistant for Google Scholar and journal abstract pages — featuring Nature Index highlighting, smart deduplication, sorting & filtering, cross-origin PDF sniffing, impact factor & partition display, and local AI literature summarization.

---

## 目录 | Table of Contents

- [快速开始 | Quick Start](#快速开始--quick-start)
- [功能特性 | Features](#功能特性--features)
- [安装方法 | Installation](#安装方法--installation)
- [使用指南 | Usage Guide](#使用指南--usage-guide)
- [配置说明 | Configuration](#配置说明--configuration)
- [项目结构 | Project Structure](#项目结构--project-structure)
- [技术架构 | Architecture](#技术架构--architecture)
- [常见问题 | FAQ](#常见问题--faq)
- [故障排除 | Troubleshooting](#故障排除--troubleshooting)
- [许可 | License](#许可--license)

---

## 快速开始 | Quick Start

**5 分钟快速上手 | Get started in 5 minutes**

1. **下载扩展** | **Download Extension**
   - 点击本页右上角绿色「Code」按钮 → 「Download ZIP」
   - Click the green "Code" button at top right → "Download ZIP"

2. **解压文件** | **Extract Files**
   - 解压 ZIP 文件到任意文件夹
   - Extract the ZIP file to any folder

3. **加载扩展** | **Load Extension**
   - 打开 Chrome，地址栏输入 `chrome://extensions/`
   - Open Chrome, type `chrome://extensions/` in address bar
   - 开启右上角「开发者模式」开关
   - Toggle "Developer mode" switch at top-right
   - 点击「加载已解压的扩展程序」，选择解压后的文件夹
   - Click "Load unpacked", select the extracted folder

4. **开始使用** | **Start Using**
   - 访问 [Google Scholar](https://scholar.google.com/) 搜索论文
   - Visit [Google Scholar](https://scholar.google.com/) and search for papers
   - 或浏览任意学术期刊论文摘要页
   - Or browse any academic journal abstract page

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
| AI 一键总结 | AI Summary | 支持 7 种大模型对文献进行要点提炼 |
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

#### Windows 系统 | Windows

1. **下载项目文件** | **Download Project Files**
   ```bash
   git clone https://github.com/your-username/paperpilot-pro-extension.git
   ```
   或者直接下载 ZIP 并解压到本地文件夹
   Or download ZIP and extract to a local folder

2. **打开 Chrome 扩展管理页面** | **Open Chrome Extensions Page**
   - 在 Chrome 地址栏输入：`chrome://extensions/`
   - Type in Chrome address bar: `chrome://extensions/`

3. **开启开发者模式** | **Enable Developer Mode**
   - 点击页面右上角的「开发者模式」开关，使其变为蓝色
   - Click the "Developer mode" toggle at top-right until it turns blue

4. **加载扩展** | **Load Extension**
   - 点击左上角出现的「加载已解压的扩展程序」按钮
   - Click the "Load unpacked" button that appears at top-left
   - 在弹出的文件选择器中，选择 `paperpilot-pro-extension` 文件夹
   - In the file picker, select the `paperpilot-pro-extension` folder
   - 点击「选择文件夹」
   - Click "Select Folder"

5. **确认安装** | **Confirm Installation**
   - 扩展列表中将出现「PaperPilot Pro」
   - "PaperPilot Pro" will appear in the extensions list
   - 浏览器工具栏右上角将显示扩展图标
   - The extension icon will appear in the top-right of the browser toolbar

#### macOS 系统 | macOS

步骤与 Windows 相同，仅文件路径不同：
Steps are the same as Windows, only file paths differ:

```bash
# 克隆到用户目录 | Clone to user directory
git clone ~/Downloads/paperpilot-pro-extension.git
```

#### Linux 系统 | Linux

步骤与 Windows 相同：
Steps are the same as Windows:

```bash
# 克隆到用户目录 | Clone to user directory
git clone ~/paperpilot-pro-extension.git
```

### 方式二：打包安装 | Method 2: Packed Installation

1. 在 Chrome 扩展管理页面点击「打包扩展程序」
   Click "Pack extension" on the Chrome extensions management page

2. 选择 `paperpilot-pro-extension` 文件夹生成 `.crx` 文件
   Select the `paperpilot-pro-extension` folder to generate a `.crx` file

3. 拖拽 `.crx` 文件到 Chrome 完成安装
   Drag the `.crx` file into Chrome to complete installation

> **注意 | Note**: 打包安装后，每次更新需要重新打包安装。
> After packed installation, you need to repack for each update.

---

## 使用指南 | Usage Guide

### 一、谷歌学术搜索增强 | Google Scholar Search Enhancement

#### 1.1 基本使用 | Basic Usage

1. 访问 [Google Scholar](https://scholar.google.com/)
   Visit [Google Scholar](https://scholar.google.com/)

2. 输入关键词进行搜索
   Enter keywords and search

3. 扩展自动激活，页面顶部将出现功能工具栏
   Extension activates automatically, a toolbar appears at the top

#### 1.2 排序功能 | Sorting Feature

搜索结果页面顶部会出现排序按钮：
Sorting buttons appear at the top of search results:

- **默认排序** | **Default Sort**: Google Scholar 原始排序
- **按引用量降序** | **By Citations (Descending)**: 被引次数从高到低
- **按发表年份降序** | **By Year (Descending)**: 发表时间从新到旧

使用方法 | How to use:
1. 点击对应的排序按钮
   Click the corresponding sorting button
2. 按钮高亮表示当前排序方式
   Highlighted button indicates current sorting method
3. 再次点击可切换
   Click again to switch

#### 1.3 侧边过滤面板 | Sidebar Filtering Panel

页面左侧会出现过滤面板：
A filtering panel appears on the left side:

**引用量过滤 | Citation Filter**:
- 拖动滑块设置引用量范围（0 - 1000+）
- Drag slider to set citation range (0 - 1000+)
- 左侧滑块设置最小值，右侧滑块设置最大值
- Left slider sets minimum, right slider sets maximum

**年份过滤 | Year Filter**:
- 拖动滑块设置发表年份范围（1900 - 2026）
- Drag slider to set publication year range (1900 - 2026)
- 支持精确到具体年份
- Supports precise year selection

**期刊来源过滤 | Journal Source Filter**:
- 勾选/取消勾选期刊来源复选框
- Check/uncheck journal source checkboxes
- 支持多选
- Supports multiple selection

**重置过滤 | Reset Filter**:
- 点击「重置」按钮恢复默认状态
- Click "Reset" button to restore default state

#### 1.4 学术指标徽章 | Academic Badges

每篇论文标题旁会显示以下徽章（如有）：
Badges appear next to each paper title (if available):

| 徽章 | Badge | 说明 | Description |
|------|-------|------|-------------|
| IF | IF | 影响因子 | Impact Factor |
| 1区/2区/3区/4区 | Q1/Q2/Q3/Q4 | 中科院分区 | CAS Partition |
| Q1/Q2/Q3/Q4 | Q1/Q2/Q3/Q4 | JCR 四分位 | JCR Quartile |
| A/B/C | A/B/C | CCF 推荐等级 | CCF Recommended Rank |
| 核心 | Core | CSSCI/北大核心 | CSSCI/PKU Core |
| 预警 | Warning | SCI 预警期刊 | SCI Warning Journal |
| 被引 X | Cited X | 被引次数 | Citation Count |
| PDF | PDF | 可下载全文 | Full-text Available |

**颜色说明 | Color Guide**:
- 绿色 | Green: 高影响力期刊 | High-impact journal
- 蓝色 | Blue: 中等影响力 | Medium impact
- 橙色 | Orange: 一般影响力 | General impact
- 灰色 | Gray: 未知指标 | Unknown metrics

#### 1.5 论文操作工具栏 | Paper Action Toolbar

每篇论文下方有操作按钮：
Action buttons appear under each paper:

**BibTeX 复制 | BibTeX Copy**:
1. 点击「BibTeX」按钮
   Click "BibTeX" button
2. BibTeX 格式引用自动复制到剪贴板
   BibTeX citation automatically copied to clipboard
3. 粘贴到 LaTeX 编辑器即可使用
   Paste into LaTeX editor to use

**DOI 复制 | Copy DOI**:
1. 点击「DOI」按钮
   Click "DOI" button
2. 论文 DOI 标识符复制到剪贴板
   Paper DOI identifier copied to clipboard

**Markdown 笔记 | Markdown Note**:
1. 点击「Markdown」按钮
   Click "Markdown" button
2. 自动生成包含完整引用信息的读书笔记模板
   Automatically generates reading note template with complete citation info
3. 包含标题、作者、期刊、年份、摘要等字段
   Includes title, authors, journal, year, abstract fields

#### 1.6 自然指数期刊高亮 | Nature Index Journal Highlight

- Nature Index 核心期刊论文左侧显示翠绿色边框
- Nature Index core journal papers show emerald-green left border
- 论文标题旁显示「NI」徽章
- "NI" badge appears next to paper title
- 便于快速识别高质量期刊论文
- Helps quickly identify high-quality journal papers

#### 1.7 预印本智能去重 | Preprint Smart Deduplication

- 自动识别同篇论文的 Preprint、会议版本、期刊版本
- Automatically identifies preprint, conference, and journal versions of the same paper
- 相同论文被折叠到一个可展开的抽屉中
- Same papers are collapsed into an expandable drawer
- 抽屉标题显示主版本（通常是期刊版本）
- Drawer title shows the main version (usually journal version)
- 点击展开可查看所有版本
- Click to expand and view all versions

---

### 二、期刊摘要页增强 | Journal Abstract Page Enhancement

#### 2.1 基本使用 | Basic Usage

1. 访问任意英文学术期刊的论文摘要页
   Visit any English academic journal's abstract page
   - 支持 Springer、Elsevier、Wiley、Nature、Science 等 80+ 出版商
   - Supports 80+ publishers including Springer, Elsevier, Wiley, Nature, Science

2. 页面右侧自动弹出悬浮元卡
   A floating metacard automatically appears on the right

3. 元卡显示论文详细信息和操作按钮
   The metacard shows paper details and action buttons

#### 2.2 悬浮元卡功能 | Floating Metacard Features

**信息展示 | Information Display**:
- 期刊名称 | Journal name
- 发表年份 | Publication year
- DOI 标识符 | DOI identifier
- Nature Index 标识 | Nature Index badge (if applicable)

**指标抽屉 | Metrics Drawer**:
- 点击元卡上的「展开」按钮
   Click "Expand" button on metacard
- 显示完整学术指标：IF、中科院分区、JCR 四分位、CiteScore、CCF、CSSCI/北大核心、SCI 预警
   Shows complete metrics: IF, CAS partition, JCR quartile, CiteScore, CCF, CSSCI/PKU core, SCI warning

**操作按钮 | Action Buttons**:
- **下载 PDF** | **Download PDF**: 下载论文全文 PDF
- **复制 DOI** | **Copy DOI**: 复制 DOI 到剪贴板
- **访问原页** | **Visit Original**: 打开论文原始网页
- **AI 总结** | **AI Summary**: 使用 AI 总结论文要点（需配置 API）

#### 2.3 元卡状态 | Metacard States

**正常状态 | Normal State**:
- 可拖拽移动位置
- Draggable to any position
- 显示完整信息和操作按钮
- Shows full info and action buttons

**固定状态 | Pinned State**:
- 点击「固定」按钮
   Click "Pin" button
- 元卡固定在页面右侧
   Metacard fixed to right side of page
- 不会随页面滚动移动
   Doesn't move with page scroll

**最小化状态 | Minimized State**:
- 点击「最小化」按钮
   Click "Minimize" button
- 元卡缩小为 48px 圆形胶囊
   Metacard shrinks to 48px circular capsule
- 鼠标悬停显示论文标题
   Hover to show paper title
- 点击恢复完整状态
   Click to restore full state

#### 2.4 PDF 下载 | PDF Download

**自动嗅探 | Auto Sniffing**:
- 扩展自动检测页面中的 PDF 链接
   Extension automatically detects PDF links on page
- 支持 54 种 CSS 选择器 + 8 种 meta 标签检测
   Supports 54 CSS selectors + 8 meta tag detectors
- 特殊处理 ScienceDirect、Nature、Springer 等出版商
   Special handling for ScienceDirect, Nature, Springer, etc.

**下载方式 | Download Method**:
1. 点击元卡上的「下载 PDF」按钮
   Click "Download PDF" button on metacard
2. PDF 文件自动下载到默认目录
   PDF automatically downloads to default directory
3. 文件名按配置模板命名
   File named according to configured template

**自定义文件名 | Custom Filename**:
在设置中可配置文件名模板：
Configure filename template in settings:
- `{title}` - 论文标题 | Paper title
- `{author}` - 第一作者 | First author
- `{year}` - 发表年份 | Publication year
- `{doi}` - DOI 标识符 | DOI identifier
- `{journal}` - 期刊名称 | Journal name

示例 | Example: `{author}_{year}_{title}` → `Smith_2024_Machine_Learning.pdf`

#### 2.5 AI 论文总结 | AI Paper Summarization

**使用方法 | How to Use**:
1. 点击元卡上的「AI 总结」按钮
   Click "AI Summary" button on metacard
2. 等待 AI 处理（通常 5-15 秒）
   Wait for AI processing (usually 5-15 seconds)
3. 元卡下方展开显示 3 句话摘要
   A 3-sentence summary expands below the metacard

**支持的 AI 提供商 | Supported AI Providers**:

| 提供商 | Provider | 模型 | Model | 推荐 | Recommended |
|--------|----------|------|-------|------|-------------|
| Google Gemini | Google Gemini | gemini-pro | gemini-pro | ✓ | ✓ |
| OpenAI | OpenAI | gpt-3.5-turbo | gpt-3.5-turbo | | |
| Anthropic | Anthropic | claude-3-haiku | claude-3-haiku | | |
| DeepSeek | DeepSeek | deepseek-chat | deepseek-chat | | |
| OpenRouter | OpenRouter | 多种模型 | Multiple models | | |
| Ollama | Ollama | 本地模型 | Local models | | |
| 自定义 | Custom | 自定义端点 | Custom endpoint | | |

**无 API 密钥时 | Without API Key**:
- 扩展使用本地启发式算法生成简要摘要
   Extension uses local heuristic algorithm to generate brief summary
- 摘要质量不如 AI，但可快速预览
   Summary quality is lower than AI, but good for quick preview

---

### 三、学人足迹 | Research Footprints

#### 3.1 查看足迹 | View Footprints

1. 点击浏览器工具栏中的扩展图标
   Click extension icon in browser toolbar
2. 默认显示「学人足迹」标签页
   "Footprints" tab is shown by default
3. 按时间顺序显示浏览过的论文
   Shows browsed papers in chronological order

#### 3.2 搜索足迹 | Search Footprints

- 在搜索框输入关键词
  Enter keywords in search box
- 支持按标题、期刊、DOI 模糊搜索
  Supports fuzzy search by title, journal, or DOI
- 实时过滤显示结果
  Real-time filtered results

#### 3.3 编辑足迹 | Edit Footprints

1. 点击足迹条目右侧的「编辑」按钮
   Click "Edit" button on the right of footprint entry
2. 滑出编辑抽屉
   Slide-out editing drawer appears
3. 可修改标题、作者、期刊、年份、DOI 等字段
   Can modify title, authors, journal, year, DOI fields
4. 点击「保存」完成编辑
   Click "Save" to complete editing

#### 3.4 导出 BibTeX | Export BibTeX

**单条导出 | Single Export**:
- 点击足迹条目上的「BibTeX」按钮
  Click "BibTeX" button on footprint entry

**批量导出 | Batch Export**:
1. 点击页面底部的「一键导出全部足迹」按钮
   Click "Export All Footprints" button at bottom
2. 所有足迹的 BibTeX 格式引用将合并
   All footprint BibTeX citations will be merged
3. 自动复制到剪贴板
   Automatically copied to clipboard

#### 3.5 删除足迹 | Delete Footprints

- 点击足迹条目右侧的「删除」按钮
  Click "Delete" button on the right of footprint entry
- 确认后删除
  Confirm to delete

---

### 四、扩展弹窗面板 | Extension Popup Panel

#### 4.1 仪表盘概览 | Dashboard Overview

点击扩展图标后，默认显示仪表盘：
After clicking extension icon, dashboard is shown by default:

- 显示 6 个核心模块的开关状态
  Shows ON/OFF status of 6 core modules
- 绿色圆点表示开启，灰色表示关闭
  Green dot means ON, gray means OFF
- 点击模块可快速切换开关
  Click module to quickly toggle

#### 4.2 全局设置 | Global Settings

点击「全局设置」标签页：
Click "Settings" tab:

详细配置选项见下方「配置说明」部分。
See "Configuration" section below for detailed options.

---

## 配置说明 | Configuration

点击浏览器工具栏中的扩展图标 → 「全局设置」标签页，可调整以下设置：

Click the extension icon in the toolbar → "Settings" tab to configure:

### 核心模块开关 | Core Module Toggles

| 设置项 | Setting | 默认值 | 说明 | Description |
|--------|---------|--------|------|-------------|
| 自然指数期刊高亮 | Nature Index Highlight | 开启 ON | Nature Index 核心期刊左侧翠绿边框 | Emerald-green left border for Nature Index journals |
| 预印本折叠去重 | Preprint Deduplication | 开启 ON | 智能识别并折叠同篇论文的 Preprint 版本 | Smart identification and folding of preprint versions |
| 检索高级重排与侧边过滤 | Advanced Sorting & Filtering | 开启 ON | 排序按钮 + 侧边滑块过滤器 | Sorting buttons + sidebar slider filters |
| 学术指标与状态徽章 | Academic Badges | 开启 ON | IF、分区、被引量等徽章 | IF, partition, citation badges |
| 期刊详情悬浮元卡 | Journal Metacard | 开启 ON | 期刊页悬浮详情卡 | Floating detail card on journal pages |
| Markdown 笔记卡片复制 | Markdown Note Copy | 开启 ON | 一键生成读书笔记 | One-click reading note generation |
| 显示期刊分区与影响因子 | Show Partition & IF | 开启 ON | 检索结果中展示 IF 与分区 | Show IF and partition in search results |

### 按钮显示开关 | Button Display Toggles

| 设置项 | Setting | 默认值 |
|--------|---------|--------|
| 一键 BibTeX 复制按钮 | BibTeX Copy Button | 开启 ON |
| 谷歌学术页复制 DOI 按钮 | Scholar Copy DOI Button | 开启 ON |
| 详情悬浮卡复制 DOI 按钮 | Metacard Copy DOI Button | 开启 ON |
| 一键下载 PDF 全文按钮 | PDF Download Button | 开启 ON |
| AI 一键精简总结按钮 | AI Summary Button | 开启 ON |

### 自动跳转设置 | Auto Redirect Settings

| 设置项 | Setting | 默认值 | 说明 | Description |
|--------|---------|--------|------|-------------|
| 自动跳转 PDF 全文 | Auto Redirect to PDF | 关闭 OFF | 嗅探成功后自动跳转 | Auto-redirect after successful sniffing |

### PDF 文件名模板 | PDF Filename Template

支持的变量 | Supported variables:
- `{title}` - 论文标题 | Paper title
- `{author}` - 第一作者 | First author
- `{year}` - 发表年份 | Publication year
- `{doi}` - DOI 标识符 | DOI identifier
- `{journal}` - 期刊名称 | Journal name

默认模板 | Default template: `{title}`
示例 | Example: `{author}_{year}_{title}` → `Smith_2024_Machine_Learning.pdf`

### 下载目录 | Download Directory

- 默认下载到浏览器默认下载目录
  Downloads to browser's default download directory
- 可自定义子目录名称
  Can customize subdirectory name
- 示例 | Example: `papers` → 下载到 `Downloads/papers/`

### 外观模式 | Appearance Mode

| 模式 | Mode | 说明 | Description |
|------|------|------|-------------|
| 跟随系统 | System | 跟随操作系统深色/浅色设置 | Follow OS dark/light setting |
| 浅色模式 | Light | 始终使用浅色主题 | Always use light theme |
| 深色模式 | Dark | 始终使用深色主题 | Always use dark theme |

### easyScholar 数据集成 | easyScholar Integration

**获取 SecretKey | Get SecretKey**:
1. 访问 [easyScholar 开放平台](https://www.easyscholar.cc/console/user/open)
   Visit [easyScholar Open Platform](https://www.easyscholar.cc/console/user/open)
2. 注册并登录账号
   Register and login
3. 在「开放接口」页面获取 SecretKey
   Get SecretKey from "Open API" page

**配置 SecretKey | Configure SecretKey**:
1. 在扩展设置中找到「easyScholar SecretKey」输入框
   Find "easyScholar SecretKey" input in extension settings
2. 粘贴获取的 SecretKey
   Paste the obtained SecretKey
3. 点击「保存」
   Click "Save"

**获取的指标 | Available Metrics**:
- 真实官方影响因子 (IF) | Official Impact Factor
- 中科院大类分区 | CAS partition classification
- JCR 四分位指标 | JCR quartile metrics
- CCF 推荐等级 (A/B/C) | CCF recommended rank
- CSSCI / 北大核心收录 | CSSCI / PKU Core journals
- 中科院预警期刊级别 | CAS early warning journal level

### AI 总结引擎配置 | AI Summarization Engine Configuration

**选择提供商 | Select Provider**:

在设置中选择 AI 提供商：
Select AI provider in settings:

| 提供商 | Provider | 需要配置 | Configuration Needed |
|--------|----------|----------|---------------------|
| Google Gemini | Google Gemini | API Key | API Key |
| OpenAI | OpenAI | API Key | API Key |
| Anthropic | Anthropic | API Key | API Key |
| DeepSeek | DeepSeek | API Key | API Key |
| OpenRouter | OpenRouter | API Key | API Key |
| Ollama | Ollama | 本地服务地址 | Local service URL |
| 自定义 | Custom | API URL + Key | API URL + Key |

**配置步骤 | Configuration Steps**:

1. 在设置中选择 AI 提供商
   Select AI provider in settings

2. 输入 API 密钥
   Enter API key

3. （可选）自定义 API 端点
   (Optional) Customize API endpoint

4. 点击「测试连接」验证配置
   Click "Test Connection" to verify configuration

5. 保存设置
   Save settings

**API 密钥安全 | API Key Security**:
- API 密钥保存在浏览器本地 storage 中
  API keys are stored in local browser storage
- 不会上传至任何第三方服务器
  Never uploaded to any third-party server
- 仅用于直接调用 AI 服务商 API
  Only used for direct calls to AI provider APIs

**Ollama 本地部署 | Ollama Local Deployment**:

1. 安装 Ollama: https://ollama.ai
2. 下载模型：`ollama pull llama2`
3. 启动服务：`ollama serve`
4. 在扩展设置中输入：`http://localhost:11434`
5. 选择模型：`llama2`（或其他已下载模型）

---

## 项目结构 | Project Structure

```
paperpilot-pro-extension/
├── manifest.json                # Manifest V3 扩展配置 | MV3 extension config
├── README.md                    # 项目文档 | Project documentation
├── .gitignore                   # Git 忽略规则 | Git ignore rules
├── generate_icons.py            # 图标生成脚本 | Icon generation script
│
├── icons/                       # 扩展图标 | Extension icons
│   ├── icon16.png               # 16x16 工具栏图标 | 16x16 toolbar icon
│   ├── icon48.png               # 48x48 管理页图标 | 48x48 management icon
│   └── icon128.png              # 128x128 商店图标 | 128x128 store icon
│
├── lib/                         # 公共库 | Shared libraries
│   └── svg-icons.js             # Feather SVG 图标库 | Feather SVG icon library
│
├── background/                  # 后台脚本 | Background scripts
│   └── background.js            # Service Worker: API 调用、PDF 探测、历史、AI 总结
│                                # Service Worker: API calls, PDF verification, history, AI
│
├── core/                        # 可复用、可测试核心模块 | Reusable, testable core modules
│   ├── pdf.js                   # PDF 归一化、评分与响应分类 | PDF normalization and classification
│   ├── pdf-discovery.js         # DOM/JSON-LD/Shadow DOM 候选发现 | Candidate discovery
│   ├── site-profiles.js         # 可注册出版商适配器 | Pluggable publisher adapters
│   ├── cache.js                 # TTL/LRU 与并发去重 | TTL/LRU and single-flight helpers
│   └── metadata.js              # DOI 与论文元数据 | DOI and paper metadata
│
├── content/                     # 内容脚本 | Content scripts
│   ├── detector.js              # 全网页轻量学术探测器 | Lightweight all-page detector
│   ├── scholar.js               # 谷歌学术增强脚本 | Google Scholar enhancement script
│   ├── scholar.css              # 谷歌学术样式 | Google Scholar styles
│   ├── journal.js               # 期刊页增强脚本 | Journal page enhancement script
│   └── journal.css              # 期刊页样式 | Journal page styles
│
├── popup/                       # 弹窗界面 | Popup interface
    ├── popup.html               # 弹窗 HTML | Popup HTML
    ├── popup.js                 # 弹窗逻辑 | Popup logic
│   └── popup.css                # 弹窗样式 | Popup styles
│
├── test/                        # 核心回归测试 | Core regression tests
└── scripts/                     # 校验、E2E 与打包 | Verification, E2E and packaging
```

**文件大小参考 | File Size Reference**:

| 文件 | File | 行数 | Lines | 说明 | Description |
|------|------|------|-------|------|-------------|
| background.js | background.js | ~1200 | ~1200 | 后台服务 | Background service |
| scholar.js | scholar.js | ~1800 | ~1800 | 学术增强 | Scholar enhancement |
| scholar.css | scholar.css | ~600 | ~600 | 学术样式 | Scholar styles |
| journal.js | journal.js | ~1600 | ~1600 | 期刊增强 | Journal enhancement |
| journal.css | journal.css | ~800 | ~800 | 期刊样式 | Journal styles |
| popup.html | popup.html | ~500 | ~500 | 弹窗界面 | Popup UI |
| popup.js | popup.js | ~800 | ~800 | 弹窗逻辑 | Popup logic |
| popup.css | popup.css | ~1200 | ~1200 | 弹窗样式 | Popup styles |

---

## 技术架构 | Architecture

### 设计原则 | Design Principles

**非破坏性排序 | Non-destructive Sorting**:
- 使用 CSS Flexbox `order` 属性重排
  Uses CSS Flexbox `order` property to reorder
- 不移动 DOM 节点，保持 Scholar 原生结构
  Doesn't move DOM nodes, maintains Scholar's native structure
- 避免触发 Scholar 的重新渲染
  Avoids triggering Scholar's re-rendering

**纯客户端运行 | Pure Client-side**:
- 所有处理在浏览器本地完成
  All processing happens locally in the browser
- 不经过代理服务器
  No proxy servers involved
- 避免触发 CAPTCHA 验证
  Avoids triggering CAPTCHA verification
- 保护用户隐私
  Protects user privacy

**响应式状态管理 | Reactive State Management**:
- MutationObserver 监听 DOM 变化
  MutationObserver watches for DOM changes
- 自动恢复被 Scholar JS 覆盖的增强元素
  Auto-restores enhanced elements overwritten by Scholar's JS
- 路由变化检测：hooks history API + popstate + hashchange + URL 轮询
  Route change detection: hooks history API + popstate + hashchange + URL polling

**模块化功能开关 | Modular Feature Toggles**:
- 20+ 独立开关
  20+ independent switches
- 每项功能可单独启用/禁用
  Each feature can be individually enabled/disabled
- 设置即时生效
  Settings take effect immediately

### 高价值架构与性能调优 | Architectural & Performance Optimizations

**两级按需激活 | Two-stage On-demand Activation**:
- 已知学术站点直接加载；其他网页只运行轻量探测器，命中学术元数据后再加载完整模块
  Known academic sites load directly; other pages run only a lightweight detector until scholarly metadata is found
- 避免在普通网页运行大型内容脚本，同时覆盖机构仓储与长尾期刊站点
  Avoids heavy scripts on ordinary pages while covering repositories and long-tail journal sites

**模块化 PDF 发现 | Modular PDF Discovery**:
- 统一识别 Highwire/PRISM 元标签、显式按钮、嵌入查看器、JSON-LD、URL 参数与开放 Shadow DOM
  Detects Highwire/PRISM metadata, controls, viewers, JSON-LD, URL parameters and open Shadow DOM
- 出版商规则通过可注册适配器扩展，不必继续堆叠 UI 文件中的站点分支
  Publisher rules are extended through registered adapters instead of UI-file condition chains

**有界 TTL/LRU 缓存 | Bounded TTL/LRU Cache**:
- 引入 7 天缓存有效生存期
  Introduces 7-day cache TTL (Time To Live)
- PDF 请求缓存和元数据缓存均有数量上限及过期清理，避免长期使用后存储无限增长
  PDF request and metadata caches are bounded and expired to prevent unbounded long-term growth

**实时 GC 垃圾回收器 | Real-time GC Garbage Collector**:
- 绑定 `downloads.onChanged` 监听器
  Binds `downloads.onChanged` listener
- 下载任务中断/取消/完成时实时注销引用
  Real-time reference cleanup when download interrupts/cancels/completes
- 清理已完成或中断任务的临时映射，降低长会话内存泄漏风险
  Cleans temporary mappings after completion or interruption to reduce long-session leak risk

**高校机构代理兼容 | Institutional Proxy Compatibility**:
- 内置统一归一化清洗引擎
  Built-in unified normalization cleaning engine
- 通过轻量探测器识别带学术元数据的 VPN/EZproxy 与机构仓储页面
  Detects VPN/EZproxy and repository pages that expose scholarly metadata
- 保留原始代理 URL 发起实际 PDF 下载
  Preserves original proxy URL for actual PDF downloads
- 校验请求携带当前会话凭据；最终访问能力仍取决于出版商和机构权限
  Verification requests include session credentials; access still depends on publisher and institutional permissions

**无限滚动增量查重 | Infinite Scroll Incremental Dedup**:
- 对 Levenshtein 算法增加 O(1) 长度差剪枝过滤器
  Adds O(1) length-difference pruning filter to Levenshtein algorithm
- 瞬间过滤 90% 以上无关标题
  Instantly filters 90%+ irrelevant titles
- 支持无限滚动增量去重
  Supports infinite scroll incremental deduplication
- 动态追加至已有折叠抽屉中
  Dynamically appends to existing collapsed drawers
- 配合同步 direct JS 属性缓存
  Combined with synchronous direct JS property caching
- 省去高频 DOM 读写开销
  Eliminates high-frequency DOM read/write overhead

**流体验带宽主动释放 | Streaming Bandwidth Active Release**:
- 嗅探 PDF 魔数后立即取消 reader
  Immediately cancels reader after sniffing PDF magic bytes
- 避免后台吞噬多余带宽
  Avoids background bandwidth consumption
- 仅读取前 1024 字节验证 PDF 格式
  Only reads first 1024 bytes to verify PDF format

**Storage 防崩溃 | Storage Anti-crash**:
- Popup 降级缓存完美模拟 chrome.storage
  Popup fallback cache perfectly simulates chrome.storage
- 支持单一/复合/配置参数签名
  Supports single/composite/config parameter signatures
- 实现工程级极限防崩溃
  Achieves engineering-grade crash prevention

### 技术栈 | Tech Stack

- **Chrome Manifest V3**: 最新扩展规范
  Latest extension specification
- **Vanilla JavaScript**: 无框架依赖，加载更快
  No framework dependencies, faster loading
- **CSS Custom Properties**: 主题变量系统
  Theme variable system
- **MutationObserver**: DOM 变更监听
  DOM change monitoring
- **Chrome Storage API**: 设置持久化
  Settings persistence
- **localStorage**: 查询状态持久化
  Query state persistence

---

## 常见问题 | FAQ

### Q1: 扩展不生效怎么办？| What if the extension doesn't work?

**可能原因 | Possible Causes**:
1. 未开启开发者模式
   Developer mode not enabled
2. 扩展未正确加载
   Extension not loaded correctly
3. 页面需要刷新
   Page needs refresh

**解决方法 | Solutions**:
1. 检查 `chrome://extensions/` 页面，确认扩展已启用
   Check `chrome://extensions/` page, confirm extension is enabled
2. 尝试重新加载扩展
   Try reloading the extension
3. 刷新当前页面
   Refresh current page
4. 检查浏览器控制台是否有错误信息
   Check browser console for error messages

### Q2: 为什么有些论文没有显示徽章？| Why don't some papers show badges?

**可能原因 | Possible Causes**:
1. 论文元数据不完整
   Paper metadata incomplete
2. API 请求失败
   API request failed
3. 未配置 easyScholar SecretKey
   easyScholar SecretKey not configured

**解决方法 | Solutions**:
1. 等待几秒，徽章会异步加载
   Wait a few seconds, badges load asynchronously
2. 配置 easyScholar SecretKey 获取官方数据
   Configure easyScholar SecretKey for official data
3. 检查网络连接
   Check network connection

### Q3: PDF 下载失败怎么办？| What if PDF download fails?

**可能原因 | Possible Causes**:
1. PDF 链接需要机构权限
   PDF link requires institutional access
2. 网络连接问题
   Network connection issue
3. 出版商限制
   Publisher restrictions

**解决方法 | Solutions**:
1. 使用学校 VPN 或机构代理
   Use school VPN or institutional proxy
2. 手动访问论文页面下载
   Manually visit paper page to download
3. 检查网络连接
   Check network connection

### Q4: AI 总结功能如何使用？| How to use AI summary feature?

**使用步骤 | Usage Steps**:
1. 在设置中选择 AI 提供商
   Select AI provider in settings
2. 输入 API 密钥
   Enter API key
3. 点击「测试连接」验证
   Click "Test Connection" to verify
4. 访问期刊摘要页，点击「AI 总结」按钮
   Visit journal abstract page, click "AI Summary" button

**无 API 密钥 | Without API Key**:
- 扩展使用本地算法生成简要摘要
  Extension uses local algorithm for brief summary
- 质量不如 AI，但可快速预览
  Quality lower than AI, but good for quick preview

### Q5: 如何获取 easyScholar SecretKey？| How to get easyScholar SecretKey?

**获取步骤 | Steps**:
1. 访问 https://www.easyscholar.cc/console/user/open
2. 注册并登录账号
   Register and login
3. 在「开放接口」页面获取 SecretKey
   Get SecretKey from "Open API" page
4. 在扩展设置中配置
   Configure in extension settings

### Q6: 扩展会影响浏览器性能吗？| Will the extension affect browser performance?

**性能影响 | Performance Impact**:
- 扩展设计为轻量级
  Extension designed to be lightweight
- 使用 MutationObserver 而非轮询
  Uses MutationObserver instead of polling
- 7 天缓存减少 API 调用
  7-day cache reduces API calls
- 对性能影响极小
  Minimal performance impact

**优化建议 | Optimization Tips**:
- 关闭不需要的功能
  Disable unused features
- 定期清理学人足迹
  Regularly clear research footprints

### Q7: 数据存储在哪里？| Where is data stored?

**存储位置 | Storage Location**:
- 设置：`chrome.storage.local`
  Settings: `chrome.storage.local`
- 学人足迹：`chrome.storage.local`
  Footprints: `chrome.storage.local`
- 缓存：`chrome.storage.local`（7 天自动过期）
  Cache: `chrome.storage.local` (auto-expires after 7 days)
- 查询状态：`localStorage`
  Query state: `localStorage`

**数据安全 | Data Security**:
- 所有数据存储在本地浏览器
  All data stored locally in browser
- 不会上传到任何服务器
  Never uploaded to any server
- API 密钥仅用于直接调用
  API keys only used for direct calls

### Q8: 支持哪些浏览器？| Which browsers are supported?

**支持的浏览器 | Supported Browsers**:
- Google Chrome (推荐 | Recommended)
- Microsoft Edge (基于 Chromium)
- Brave Browser
- 其他基于 Chromium 的浏览器
  Other Chromium-based browsers

**不支持的浏览器 | Unsupported Browsers**:
- Firefox (使用不同扩展规范)
  Firefox (uses different extension specification)
- Safari (使用不同扩展规范)
  Safari (uses different extension specification)

### Q9: 如何更新扩展？| How to update the extension?

**开发者模式 | Developer Mode**:
1. 下载最新代码
   Download latest code
2. 替换本地文件夹
   Replace local folder
3. 在 `chrome://extensions/` 页面点击扩展的「刷新」按钮
   Click extension's "Refresh" button on `chrome://extensions/` page

**打包安装 | Packed Installation**:
1. 重新打包新版本
   Repack new version
2. 安装新的 `.crx` 文件
   Install new `.crx` file

### Q10: 如何反馈问题？| How to report issues?

**反馈方式 | Feedback Methods**:
1. 在 GitHub 仓库提交 Issue
   Submit Issue in GitHub repository
2. 包含以下信息：
   Include the following info:
   - 浏览器版本
     Browser version
   - 扩展版本
     Extension version
   - 问题描述
     Problem description
   - 复现步骤
     Reproduction steps
   - 浏览器控制台错误信息（如有）
     Browser console errors (if any)

---

## 故障排除 | Troubleshooting

### 问题 1: 扩展图标灰色 | Issue 1: Extension icon is gray

**症状 | Symptoms**:
- 扩展图标显示为灰色
  Extension icon appears gray
- 点击无反应
  No response when clicking

**解决方法 | Solutions**:
1. 检查扩展是否启用
   Check if extension is enabled
2. 尝试重新加载扩展
   Try reloading extension
3. 检查 manifest.json 是否有语法错误
   Check manifest.json for syntax errors

### 问题 2: 学术页面无增强效果 | Issue 2: No enhancement on academic pages

**症状 | Symptoms**:
- Google Scholar 页面无排序按钮
  No sorting buttons on Google Scholar
- 期刊页无悬浮元卡
  No floating metacard on journal pages

**解决方法 | Solutions**:
1. 刷新页面
   Refresh page
2. 检查扩展是否在该站点启用
   Check if extension is enabled on that site
3. 检查浏览器控制台错误
   Check browser console errors
4. 确认功能开关已开启
   Confirm feature toggles are ON

### 问题 3: 指标显示「查询中」或未显示 | Issue 3: Metrics show "Querying" or are hidden

**症状 | Symptoms**:
- 徽章显示「查询中」或不显示 IF/JCR/中科院分区
  Badges show "Querying" or IF/JCR/CAS metrics are hidden

**解决方法 | Solutions**:
1. 配置 easyScholar SecretKey
   Configure easyScholar SecretKey
2. 等待异步数据加载
   Wait for async data loading
3. 检查网络连接
   Check network connection
4. 未配置可信数据源时，PaperPilot Pro 不再展示估算指标
   Without a trusted data source, PaperPilot Pro no longer shows estimated metrics

### 问题 4: PDF 下载失败 | Issue 4: PDF download fails

**症状 | Symptoms**:
- 点击下载按钮无反应
  No response when clicking download button
- 下载开始但失败
  Download starts but fails

**解决方法 | Solutions**:
1. 检查网络连接
   Check network connection
2. 使用学校 VPN
   Use school VPN
3. 手动访问论文页面下载
   Manually visit paper page to download
4. 检查浏览器下载设置
   Check browser download settings

### 问题 5: AI 总结超时 | Issue 5: AI summary timeout

**症状 | Symptoms**:
- 点击 AI 总结后长时间无响应
  No response for long time after clicking AI summary
- 显示超时错误
  Shows timeout error

**解决方法 | Solutions**:
1. 检查 API 密钥是否正确
   Check if API key is correct
2. 检查网络连接
   Check network connection
3. 尝试其他 AI 提供商
   Try other AI providers
4. 检查 API 配额是否用尽
   Check if API quota is exhausted

### 问题 6: 设置不保存 | Issue 6: Settings not saving

**症状 | Symptoms**:
- 修改设置后刷新页面恢复原状
  Settings revert after page refresh
- 设置无法生效
  Settings don't take effect

**解决方法 | Solutions**:
1. 检查浏览器存储权限
   Check browser storage permissions
2. 清除浏览器缓存后重试
   Clear browser cache and retry
3. 重新安装扩展
   Reinstall extension

---

## 许可 | License

MIT License

Copyright (c) 2025 PaperPilot Pro

本项目基于 MIT 许可证开源，详情请参阅 [LICENSE](LICENSE) 文件。

This project is open-sourced under the MIT License. See [LICENSE](LICENSE) for details.

---

## 致谢 | Acknowledgments

感谢以下开源项目和服务：
Thanks to the following open-source projects and services:

- [Google Scholar](https://scholar.google.com/) - 学术搜索引擎
- [easyScholar](https://www.easyscholar.cc/) - 学术指标数据
- [OpenAlex](https://openalex.org/) - 开放学术数据
- [Crossref](https://www.crossref.org/) - DOI 解析服务
- [Feather Icons](https://feathericons.com/) - SVG 图标库

---

**最后更新 | Last Updated**: 2025-01

**版本 | Version**: 1.2.0

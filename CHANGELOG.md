# Changelog

## v2.1.0 - 2026-08-03

### Performance & Compatibility

- Rendered journal metadata cards immediately from local page metadata and progressively refreshed remote enrichment.
- Bounded all-page academic detection, paused hidden-page work, and cleaned up observers and timers during page lifecycle transitions.
- Added DOI CSL JSON negotiation, title-similarity validation, metadata single-flight, cache schema versioning, and parallel scholarly provider lookups.
- Deduplicated easyScholar journal requests while preserving its default-off privacy gate.
- Added adaptive Scholar lifecycle polling and incremental Popup history rendering with debounced search.
- Expanded multilingual publisher challenge and authentication-page detection.
- Added private OpenAlex API key and scholarly contact-email settings.
- Fixed IOPscience `/article/{doi}/meta` and related presentation routes being misidentified as part of the DOI.

## v2.0.3 - 2026-08-03

### Changed

- Added an explicit easyScholar master switch that is disabled by default.
- Prevented background easyScholar requests unless the integration is explicitly enabled and configured.
- Improved weak-title detection and preserved unknown publication year and open-access status instead of inventing defaults.

## v2.0.2 - 2026-07-30

### Fixed

- Persisted Scholar favorites in footprint history and preserved them after later visit, download, or citation events.
- Restored and synchronized active Chrome PDF download tracking across MV3 service worker wake-ups.
- Kept easyScholar secret values out of Scholar and journal content-script configuration paths.

### Changed

- Removed raw easyScholar API response logging and the obsolete duplicate Popup history filter.

## v2.0.1 - 2026-07-24

### Fixed & Optimized
- **「文过留痕」与「全局配置」切换平滑无缝过渡**：重构 Popup 选项卡切换视觉引擎，新增 `nav-pill` 流体弹簧滑动指示器与视口 `transform` 3D 左右推移 + 模糊淡入淡出（Cross-fade）动画；移除旧版切换时顶部卡片的突兀高度坍塌，彻底消除卡顿与割裂感。
- **MV3 Service Worker 状态持久化**：使用 `chrome.storage.session` 对下载与重命名跟踪器进行会话存储，确保后台 SW 休眠重启后在途 PDF 重命名与缓存处理不丢失。
- **足迹历史容量限制优化**：优化 `addFootprint()` 存储上限为 500 条，大幅提升 `chrome.storage.local` 反序列化与读取性能。
- **谷歌学术 Nature Index 刊名精准匹配**：改用按刊名长度降序排列的匹配规则 `NATURE_INDEX_JOURNALS_LIST`，避免 Nature 子刊（如 *Nature Communications*）被误匹配归类为 *Nature* 父刊。
- **Unicode 引用 Key 提取支持**：在 `core/citation.js` 中使用 Unicode 字符正则（`\p{L}\p{N}`），全面兼容中文作者姓名及欧语系重音字母的 BibTeX / RIS 引用 Key 自动生成。
- **Unpaywall 邮箱集中配置**：导出集中管理的 `UNPAYWALL_EMAIL` 变量。

## v2.0.0 - 2026-07-24

### Added
- **文献留痕备份与恢复 (JSON Import/Export)**：新增完整 JSON 结构化备份导出与一键还原恢复功能，支持在跨浏览器或新设备间无损同步文献研读轨迹，且自动排重。
- **卡片直观快捷元数据编辑按键 (✏️)**：在每张留痕卡片上增设 ✏️ 快速编辑按钮，点击直接召唤浮层 Edit Drawer 修正标题、作者、年份或 DOI。
- **多维度深度组合搜索**：扩展搜索过滤匹配规则，除了标题、期刊和 DOI 外，支持按作者姓名（如 `Hinton`）或出版年份（如 `2024`）进行实时全字段检索。
- **留痕卡片 1-Click Markdown 笔记复制按键 (`MD`)**：在文献卡片工具栏增设一键 Markdown 引用复制按键，方便迅速导出形如 `[Title](URL) - *Journal* (Year)` 的卡片笔记至 Obsidian 或 Notion。
- **键盘极客快捷搜索与清除**：支持在弹出窗口任意位置按下 `/` 或 `Ctrl+F` (`Cmd+F`) 迅速展开面板并聚焦搜索框；按 `Esc` 可秒速清空搜索。
- **日期快捷选框高亮联动**：点击「今天」、「近 3 天」、「本周」等快捷筛选时间段时，按键增加 `.active` 荧光 Pill 状态指示，筛选交互更直观。

### Changed
- **「学人足迹」品牌重构为「文过留痕」**：全面重构了 Popup 界面 Tab 标签、统计栏、打卡日历、搜索框 Placeholder 及导出提示的中文文案。

### Fixed
- **日期 Quick Filter 筛选计算修复**：修正了「近 3 天」与「本周」快捷区间按键赋值导致的单日覆盖问题。
- **留痕清空按键绑定修复**：补全了 Popup 底部 `btn-clear-history` 清空按键的二次确认提示与数据持久化清空。

## v1.8.1 - 2026-07-23

### Added
- **留痕卡片 1-Click Markdown 笔记复制按键 (`MD`)**：在文献卡片工具栏增设一键 Markdown 引用复制按键，方便迅速导出形如 `[Title](URL) - *Journal* (Year)` 的卡片笔记至 Obsidian 或 Notion。
- **键盘极客快捷搜索与清除**：支持在弹出窗口任意位置按下 `/` 或 `Ctrl+F` (`Cmd+F`) 迅速展开面板并聚焦搜索框；按 `Esc` 可秒速清空搜索。
- **日期快捷选框高亮联动**：点击「今天」、「近 3 天」、「本周」等快捷筛选时间段时，按键增加 `.active` 荧光 Pill 状态指示，筛选交互更直观。

### Changed
- **「学人足迹」品牌重构为「文过留痕」**：全面重构了 Popup 界面 Tab 标签、统计栏、打卡日历、搜索框 Placeholder 及导出提示的中文文案。

### Fixed
- **日期 Quick Filter 筛选计算修复**：修正了「近 3 天」与「本周」快捷区间按键赋值导致的单日覆盖问题。
- **留痕清空按键绑定修复**：补全了 Popup 底部 `btn-clear-history` 清空按键的二次确认提示与数据持久化清空。

## v1.8.1 - 2026-07-23

### Added
- **足迹卡片 1-Click DOI 直链复制按键 (`DOI`)**：在每张足迹卡片工具栏上增设 DOI 直链一键复制按钮，方便将 `https://doi.org/...` 格式迅速分享给同行。
- **DOM-Safe 搜索关键词荧光高亮引擎**：基于原生分词拆解，在不破坏 DOM 安全的前提下，实时将搜索到的词汇应用 `.pp-highlight` 绿色荧光突出显示。

### Changed
- **快捷日期区间筛选升级**：优化了「今天」、「近 3 天」、「本周」按键的毫秒算术区间计算与过滤提示。

## v1.8.0 - 2026-07-23

### Added
- **日历打卡与搜索面板无缝联动**：引入可折叠/展开的「文献搜索与日期筛选面板 Card」，点击 28 天日历网格上的任意日期时，面板自动展开并高亮挂载日期标签，提供「今天」、「近 3 天」、「本周」快捷时间筛选。
- **智能安全日期解析引擎 (`safeParseDate`)**：彻底解决了毫秒数字戳与日期字符串在 JavaScript 中的解析歧义，确保新旧所有科研轨迹均能精准呈现与展开。

### Changed
- **单列表架构优化 (Unified Single-List)**：彻底清理了多余的内嵌重复抽屉与多重嵌套滚动条，文献统一在单一下方列表中呈现，全弹窗维持单一清爽滚动条。

### Fixed
- **Chrome 扩展窗口溢出裁剪修复**：修正了 `.pp-popup-section` 的 `overflow: hidden` 限制，全面解除 Chrome Popup 600px 剪切限制，并增加点击日期时的智能平滑滚轴定位。

## v1.7.0 - 2026-07-23

### Added
- **日历型学术研读打卡看板重设计**：针对原点阵图可读性差的问题，将其重构为 **4 周 (28 天) 星期对齐日历网格 (周一~周日)**。单元格扩展至 32px 大尺寸并直观标注**公历日期数字与本日阅读篇数**，右上方增设 **🔥 连续打卡天数追踪徽章**，大幅提升可读性、点击交互体验与科研打卡成就感。

### Changed
- **文献足迹存储上限大幅扩容**：将原先 100 篇的硬上限提升至 **3000 篇**，满足长期科研文献轨迹积累需求。
- **学人足迹卡片极致极简化重构**：移除了右侧冗余的操作按钮列（打开 / BibTeX / MD / 编辑 / 删除），实现**全卡片点击直接跳转**论文网页/PDF。右侧仅保留极简的收藏星号 (⭐)、快捷移除 (❌) 和外链图标 (↗)，标题与元数据横向空间提升 100%，排版清爽高质感。
- **Dashboard Overview 功能格改为 3行 × 2列**布局，6 个功能模块每格横向空间更充裕，名称与域标签不再截断。
- **弹出窗口高度**增大至 740px，为学人足迹列表提供更充足的可视高度（最小保障 280px），列表项增加 `flex-shrink: 0` 防止压缩变形。

### Fixed
- **Toast 弹出框样式与动画关联修复**：修正了 `popup.css` 中 `.pp-popup-toast.pp-show` 选择器缺失问题，确保保存设置与剪贴板复制提示框能够淡入滑动浮现。
- **足迹卡片快捷删除支持**：在学人足迹条目右侧直观补充独立一键删除按钮 (`.pp-foot-delete-btn`) 及其 Hover 红色警示气泡反馈。

## v1.6.0 - 2026-07-23

### Added
- Brand-new modern icon set redesign (16x16, 32x32, 48x48, 128x128) featuring emerald gradient canvas, crisp origami wing motif, and Lanczos anti-aliased rendering.

### Fixed
- Replaced direct `chrome.runtime.sendMessage` invocations in Scholar search and Popup scripts with safe wrappers to prevent `Unchecked runtime.lastError` and `Extension context invalidated` console errors.
- Added missing Promise `.catch()` error handling for `ACTIVATE_JOURNAL_PAGE` and unhandled message action fallbacks in Service Worker background script.

## v1.5.0 - 2026-07-23

### Added
- Complete UI/UX Glassmorphic Redesign across Popup, Google Scholar Sidebar, and Journal Floating Metacard.
- 6 Geek-Tier Preset Theme Engine: System Auto, Obsidian Night, Porcelain Day, Cyber Violet, Oceanic Cyan, and Sunset Amber.
- Global Keyboard Shortcuts: `Alt+P` (toggle metacard), `Alt+D` (download PDF), `Alt+C` (copy DOI).
- Footprint Quick Filter Chips (`全部`, `⭐ 精选收藏`, `📥 已下载`, `📝 已复引用`) and 1-Click `[BibTeX]` / `[MD]` copy pills.
- Crystal-clear in-place copy status badge (`✓ 已成功复制到剪贴板`) and SVG icon path optimizations.

### Fixed
- Fixed ReferenceError for pin/minimize SVG buttons on metacard header by defining `getIcon` helper.
- Fixed tab switching binding in Popup so clicking "全局配置" (`#tab-btn-set`) activates settings panel smoothly.

## v1.4.2 - 2026-07-20

### Fixed
- Prevented accepted Chrome PDF downloads from being cancelled when publishers temporarily report an empty or generic MIME type.
- Made post-dispatch verification advisory so Cookie-, Referer-, or challenge-dependent downloads can continue natively.

## v1.4.1 - 2026-07-20

### Fixed
- Kept Chrome's Save As prompt authoritative for page-context fallbacks so downloads no longer silently bypass the selected-path dialog.
- Removed full-file Data URL conversion that delayed native PDF download dispatch.

### Changed
- Dispatch high-confidence PDF candidates directly to Chrome while verification and cache warming continue in the background.
- Prewarm and actively synchronize PDF download settings to remove per-click storage latency.
- Treat direct Scholar PDF links as high-confidence native download candidates.

## v1.4.0 - 2026-07-18

### Added
- Broader Chrome PDF compatibility for SAGE, APS, AIP, BMJ, DOI-driven long-tail publishers, blob URLs, and session-bound page downloads.
- In-memory verified-target reuse, verification single-flight coordination, and richer PDF transport diagnostics.

### Changed
- Optimized high-confidence PDF discovery and dynamic journal activation for faster one-click downloads.
- Added regression and performance coverage for page-context fallback, non-standard PDF routes, and repeated downloads.

## v1.3.0 - 2026-07-17

### Added
- Independent PDF verifier and page-activation modules with focused regression coverage.
- Direct adapters for OpenReview, ACL Anthology, PMLR, NeurIPS proceedings, and CVF Open Access.
- Dashboard Overview shortcut for toggling the PDF save-location prompt, synchronized with global settings.
- Chrome page-context fallback for blob, session-bound, and non-standard PDF download controls.
- Additional DOI route adapters for SAGE, APS, AIP, BMJ, and metadata-driven long-tail publishers.

### Changed
- Converted publisher URL handling to a data-driven adapter registry.
- Replaced eager parallel PDF probes with adaptive hedged HEAD/Range verification.
- Replaced full-page mutation observers with bounded head observation and low-frequency route checks.
- Short-circuited high-confidence PDF discovery, added in-memory verified-target reuse, and separated verification single-flight from download-task creation.

### Fixed
- Accumulate split response chunks before checking the PDF signature and reject HTML/JSON disguised as binary downloads.
- Preserve functional download parameters in candidate identities and hash every candidate in request-cache keys.
- Retry failed dynamic injection, avoid duplicate runtime/CSS injection, queue same-URL downloads safely, and invalidate stale signed-link caches.
- Cache only definitive negative PDF checks; transient timeouts, authentication failures, and network errors remain retryable.
- Added transport, fallback, discovery-mode, and duration diagnostics for PDF downloads.

## v1.2.0 - 2026-07-16

### Added
- Lightweight all-page academic detector with on-demand journal runtime activation.
- Modular PDF discovery for metadata, controls, embedded viewers, JSON-LD, viewer parameters, and open shadow roots.
- Pluggable publisher adapters for long-tail journal and repository support.
- Bounded TTL/LRU caches and single-flight request coordination.
- Current-page diagnostics, regression fixtures, performance budgets, and reproducible packaging scripts.

### Changed
- Reworked the PDF candidate, verification, caching, and download pipeline for faster repeated downloads and clearer diagnostics.
- Limited heavy content scripts to academic routes while retaining broad background fetch permissions.
- Added SPA lifecycle handling and stale-callback protection for dynamic article pages.
- Updated the extension version to 1.2.0.

### Fixed
- Prevented unverified browser download fallbacks from polluting the persistent verified-PDF cache.
- Preserved case-sensitive URL paths in cache keys and accepted valid PDF headers within the first 1024 bytes.
- Removed fabricated metric estimates and simulated AI-summary fallbacks from the runtime path.

### Compatibility
Backward compatible; no settings migration is required. Publisher authentication and paywall access still depend on the active browser and institutional session.

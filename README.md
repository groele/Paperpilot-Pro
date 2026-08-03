<div align="center">

# PaperPilot Pro

**面向学术搜索与期刊页面的文献发现增强引擎**  
*Academic search and publisher-page enhancement engine for DOI, PDF, BibTeX, journal metrics, and AI-assisted literature reading.*

![Type](https://img.shields.io/badge/type-Chrome%20Extension-blue?style=flat-square)
![Workflow](https://img.shields.io/badge/workflow-literature%20engine-green?style=flat-square)
![Architecture](https://img.shields.io/badge/architecture-browser--native-purple?style=flat-square)
![Version](https://img.shields.io/badge/version-2.1.1-6f42c1?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)

Part of **ResearchFlow Lab** — a local-first research productivity ecosystem for literature, manuscripts, data, and scientific visualization.

</div>

---

## 01. Overview

**PaperPilot Pro** enhances academic literature discovery directly inside the browser. It augments Google Scholar and publisher abstract pages with metadata extraction, DOI utilities, PDF link detection, journal metrics, BibTeX generation, reading notes, and optional AI summaries.

**PaperPilot Pro** 是一个面向科研文献检索和论文页面阅读的浏览器增强工具。它服务于“搜索论文 → 判断质量 → 找 PDF → 复制 DOI/BibTeX → 生成读书笔记 → 进入科研记录”的完整入口流程。

---

## 02. Why this project exists

Academic literature discovery is still highly fragmented. Researchers often jump between Google Scholar, publisher pages, journal ranking websites, PDF sources, citation managers, and AI tools. PaperPilot Pro reduces this friction by turning the browser page itself into a structured literature cockpit.

核心目标：

- Make Google Scholar result pages more sortable, filterable, and informative.
- Detect DOI, PDF links, citation formats, and journal metadata closer to the reading context.
- Reduce repetitive copying between publisher pages, Zotero, BibTeX, Markdown notes, and AI tools.
- Provide a literature-engine layer that can later connect with ResearchFlow records.

---

## 03. Key features

| Module | What it does | 中文说明 |
|---|---|---|
| Google Scholar Enhancement | Adds sorting, filtering, deduplication, and visual badges | 增强 Google Scholar 的排序、过滤、去重和标记能力 |
| Nature Index Highlight | Highlights Nature Index-related journal results | 对 Nature Index 相关期刊结果进行高亮 |
| Metadata Badges | Displays IF, partition, CCF, CSSCI, warning, citations, and PDF status where available | 展示影响因子、分区、CCF、CSSCI、预警、引用量和 PDF 状态 |
| DOI Tools | Detects and copies DOI from literature pages | 检测并复制 DOI |
| On-demand Page Activation | Uses a lightweight detector before loading the full journal runtime on long-tail academic sites | 通过轻量探测器按需激活长尾期刊与机构仓储页面 |
| Modular PDF Discovery | Detects PDF metadata, controls, viewers, JSON-LD, URL parameters, and open Shadow DOM | 识别 PDF 元标签、按钮、查看器、JSON-LD、URL 参数和开放 Shadow DOM |
| PDF Verification & Diagnostics | Uses bounded hedged HEAD/Range checks, reuses verified requests, and reports cache/verification status | 使用有界对冲式 HEAD/Range 校验、复用已验证请求并显示缓存与校验诊断 |
| BibTeX Export | Generates or copies BibTeX-style citation information | 生成或复制 BibTeX 引用 |
| Markdown Notes | Generates structured literature note templates | 生成结构化 Markdown 读书笔记 |
| AI Summary | Uses optional local/user-configured AI providers for literature summaries | 使用用户配置的 AI 模型进行文献总结 |
| Reading Footprints | Records browsed literature history for later search and export | 记录浏览过的论文留痕（文过留痕），便于后续检索与导出 |
| Theme Controls | Supports light, dark, and system-aware appearance | 支持白天、夜间和跟随系统主题 |

---

## 04. Product philosophy

PaperPilot Pro follows four design principles:

1. **Page-native** — literature tools should appear where the paper is being viewed.
2. **Metadata-first** — DOI, title, journal, PDF, and citation data are the core workflow objects.
3. **Research-aware ranking** — journal identity, partitions, citations, and source type should be visible before saving.
4. **Composable** — results should flow into Zotero, Markdown, BibTeX, ResearchFlow, or manuscript notes.

---

## 05. Architecture

```text
PaperPilot Pro
├── Activation Layer
│   ├── known academic route matching
│   └── lightweight all-page detector → on-demand runtime injection
├── Core Layer
│   ├── metadata and DOI normalization
│   ├── PDF discovery and response classification
│   ├── pluggable publisher adapters
│   ├── bounded TTL/LRU caches and single-flight coordination
│   └── citation, sanitization, messaging, and AI adapters
├── Runtime Layer
│   ├── Google Scholar enhancer
│   ├── SPA-aware publisher-page metacard
│   ├── adaptive hedged HEAD/Range PDF verification
│   └── browser download and filename management
└── Presentation Layer
    ├── current-page diagnostics
    ├── feature toggles and themes
    └── reading footprints and exports
```

---

## 06. Quick start

```bash
git clone https://github.com/groele/Paperpilot-Pro.git
cd Paperpilot-Pro
```

Then load the extension in Chrome:

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder containing `manifest.json`.
5. Open Google Scholar or a publisher abstract page.

---

## 07. Recommended workflow

```text
Search on Google Scholar → Sort / filter / inspect badges
                         → Open publisher page
                         → Detect DOI / PDF / citation
                         → Generate BibTeX or Markdown note
                         → Save to Zotero or ResearchFlow
```

Typical use cases:

- Quickly screen literature from Scholar result pages.
- Identify high-value journal papers during broad topic searches.
- Extract DOI and citation data from publisher pages.
- Generate structured literature notes for later manuscript writing.

---

## 08. Project structure

```text
PaperPilot Pro
├── background/        # MV3 service worker, page activation, and download orchestration
├── content/           # lightweight detector plus Scholar/journal runtimes
├── core/              # reusable and independently tested modules
├── popup/             # settings, history, and current-page diagnostics
├── scripts/           # lint, E2E performance checks, and packaging
├── test/              # unit tests and academic repository fixtures
├── manifest.json
├── package.json
└── CHANGELOG.md
```

Key extension points are intentionally isolated: publisher URL rules are registered in
`core/site-profiles.js`, byte/header verification lives in `core/pdf-verifier.js`, generic
DOM discovery lives in `core/pdf-discovery.js`, and dynamic page injection lives in
`background/page-activation.js`. New publisher support should normally add one adapter and
one fixture-backed test without modifying the download state machine.

---

## 09. Roadmap

- [x] Pluggable publisher adapters and metadata-driven long-tail activation
- [x] Modular PDF discovery with bounded verification and diagnostics
- [ ] ResearchFlow record export
- [ ] Zotero import / export bridge
- [ ] Better deduplication across Scholar, arXiv, and publisher versions
- [ ] Configurable journal-metric providers
- [ ] Safer AI summary prompt templates

---

## 10. Privacy and data ownership

PaperPilot Pro is designed as a browser-side literature enhancement tool. Reading footprints, settings, and local metadata should remain in browser storage unless the user explicitly enables export, sync, or external AI services.

---

## 11. Related projects

- **ResearchFlow Companion** — research workflow operating system
- **ClipNote** — browser-native quick notes and Markdown capture
- **BetterScholar** — lightweight Google Scholar userscript
- **ManuGuide** — Microsoft Word manuscript formatting and style checker
- **Scientific Color Lab** — scientific color and visualization workspace

---

## 12. License

MIT License.

Developed by **Shikun Hou / groele**.

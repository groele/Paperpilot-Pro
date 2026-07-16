/**
 * PaperPilot Pro - Extension Dropdown Controller
 * Manages configuration storage binds and footprints log lists.
 */

const initPopup = () => {
  // Safe Storage wrappers to support both chrome.storage and localStorage fallback (for local previews)
  const getStorage = (keys, callback) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, callback);
    } else {
      console.warn("chrome.storage.local is not available. Falling back to localStorage.");
      const result = {};
      let keyList = [];
      let defaults = {};
      if (typeof keys === 'string') {
        keyList = [keys];
      } else if (Array.isArray(keys)) {
        keyList = keys;
      } else if (keys && typeof keys === 'object') {
        keyList = Object.keys(keys);
        defaults = keys;
      }
      keyList.forEach(k => {
        try {
          const val = localStorage.getItem(k);
          result[k] = val ? JSON.parse(val) : (defaults[k] !== undefined ? defaults[k] : undefined);
        } catch (e) {
          result[k] = defaults[k] !== undefined ? defaults[k] : undefined;
        }
      });
      callback(result);
    }
  };

  const setStorage = (data, callback) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(data, callback);
    } else {
      console.warn("chrome.storage.local is not available. Falling back to localStorage.");
      Object.keys(data).forEach(k => {
        try {
          localStorage.setItem(k, JSON.stringify(data[k]));
        } catch (e) {}
      });
      if (callback) callback();
    }
  };

  const tabFoot = document.getElementById("tab-btn-foot");
  const tabSet = document.getElementById("tab-btn-set");
  const panelFoot = document.getElementById("panel-foot");
  const panelSet = document.getElementById("panel-set");

  const searchInput = document.getElementById("history-search");
  const historyList = document.getElementById("history-list");
  const emptyMsg = document.getElementById("history-empty");
  const exportAllBtn = document.getElementById("btn-export-all");
  const exportFormatSelect = document.getElementById("setting-export-format");
  const overviewStatusPill = document.getElementById("overview-status-pill");
  const pageDiagnosticsText = document.getElementById("page-diagnostics-text");
  const refreshPageDiagnosticsBtn = document.getElementById("btn-refresh-page-diagnostics");
  const openFirstPdfBtn = document.getElementById("btn-open-first-pdf");
  const recordEditOverlay = document.getElementById("record-edit-overlay");
  const recordEditDrawer = document.getElementById("record-edit-drawer");
  const recordEditForm = document.getElementById("record-edit-form");
  const recordEditClose = document.getElementById("record-edit-close");
  const recordEditCancel = document.getElementById("record-edit-cancel");
  const recordEditDelete = document.getElementById("record-edit-delete");
  const recordEditTitleInput = document.getElementById("record-edit-title-input");
  const recordEditJournalInput = document.getElementById("record-edit-journal-input");
  const recordEditYearInput = document.getElementById("record-edit-year-input");
  const recordEditStatusInput = document.getElementById("record-edit-status-input");
  const recordEditDoiInput = document.getElementById("record-edit-doi-input");
  const recordEditPdfInput = document.getElementById("record-edit-pdf-input");
  const recordEditAuthorsInput = document.getElementById("record-edit-authors-input");


  const configRedirect = document.getElementById("setting-auto-redirect");
  const configPdfDownloadSaveAs = document.getElementById("setting-pdf-download-save-as");
  const configPdfNaming = document.getElementById("setting-pdf-naming");
  const configPdfDownloadDir = document.getElementById("setting-pdf-download-dir");
  const configAiProvider = document.getElementById("setting-ai-provider");
  const configAiModel = document.getElementById("setting-ai-model");
  const configAiBaseUrl = document.getElementById("setting-ai-base-url");
  const configAiKey = document.getElementById("setting-ai-key");
  const configAiPrompt = document.getElementById("setting-ai-prompt");
  const testAiBtn = document.getElementById("btn-test-ai-connection");
  const aiTestStatus = document.getElementById("ai-test-status");
  const configAppearanceMode = document.getElementById("setting-appearance-mode");

  // Feature toggles
  const configNi = document.getElementById("setting-enable-ni");
  const configDedup = document.getElementById("setting-enable-dedup");
  const configSortingFilter = document.getElementById("setting-enable-sorting-filter");
  const configBadges = document.getElementById("setting-enable-badges");
  const configMetacard = document.getElementById("setting-enable-metacard");
  const configMarkdownNote = document.getElementById("setting-enable-markdown-note");
  const configMetricsDisplay = document.getElementById("setting-enable-metrics-display");
  const configMetricsAutoDetect = document.getElementById("setting-enable-metrics-auto-detect");
  const configBibtexBtn = document.getElementById("setting-enable-bibtex-btn");
  const configScholarCopyDoiBtn = document.getElementById("setting-enable-scholar-copy-doi-btn");
  const configJournalCopyDoiBtn = document.getElementById("setting-enable-journal-copy-doi-btn");
  const configPdfDownloadBtn = document.getElementById("setting-enable-pdf-download-btn");
  const configAiSummaryBtn = document.getElementById("setting-enable-ai-summary-btn");
  
  // easyScholar & Academic badges toggles
  const configCcfBadge = document.getElementById("setting-enable-ccf-badge");
  const configCoreBadge = document.getElementById("setting-enable-core-badge");
  const configWarnBadge = document.getElementById("setting-enable-warn-badge");
  const configIfBadge = document.getElementById("setting-enable-if-badge");
  const configCasBadge = document.getElementById("setting-enable-cas-badge");
  const configJcrBadge = document.getElementById("setting-enable-jcr-badge");
  const configCiteBadge = document.getElementById("setting-enable-cite-badge");

  // Feature status dots
  const statusNi = document.getElementById("status-ni");
  const statusDedup = document.getElementById("status-dedup");
  const statusSortingFilter = document.getElementById("status-sorting-filter");
  const statusBadges = document.getElementById("status-badges");
  const statusMetacard = document.getElementById("status-metacard");
  const statusMarkdown = document.getElementById("status-markdown");

  let historyData = [];
  let activeEditIndex = -1;
  let currentHistoryQuery = "";
  let currentDiagnostics = null;
  const inputSaveTimers = new Map();
  const AI_PROVIDER_DEFAULTS = {
    openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
    gemini: { model: "gemini-1.5-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
    deepseek: { model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
    anthropic: { model: "claude-3-5-haiku-latest", baseUrl: "https://api.anthropic.com/v1" },
    openrouter: { model: "openai/gpt-4o-mini", baseUrl: "https://openrouter.ai/api/v1" },
    ollama: { model: "llama3.1", baseUrl: "http://127.0.0.1:11434" },
    custom: { model: "", baseUrl: "" }
  };


  const coreModules = [
    { card: statusNi, control: configNi, key: "enable_ni", name: "自然指数高亮" },
    { card: statusDedup, control: configDedup, key: "enable_dedup", name: "预印本折叠去重" },
    { card: statusSortingFilter, control: configSortingFilter, key: "enable_sorting_filter", name: "高级重排与过滤" },
    { card: statusBadges, control: configBadges, key: "enable_badges", name: "学术状态徽章" },
    { card: statusMetacard, control: configMetacard, key: "enable_metacard", name: "期刊详情悬浮元卡" },
    { card: statusMarkdown, control: configMarkdownNote, key: "enable_markdown_note", name: "Markdown 笔记复制" }
  ];

  // Theme update helper
  function updateTheme(mode) {
    document.documentElement.setAttribute("data-pp-theme", mode || "system");
  }

  function switchPanel(panelName) {
    const showSettings = panelName === "settings";
    closeRecordEditor();
    tabSet.classList.toggle("active", showSettings);
    tabFoot.classList.toggle("active", !showSettings);
    panelSet.classList.toggle("active", showSettings);
    panelFoot.classList.toggle("active", !showSettings);
    if (!showSettings) loadFootprints();
  }

  function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getAnchoredPanelTop(anchor, containerRect, panelHeight, margin = 10) {
    const anchorRect = anchor.getBoundingClientRect();
    const anchorTop = anchorRect.top - containerRect.top;
    const anchorBottom = anchorRect.bottom - containerRect.top;
    const maxTop = Math.max(margin, containerRect.height - panelHeight - margin);
    const belowTop = anchorBottom + margin;
    const aboveTop = anchorTop - panelHeight - margin;

    if (belowTop <= maxTop) return belowTop;
    if (aboveTop >= margin) return aboveTop;
    return clampNumber(anchorTop + (anchorRect.height / 2) - (panelHeight / 2), margin, maxTop);
  }

  function positionRecordEditorNearAnchor(anchor) {
    if (!recordEditDrawer || !anchor) return;
    const container = document.querySelector(".pp-popup-container");
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const panelHeight = Math.min(430, containerRect.height - 24);
    const top = getAnchoredPanelTop(anchor, containerRect, panelHeight, 12);
    recordEditDrawer.style.setProperty("--record-edit-top", `${Math.round(top)}px`);
    recordEditDrawer.style.setProperty("--record-edit-max-height", `${Math.round(panelHeight)}px`);
  }



  function getAiProviderDefaults(provider) {
    return AI_PROVIDER_DEFAULTS[provider] || AI_PROVIDER_DEFAULTS.openai;
  }

  function applyAiProviderDefaults(provider, shouldOverwrite = false) {
    if (!configAiModel || !configAiBaseUrl) return {};
    const defaults = getAiProviderDefaults(provider);
    const previousDefaults = Object.values(AI_PROVIDER_DEFAULTS);
    const modelLooksDefault = previousDefaults.some(item => item.model && item.model === configAiModel.value.trim());
    const baseLooksDefault = previousDefaults.some(item => item.baseUrl && item.baseUrl === configAiBaseUrl.value.trim());
    if (shouldOverwrite || !configAiModel.value.trim() || modelLooksDefault) {
      configAiModel.value = defaults.model;
    }
    if (shouldOverwrite || !configAiBaseUrl.value.trim() || baseLooksDefault) {
      configAiBaseUrl.value = defaults.baseUrl;
    }
    return {
      ai_model: configAiModel.value.trim(),
      ai_base_url: configAiBaseUrl.value.trim()
    };
  }

  function setAiTestStatus(message, state = "") {
    if (!aiTestStatus) return;
    aiTestStatus.textContent = message;
    if (state) {
      aiTestStatus.dataset.state = state;
    } else {
      delete aiTestStatus.dataset.state;
    }
  }

  function testAiConnection() {
    if (!testAiBtn) return;
    testAiBtn.disabled = true;
    setAiTestStatus("Testing provider connection...");
    setStorage({
      ai_provider: configAiProvider.value,
      ai_model: configAiModel.value.trim(),
      ai_base_url: configAiBaseUrl.value.trim(),
      ai_api_key: configAiKey.value.trim(),
      ai_prompt: configAiPrompt.value
    }, () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "TEST_AI_CONNECTION" }, (response) => {
          testAiBtn.disabled = false;
          if (chrome.runtime.lastError) {
            setAiTestStatus(chrome.runtime.lastError.message, "error");
            return;
          }
          if (response && response.success) {
            setAiTestStatus(`Connected: ${response.provider} / ${response.model}`, "ok");
          } else {
            setAiTestStatus(response?.error || "Connection test failed", "error");
          }
        });
      } else {
        setTimeout(() => {
          testAiBtn.disabled = false;
          setAiTestStatus("Connected: Mock Provider / local-preview-mode", "ok");
        }, 1000);
      }
    });
  }

  function focusSettingControl(controlId) {
    const control = document.getElementById(controlId);
    if (!control) return;

    switchPanel("settings");
    const settingItem = control.closest(".pp-popup-setting-item");
    if (settingItem) {
      settingItem.scrollIntoView({ behavior: "smooth", block: "center" });
      settingItem.classList.add("pp-popup-setting-item-focus");
      setTimeout(() => settingItem.classList.remove("pp-popup-setting-item-focus"), 1300);
    }
    setTimeout(() => control.focus({ preventScroll: true }), 250);
  }

  function toggleDashboardModule(module) {
    if (!module?.control || !module.key) return;
    module.control.checked = !module.control.checked;
    saveSetting(
      module.key,
      module.control.checked,
      `${module.name}${module.control.checked ? "已开启" : "已关闭"}`
    );
  }

  function getFilteredHistoryItems() {
    const q = currentHistoryQuery.toLowerCase().trim();
    if (!q) return historyData;
    return historyData.filter(item => {
      const title = (item.title || "").toLowerCase();
      const journal = (item.journal || "").toLowerCase();
      const doi = (item.doi || "").toLowerCase();
      return title.includes(q) || journal.includes(q) || doi.includes(q);
    });
  }

  function renderCurrentFootprints() {
    renderFootprints(getFilteredHistoryItems(), currentHistoryQuery);
  }

  function parseAuthorsInput(value) {
    return String(value || "")
      .split(/[;\n]+/)
      .map(author => author.trim())
      .filter(Boolean);
  }

  function persistHistory(successMsg) {
    setStorage({ history: historyData }, () => {
      renderCurrentFootprints();
      showToast(successMsg);
    });
  }

  function openRecordEditor(index, anchor) {
    const item = historyData[index];
    if (!item || !recordEditOverlay) return;

    activeEditIndex = index;
    recordEditTitleInput.value = item.title || "";
    recordEditJournalInput.value = item.journal || "";
    recordEditYearInput.value = item.year || "";
    recordEditStatusInput.value = item.status || "visited";
    recordEditDoiInput.value = item.doi || "";
    recordEditPdfInput.value = item.pdfUrl || "";
    recordEditAuthorsInput.value = Array.isArray(item.authors) ? item.authors.join("; ") : "";

    positionRecordEditorNearAnchor(anchor);
    recordEditOverlay.classList.add("pp-open");
    recordEditOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => recordEditTitleInput.focus({ preventScroll: true }), 120);
  }

  function closeRecordEditor() {
    if (!recordEditOverlay) return;
    activeEditIndex = -1;
    recordEditOverlay.classList.remove("pp-open");
    recordEditOverlay.setAttribute("aria-hidden", "true");
    recordEditDrawer?.style.removeProperty("--record-edit-top");
    recordEditDrawer?.style.removeProperty("--record-edit-max-height");
  }

  function saveRecordEditor() {
    if (activeEditIndex < 0 || !historyData[activeEditIndex]) return;
    const yearValue = parseInt(recordEditYearInput.value, 10);
    historyData[activeEditIndex] = {
      ...historyData[activeEditIndex],
      title: recordEditTitleInput.value.trim() || "Untitled paper",
      journal: recordEditJournalInput.value.trim(),
      year: Number.isFinite(yearValue) ? yearValue : new Date().getFullYear(),
      status: recordEditStatusInput.value || "visited",
      doi: recordEditDoiInput.value.trim(),
      pdfUrl: recordEditPdfInput.value.trim(),
      authors: parseAuthorsInput(recordEditAuthorsInput.value),
      updatedAt: Date.now()
    };
    closeRecordEditor();
    persistHistory("Research Record 已更新");
  }

  function deleteRecordEditorItem() {
    if (activeEditIndex < 0 || !historyData[activeEditIndex]) return;
    historyData.splice(activeEditIndex, 1);
    closeRecordEditor();
    persistHistory("Research Record 已删除");
  }

  // Update Dashboard Overview status grid
  function updateFeatureStatusGrid() {
    const setStatus = (element, isActive) => {
      if (!element) return;
      if (isActive) {
        element.classList.add("active");
        element.classList.remove("inactive");
        element.setAttribute("aria-pressed", "true");
      } else {
        element.classList.remove("active");
        element.classList.add("inactive");
        element.setAttribute("aria-pressed", "false");
      }
    };

    let activeCount = 0;
    coreModules.forEach(({ card, control, name }) => {
      const isActive = !!control?.checked;
      if (isActive) activeCount += 1;
      setStatus(card, isActive);
      if (card) {
        const stateEl = card.querySelector(".feature-state");
        card.dataset.state = isActive ? "active" : "inactive";
        card.title = `${name}：${isActive ? "已开启" : "已关闭"}，点击切换`;
        if (stateEl) stateEl.textContent = isActive ? "ON" : "OFF";
      }
    });

    if (overviewStatusPill) {
      overviewStatusPill.textContent = `${activeCount}/${coreModules.length} 模块运行`;
      overviewStatusPill.classList.toggle("pp-warning", activeCount < coreModules.length);
    }
  }

  function classifyActiveUrl(urlValue) {
    let url;
    try {
      url = new URL(urlValue || "");
    } catch (_) {
      return { type: "unknown", label: "无法识别当前页面 URL" };
    }
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (host.includes("scholar.google.") || host === "xueshu.baidu.com") {
      return { type: "scholar", label: "学术检索页：Scholar 增强模块应激活" };
    }
    const journalHosts = [
      "doi.org", "nature.com", "science.org", "sciencedirect.com", "elsevier.com", "springer.com",
      "wiley.com", "pubs.acs.org", "ieee.org", "arxiv.org", "biorxiv.org", "medrxiv.org",
      "cell.com", "thelancet.com", "plos.org", "mdpi.com", "frontiersin.org", "tandfonline.com",
      "sagepub.com", "oup.com", "cambridge.org", "rsc.org", "aps.org", "pnas.org", "aip.org",
      "iopscience.iop.org", "spiedigitallibrary.org", "dl.acm.org", "jstor.org", "projecteuclid.org",
      "jstage.jst.go.jp", "pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov"
    ];
    if (journalHosts.some(domain => host === domain || host.endsWith(`.${domain}`)) || /\b10\.\d{4,9}\//i.test(urlValue || "") || path.includes("/article/")) {
      return { type: "journal", label: "论文/期刊页：元卡、PDF 与 AI 模块可用" };
    }
    return { type: "inactive", label: "普通网页：PaperPilot 不会自动注入内容脚本" };
  }

  function updateCurrentPageDiagnostics() {
    if (!pageDiagnosticsText) return;
    if (typeof chrome === "undefined" || !chrome.tabs?.query) {
      pageDiagnosticsText.textContent = "本地预览模式：无法读取浏览器标签页。";
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const result = classifyActiveUrl(tab?.url || "");
      pageDiagnosticsText.textContent = result.label;
      pageDiagnosticsText.dataset.pageType = result.type;
      currentDiagnostics = null;
      if (openFirstPdfBtn) openFirstPdfBtn.disabled = true;

      if (!tab?.id || !chrome.tabs?.sendMessage) return;
      chrome.tabs.sendMessage(tab.id, {
        action: "diagnostics.currentPage",
        refresh: Boolean(updateCurrentPageDiagnostics.forceRefresh)
      }, (response) => {
        updateCurrentPageDiagnostics.forceRefresh = false;
        if (chrome.runtime?.lastError || !response?.ok || !response.data) {
          return;
        }
        currentDiagnostics = response.data;
        const data = response.data;
        const parts = [
          data.pageType === "scholar" ? "检索页" : "论文页",
          `站点 ${data.profileId || "unknown"}`,
          data.doi ? `DOI ${data.doi}` : "DOI 未识别",
          `PDF 候选 ${data.pdfCandidateCount || 0}`,
          data.firstPdfSource ? `首选 ${data.firstPdfSource}` : "无首选 PDF",
          data.metricsSource ? `指标 ${data.metricsSource}` : ""
        ].filter(Boolean);
        pageDiagnosticsText.textContent = parts.join(" · ");
        pageDiagnosticsText.dataset.pageType = data.pageType || result.type;
        if (openFirstPdfBtn) {
          openFirstPdfBtn.disabled = !data.firstPdfUrl;
          openFirstPdfBtn.title = data.firstPdfUrl || "当前页没有 PDF 候选";
        }
      });
    });
  }

  if (refreshPageDiagnosticsBtn) {
    refreshPageDiagnosticsBtn.onclick = () => {
      updateCurrentPageDiagnostics.forceRefresh = true;
      updateCurrentPageDiagnostics();
    };
  }

  if (openFirstPdfBtn) {
    openFirstPdfBtn.onclick = () => {
      if (currentDiagnostics?.firstPdfUrl) {
        window.open(currentDiagnostics.firstPdfUrl, "_blank", "noopener,noreferrer");
      }
    };
  }

  // 1. Navigation Tab Switching


  tabFoot.onclick = () => switchPanel("footprints");
  tabSet.onclick = () => switchPanel("settings");

  coreModules.forEach((module) => {
    const { card } = module;
    if (!card) return;
    const toggleTarget = () => toggleDashboardModule(module);
    card.addEventListener("click", toggleTarget);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleTarget();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        focusSettingControl(card.dataset.settingTarget);
      }
    });
  });

  if (recordEditOverlay) {
    recordEditOverlay.addEventListener("click", (event) => {
      if (event.target === recordEditOverlay) closeRecordEditor();
    });
  }
  if (recordEditDrawer) {
    recordEditDrawer.addEventListener("click", (event) => event.stopPropagation());
  }
  if (recordEditClose) recordEditClose.onclick = closeRecordEditor;
  if (recordEditCancel) recordEditCancel.onclick = closeRecordEditor;
  if (recordEditDelete) recordEditDelete.onclick = deleteRecordEditorItem;
  if (recordEditForm) {
    recordEditForm.onsubmit = (event) => {
      event.preventDefault();
      saveRecordEditor();
    };
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && recordEditOverlay?.classList.contains("pp-open")) {
      closeRecordEditor();
    }
  });

  getStorage([
    "auto_redirect",
    "pdf_download_save_as",
    "pdf_naming",
    "pdf_download_dir",
    "ai_provider",
    "ai_model",
    "ai_base_url",
    "ai_api_key",
    "ai_prompt",
    "appearance_mode",
    "enable_ni",
    "enable_dedup",
    "enable_sorting_filter",
    "enable_badges",
    "enable_metacard",
    "enable_markdown_note",
    "enable_metrics_display",
    "enable_metrics_auto_detect",
    "enable_bibtex_btn",
    "enable_scholar_copy_doi_btn",
    "enable_journal_copy_doi_btn",
    "enable_copy_doi_btn",
    "enable_pdf_download_btn",
    "enable_ai_summary_btn",
    "easyscholar_key",
    "enable_ccf_badge",
    "enable_core_badge",
    "enable_warn_badge",
    "enable_if_badge",
    "enable_cas_badge",
    "enable_jcr_badge",
    "enable_cite_badge"
  ], (config) => {
    if (config.auto_redirect !== undefined) configRedirect.checked = config.auto_redirect;
    if (config.pdf_download_save_as !== undefined) configPdfDownloadSaveAs.checked = config.pdf_download_save_as;
    if (config.pdf_naming !== undefined) configPdfNaming.value = config.pdf_naming;
    configPdfDownloadDir.value = config.pdf_download_dir !== undefined ? config.pdf_download_dir : "PaperPilot Pro";
    if (config.ai_provider !== undefined) configAiProvider.value = config.ai_provider;
    configAiModel.value = config.ai_model || getAiProviderDefaults(configAiProvider.value).model;
    configAiBaseUrl.value = config.ai_base_url || getAiProviderDefaults(configAiProvider.value).baseUrl;
    if (config.ai_api_key !== undefined) configAiKey.value = config.ai_api_key;
    if (config.ai_prompt !== undefined) configAiPrompt.value = config.ai_prompt;
    if (config.appearance_mode !== undefined) {
      configAppearanceMode.value = config.appearance_mode;
      updateTheme(config.appearance_mode);
    }

    const easyScholarKeyInput = document.getElementById("setting-easyscholar-key");
    if (config.easyscholar_key !== undefined) {
      easyScholarKeyInput.value = config.easyscholar_key;
    }

    // Set feature switches (default to true if undefined)
    configNi.checked = config.enable_ni !== false;
    configDedup.checked = config.enable_dedup !== false;
    configSortingFilter.checked = config.enable_sorting_filter !== false;
    configBadges.checked = config.enable_badges !== false;
    configMetacard.checked = config.enable_metacard !== false;
    configMarkdownNote.checked = config.enable_markdown_note !== false;
    configMetricsDisplay.checked = config.enable_metrics_display !== false;
    configMetricsAutoDetect.checked = config.enable_metrics_auto_detect !== false;
    configBibtexBtn.checked = config.enable_bibtex_btn !== false;
    
    // Legacy migration support
    let enableScholarDoi = config.enable_scholar_copy_doi_btn;
    let enableJournalDoi = config.enable_journal_copy_doi_btn;
    if (enableScholarDoi === undefined) {
      enableScholarDoi = config.enable_copy_doi_btn !== false;
    }
    if (enableJournalDoi === undefined) {
      enableJournalDoi = config.enable_copy_doi_btn !== false;
    }
    configScholarCopyDoiBtn.checked = enableScholarDoi;
    configJournalCopyDoiBtn.checked = enableJournalDoi;
    
    configPdfDownloadBtn.checked = config.enable_pdf_download_btn !== false;
    configAiSummaryBtn.checked = config.enable_ai_summary_btn !== false;

    // easyScholar & Academic badges checked states
    configCcfBadge.checked = config.enable_ccf_badge !== false;
    configCoreBadge.checked = config.enable_core_badge !== false;
    configWarnBadge.checked = config.enable_warn_badge !== false;
    configIfBadge.checked = config.enable_if_badge !== false;
    configCasBadge.checked = config.enable_cas_badge !== false;
    configJcrBadge.checked = config.enable_jcr_badge !== false;
    configCiteBadge.checked = config.enable_cite_badge !== false;

    // Update the visual status grid
    updateFeatureStatusGrid();
  });

  const saveSetting = (key, value, successMsg = "设置已保存") => {
    const data = {};
    data[key] = value;
    setStorage(data, () => {
      showToast(successMsg);
      updateFeatureStatusGrid();
    });
  };

  const saveSettings = (data, successMsg = "设置已保存") => {
    setStorage(data, () => {
      showToast(successMsg);
      updateFeatureStatusGrid();
    });
  };

  const saveSettingDebounced = (key, value, successMsg, delay = 500) => {
    clearTimeout(inputSaveTimers.get(key));
    inputSaveTimers.set(key, setTimeout(() => {
      saveSetting(key, value, successMsg);
      inputSaveTimers.delete(key);
    }, delay));
  };

  const flushSettingSave = (key, value, successMsg) => {
    if (inputSaveTimers.has(key)) {
      clearTimeout(inputSaveTimers.get(key));
      inputSaveTimers.delete(key);
      saveSetting(key, value, successMsg);
    }
  };

  configRedirect.onchange = () => saveSetting("auto_redirect", configRedirect.checked, "自动重定向设置已同步");
  configPdfDownloadSaveAs.onchange = () => saveSetting("pdf_download_save_as", configPdfDownloadSaveAs.checked, "下载另存为设置已同步");
  configPdfNaming.onchange = () => saveSetting("pdf_naming", configPdfNaming.value, "文件命名模板保存成功");
  configPdfDownloadDir.oninput = () => saveSettingDebounced("pdf_download_dir", configPdfDownloadDir.value.trim(), "PDF 下载子目录已保存");
  configPdfDownloadDir.onchange = () => flushSettingSave("pdf_download_dir", configPdfDownloadDir.value.trim(), "PDF 下载子目录已保存");
  configAiProvider.onchange = () => {
    const nextDefaults = applyAiProviderDefaults(configAiProvider.value, true);
    saveSettings({
      ai_provider: configAiProvider.value,
      ...nextDefaults
    }, "AI 提供商已切换");
    setAiTestStatus("Provider changed. Test connection before using it.");
  };
  configAiModel.oninput = () => saveSettingDebounced("ai_model", configAiModel.value.trim(), "AI 模型已保存");
  configAiModel.onchange = () => flushSettingSave("ai_model", configAiModel.value.trim(), "AI 模型已保存");
  configAiBaseUrl.oninput = () => saveSettingDebounced("ai_base_url", configAiBaseUrl.value.trim(), "AI Base URL 已保存");
  configAiBaseUrl.onchange = () => flushSettingSave("ai_base_url", configAiBaseUrl.value.trim(), "AI Base URL 已保存");
  configAiKey.oninput = () => saveSettingDebounced("ai_api_key", configAiKey.value.trim(), "API 密钥已更新保存");
  configAiKey.onchange = () => flushSettingSave("ai_api_key", configAiKey.value.trim(), "API 密钥已更新保存");
  configAiPrompt.oninput = () => saveSettingDebounced("ai_prompt", configAiPrompt.value, "自定义提示词已更新", 700);
  configAiPrompt.onchange = () => flushSettingSave("ai_prompt", configAiPrompt.value, "自定义提示词已更新");
  if (testAiBtn) testAiBtn.onclick = testAiConnection;
  configAppearanceMode.onchange = () => {
    saveSetting("appearance_mode", configAppearanceMode.value, "外观展示模式已切换");
    updateTheme(configAppearanceMode.value);
  };

  const easyScholarKeyInput = document.getElementById("setting-easyscholar-key");
  const toggleEasyScholarBtn = document.getElementById("btn-toggle-easyscholar-visible");

  easyScholarKeyInput.oninput = () => {
    const keyVal = easyScholarKeyInput.value.trim();
    clearTimeout(inputSaveTimers.get("easyscholar_key"));
    inputSaveTimers.set("easyscholar_key", setTimeout(() => {
      saveSettings({
      easyscholar_key: keyVal,
      pdf_cache: {},
      easyscholar_cache: {}
      }, "easyScholar Key 已保存，历史指标缓存已自动清除");
      inputSaveTimers.delete("easyscholar_key");
    }, 650));
  };

  easyScholarKeyInput.onchange = () => {
    if (!inputSaveTimers.has("easyscholar_key")) return;
    clearTimeout(inputSaveTimers.get("easyscholar_key"));
    inputSaveTimers.delete("easyscholar_key");
    saveSettings({
      easyscholar_key: easyScholarKeyInput.value.trim(),
      pdf_cache: {},
      easyscholar_cache: {}
    }, "easyScholar Key 已保存，历史指标缓存已自动清除");
  };

  toggleEasyScholarBtn.onclick = () => {
    if (easyScholarKeyInput.type === "password") {
      easyScholarKeyInput.type = "text";
      toggleEasyScholarBtn.innerText = "🔒";
    } else {
      easyScholarKeyInput.type = "password";
      toggleEasyScholarBtn.innerText = "👁️";
    }
  };

  // Feature toggles saves
  configNi.onchange = () => saveSetting("enable_ni", configNi.checked, "自然指数期刊高亮开关已同步");
  configDedup.onchange = () => saveSetting("enable_dedup", configDedup.checked, "预印本折叠去重开关已同步");
  configSortingFilter.onchange = () => saveSetting("enable_sorting_filter", configSortingFilter.checked, "高级重排侧边过滤开关已同步");
  configBadges.onchange = () => saveSetting("enable_badges", configBadges.checked, "学术状态徽章开关已同步");
  configMetacard.onchange = () => saveSetting("enable_metacard", configMetacard.checked, "悬浮元卡面板开关已同步");
  configMarkdownNote.onchange = () => saveSetting("enable_markdown_note", configMarkdownNote.checked, "Markdown 笔记复制开关已同步");
  configMetricsDisplay.onchange = () => saveSetting("enable_metrics_display", configMetricsDisplay.checked, "期刊分区与影响因子显示已同步");
  configMetricsAutoDetect.onchange = () => saveSetting("enable_metrics_auto_detect", configMetricsAutoDetect.checked, "SecretKey 自动检测展示已同步");
  configBibtexBtn.onchange = () => saveSetting("enable_bibtex_btn", configBibtexBtn.checked, "BibTeX复制按钮显示已同步");
  configScholarCopyDoiBtn.onchange = () => saveSetting("enable_scholar_copy_doi_btn", configScholarCopyDoiBtn.checked, "学术检索页复制 DOI 开关已同步");
  configJournalCopyDoiBtn.onchange = () => saveSetting("enable_journal_copy_doi_btn", configJournalCopyDoiBtn.checked, "悬浮详情卡复制 DOI 开关已同步");
  configPdfDownloadBtn.onchange = () => saveSetting("enable_pdf_download_btn", configPdfDownloadBtn.checked, "下载PDF按钮显示已同步");
  configAiSummaryBtn.onchange = () => saveSetting("enable_ai_summary_btn", configAiSummaryBtn.checked, "AI总结按钮显示已同步");

  // easyScholar & Academic badges toggles saves
  configCcfBadge.onchange = () => saveSetting("enable_ccf_badge", configCcfBadge.checked, "CCF 等级徽章显示已同步");
  configCoreBadge.onchange = () => saveSetting("enable_core_badge", configCoreBadge.checked, "国内核心徽章显示已同步");
  configWarnBadge.onchange = () => saveSetting("enable_warn_badge", configWarnBadge.checked, "中科院预警徽章显示已同步");
  configIfBadge.onchange = () => saveSetting("enable_if_badge", configIfBadge.checked, "影响因子徽章显示已同步");
  configCasBadge.onchange = () => saveSetting("enable_cas_badge", configCasBadge.checked, "中科院分区徽章显示已同步");
  configJcrBadge.onchange = () => saveSetting("enable_jcr_badge", configJcrBadge.checked, "JCR 分区指标显示已同步");
  configCiteBadge.onchange = () => saveSetting("enable_cite_badge", configCiteBadge.checked, "被引量徽章显示已同步");

  function loadFootprints() {
    getStorage("history", (res) => {
      historyData = res.history || [];
      renderCurrentFootprints();
    });
  }

  function renderFootprints(items, query = "") {
    // Clear list
    // Preserve empty placeholder
    historyList.innerHTML = "";
    
    if (items.length === 0) {
      emptyMsg.textContent = query
        ? "没有匹配的学术足迹，请尝试标题、期刊或 DOI 的其他关键词。"
        : "暂无学术足迹，快去浏览期刊摘要页或检索谷歌学术吧！";
      historyList.appendChild(emptyMsg);
      emptyMsg.style.display = "block";
      exportAllBtn.disabled = historyData.length === 0 || !!query;
      return;
    }

    emptyMsg.style.display = "none";
    exportAllBtn.disabled = false;

    items.forEach((item) => {
      const recordIndex = historyData.indexOf(item);
      const card = document.createElement("div");
      card.className = "pp-popup-foot-item";
      
      let statusText = "已访问";
      let statusClass = "visited";
      if (item.status === "downloaded") {
        statusText = "已下载";
        statusClass = "downloaded";
      } else if (item.status === "copied_bibtex") {
        statusText = "复制 BibTeX";
        statusClass = "copied_bibtex";
      } else if (item.status === "copied_doi") {
        statusText = "复制 DOI";
        statusClass = "copied_bibtex";
      } else if (item.status === "copied_citation") {
        statusText = "复制引用";
        statusClass = "copied_bibtex";
      }

      const main = document.createElement("div");
      main.className = "pp-popup-foot-main";
      main.setAttribute("role", "button");
      main.setAttribute("tabindex", "0");
      main.setAttribute("title", "打开该文献链接");

      const title = document.createElement("div");
      title.className = "pp-popup-foot-title";
      title.textContent = item.title || "Untitled paper";

      const meta = document.createElement("div");
      meta.className = "pp-popup-foot-meta";

      const journal = document.createElement("span");
      journal.className = "pp-popup-foot-journal";
      journal.textContent = `${item.journal || "Other"} (${item.year || "N/A"})`;

      const status = document.createElement("span");
      status.className = `pp-popup-foot-status ${statusClass}`;
      status.textContent = statusText;

      meta.appendChild(journal);
      meta.appendChild(status);
      main.appendChild(title);
      main.appendChild(meta);

      const openRecordTarget = () => {
        // Open PDF Url or DOI url
        const targetUrl = item.pdfUrl || (item.doi ? `https://doi.org/${item.doi}` : "");
        if (targetUrl) {
          window.open(targetUrl, "_blank");
        } else {
          showToast("该文献无直链，将为您在谷歌中搜索");
          window.open(`https://www.google.com/search?q=${encodeURIComponent(item.title)}`, "_blank");
        }
      };

      main.onclick = openRecordTarget;
      main.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openRecordTarget();
        }
      };

      const actions = document.createElement("div");
      actions.className = "pp-popup-foot-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "pp-popup-foot-action-btn";
      editBtn.textContent = "编辑";
      editBtn.setAttribute("aria-label", `编辑 ${item.title || "Research Record"}`);
      editBtn.onclick = (event) => {
        event.stopPropagation();
        openRecordEditor(recordIndex, editBtn);
      };
      actions.appendChild(editBtn);

      card.appendChild(main);
      card.appendChild(actions);
      historyList.appendChild(card);
    });
  }

  // 5. Fuzzy filtering
  searchInput.oninput = () => {
    currentHistoryQuery = searchInput.value.trim();
    renderCurrentFootprints();
  };

  // 6. Bulk Export clean BibTeX files
  exportAllBtn.onclick = () => {
    if (historyData.length === 0) return;

    const format = exportFormatSelect?.value || "bibtex";
    const citation = window.PaperPilotCore?.citation;
    const normalized = historyData.map(item => ({
      ...item,
      url: item.pdfUrl || (item.doi ? `https://doi.org/${item.doi}` : ""),
      source: item.source || item.metricsSource || "PaperPilot history"
    }));

    let exported = "";
    let label = "BibTeX";
    if (citation && format === "ris") {
      exported = citation.buildRisEntries(normalized);
      label = "RIS";
    } else if (citation && format === "csljson") {
      exported = JSON.stringify(citation.buildCslJson(normalized), null, 2);
      label = "CSL JSON";
    } else if (citation) {
      exported = citation.buildBibtexEntries(normalized);
    } else {
      exported = normalized.map(paper => `${paper.title || "Untitled"} ${paper.doi || ""}`.trim()).join("\n");
    }

    navigator.clipboard.writeText(exported.trim()).then(() => {
      showToast(`已将 ${historyData.length} 篇文献足迹以 ${label} 复制`);
    }).catch(err => {
      console.error("Export copy failed:", err);
      showToast("复制失败，请检查浏览器剪贴板权限！");
    });
  };

  // Toast injector
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("popup-toast");
    const toastMsg = document.getElementById("popup-toast-msg");
    
    toastMsg.innerText = msg;
    toast.classList.add("pp-show");
    
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("pp-show");
    }, 2200);
  }

  // Load footprints on initial popup show
  loadFootprints();
  updateCurrentPageDiagnostics();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPopup);
} else {
  initPopup();
}

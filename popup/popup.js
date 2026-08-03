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
      chrome.storage.local.set(data, () => {
        const error = chrome.runtime?.lastError;
        if (callback) callback(error ? new Error(error.message) : null);
      });
    } else {
      console.warn("chrome.storage.local is not available. Falling back to localStorage.");
      Object.keys(data).forEach(k => {
        try {
          localStorage.setItem(k, JSON.stringify(data[k]));
        } catch (e) { }
      });
      if (callback) callback(null);
    }
  };

  const sendBackgroundMessage = (message, callback) => {
    if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(message, response => {
        const error = chrome.runtime.lastError;
        callback(error ? { success: false, ok: false, error: error.message } : response);
      });
      return;
    }
    callback({ success: false, ok: false, error: "Extension context unavailable" });
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
  const overviewSaveAsControl = document.getElementById("overview-save-as-control");
  const overviewPdfDownloadSaveAs = document.getElementById("overview-pdf-download-save-as");
  const overviewPdfDownloadSaveAsState = document.getElementById("overview-pdf-download-save-as-state");
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
  let historyRevision = 0;
  let activeEditIndex = -1;
  let currentHistoryQuery = "";
  let currentDiagnostics = null;
  let currentPdfDownloadSaveAs = false;
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

    const container = document.querySelector(".pp-popup-container");
    if (container) {
      container.classList.toggle("pp-settings-mode", showSettings);
    }

    if (tabSet) tabSet.classList.toggle("active", showSettings);
    if (tabFoot) tabFoot.classList.toggle("active", !showSettings);
    if (panelSet) panelSet.classList.toggle("active", showSettings);
    if (panelFoot) panelFoot.classList.toggle("active", !showSettings);

    const navPill = document.getElementById("nav-pill");
    if (navPill) {
      navPill.style.transform = showSettings ? "translateX(100%)" : "translateX(0%)";
    }

    if (!showSettings) loadFootprints();
  }

  if (tabFoot) tabFoot.onclick = () => switchPanel("footprints");
  if (tabSet) tabSet.onclick = () => switchPanel("settings");

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
    }, (error) => {
      if (error) {
        testAiBtn.disabled = false;
        setAiTestStatus(`Settings save failed: ${error.message}`, "error");
        return;
      }
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({ action: "TEST_AI_CONNECTION" }, (response) => {
            testAiBtn.disabled = false;
            const err = chrome.runtime.lastError;
            if (err) {
              setAiTestStatus(err.message, "error");
              return;
            }
            if (response && response.success) {
              setAiTestStatus(`Connected: ${response.provider} / ${response.model}`, "ok");
            } else {
              setAiTestStatus(response?.error || "Connection test failed", "error");
            }
          });
        } catch (e) {
          testAiBtn.disabled = false;
          setAiTestStatus(e?.message || "Connection test failed", "error");
        }
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

  function deleteRecordAt(index) {
    if (index < 0 || !historyData[index]) return;
    historyData.splice(index, 1);
    if (activeEditIndex === index) {
      closeRecordEditor();
    }
    persistHistory("已从文过留痕中移除此记录");
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

  function syncPdfDownloadSaveAsControls(isEnabled) {
    const enabled = Boolean(isEnabled);
    currentPdfDownloadSaveAs = enabled;
    if (configPdfDownloadSaveAs) configPdfDownloadSaveAs.checked = enabled;
    if (overviewPdfDownloadSaveAs) overviewPdfDownloadSaveAs.checked = enabled;
    if (overviewSaveAsControl) overviewSaveAsControl.dataset.active = String(enabled);
    if (overviewPdfDownloadSaveAsState) {
      overviewPdfDownloadSaveAsState.textContent = enabled
        ? "每次下载前询问保存位置"
        : "静默保存到配置目录";
    }
  }

  function persistPdfDownloadSaveAs(isEnabled) {
    const previousValue = currentPdfDownloadSaveAs;
    const nextValue = Boolean(isEnabled);
    syncPdfDownloadSaveAsControls(nextValue);
    setStorage({ pdf_download_save_as: nextValue }, (error) => {
      if (error) {
        syncPdfDownloadSaveAsControls(previousValue);
        showToast("设置保存失败，已恢复原状态");
        return;
      }
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
          chrome.runtime.sendMessage({
            action: "UPDATE_PDF_DOWNLOAD_SETTINGS",
            saveAs: nextValue
          }, () => void chrome.runtime.lastError);
        }
      } catch (_) { }
      showToast(nextValue ? "已开启下载路径选择窗口" : "已恢复静默下载");
    });
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
      "jstage.jst.go.jp", "pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov",
      "openreview.net", "aclanthology.org", "proceedings.mlr.press", "papers.nips.cc", "openaccess.thecvf.com"
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
    "enable_easyscholar",
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
    syncPdfDownloadSaveAsControls(config.pdf_download_save_as === true);
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
    const enableEasyScholarInput = document.getElementById("setting-enable-easyscholar");
    enableEasyScholarInput.checked = config.enable_easyscholar === true;
    easyScholarKeyInput.disabled = !enableEasyScholarInput.checked;
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
    setStorage(data, (error) => {
      if (error) {
        showToast("设置保存失败，请重试");
        return;
      }
      showToast(successMsg);
      updateFeatureStatusGrid();
    });
  };

  const saveSettings = (data, successMsg = "设置已保存") => {
    setStorage(data, (error) => {
      if (error) {
        showToast("设置保存失败，请重试");
        return;
      }
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
  configPdfDownloadSaveAs.onchange = () => persistPdfDownloadSaveAs(configPdfDownloadSaveAs.checked);
  if (overviewPdfDownloadSaveAs) {
    overviewPdfDownloadSaveAs.onchange = () => persistPdfDownloadSaveAs(overviewPdfDownloadSaveAs.checked);
  }
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.pdf_download_save_as) {
        syncPdfDownloadSaveAsControls(changes.pdf_download_save_as.newValue === true);
      }
    });
  }
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
  const THEME_CYCLE = ["system", "dark", "light", "violet", "cyan", "amber"];
  const THEME_ICONS = {
    system: "🌓",
    dark: "🌙",
    light: "☀️",
    violet: "💜",
    cyan: "🌊",
    amber: "🌅"
  };
  const THEME_LABELS = {
    system: "跟随系统 Auto",
    dark: "Obsidian 极客黑曜 (夜间)",
    light: "Porcelain 极简瓷白 (白天)",
    violet: "Cyber Violet 赛博紫罗兰",
    cyan: "Oceanic Cyan 深海蔚蓝",
    amber: "Sunset Amber 琥珀金辉"
  };

  const btnQuickThemeToggle = document.getElementById("btn-quick-theme-toggle");
  if (btnQuickThemeToggle) {
    btnQuickThemeToggle.onclick = () => {
      const currentTheme = document.documentElement.getAttribute("data-pp-theme") || "system";
      const currentIndex = THEME_CYCLE.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
      const nextTheme = THEME_CYCLE[nextIndex];

      configAppearanceMode.value = nextTheme;
      saveSetting("appearance_mode", nextTheme, `已切换为 ${THEME_LABELS[nextTheme] || nextTheme} 主题`);
      updateTheme(nextTheme);
      btnQuickThemeToggle.textContent = THEME_ICONS[nextTheme] || "🌓";
    };
  }

  configAppearanceMode.onchange = () => {
    const selectedTheme = configAppearanceMode.value || "system";
    saveSetting("appearance_mode", selectedTheme, `外观展示模式已切换为 ${THEME_LABELS[selectedTheme] || selectedTheme}`);
    updateTheme(selectedTheme);
    if (btnQuickThemeToggle) {
      btnQuickThemeToggle.textContent = THEME_ICONS[selectedTheme] || "🌓";
    }
  };

  const easyScholarKeyInput = document.getElementById("setting-easyscholar-key");
  const toggleEasyScholarBtn = document.getElementById("btn-toggle-easyscholar-visible");
  const enableEasyScholarInput = document.getElementById("setting-enable-easyscholar");

  const syncEasyScholarControls = () => {
    const disabled = !enableEasyScholarInput.checked;
    easyScholarKeyInput.disabled = disabled;
    toggleEasyScholarBtn.disabled = disabled;
  };
  syncEasyScholarControls();
  enableEasyScholarInput.onchange = () => {
    syncEasyScholarControls();
    saveSettings({
      enable_easyscholar: enableEasyScholarInput.checked,
      pdf_cache: {},
      easyscholar_cache: {}
    }, enableEasyScholarInput.checked ? "easyScholar 学术数据已启用" : "easyScholar 学术数据已关闭");
  };

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

  let currentChipFilter = "all";
  let currentDateFilter = null;

  function safeParseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === "number") return isNaN(val) ? null : new Date(val);
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        return isNaN(num) ? null : new Date(num);
      }
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function formatDateKey(dateInput) {
    const dateObj = safeParseDate(dateInput) || new Date();
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getFilteredHistoryItems() {
    const q = currentHistoryQuery.toLowerCase().trim();
    let result = historyData;

    if (currentDateFilter) {
      const today = new Date();
      const todayKey = formatDateKey(today);

      result = result.filter(item => {
        const rawTime = item.time || item.updatedAt || item.timestamp;
        const parsed = safeParseDate(rawTime);
        if (!parsed) {
          return currentDateFilter === todayKey || currentDateFilter === "3days" || currentDateFilter === "week";
        }
        if (currentDateFilter === "3days") {
          const diffDays = (today.getTime() - parsed.getTime()) / (1000 * 3600 * 24);
          return diffDays >= 0 && diffDays <= 3;
        }
        if (currentDateFilter === "week") {
          const diffDays = (today.getTime() - parsed.getTime()) / (1000 * 3600 * 24);
          return diffDays >= 0 && diffDays <= 7;
        }
        return formatDateKey(parsed) === currentDateFilter;
      });
    }

    if (currentChipFilter === "starred") {
      result = result.filter(item => item.starred === true);
    } else if (currentChipFilter === "downloaded") {
      result = result.filter(item => item.status === "downloaded");
    } else if (currentChipFilter === "copied") {
      result = result.filter(item => (item.status || "").startsWith("copied"));
    }

    if (!q) return result;
    return result.filter(item => {
      const title = (item.title || "").toLowerCase();
      const journal = (item.journal || "").toLowerCase();
      const doi = (item.doi || "").toLowerCase();
      const authors = Array.isArray(item.authors) ? item.authors.join(" ").toLowerCase() : String(item.authors || "").toLowerCase();
      const year = String(item.year || "");
      return title.includes(q) || journal.includes(q) || doi.includes(q) || authors.includes(q) || year.includes(q);
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
    sendBackgroundMessage({ action: "HISTORY_REPLACE", history: historyData, revision: historyRevision }, response => {
      if (!response?.success) {
        if (response?.errorCode === "HISTORY_CONFLICT" && Array.isArray(response.history)) {
          historyData = response.history;
          historyRevision = Number.isInteger(response.revision) ? response.revision : historyRevision;
          renderCurrentFootprints();
          showToast("留痕已在其他页面更新，本次修改未覆盖；请刷新后重试");
          return;
        }
        showToast(`Research Record 保存失败：${response?.error || "未知错误"}`);
        return;
      }
      historyData = Array.isArray(response.history) ? response.history : historyData;
      historyRevision = Number.isInteger(response.revision) ? response.revision : historyRevision;
      renderCurrentFootprints();
      if (successMsg) showToast(successMsg);
    });
  }

  function loadFootprints() {
    sendBackgroundMessage({ action: "HISTORY_GET" }, response => {
      if (!response?.success) {
        // Keep the standalone preview usable; Chrome extension contexts always use
        // the serialized background path above.
        getStorage(["history", "history_revision"], fallback => applyHistorySnapshot(fallback?.history, fallback?.history_revision));
        return;
      }
      applyHistorySnapshot(response.history, response.revision);
    });
  }

  function applyHistorySnapshot(rawHistory, revision) {
      const raw = Array.isArray(rawHistory) ? rawHistory : [];
      const now = Date.now();
      historyData = raw.map((item, idx) => {
        const rawTime = item.time || item.updatedAt || item.timestamp;
        if (!rawTime || !safeParseDate(rawTime)) {
          return {
            ...item,
            time: now - (idx * 1800000)
          };
        }
        return item;
      });
      historyRevision = Number.isInteger(revision) ? revision : 0;
      renderCurrentFootprints();
  }

  function getCalendarGridDays() {
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const dayIndex = currentDayOfWeek === 0 ? 7 : currentDayOfWeek;
    const endOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (7 - dayIndex));

    const todayStr = formatDateKey(today);
    const days = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(endOfWeek.getFullYear(), endOfWeek.getMonth(), endOfWeek.getDate() - i);
      const dateStr = formatDateKey(d);
      days.push({
        dateStr,
        dayNum: d.getDate(),
        monthNum: d.getMonth() + 1,
        isToday: todayStr === dateStr,
        isFuture: d.getTime() > today.getTime() && todayStr !== dateStr
      });
    }
    return days;
  }

  function calculateStreak(countsByDate) {
    const today = new Date();
    let streak = 0;
    let checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (!countsByDate.has(formatDateKey(checkDate))) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (countsByDate.has(formatDateKey(checkDate)) && countsByDate.get(formatDateKey(checkDate)) > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  }

  function renderHeatmapBoard() {
    const grid = document.getElementById("heatmap-grid");
    const activeBar = document.getElementById("heatmap-active-bar");
    const activeText = document.getElementById("heatmap-active-text");
    const resetBtn = document.getElementById("btn-reset-heatmap-filter");
    const summaryCopy = document.getElementById("heatmap-summary-copy");
    const streakBadge = document.getElementById("heatmap-streak-badge");
    if (!grid) return;

    grid.innerHTML = "";

    // Count history entries by YYYY-MM-DD
    const countsByDate = new Map();
    historyData.forEach(item => {
      const rawTime = item.time || item.updatedAt || item.timestamp;
      const parsed = safeParseDate(rawTime) || new Date();
      const dateKey = formatDateKey(parsed);
      countsByDate.set(dateKey, (countsByDate.get(dateKey) || 0) + 1);
    });

    const days = getCalendarGridDays();
    let activeDaysCount = 0;
    const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

    days.forEach(({ dateStr, dayNum, isToday, isFuture }) => {
      const count = countsByDate.get(dateStr) || 0;
      if (count > 0 && !isFuture) activeDaysCount++;

      let lvl = "lvl-0";
      if (isFuture) lvl = "is-future";
      else if (count >= 6) lvl = "lvl-4";
      else if (count >= 4) lvl = "lvl-3";
      else if (count >= 2) lvl = "lvl-2";
      else if (count >= 1) lvl = "lvl-1";

      const cell = document.createElement("div");
      cell.className = `pp-calendar-cell ${lvl} ${isToday ? 'is-today' : ''} ${currentDateFilter === dateStr ? 'active' : ''}`;

      const dObj = new Date(dateStr);
      const weekdayStr = weekdayNames[dObj.getDay()] || "";
      cell.title = `${dateStr} (${weekdayStr}): ${count} 篇文献 ${isFuture ? '(尚未到达)' : '(点击展开本日留痕)'}`;

      const dateEl = document.createElement("span");
      dateEl.className = "pp-calendar-date";
      dateEl.textContent = String(dayNum);
      cell.appendChild(dateEl);

      if (count > 0 && !isFuture) {
        const countEl = document.createElement("span");
        countEl.className = "pp-calendar-count";
        countEl.textContent = `${count}篇`;
        cell.appendChild(countEl);
      }

      if (!isFuture) {
        cell.onclick = (e) => {
          e.stopPropagation();
          if (currentDateFilter === dateStr) {
            currentDateFilter = null;
          } else {
            currentDateFilter = dateStr;
          }
          renderCurrentFootprints();

          setTimeout(() => {
            const searchPanelEl = document.getElementById("pp-search-expand-panel");
            if (searchPanelEl) {
              searchPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }, 50);
        };
      }

      grid.appendChild(cell);
    });

    const streak = calculateStreak(countsByDate);
    if (streakBadge) {
      streakBadge.textContent = `🔥 连续打卡 ${streak} 天`;
    }

    if (summaryCopy) {
      summaryCopy.textContent = `近 4 周研读 ${activeDaysCount} 天`;
    }

    if (currentDateFilter && activeBar && activeText) {
      const currentCount = countsByDate.get(currentDateFilter) || 0;
      activeText.textContent = `正在显示 ${currentDateFilter} 的研读留痕 (${currentCount} 篇)`;
      activeBar.style.display = "flex";
    } else if (activeBar) {
      activeBar.style.display = "none";
    }

    if (resetBtn) {
      resetBtn.onclick = () => {
        currentDateFilter = null;
        renderCurrentFootprints();
      };
    }
  }

  function updateFootprintStats() {
    const totalEl = document.getElementById("stat-total-count");
    const dlEl = document.getElementById("stat-downloaded-count");
    const cpEl = document.getElementById("stat-copied-count");
    if (totalEl) totalEl.textContent = String(historyData.length);
    if (dlEl) dlEl.textContent = String(historyData.filter(i => i.status === "downloaded").length);
    if (cpEl) cpEl.textContent = String(historyData.filter(i => (i.status || "").startsWith("copied")).length);

    const counts = {
      all: historyData.length,
      starred: historyData.filter(i => i.starred === true).length,
      downloaded: historyData.filter(i => i.status === "downloaded").length,
      copied: historyData.filter(i => (i.status || "").startsWith("copied")).length
    };
    const labels = {
      all: `全部 (${counts.all})`,
      starred: `⭐ 收藏 (${counts.starred})`,
      downloaded: `📥 已下载 (${counts.downloaded})`,
      copied: `📝 已复引用 (${counts.copied})`
    };
    document.querySelectorAll("#footprint-chips [data-filter], #footprint-quick-filters [data-filter]").forEach(button => {
      const filter = button.dataset.filter || "all";
      if (labels[filter]) button.textContent = labels[filter];
      const isActive = filter === currentChipFilter;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    renderHeatmapBoard();
  }

  function selectFootprintFilter(filter, { clearDate = false, revealResults = false } = {}) {
    currentChipFilter = filter || "all";
    if (clearDate) currentDateFilter = null;
    renderCurrentFootprints();
    if (revealResults) {
      requestAnimationFrame(() => historyList?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  // This shortcut makes saved papers reachable directly from the activity overview.
  document.querySelectorAll("#footprint-chips [data-filter], #footprint-quick-filters [data-filter]").forEach(button => {
    button.onclick = () => {
      const isQuickFilter = button.closest("#footprint-quick-filters") !== null;
      selectFootprintFilter(button.dataset.filter, {
        clearDate: isQuickFilter,
        revealResults: true
      });
    };
  });

  function renderFootprints(items, query = "") {
    updateFootprintStats();
    historyList.innerHTML = "";

    const activeDateTag = document.getElementById("search-active-date-tag");
    const resultCountBadge = document.getElementById("search-result-count-badge");
    const btnDateReset = document.getElementById("btn-date-reset");
    const searchExpandPanel = document.getElementById("pp-search-expand-panel");

    if (activeDateTag) {
      if (currentDateFilter) {
        let dateLabel = currentDateFilter;
        if (currentDateFilter === "3days") dateLabel = "近 3 天";
        else if (currentDateFilter === "week") dateLabel = "本周";
        activeDateTag.textContent = `📅 ${dateLabel}`;
        activeDateTag.style.display = "inline-block";
      } else {
        activeDateTag.style.display = "none";
      }
    }

    if (resultCountBadge) {
      resultCountBadge.textContent = `共 ${items.length} 篇`;
    }

    if (btnDateReset) {
      btnDateReset.style.display = currentDateFilter ? "inline-block" : "none";
    }

    const btnDateToday = document.getElementById("btn-date-today");
    const btnDate3days = document.getElementById("btn-date-3days");
    const btnDateWeek = document.getElementById("btn-date-week");
    const todayStr = formatDateKey(new Date());

    if (btnDateToday) btnDateToday.classList.toggle("active", currentDateFilter === todayStr);
    if (btnDate3days) btnDate3days.classList.toggle("active", currentDateFilter === "3days");
    if (btnDateWeek) btnDateWeek.classList.toggle("active", currentDateFilter === "week");

    if (currentDateFilter && searchExpandPanel) {
      searchExpandPanel.classList.add("expanded");
    }

    if (items.length === 0) {
      if (currentDateFilter) {
        emptyMsg.textContent = `日期 [${currentDateFilter}] 下没有检索到文过留痕记录。`;
      } else if (query || currentChipFilter !== "all") {
        emptyMsg.textContent = "当前筛选条件下没有匹配的文过留痕记录。";
      } else {
        emptyMsg.textContent = "暂无文过留痕记录，快去浏览期刊摘要页或检索谷歌学术吧！";
      }
      historyList.appendChild(emptyMsg);
      emptyMsg.style.display = "block";
      exportAllBtn.disabled = true;
      return;
    }

    emptyMsg.style.display = "none";
    exportAllBtn.disabled = false;

    items.forEach((item) => {
      const recordIndex = historyData.indexOf(item);
      const card = document.createElement("div");
      card.className = `pp-foot-card ${item.starred ? 'pp-foot-card--starred' : ''}`;
      card.title = "点击在新标签页中打开文献页面或 PDF";

      // Click card to open link
      card.onclick = () => {
        const targetUrl = item.pdfUrl || (item.doi ? `https://doi.org/${item.doi}` : "");
        if (targetUrl) {
          if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: targetUrl });
          } else {
            window.open(targetUrl, "_blank");
          }
        } else {
          showToast("该文献无直链，将为您在谷歌中搜索");
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(item.title)}`;
          if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: searchUrl });
          } else {
            window.open(searchUrl, "_blank");
          }
        }
      };

      // --- Status mapping ---
      let statusText = "已访问";
      let statusClass = "visited";
      if (item.status === "downloaded") {
        statusText = "已下载";
        statusClass = "downloaded";
      } else if (item.status === "copied_bibtex" || item.status === "copied_doi") {
        statusText = "已复引用";
        statusClass = "bibtex";
      } else if (item.status === "copied_citation") {
        statusText = "已做笔记";
        statusClass = "bibtex";
      }

      // --- Left accent bar ---
      const accentBar = document.createElement("div");
      accentBar.className = `pp-foot-accent ${statusClass}`;

      // --- Card body ---
      const body = document.createElement("div");
      body.className = "pp-foot-body";

      // --- Top row: title + tool buttons ---
      const topRow = document.createElement("div");
      topRow.className = "pp-foot-top-row";

      // Safe text node highlighter
      const highlightTextNode = (element, text, q) => {
        element.innerHTML = "";
        if (!q || !text) {
          element.textContent = text || "";
          return;
        }
        const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(${escapedQ})`, "gi");
        const parts = text.split(regex);
        parts.forEach(part => {
          if (part.toLowerCase() === q.toLowerCase()) {
            const mark = document.createElement("mark");
            mark.className = "pp-highlight";
            mark.textContent = part;
            element.appendChild(mark);
          } else {
            element.appendChild(document.createTextNode(part));
          }
        });
      };

      const titleEl = document.createElement("div");
      titleEl.className = "pp-foot-title";
      highlightTextNode(titleEl, item.title || "Untitled paper", query);

      const tools = document.createElement("div");
      tools.className = "pp-foot-tools";

      // Star button
      const starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = `pp-foot-star ${item.starred ? 'active' : ''}`;
      starBtn.innerHTML = item.starred
        ? `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
        : `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      starBtn.title = item.starred ? "取消精选收藏" : "精选收藏此文献";
      starBtn.onclick = (event) => {
        event.stopPropagation();
        item.starred = !item.starred;
        persistHistory(item.starred ? "已加入精选文献收藏" : "已取消精选收藏");
      };

      // Quick Delete button
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "pp-foot-del-btn";
      delBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      delBtn.title = "移除此留痕记录";
      delBtn.onclick = (event) => {
        event.stopPropagation();
        deleteRecordAt(recordIndex);
      };

      // External link icon
      const linkIcon = document.createElement("span");
      linkIcon.className = "pp-foot-link-icon";
      linkIcon.title = "在新标签页中打开链接";
      linkIcon.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;

      // 1-Click Copy BibTeX button
      const bibBtn = document.createElement("button");
      bibBtn.type = "button";
      bibBtn.className = "pp-foot-copy-btn";
      bibBtn.textContent = "Bib";
      bibBtn.title = "一键复制该文献的 BibTeX 引用";
      bibBtn.onclick = (event) => {
        event.stopPropagation();
        const citation = window.PaperPilotCore?.citation;
        const text = citation
          ? citation.buildBibtexEntries([item])
          : `@article{paper_${item.year || 2026},\n  title={${item.title || ""}},\n  journal={${item.journal || ""}},\n  year={${item.year || 2026}},\n  doi={${item.doi || ""}}\n}`;
        navigator.clipboard.writeText(text).then(() => {
          item.status = "copied_bibtex";
          persistHistory("已将 BibTeX 引用写入剪贴板");
        }).catch(() => {
          showToast("剪贴板写入失败，请检查浏览器权限");
        });
      };

      // 1-Click Copy Markdown button
      const mdBtn = document.createElement("button");
      mdBtn.type = "button";
      mdBtn.className = "pp-foot-copy-btn";
      mdBtn.textContent = "MD";
      mdBtn.title = "一键复制 Markdown 笔记格式引用";
      mdBtn.onclick = (event) => {
        event.stopPropagation();
        const targetUrl = item.pdfUrl || (item.doi ? `https://doi.org/${item.doi}` : "");
        const link = targetUrl ? `[${item.title || "Untitled"}](${targetUrl})` : `**${item.title || "Untitled"}**`;
        const journalStr = item.journal ? `*${item.journal}*` : "";
        const yearStr = item.year ? `(${item.year})` : "";
        const authorsStr = Array.isArray(item.authors) ? item.authors.join(", ") : (item.authors || "");
        const mdText = `${link} - ${journalStr} ${yearStr}${authorsStr ? ` - ${authorsStr}` : ""}`.trim();
        navigator.clipboard.writeText(mdText).then(() => {
          item.status = "copied_citation";
          persistHistory("已将 Markdown 笔记写入剪贴板");
        }).catch(() => {
          showToast("剪贴板写入失败，请检查浏览器权限");
        });
      };

      tools.appendChild(starBtn);
      tools.appendChild(bibBtn);
      tools.appendChild(mdBtn);

      // 1-Click Copy DOI button
      if (item.doi) {
        const doiBtn = document.createElement("button");
        doiBtn.type = "button";
        doiBtn.className = "pp-foot-copy-btn";
        doiBtn.textContent = "DOI";
        doiBtn.title = "一键复制文献 DOI 链接";
        doiBtn.onclick = (event) => {
          event.stopPropagation();
          const doiUrl = item.doi.startsWith("http") ? item.doi : `https://doi.org/${item.doi}`;
          navigator.clipboard.writeText(doiUrl).then(() => {
            showToast("已复制 DOI 链接到剪贴板");
          });
        };
        tools.appendChild(doiBtn);
      }

      // Quick Edit record button
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "pp-foot-edit-btn";
      editBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
      editBtn.title = "编辑修正此文献元数据";
      editBtn.onclick = (event) => {
        event.stopPropagation();
        openRecordEditor(recordIndex, editBtn);
      };

      tools.appendChild(editBtn);
      tools.appendChild(delBtn);
      tools.appendChild(linkIcon);

      topRow.appendChild(titleEl);
      topRow.appendChild(tools);

      // --- Meta row: journal + year + authors + status badge ---
      const metaRow = document.createElement("div");
      metaRow.className = "pp-foot-meta-row";

      const journalEl = document.createElement("span");
      journalEl.className = "pp-foot-journal";
      const journalName = item.journal || "Academic Source";
      const yearStr = item.year ? ` · ${item.year}` : "";
      journalEl.textContent = `${journalName}${yearStr}`;

      metaRow.appendChild(journalEl);

      const hasAuthors = item.authors && item.authors.length > 0;
      if (hasAuthors) {
        const authorsEl = document.createElement("span");
        authorsEl.className = "pp-foot-authors";
        const authorList = Array.isArray(item.authors) ? item.authors : [item.authors];
        const displayed = authorList.slice(0, 2).join(", ") + (authorList.length > 2 ? " 等" : "");
        authorsEl.textContent = displayed;
        metaRow.appendChild(authorsEl);
      }

      const statusBadge = document.createElement("span");
      statusBadge.className = `pp-foot-status-badge ${statusClass}`;
      statusBadge.textContent = statusText;
      metaRow.appendChild(statusBadge);

      body.appendChild(topRow);
      body.appendChild(metaRow);

      card.appendChild(accentBar);
      card.appendChild(body);
      historyList.appendChild(card);
    });
  }

  // 5. Expandable Search Panel & Quick Date Shortcuts
  const searchExpandPanel = document.getElementById("pp-search-expand-panel");
  const searchExpandToggle = document.getElementById("search-expand-toggle");
  const btnDateToday = document.getElementById("btn-date-today");
  const btnDate3days = document.getElementById("btn-date-3days");
  const btnDateWeek = document.getElementById("btn-date-week");
  const btnDateReset = document.getElementById("btn-date-reset");
  const searchClearBtn = document.getElementById("history-search-clear");

  if (searchExpandToggle && searchExpandPanel) {
    searchExpandToggle.onclick = () => {
      searchExpandPanel.classList.toggle("expanded");
    };
  }

  if (btnDateToday) {
    btnDateToday.onclick = () => {
      currentDateFilter = formatDateKey(new Date());
      renderCurrentFootprints();
      if (searchInput) searchInput.focus();
    };
  }

  if (btnDate3days) {
    btnDate3days.onclick = () => {
      currentDateFilter = "3days";
      renderCurrentFootprints();
      if (searchInput) searchInput.focus();
    };
  }

  if (btnDateWeek) {
    btnDateWeek.onclick = () => {
      currentDateFilter = "week";
      renderCurrentFootprints();
      if (searchInput) searchInput.focus();
    };
  }

  if (btnDateReset) {
    btnDateReset.onclick = () => {
      currentDateFilter = null;
      renderCurrentFootprints();
    };
  }

  searchInput.oninput = () => {
    currentHistoryQuery = searchInput.value.trim();
    if (searchClearBtn) {
      searchClearBtn.style.display = searchInput.value ? "block" : "none";
    }
    renderCurrentFootprints();
  };

  searchInput.onkeydown = (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      currentHistoryQuery = "";
      if (searchClearBtn) searchClearBtn.style.display = "none";
      renderCurrentFootprints();
    }
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput && !recordEditOverlay?.classList.contains("pp-open")) {
      e.preventDefault();
      if (searchExpandPanel) searchExpandPanel.classList.add("expanded");
      if (searchInput) searchInput.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      if (searchExpandPanel) searchExpandPanel.classList.add("expanded");
      if (searchInput) searchInput.focus();
    }
  });

  if (searchClearBtn) {
    searchClearBtn.onclick = () => {
      searchInput.value = "";
      currentHistoryQuery = "";
      searchClearBtn.style.display = "none";
      searchInput.focus();
      renderCurrentFootprints();
    };
  }

  // 6. Bulk Export clean BibTeX / Markdown / RIS files
  exportAllBtn.onclick = () => {
    const activeItems = getFilteredHistoryItems();
    if (activeItems.length === 0) return;

    const format = exportFormatSelect?.value || "bibtex";
    const citation = window.PaperPilotCore?.citation;
    const normalized = activeItems.map(item => ({
      ...item,
      url: item.pdfUrl || (item.doi ? `https://doi.org/${item.doi}` : ""),
      source: item.source || item.metricsSource || "PaperPilot history"
    }));

    let exported = "";
    let label = "BibTeX";

    if (format === "markdown") {
      label = "Markdown 清单";
      const filterLabel = currentDateFilter ? ` (${currentDateFilter})` : "";
      exported = `# 学术研读文献清单${filterLabel} (${normalized.length} 篇)\n\n` + normalized.map((paper, idx) => {
        const title = paper.title || "Untitled paper";
        const journal = paper.journal ? `*${paper.journal}*` : "";
        const year = paper.year ? `(${paper.year})` : "";
        const doi = paper.doi ? `[${paper.doi}](https://doi.org/${paper.doi})` : "N/A";
        const url = paper.pdfUrl ? `[PDF 全文](${paper.pdfUrl})` : "";
        const authors = Array.isArray(paper.authors) ? paper.authors.join(", ") : (paper.authors || "");
        return `${idx + 1}. **${title}**\n   - 期刊年份: ${journal} ${year}\n   - 作者: ${authors || "N/A"}\n   - DOI/直链: ${doi} ${url}`.trim();
      }).join("\n\n");
    } else if (citation && format === "ris") {
      exported = citation.buildRisEntries(normalized);
      label = "RIS";
    } else if (citation && format === "csljson") {
      exported = JSON.stringify(citation.buildCslJson(normalized), null, 2);
      label = "CSL JSON";
    } else if (format === "json") {
      exported = JSON.stringify({
        schema: "paperpilot.history",
        version: 1,
        exportedAt: new Date().toISOString(),
        history: normalized
      }, null, 2);
      label = "完整 JSON 备份";
    } else if (citation) {
      exported = citation.buildBibtexEntries(normalized);
    } else {
      exported = normalized.map(paper => `${paper.title || "Untitled"} ${paper.doi || ""}`.trim()).join("\n");
    }

    navigator.clipboard.writeText(exported.trim()).then(() => {
      showToast(`已将 ${normalized.length} 篇文献留痕以 ${label} 写入剪贴板`);
    }).catch(err => {
      console.error("Export copy failed:", err);
      showToast("复制失败，请检查浏览器剪贴板权限！");
    });
  };

  // Backup JSON Import
  const btnImportHistory = document.getElementById("btn-import-history");
  const fileImportHistory = document.getElementById("file-import-history");
  if (btnImportHistory && fileImportHistory) {
    btnImportHistory.onclick = () => fileImportHistory.click();
    fileImportHistory.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (!Array.isArray(parsed) && parsed?.schema && parsed.schema !== "paperpilot.history") {
            throw new Error("不支持的备份类型");
          }
          if (!Array.isArray(parsed) && parsed?.version && parsed.version > 1) {
            throw new Error(`备份版本 ${parsed.version} 高于当前支持版本`);
          }
          const list = Array.isArray(parsed) ? parsed : (parsed.history || []);
          if (!Array.isArray(list) || list.length > 2000) throw new Error("无有效留痕数据架构或记录数过多");

          let addedCount = 0;
          const existingDois = new Set(historyData.map(i => (i.doi || "").toLowerCase()).filter(Boolean));
          const existingTitles = new Set(historyData.map(i => (i.title || "").toLowerCase()).filter(Boolean));

          const validItems = list.filter(item => item && typeof item === "object" && (item.title || item.doi));
          if (!validItems.length && list.length) throw new Error("备份中没有可恢复的文献记录");
          if (!window.confirm(`将检查并合并 ${validItems.length} 条备份记录；重复文献会跳过。是否继续？`)) return;

          validItems.forEach(item => {
            const doi = (item.doi || "").toLowerCase();
            const title = (item.title || "").toLowerCase();
            if ((doi && existingDois.has(doi)) || (title && existingTitles.has(title))) return;
            historyData.unshift(item);
            addedCount++;
            if (doi) existingDois.add(doi);
            if (title) existingTitles.add(title);
          });

          persistHistory(`成功从备份导入 ${addedCount} 篇新文献留痕！`);
        } catch (err) {
          showToast(`导入失败: ${err.message}`);
        } finally {
          fileImportHistory.value = "";
        }
      };
      reader.readAsText(file);
    };
  }

  // Clear All Footprints / History Button
  const btnClearHistory = document.getElementById("btn-clear-history");
  if (btnClearHistory) {
    btnClearHistory.onclick = () => {
      if (!historyData || historyData.length === 0) {
        showToast("当前暂无文献留痕可清空");
        return;
      }
      if (window.confirm("确定要清空全部文过留痕记录吗？此操作无法撤销。")) {
        historyData = [];
        closeRecordEditor();
        persistHistory("已清空全部文过留痕记录");
      }
    };
  }

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

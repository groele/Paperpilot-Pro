/**
 * PaperPilot Pro - Extension Dropdown Controller
 * Manages configuration storage binds and footprints log lists.
 */

document.addEventListener("DOMContentLoaded", () => {
  const tabFoot = document.getElementById("tab-btn-foot");
  const tabSet = document.getElementById("tab-btn-set");
  const panelFoot = document.getElementById("panel-foot");
  const panelSet = document.getElementById("panel-set");

  const searchInput = document.getElementById("history-search");
  const historyList = document.getElementById("history-list");
  const emptyMsg = document.getElementById("history-empty");
  const exportAllBtn = document.getElementById("btn-export-all");

  const configRedirect = document.getElementById("setting-auto-redirect");
  const configPdfNaming = document.getElementById("setting-pdf-naming");
  const configAiProvider = document.getElementById("setting-ai-provider");
  const configAiKey = document.getElementById("setting-ai-key");
  const configAiPrompt = document.getElementById("setting-ai-prompt");
  const configAppearanceMode = document.getElementById("setting-appearance-mode");

  // Feature toggles
  const configNi = document.getElementById("setting-enable-ni");
  const configDedup = document.getElementById("setting-enable-dedup");
  const configSortingFilter = document.getElementById("setting-enable-sorting-filter");
  const configBadges = document.getElementById("setting-enable-badges");
  const configMetacard = document.getElementById("setting-enable-metacard");
  const configMarkdownNote = document.getElementById("setting-enable-markdown-note");
  const configMetricsDisplay = document.getElementById("setting-enable-metrics-display");
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
  const configPdfBadge = document.getElementById("setting-enable-pdf-badge");

  // Feature status dots
  const statusNi = document.getElementById("status-ni");
  const statusDedup = document.getElementById("status-dedup");
  const statusSortingFilter = document.getElementById("status-sorting-filter");
  const statusBadges = document.getElementById("status-badges");
  const statusMetacard = document.getElementById("status-metacard");
  const statusMarkdown = document.getElementById("status-markdown");

  let historyData = [];

  // Theme update helper
  function updateTheme(mode) {
    document.documentElement.setAttribute("data-pp-theme", mode || "system");
  }

  // Update Status grid dots
  function updateFeatureStatusGrid() {
    const setStatus = (element, isActive) => {
      if (!element) return;
      if (isActive) {
        element.classList.add("active");
        element.classList.remove("inactive");
      } else {
        element.classList.remove("active");
        element.classList.add("inactive");
      }
    };

    setStatus(statusNi, configNi.checked);
    setStatus(statusDedup, configDedup.checked);
    setStatus(statusSortingFilter, configSortingFilter.checked);
    setStatus(statusBadges, configBadges.checked);
    setStatus(statusMetacard, configMetacard.checked);
    setStatus(statusMarkdown, configMarkdownNote.checked);
  }

  // 1. Navigation Tab Switching
  tabFoot.onclick = () => {
    tabFoot.classList.add("active");
    tabSet.classList.remove("active");
    panelFoot.classList.add("active");
    panelSet.classList.remove("active");
    loadFootprints();
  };

  tabSet.onclick = () => {
    tabSet.classList.add("active");
    tabFoot.classList.remove("active");
    panelSet.classList.add("active");
    panelFoot.classList.remove("active");
  };

  // 2. Load settings from storage
  chrome.storage.local.get([
    "auto_redirect",
    "pdf_naming",
    "ai_provider",
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
    "enable_cite_badge",
    "enable_pdf_badge"
  ], (config) => {
    if (config.auto_redirect !== undefined) configRedirect.checked = config.auto_redirect;
    if (config.pdf_naming !== undefined) configPdfNaming.value = config.pdf_naming;
    if (config.ai_provider !== undefined) configAiProvider.value = config.ai_provider;
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
    configPdfBadge.checked = config.enable_pdf_badge !== false;

    // Update the visual status grid
    updateFeatureStatusGrid();
  });

  // 3. Save settings binds
  const saveSetting = (key, value, successMsg = "设置已保存") => {
    const data = {};
    data[key] = value;
    chrome.storage.local.set(data, () => {
      showToast(successMsg);
      updateFeatureStatusGrid();
    });
  };

  configRedirect.onchange = () => saveSetting("auto_redirect", configRedirect.checked, "自动重定向设置已同步");
  configPdfNaming.onchange = () => saveSetting("pdf_naming", configPdfNaming.value, "文件命名模板保存成功");
  configAiProvider.onchange = () => saveSetting("ai_provider", configAiProvider.value, "AI 提供商已切换");
  configAiKey.oninput = () => saveSetting("ai_api_key", configAiKey.value, "API 密钥已更新保存");
  configAiPrompt.oninput = () => saveSetting("ai_prompt", configAiPrompt.value, "自定义提示词已更新");
  configAppearanceMode.onchange = () => {
    saveSetting("appearance_mode", configAppearanceMode.value, "外观展示模式已切换");
    updateTheme(configAppearanceMode.value);
  };

  const easyScholarKeyInput = document.getElementById("setting-easyscholar-key");
  const toggleEasyScholarBtn = document.getElementById("btn-toggle-easyscholar-visible");

  easyScholarKeyInput.oninput = () => {
    const keyVal = easyScholarKeyInput.value.trim();
    chrome.storage.local.set({
      easyscholar_key: keyVal,
      pdf_cache: {},
      easyscholar_cache: {}
    }, () => {
      showToast("easyScholar Key 已保存，历史估算缓存已自动清除");
      updateFeatureStatusGrid();
    });
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
  configPdfBadge.onchange = () => saveSetting("enable_pdf_badge", configPdfBadge.checked, "PDF 直链徽章显示已同步");

  // 4. Load academic footprints history
  function loadFootprints() {
    chrome.storage.local.get("history", (res) => {
      historyData = res.history || [];
      renderFootprints(historyData);
    });
  }

  function renderFootprints(items) {
    // Clear list
    // Preserve empty placeholder
    historyList.innerHTML = "";
    
    if (items.length === 0) {
      historyList.appendChild(emptyMsg);
      emptyMsg.style.display = "block";
      exportAllBtn.disabled = true;
      return;
    }

    emptyMsg.style.display = "none";
    exportAllBtn.disabled = false;

    items.forEach((item) => {
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
      }

      card.innerHTML = `
        <div class="pp-popup-foot-title">${item.title}</div>
        <div class="pp-popup-foot-meta">
          <span class="pp-popup-foot-journal">${item.journal || "Other"} (${item.year})</span>
          <span class="pp-popup-foot-status ${statusClass}">${statusText}</span>
        </div>
      `;

      card.onclick = () => {
        // Open PDF Url or DOI url
        const targetUrl = item.pdfUrl || (item.doi ? `https://doi.org/${item.doi}` : "");
        if (targetUrl) {
          window.open(targetUrl, "_blank");
        } else {
          showToast("该文献无直链，将为您在谷歌中搜索");
          window.open(`https://www.google.com/search?q=${encodeURIComponent(item.title)}`, "_blank");
        }
      };

      historyList.appendChild(card);
    });
  }

  // 5. Fuzzy filtering
  searchInput.oninput = () => {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) {
      renderFootprints(historyData);
      return;
    }

    const filtered = historyData.filter(item => {
      const title = (item.title || "").toLowerCase();
      const journal = (item.journal || "").toLowerCase();
      const doi = (item.doi || "").toLowerCase();
      return title.includes(q) || journal.includes(q) || doi.includes(q);
    });

    renderFootprints(filtered);
  };

  // 6. Bulk Export clean BibTeX files
  exportAllBtn.onclick = () => {
    if (historyData.length === 0) return;

    let bibCompiled = "";
    historyData.forEach((paper) => {
      const authorList = Array.isArray(paper.authors) ? paper.authors : [];
      const firstAuthorSurname = authorList.length > 0 ? 
        authorList[0].split(/\s+/).pop().replace(/[^a-zA-Z]/g, "") : "Unknown";
      const cleanTitleWords = (paper.title || "Paper").split(/\s+/);
      const firstWordOfTitle = cleanTitleWords.length > 0 ? 
        cleanTitleWords[0].replace(/[^a-zA-Z]/g, "") : "Paper";
      
      const cleanKey = `${firstAuthorSurname}${paper.year}${firstWordOfTitle}`;

      bibCompiled += `@article{${cleanKey},\n` +
        `  title={${paper.title}},\n` +
        `  author={${authorList.join(" and ")}},\n` +
        `  journal={${paper.journal || "Other"}},\n` +
        `  year={${paper.year}},\n` +
        `  doi={${paper.doi || ""}}\n` +
        `}\n\n`;
    });

    navigator.clipboard.writeText(bibCompiled.trim()).then(() => {
      showToast(`已将 ${historyData.length} 篇文献足迹以 clean BibTeX 打包复制！`);
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
});

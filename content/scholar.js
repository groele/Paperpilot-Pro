/**
 * PaperPilot Pro - Google Scholar Enhancer Content Script
 * Operating purely on client-loaded content to prevent CAPTCHA blocks.
 * Inspired by Better Scholar's non-destructive flexbox sorting and stateful architecture.
 */

(function() {
  // Built-in Nature Index journals normalized matching list
  const NATURE_INDEX_JOURNALS = new Set([
    "nature", "science", "cell", "journal of the american chemical society", "j. am. chem. soc.",
    "jacs", "angewandte chemie", "angew. chem.", "advanced materials", "adv. mater.",
    "physical review letters", "phys. rev. lett.", "prl", "nature energy", "nat. energy",
    "nature materials", "nat. mater.", "chemical communications", "chem. commun.",
    "nano letters", "nano lett.", "acs nano", "nature communications", "nat. commun.",
    "proceedings of the national academy of sciences", "pnas", "nature nanotechnology", "nat. nanotechnol.",
    "nature chemistry", "nat. chem.", "nature biotechnology", "nat. biotech.", "nature medicine", "nat. med.",
    "nature physics", "nat. phys.", "nature photonics", "nat. photon.", "nature methods", "nat. methods",
    "nature genetics", "nat. genet.", "nature neuroscience", "nat. neurosci.", "nature cell biology", "nat. cell biol.",
    "nature structural & molecular biology", "nat. struct. mol. biol.", "nature immunology", "nat. immunol.",
    "clinical cancer research", "clin. cancer res.", "cancer research", "cancer res.", "the journal of clinical investigation", "j. clin. invest.",
    "the journal of experimental medicine", "j. exp. med.", "neuron", "plos biology", "plos biol.",
    "journal of cell biology", "j. cell biol.", "developmental cell", "dev. cell", "molecular cell", "mol. cell",
    "genes & development", "genes dev.", "systematic biology", "syst. biol.", "molecular biology and evolution", "mol. biol. evol.",
    "nature ecology & evolution", "nat. ecol. evol.", "ecology letters", "ecol. lett.", "the american naturalist", "am. nat.",
    "astrophysical journal", "astrophys. j.", "monthly notices of the royal astronomical society", "mon. not. r. astron. soc.",
    "astronomy & astrophysics", "astron. astrophys.", "physical review d", "phys. rev. d", "physical review b", "phys. rev. b",
    "physical review a", "phys. rev. a", "physical review x", "phys. rev. x", "journal of high energy physics", "j. high energy phys.",
    "physical review c", "phys. rev. c", "journal of geophysical research", "j. geophys. res.", "geophysical research letters", "geophys. res. lett.",
    "earth and planetary science letters", "earth planet. sci. lett.", "geochimica et cosmochimica acta", "geochim. cosmochim. acta",
    "journal of petrology", "j. petrol.", "geology", "paleoceanography", "water resources research", "water resour. res."
  ]);

  const STORAGE_PREFIX = 'paperpilot-pro:scholar:v1';
  const SETTINGS_KEYS = [
    "appearance_mode",
    "enable_ni",
    "enable_dedup",
    "enable_sorting_filter",
    "enable_badges",
    "enable_markdown_note",
    "enable_metrics_display",
    "enable_metrics_auto_detect",
    "enable_bibtex_btn",
    "enable_scholar_copy_doi_btn",
    "enable_pdf_download_btn",
    "easyscholar_key",
    "enable_ccf_badge",
    "enable_core_badge",
    "enable_warn_badge",
    "enable_if_badge",
    "enable_cas_badge",
    "enable_jcr_badge",
    "enable_cite_badge"
  ];

  let maxCites = 100;
  let minYear = 2010;
  let maxYear = new Date().getFullYear();
  let venuesFound = new Map(); // Name -> Count
  let parsedPapers = [];
  let currentTheme = "system";

  // Global State for state preservation and reactive updates
  const state = {
    observer: null,
    observerAttached: false,
    toolbarObserver: null,
    toolbarObserverAttached: false,
    toolbarObserverTarget: null,
    toolbarWatchdog: null,
    isInternalUpdating: false,
    refreshTimer: null,
    saveTimer: null,
    routeHooked: false,
    urlWatchTimer: null,

    lastUrl: location.href,
    lastQueryKey: '',
    lastResultSetKey: '',
    lastArticleSignature: '',
    lastSourceSignature: '',

    currentSortType: 'default',
    currentExpanded: false,
    citeThreshold: 0,
    yearThreshold: 0,
    sourceFilterState: new Map(),

    initRetryCount: 0,
    initialized: false,
    settings: null
  };

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base'
  });

  // Theme Update Helper
  function updateAllThemes() {
    const panels = document.querySelectorAll(".pp-scholar-sidebar-panel");
    panels.forEach(p => p.setAttribute("data-pp-theme", currentTheme));
    
    const toasts = document.querySelectorAll(".pp-scholar-toast");
    toasts.forEach(t => t.setAttribute("data-pp-theme", currentTheme));

    const dups = document.querySelectorAll(".pp-scholar-dup-container");
    dups.forEach(d => d.setAttribute("data-pp-theme", currentTheme));

    const toolbar = document.getElementById("pp-scholar-sorting-toolbar");
    if (toolbar) toolbar.setAttribute("data-pp-theme", currentTheme);
  }

  function isScholarPage() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    const scholarLikeHost = [
      "scholar", "xueshu", "x-mol", "lanfanshu", "cljtscd", "panda985"
    ].some(keyword => host.includes(keyword));
    const hasScholarDom = !!(
      document.getElementById("gs_top") ||
      document.getElementById("gs_hdr") ||
      document.getElementById("gs_res_ccl") ||
      document.getElementById("gs_res_ccl_mid") ||
      document.querySelector(".gs_rt") ||
      document.querySelector(".gs_r.gs_or") ||
      document.querySelector("a[href*='/scholar?cites='], a[href*='cites=']")
    );

    return hasScholarDom || (scholarLikeHost && (path.includes("scholar") || path.includes("xueshu") || document.querySelector(".gs_r, .gs_rt")));
  }

  // =========================================================
  // DOM Fetch Helpers
  // =========================================================
  function getResultsContainer() {
    return document.getElementById("gs_res_ccl_mid") ||
           document.getElementById("gs_res_ccl") ||
           document.querySelector(".gs_r.gs_or.gs_scl")?.parentElement ||
           document.querySelector(".gs_rt")?.closest(".gs_r")?.parentElement;
  }

  function getSidebar() {
    return document.getElementById("gs_bdy_sb_in") || 
           document.getElementById("gs_bdy_sb-in") || 
           document.getElementById("gs_bdy_sb") || 
           document.getElementById("gs_sidebar");
  }

  function getToolbar() {
    return document.querySelector('#gs_ab_md') ||
           document.querySelector('#gs_ab .gs_ab_mdw')?.parentElement ||
           document.querySelector('#gs_ab') ||
           document.querySelector('.gs_ab_mdw')?.parentElement ||
           null;
  }

  function getToolbarMountNode() {
    const toolbar = getToolbar();
    if (!toolbar) return null;
    return toolbar.querySelector('.gs_ab_mdw') || toolbar;
  }

  function isResultArticle(el) {
    return !!(
      el &&
      el.nodeType === 1 &&
      el.classList &&
      el.classList.contains("gs_r") &&
      el.classList.contains("gs_or") &&
      el.classList.contains("gs_scl")
    );
  }

  function getScholarArticles() {
    const container = getResultsContainer();
    if (!container) return [];
    return Array.from(container.children).filter(isResultArticle);
  }

  // =========================================================
  // State Storage Bindings
  // =========================================================
  function getQueryKey() {
    try {
      const url = new URL(location.href);
      const q = (url.searchParams.get('q') || '').trim();
      const scisbd = (url.searchParams.get('scisbd') || '').trim();
      const asSdt = (url.searchParams.get('as_sdt') || '').trim();
      const hl = (url.searchParams.get('hl') || '').trim();
      return `${url.hostname}|q=${q}|scisbd=${scisbd}|as_sdt=${asSdt}|hl=${hl}`;
    } catch (_) {
      return 'default-key';
    }
  }

  function getStorageKey() {
    return `${STORAGE_PREFIX}|${getQueryKey()}`;
  }

  function loadPersistedState() {
    state.currentSortType = 'default';
    state.currentExpanded = false;
    state.sourceFilterState = new Map();
    state.citeThreshold = 0;
    state.yearThreshold = 0;

    try {
      const raw = localStorage.getItem(getStorageKey());
      if (!raw) return;

      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;

      if (['default', 'citations', 'year'].includes(data.sortType)) {
        state.currentSortType = data.sortType;
      }
      state.currentExpanded = !!data.expanded;
      if (typeof data.citeThreshold === 'number') {
        state.citeThreshold = data.citeThreshold;
      }
      if (typeof data.yearThreshold === 'number') {
        state.yearThreshold = data.yearThreshold;
      }
      if (data.filters && typeof data.filters === 'object') {
        state.sourceFilterState = new Map(Object.entries(data.filters));
      }
    } catch (_) {}
  }

  function savePersistedState() {
    try {
      const data = {
        updatedAt: Date.now(),
        sortType: state.currentSortType,
        expanded: state.currentExpanded,
        citeThreshold: state.citeThreshold,
        yearThreshold: state.yearThreshold,
        filters: Object.fromEntries(state.sourceFilterState)
      };
      localStorage.setItem(getStorageKey(), JSON.stringify(data));
    } catch (_) {}
  }

  // =========================================================
  // Result Signatures to detect query transitions
  // =========================================================
  function getArticleStableId(article, index) {
    if (article._ppStableId) return article._ppStableId;
    const titleEl = article.querySelector(".gs_rt");
    const title = titleEl ? titleEl.innerText.replace(/\[[A-Z]+\]/g, "").trim() : "";
    const href = titleEl?.querySelector("a")?.href || "";
    const meta = (article.querySelector('.gs_a')?.textContent || '').replace(/\s+/g, ' ').trim();
    article._ppStableId = `${href || title || `idx:${index}`}|${meta}`;
    return article._ppStableId;
  }

  function getResultSetKey() {
    const url = new URL(location.href);
    const q = url.searchParams.get('q') || '';
    const start = url.searchParams.get('start') || '0';
    const ids = getScholarArticles()
      .map((article, index) => getArticleStableId(article, index))
      .sort(collator.compare);

    return `${url.pathname}|q=${q}|start=${start}|count=${ids.length}|${ids.join('||')}`;
  }

  function getArticleSignature() {
    const ids = getScholarArticles()
      .map((article, index) => {
        return [
          getArticleStableId(article, index),
          article._ppYear || article.dataset.year || '0',
          article._ppCite || article.dataset.cite || '0',
          article._ppVenue || article.dataset.venue || ''
        ].join('|');
      })
      .sort(collator.compare);

    return ids.join('||');
  }

  function getSourceStats() {
    const stats = new Map();
    getScholarArticles().forEach(article => {
      const venue = article.dataset.venue || 'Other';
      
      const normVenue = venue.toLowerCase();
      let matchedNormName = "Other";
      for (let niName of NATURE_INDEX_JOURNALS) {
        if (normVenue.includes(niName)) {
          matchedNormName = niName;
          break;
        }
      }
      stats.set(matchedNormName, (stats.get(matchedNormName) || 0) + 1);
    });
    return stats;
  }

  function getSourceSignature() {
    return JSON.stringify(
      Array.from(getSourceStats().entries()).sort((a, b) => {
        if (a[0] === b[0]) return 0;
        return collator.compare(a[0], b[0]);
      })
    );
  }

  // =========================================================
  // Life Cycle Engine & Re-rendering Loops
  // =========================================================
  function fetchSettingsAndRun(callback) {
    chrome.storage.local.get(SETTINGS_KEYS, (settings) => {
      state.settings = {
        appearance_mode: settings.appearance_mode || "system",
        enable_ni: settings.enable_ni !== false,
        enable_dedup: settings.enable_dedup !== false,
        enable_sorting_filter: settings.enable_sorting_filter !== false,
        enable_badges: settings.enable_badges !== false,
        enable_markdown_note: settings.enable_markdown_note !== false,
        enable_metrics_display: settings.enable_metrics_display !== false,
        enable_metrics_auto_detect: settings.enable_metrics_auto_detect !== false,
        enable_bibtex_btn: settings.enable_bibtex_btn !== false,
        enable_scholar_copy_doi_btn: settings.enable_scholar_copy_doi_btn !== false,
        enable_pdf_download_btn: settings.enable_pdf_download_btn !== false,
        easyscholar_key: (settings.easyscholar_key || "").trim(),
        enable_ccf_badge: settings.enable_ccf_badge !== false,
        enable_core_badge: settings.enable_core_badge !== false,
        enable_warn_badge: settings.enable_warn_badge !== false,
        enable_if_badge: settings.enable_if_badge !== false,
        enable_cas_badge: settings.enable_cas_badge !== false,
        enable_jcr_badge: settings.enable_jcr_badge !== false,
        enable_cite_badge: settings.enable_cite_badge !== false
      };
      currentTheme = state.settings.appearance_mode;
      updateAllThemes();
      if (callback) callback();
    });
  }

  function withInternalUpdate(fn) {
    state.isInternalUpdating = true;
    try {
      fn();
    } finally {
      requestAnimationFrame(() => {
        state.isInternalUpdating = false;
      });
    }
  }

  function debounceRefresh(forcePanel = false) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => {
      refreshPage(forcePanel);
    }, 140);
  }

  function refreshPage(forcePanel = false) {
    if (state.isInternalUpdating) return;

    const container = getResultsContainer();
    if (!container) return;

    const currentResultSetKey = getResultSetKey();
    const currentSignature = getArticleSignature();

    const needReprocess =
      forcePanel ||
      currentResultSetKey !== state.lastResultSetKey ||
      currentSignature !== state.lastArticleSignature ||
      location.href !== state.lastUrl;

    if (needReprocess) {
      state.lastUrl = location.href;
      processAllArticles(forcePanel, false);
    } else {
      if (state.settings.enable_sorting_filter) {
        ensureSortingToolbar();
        try {
          renderSourcePanel(false);
        } catch (e) {
          console.warn("PaperPilot Pro: source panel render failed", e);
        }
      }
      applyCurrentSort();
      applyFilters();
    }

    attachObserver();
  }

  function ensureOrderMode() {
    const container = getResultsContainer();
    if (!container) return;
    container.classList.add('pp-order-mode');
  }

  function refreshDefaultOrderIfNeeded() {
    const nextResultSetKey = getResultSetKey();
    const articles = getScholarArticles();

    if (nextResultSetKey !== state.lastResultSetKey) {
      articles.forEach(article => {
        delete article.dataset.ppDefaultOrder;
        article.classList.remove("pp-scholar-hidden-by-filter");
      });
      state.lastResultSetKey = nextResultSetKey;
      state.lastSourceSignature = '';
    }
  }

  function processAllArticles(forcePanel = false, skipPanel = false) {
    const container = getResultsContainer();
    if (!container) return false;
    
    const articles = getScholarArticles();
    if (!articles.length) return false;

    withInternalUpdate(() => {
      ensureOrderMode();
      refreshDefaultOrderIfNeeded();

      // Clear dynamic stats
      maxCites = 100;
      minYear = 2010;
      maxYear = new Date().getFullYear();
      venuesFound.clear();
      parsedPapers = [];

      // Run card enhancement
      enhanceGoogleScholar(state.settings);

      // Recalculate slider boundaries and stats
      articles.forEach((card, index) => {
        const cite = parseInt(card.dataset.cite || "0");
        const year = parseInt(card.dataset.year || "0");
        const venue = card.dataset.venue || "Other";

        if (cite > maxCites) maxCites = cite;
        if (year < minYear && year > 1900) minYear = year;

        const normVenue = venue.toLowerCase();
        let matchedNormName = "Other";
        for (let niName of NATURE_INDEX_JOURNALS) {
          if (normVenue.includes(niName)) {
            matchedNormName = niName;
            break;
          }
        }
        venuesFound.set(matchedNormName, (venuesFound.get(matchedNormName) || 0) + 1);
      });

      ensureSourceFilterState();
      
      if (state.settings.enable_sorting_filter) {
        ensureSortingToolbar();
        if (!skipPanel) {
          try {
            renderSourcePanel(forcePanel);
          } catch (e) {
            console.warn("PaperPilot Pro: source panel render failed", e);
          }
        }
      }

      applyCurrentSort();
      applyFilters();
    });

    state.lastArticleSignature = getArticleSignature();
    return true;
  }

  // =========================================================
  // Top toolbar sorting, matching Better Scholar's placement in #gs_ab_md
  // =========================================================
  function updateSortButtonState() {
    const toolbar = document.getElementById("pp-scholar-sorting-toolbar");
    if (!toolbar) return;
    toolbar.querySelectorAll('.pp-scholar-sort-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sort === state.currentSortType);
    });
  }

  function ensureSortingToolbar(retryCount = 0) {
    if (!state.settings || !state.settings.enable_sorting_filter) return;

    const toolbar = getToolbar();
    const toolbarMount = getToolbarMountNode();
    if (!toolbar || !toolbarMount) {
      if (retryCount < 100) {
        setTimeout(() => ensureSortingToolbar(retryCount + 1), 100);
      }
      return;
    }

    let sortBar = document.getElementById("pp-scholar-sorting-toolbar");
    if (!sortBar) {
      sortBar = document.createElement("div");
      sortBar.id = "pp-scholar-sorting-toolbar";
      sortBar.className = "pp-scholar-sort-bar";
      sortBar.setAttribute("data-pp-theme", currentTheme);

      const buttonConfigs = [
        { key: 'default', label: '默认排序', id: 'pp-sort-default' },
        { key: 'citations', label: '按引用量降序', id: 'pp-sort-citations' },
        { key: 'year', label: '按发表年份降序', id: 'pp-sort-year' }
      ];

      buttonConfigs.forEach(cfg => {
        const button = document.createElement('button');
        button.className = 'pp-scholar-sort-btn';
        button.id = cfg.id;
        button.type = 'button';
        button.dataset.sort = cfg.key;
        button.textContent = cfg.label;

        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setSortType(cfg.key);
        });

        sortBar.appendChild(button);
      });

      toolbarMount.appendChild(sortBar);
    } else {
      sortBar.setAttribute("data-pp-theme", currentTheme);
      // Keep the sort bar inside Google Scholar's top metadata toolbar.
      if (!toolbar.contains(sortBar) || sortBar.parentNode !== toolbarMount) {
        toolbarMount.appendChild(sortBar);
      }
    }

    updateSortButtonState();
    attachToolbarObserver();
  }

  function startToolbarWatchdog() {
    if (state.toolbarWatchdog) return;

    state.toolbarWatchdog = setInterval(() => {
      if (!isScholarPage() || !state.settings || !state.settings.enable_sorting_filter) return;
      if (!getResultsContainer()) return;

      const toolbarContainer = getToolbarMountNode();
      const toolbar = document.getElementById("pp-scholar-sorting-toolbar");
      if (toolbarContainer && (!toolbar || toolbar.parentNode !== toolbarContainer)) {
        ensureSortingToolbar();
      }
    }, 800);
  }

  function setSortType(sortType, silent = false) {
    state.currentSortType = sortType;
    applyCurrentSort();
    savePersistedState();

    if (!silent) {
      if (sortType === 'default') showToast('已恢复默认排序');
      if (sortType === 'citations') showToast('已按引用量排序');
      if (sortType === 'year') showToast('已按年份排序');
    }
  }

  function applyCurrentSort() {
    ensureOrderMode();
    const articles = getScholarArticles();
    if (!articles.length) return;

    const sorted = [...articles];

    if (state.currentSortType === 'default') {
      sorted.sort((a, b) => {
        const ao = parseInt(a.dataset.ppDefaultOrder || '0', 10);
        const bo = parseInt(b.dataset.ppDefaultOrder || '0', 10);
        return ao - bo;
      });
    } else if (state.currentSortType === 'citations') {
      sorted.sort((a, b) => {
        const ac = parseInt(a.dataset.cite || '0', 10);
        const bc = parseInt(b.dataset.cite || '0', 10);
        if (bc !== ac) return bc - ac;

        const ay = parseInt(a.dataset.year || '0', 10);
        const by = parseInt(b.dataset.year || '0', 10);
        if (by !== ay) return by - ay;

        const tt = collator.compare(a.dataset.title || "", b.dataset.title || "");
        if (tt !== 0) return tt;

        const ao = parseInt(a.dataset.ppDefaultOrder || '0', 10);
        const bo = parseInt(b.dataset.ppDefaultOrder || '0', 10);
        return ao - bo;
      });
    } else if (state.currentSortType === 'year') {
      sorted.sort((a, b) => {
        const ay = parseInt(a.dataset.year || '0', 10);
        const by = parseInt(b.dataset.year || '0', 10);
        if (by !== ay) return by - ay;

        const ac = parseInt(a.dataset.cite || '0', 10);
        const bc = parseInt(b.dataset.cite || '0', 10);
        if (bc !== ac) return bc - ac;

        const tt = collator.compare(a.dataset.title || "", b.dataset.title || "");
        if (tt !== 0) return tt;

        const ao = parseInt(a.dataset.ppDefaultOrder || '0', 10);
        const bo = parseInt(b.dataset.ppDefaultOrder || '0', 10);
        return ao - bo;
      });
    }

    sorted.forEach((article, index) => {
      article.style.order = String(index);
    });

    updateSortButtonState();
  }

  // =========================================================
  // Sidebar Filtering Panel
  // =========================================================
  function updateFoldState() {
    const items = Array.from(document.querySelectorAll('.pp-scholar-source-item'));
    const moreBtn = document.getElementById('pp-source-more');
    if (!items.length || !moreBtn) return;

    const FOLD_THRESHOLD = 9;
    if (items.length <= FOLD_THRESHOLD) {
      items.forEach(item => item.style.display = 'flex');
      moreBtn.style.display = 'none';
      return;
    }

    items.forEach((item, index) => {
      item.style.display = (state.currentExpanded || index < FOLD_THRESHOLD) ? 'flex' : 'none';
    });

    moreBtn.style.display = 'block';
    moreBtn.textContent = state.currentExpanded ? '收起 ▲' : '展开更多 ▼';
  }

  function renderSourcePanel(force = false, retryCount = 0) {
    if (!state.settings || !state.settings.enable_sorting_filter) return;

    const sidebar = getSidebar();
    if (!sidebar) {
      if (retryCount < 25) {
        setTimeout(() => renderSourcePanel(force, retryCount + 1), 100);
      }
      return;
    }

    const nextSignature = getSourceSignature();
    let panel = document.querySelector(".pp-scholar-sidebar-panel");

    if (!force && panel && state.lastSourceSignature === nextSignature) {
      syncCheckboxesAndSlidersFromState();
      updateFoldState();
      return;
    }

    state.lastSourceSignature = nextSignature;

    if (!panel) {
      panel = document.createElement("div");
      panel.className = "pp-scholar-sidebar-panel";
      panel.setAttribute("data-pp-theme", currentTheme);
      
      panel.innerHTML = `
        <div class="pp-scholar-panel-header">
          <div class="pp-scholar-panel-title">
            ${window.PP_ICONS.filter}
            <span>智能检索重排与过滤</span>
          </div>
          <span class="pp-scholar-panel-badge" id="pp-filter-count-badge">已展示全部</span>
        </div>
        <div class="pp-scholar-panel-subtitle">本地零开销无感过滤 • 实时动态重排</div>

        <!-- Quick Filter Presets -->
        <div class="pp-scholar-presets-bar">
          <button type="button" class="pp-preset-btn" id="pp-preset-cite" title="快速筛选被引量≥100的文献">🔥 100+被引</button>
          <button type="button" class="pp-preset-btn" id="pp-preset-year" title="快速筛选近3年发表文献">📅 近3年</button>
          <button type="button" class="pp-preset-btn" id="pp-preset-ni" title="仅保留自然指数/核心期刊">🏆 仅NI顶刊</button>
          <button type="button" class="pp-preset-btn pp-preset-reset" id="pp-preset-reset" title="重置所有筛选">🔄 重置</button>
        </div>
        
        <div class="pp-scholar-slider-group">
          <div class="pp-scholar-slider-label">
            <span>被引量下限</span>
            <span class="pp-scholar-slider-val" id="pp-val-cite">≥ 0 次</span>
          </div>
          <input type="range" class="pp-scholar-range-slider" id="pp-slider-cite" min="0" max="${Math.ceil(maxCites / 50) * 50}" value="${state.citeThreshold}" step="10">
        </div>

        <div class="pp-scholar-slider-group">
          <div class="pp-scholar-slider-label">
            <span>发表年份下限</span>
            <span class="pp-scholar-slider-val" id="pp-val-year">≥ ${minYear} 年</span>
          </div>
          <input type="range" class="pp-scholar-range-slider" id="pp-slider-year" min="${minYear}" max="${maxYear}" value="${state.yearThreshold || minYear}" step="1">
        </div>

        <div class="pp-scholar-source-list">
          <div class="pp-scholar-panel-title" style="font-size: 11.5px; margin-top: 4px; justify-content: space-between;">
            <span>期刊来源匹配过滤</span>
            <button type="button" class="pp-scholar-mini-toggle-link" id="pp-toggle-all">全选</button>
          </div>
          <div id="pp-source-items-wrap"></div>
        </div>
        <div id="pp-source-more" style="color: var(--pp-primary); font-size: 11px; cursor: pointer; user-select: none; text-align: center; margin-top: 4px; display: none;">展开更多 ▼</div>
      `;
      sidebar.insertBefore(panel, sidebar.firstChild);

      // Presets event handlers
      panel.querySelector("#pp-preset-cite").onclick = () => {
        state.citeThreshold = 100;
        syncCheckboxesAndSlidersFromState();
        applyFilters();
        savePersistedState();
      };

      panel.querySelector("#pp-preset-year").onclick = () => {
        const targetYear = new Date().getFullYear() - 3;
        state.yearThreshold = Math.max(minYear, targetYear);
        syncCheckboxesAndSlidersFromState();
        applyFilters();
        savePersistedState();
      };

      panel.querySelector("#pp-preset-ni").onclick = () => {
        state.sourceFilterState.forEach((_, key) => {
          const isNi = NATURE_INDEX_JOURNALS.includes(key.toLowerCase());
          state.sourceFilterState.set(key, isNi);
        });
        syncCheckboxesAndSlidersFromState();
        applyFilters();
        savePersistedState();
      };

      panel.querySelector("#pp-preset-reset").onclick = () => {
        state.citeThreshold = 0;
        state.yearThreshold = minYear;
        state.sourceFilterState.forEach((_, key) => {
          state.sourceFilterState.set(key, true);
        });
        syncCheckboxesAndSlidersFromState();
        applyFilters();
        savePersistedState();
      };

      // Event listener for toggle all / clear all
      panel.querySelector("#pp-toggle-all").onclick = (e) => {
        e.preventDefault();
        const checkboxValues = Array.from(state.sourceFilterState.values());
        const allChecked = checkboxValues.length > 0 && checkboxValues.every(v => v === true);

        state.sourceFilterState.forEach((_, key) => {
          state.sourceFilterState.set(key, !allChecked);
        });

        syncCheckboxesAndSlidersFromState();
        applyFilters();
        savePersistedState();
      };

      panel.querySelector("#pp-source-more").onclick = (e) => {
        e.preventDefault();
        state.currentExpanded = !state.currentExpanded;
        updateFoldState();
        savePersistedState();
      };

      // Set up slider changes
      const citeSlider = panel.querySelector("#pp-slider-cite");
      const yearSlider = panel.querySelector("#pp-slider-year");

      const onSliderInput = () => {
        state.citeThreshold = parseInt(citeSlider.value);
        state.yearThreshold = parseInt(yearSlider.value);
        
        panel.querySelector("#pp-val-cite").innerText = `≥ ${state.citeThreshold} 次`;
        panel.querySelector("#pp-val-year").innerText = `≥ ${state.yearThreshold} 年`;
        
        applyFilters();
        savePersistedState();
      };

      citeSlider.oninput = onSliderInput;
      yearSlider.oninput = onSliderInput;
    } else {
      panel.setAttribute("data-pp-theme", currentTheme);
      // Update slider bounds if they changed
      const citeSlider = panel.querySelector("#pp-slider-cite");
      const yearSlider = panel.querySelector("#pp-slider-year");
      citeSlider.max = String(Math.ceil(maxCites / 50) * 50);
      yearSlider.min = String(minYear);
      yearSlider.max = String(maxYear);
    }

    const itemsWrap = document.getElementById("pp-source-items-wrap");
    if (itemsWrap) {
      itemsWrap.innerHTML = "";

      const stats = getSourceStats();
      const sources = Array.from(stats.entries()).sort((a, b) => {
        if (a[0] === 'Other') return 1;
        if (b[0] === 'Other') return -1;
        if (b[1] !== a[1]) return b[1] - a[1];
        return collator.compare(a[0], b[0]);
      });

      sources.forEach(([source, count], index) => {
        const displayName = source === "Other" ? "其他普通期刊" : 
          (source.charAt(0).toUpperCase() + source.slice(1));
        
        const label = document.createElement("label");
        label.className = "pp-scholar-source-item";
        label.dataset.index = String(index);
        label.dataset.source = source;

        const isNi = NATURE_INDEX_JOURNALS.includes(source.toLowerCase());

        label.innerHTML = `
          <span class="source-item-name">
            <input type="checkbox" class="pp-source-cb" value="${source}" ${state.sourceFilterState.get(source) !== false ? 'checked' : ''}> 
            ${isNi ? '<span class="pp-ni-dot" title="Nature Index 顶级期刊">●</span>' : ''}
            ${displayName}
          </span>
          <span class="pp-scholar-source-badge">${count}</span>
        `;

        const cb = label.querySelector(".pp-source-cb");
        cb.onchange = () => {
          state.sourceFilterState.set(source, cb.checked);
          applyFilters();
          savePersistedState();
        };

        itemsWrap.appendChild(label);
      });
    }

    updateFoldState();
    syncCheckboxesAndSlidersFromState();
    applyFilters();
  }

  function syncCheckboxesAndSlidersFromState() {
    const panel = document.querySelector(".pp-scholar-sidebar-panel");
    if (!panel) return;

    const citeSlider = panel.querySelector("#pp-slider-cite");
    const yearSlider = panel.querySelector("#pp-slider-year");

    if (citeSlider) {
      citeSlider.value = String(state.citeThreshold);
      panel.querySelector("#pp-val-cite").innerText = `≥ ${state.citeThreshold} 次`;
    }
    if (yearSlider) {
      const yMin = parseInt(yearSlider.min);
      const yMax = parseInt(yearSlider.max);
      if (state.yearThreshold < yMin || state.yearThreshold > yMax) {
        state.yearThreshold = yMin;
      }
      yearSlider.value = String(state.yearThreshold);
      panel.querySelector("#pp-val-year").innerText = `≥ ${state.yearThreshold} 年`;
    }

    panel.querySelectorAll(".pp-source-cb").forEach(cb => {
      cb.checked = state.sourceFilterState.get(cb.value) !== false;
    });

    const checkboxValues = Array.from(state.sourceFilterState.values());
    const allChecked = checkboxValues.length > 0 && checkboxValues.every(v => v === true);
    const toggleBtn = panel.querySelector("#pp-toggle-all");
    if (toggleBtn) {
      toggleBtn.textContent = allChecked ? "全不选" : "全选";
    }
  }

  function applyFilters() {
    const articles = getScholarArticles();
    let visibleCount = 0;
    let totalCount = 0;

    articles.forEach(card => {
      if (card.dataset.foldedAsDuplicate === "true") return;
      totalCount += 1;

      const cite = parseInt(card._ppCite !== undefined ? card._ppCite : card.dataset.cite || "0", 10);
      const year = parseInt(card._ppYear !== undefined ? card._ppYear : card.dataset.year || "0", 10);
      const venue = card._ppVenue !== undefined ? card._ppVenue : card.dataset.venue || "Other";

      const normVenue = venue.toLowerCase();
      let matchedNormName = "Other";
      for (let niName of NATURE_INDEX_JOURNALS) {
        if (normVenue.includes(niName)) {
          matchedNormName = niName;
          break;
        }
      }

      const matchCite = cite >= state.citeThreshold;
      const matchYear = year >= state.yearThreshold;
      const matchVenue = state.sourceFilterState.get(matchedNormName) !== false;

      if (matchCite && matchYear && matchVenue) {
        card.classList.remove("pp-scholar-hidden-by-filter");
        visibleCount += 1;
      } else {
        card.classList.add("pp-scholar-hidden-by-filter");
      }
    });

    const badge = document.getElementById("pp-filter-count-badge");
    if (badge) {
      if (visibleCount === totalCount) {
        badge.textContent = `已展示全部 (${totalCount})`;
        badge.classList.remove("pp-filtered");
      } else {
        badge.textContent = `保留 ${visibleCount} / ${totalCount} 篇`;
        badge.classList.add("pp-filtered");
      }
    }
  }

  // =========================================================
  // MutationObserver Bounded on Results Container
  // =========================================================
  function disconnectObserver() {
    if (state.observer) state.observer.disconnect();
    state.observerAttached = false;
    
    if (state.toolbarObserver) state.toolbarObserver.disconnect();
    state.toolbarObserverAttached = false;
  }

  function attachToolbarObserver() {
    const abContainer = getToolbar();
    if (!abContainer) return;

    // Re-target if the current observer target is no longer in the DOM
    if (state.toolbarObserverAttached && state.toolbarObserverTarget && !document.contains(state.toolbarObserverTarget)) {
      state.toolbarObserver.disconnect();
      state.toolbarObserverAttached = false;
    }

    if (state.toolbarObserverAttached) return;
    state.toolbarObserverTarget = abContainer;

    state.toolbarObserver = new MutationObserver(() => {
      if (state.isInternalUpdating) return;
      if (state.settings && state.settings.enable_sorting_filter) {
        const toolbar = document.getElementById("pp-scholar-sorting-toolbar");
        const toolbarRoot = getToolbar();
        const toolbarContainer = getToolbarMountNode();
        // If Google Scholar's client-side JS wiped it or it was deleted, restore it immediately
        if (toolbarContainer && (!toolbar || !toolbarRoot.contains(toolbar) || toolbar.parentNode !== toolbarContainer)) {
          ensureSortingToolbar();
        }
      }
    });

    state.toolbarObserver.observe(abContainer, {
      childList: true,
      subtree: true
    });
    state.toolbarObserverAttached = true;
  }

  function attachObserver() {
    const parent = getResultsContainer();
    if (!parent) return;

    if (state.observerAttached) {
      const oldParent = state.observer?._ppParent;
      if (oldParent === parent) return;
      disconnectObserver();
    }

    state.observer = new MutationObserver((mutations) => {
      if (state.isInternalUpdating) return;

      const hasMeaningfulChange = mutations.some(m => {
        if (m.type !== 'childList') return false;
        
        // Filter out mutations that are just badges, toolbars, or other plugin-injected nodes.
        // Only trigger update if a scholarly article card (gs_r) or results container itself is added/removed.
        const nodes = Array.from(m.addedNodes).concat(Array.from(m.removedNodes));
        return nodes.some(node => {
          if (node.nodeType !== 1) return false;
          return node.classList.contains("gs_r") || 
                 node.querySelector?.(".gs_r") || 
                 node.id === "gs_res_ccl_mid";
        });
      });

      if (!hasMeaningfulChange) return;
      debounceRefresh(false);
    });

    state.observer.observe(parent, {
      childList: true,
      subtree: true
    });

    state.observer._ppParent = parent;
    state.observerAttached = true;

    // Also attach toolbar observer to prevent timing issues on dynamic pages
    attachToolbarObserver();
  }

  // =========================================================
  // Route Changes
  // =========================================================
  function handleRouteChange() {
    const newUrl = location.href;
    const newQueryKey = getQueryKey();

    if (newUrl === state.lastUrl && newQueryKey === state.lastQueryKey) return;

    state.lastUrl = newUrl;
    state.lastQueryKey = newQueryKey;
    state.lastResultSetKey = '';
    state.lastArticleSignature = '';
    state.lastSourceSignature = '';

    loadPersistedState();

    setTimeout(() => {
      if (state.settings && state.settings.enable_sorting_filter) {
        ensureSortingToolbar();
      }
      debounceRefresh(true);
    }, 120);
  }

  function hookRouteChanges() {
    if (state.routeHooked) return;
    state.routeHooked = true;

    const dispatchRouteChange = () => {
      window.dispatchEvent(new Event('pp:routechange'));
    };

    ['pushState', 'replaceState'].forEach(method => {
      const raw = history[method];
      if (typeof raw !== 'function') return;

      history[method] = function () {
        const result = raw.apply(this, arguments);
        setTimeout(dispatchRouteChange, 0);
        return result;
      };
    });

    window.addEventListener('popstate', dispatchRouteChange);
    window.addEventListener('hashchange', dispatchRouteChange);
    window.addEventListener('pp:routechange', handleRouteChange);
  }

  function startUrlFallbackWatcher() {
    if (state.urlWatchTimer) return;

    state.urlWatchTimer = setInterval(() => {
      if (location.href !== state.lastUrl || getQueryKey() !== state.lastQueryKey) {
        handleRouteChange();
      }
    }, 1200);
  }

  // =========================================================
  // Trusted academic metrics display state.
  // =========================================================
  function getJournalMetrics(venue, year, citations) {
    const venueLower = (venue || "").toLowerCase();
    if (venueLower.includes("arxiv") || venueLower.includes("biorxiv") || venueLower.includes("medrxiv") || venueLower.includes("chemrxiv") || venueLower.includes("preprint")) {
      return { ifVal: "Preprint", cas: "预印本", jcr: "N/A", isPreprint: true, metricsSource: "page" };
    }

    return { ifVal: "查询中", cas: "查询中", jcr: "查询中", isPreprint: false, metricsSource: "easyScholar" };
  }

  // =========================================================
  // PaperPilot Core DOM Enhancement Engine
  // =========================================================
  function enhanceGoogleScholar(settings) {
    const results = getScholarArticles();
    if (results.length === 0) return;

    parsedPapers = [];

    results.forEach((card, index) => {
      // Ensure dataset.ppDefaultOrder is saved on the very first pass
      if (!card.dataset.ppDefaultOrder) {
        card.dataset.ppDefaultOrder = String(index);
      }

      // Avoid double-processing
      if (card.dataset.ppEnhanced) return;
      card.dataset.ppEnhanced = "true";

      // 1. Extract Title & main link
      const titleEl = card.querySelector(".gs_rt");
      if (!titleEl) return;
      const titleText = titleEl.innerText.replace(/\[[A-Z]+\]/g, "").trim();
      const titleLinkEl = titleEl.querySelector("a");
      const titleLink = titleLinkEl ? titleLinkEl.href : "";

      // 2. Extract Authors, Venue and Year from .gs_a
      const authorLineEl = card.querySelector(".gs_a");
      let authors = [];
      let venue = "Other";
      let year = new Date().getFullYear();

      if (authorLineEl) {
        const authorText = authorLineEl.innerText;
        
        const yearMatch = authorText.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[0]);
        }

        const chunks = authorText.split(/\s*-\s*/);
        if (chunks.length > 0) {
          authors = chunks[0].split(",").map(a => a.trim());
        }
        if (chunks.length > 1) {
          const venuePart = chunks[1];
          const venueCleaned = venuePart.replace(/\b(19|20)\d{2}\b/, "").replace(/,/g, "").trim();
          if (venueCleaned) {
            venue = venueCleaned;
          } else {
            venue = venuePart.trim();
          }
        }
      }

      // 3. Extract Citations count
      let citations = 0;
      const footerLinks = card.querySelectorAll(".gs_fl a");
      let citeLink = "";
      footerLinks.forEach(link => {
        const text = link.innerText;
        const href = link.href || "";
        
        if (href.includes("cites=") || href.includes("scholar?cites=")) {
          citeLink = href;
          const digitMatch = text.match(/\d+/);
          if (digitMatch) {
            citations = parseInt(digitMatch[0]);
          }
        }
      });

      // 4. Extract PDF Direct Links if present
      const ggsEl = card.querySelector(".gs_ggs a");
      let pdfUrl = ggsEl ? ggsEl.href : "";

      // 5. Store parsed metrics on card datasets
      card.dataset.cite = citations;
      card.dataset.year = year;
      card.dataset.venue = venue;
      card.dataset.title = titleText;

      // Direct JS properties caching for 100x faster reads
      card._ppCite = citations;
      card._ppYear = year;
      card._ppVenue = venue;
      card._ppTitle = titleText;

      // 6. Highlight Nature Index Papers
      let isNatureIndex = false;
      const cleanNormVenue = venue.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
      for (const niJournal of NATURE_INDEX_JOURNALS) {
        const cleanNiJournal = niJournal.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
        if (cleanNormVenue.includes(cleanNiJournal) || cleanNiJournal.includes(cleanNormVenue)) {
          isNatureIndex = true;
          break;
        }
      }

      // Inject Badges Container if enabled
      if (settings.enable_badges) {
        let badgeContainer = card.querySelector(".pp-scholar-badge-container");
        if (!badgeContainer) {
          badgeContainer = document.createElement("div");
          badgeContainer.className = "pp-scholar-badge-container";
          badgeContainer.onclick = (e) => e.stopPropagation();
          titleEl.appendChild(badgeContainer);
        }

        if (isNatureIndex && settings.enable_ni) {
          card.classList.add("pp-scholar-ni-card");
          const niBadge = document.createElement("span");
          niBadge.className = "pp-scholar-badge pp-scholar-badge-ni";
          niBadge.innerText = "NI / 自然指数";
          badgeContainer.appendChild(niBadge);
        }

        // Inject High-Precision Partition and IF Badges
        let ifBadge = null;
        let casBadge = null;
        let jcrBadge = null;

        const shouldShowMetrics = settings.enable_metrics_display &&
          (settings.enable_metrics_auto_detect === false || Boolean(settings.easyscholar_key));

        if (shouldShowMetrics) {
          const metrics = getJournalMetrics(venue, year, citations);
          if (metrics.isPreprint) {
            const preprintBadge = document.createElement("span");
            preprintBadge.className = "pp-scholar-badge pp-scholar-badge-preprint";
            preprintBadge.innerText = "Preprint / 预印本";
            badgeContainer.appendChild(preprintBadge);
          } else {
            // IF badge
            if (settings.enable_if_badge !== false) {
              ifBadge = document.createElement("span");
              ifBadge.className = "pp-scholar-badge pp-scholar-badge-if";
              const val = document.createElement("span");
              val.className = "pp-val";
              val.textContent = `IF: ${metrics.ifVal}`;
              ifBadge.appendChild(val);
              badgeContainer.appendChild(ifBadge);
            }

            // CAS Partition badge
            if (settings.enable_cas_badge !== false) {
              casBadge = document.createElement("span");
              let casClass = "pp-scholar-badge-cas-4";
              if (metrics.cas === "1区") casClass = "pp-scholar-badge-cas-1";
              else if (metrics.cas === "2区") casClass = "pp-scholar-badge-cas-2";
              else if (metrics.cas === "3区") casClass = "pp-scholar-badge-cas-3";

              casBadge.className = `pp-scholar-badge pp-scholar-badge-cas ${casClass}`;
              const val = document.createElement("span");
              val.className = "pp-val";
              val.textContent = `中科院${metrics.cas}`;
              casBadge.appendChild(val);
              badgeContainer.appendChild(casBadge);
            }

            // JCR Partition badge
            if (settings.enable_jcr_badge !== false) {
              jcrBadge = document.createElement("span");
              let jcrClass = "pp-scholar-badge-jcr-4";
              if (metrics.jcr === "Q1") jcrClass = "pp-scholar-badge-jcr-1";
              else if (metrics.jcr === "Q2") jcrClass = "pp-scholar-badge-jcr-2";
              else if (metrics.jcr === "Q3") jcrClass = "pp-scholar-badge-jcr-3";

              jcrBadge.className = `pp-scholar-badge pp-scholar-badge-jcr ${jcrClass}`;
              const val = document.createElement("span");
              val.className = "pp-val";
              val.textContent = `JCR ${metrics.jcr}`;
              jcrBadge.appendChild(val);
              badgeContainer.appendChild(jcrBadge);
            }

            // Async easyScholar integration (Robust & Defensively Guarded)
            if (settings.easyscholar_key && venue && venue !== "Other") {
              safeSendMessage({
                action: "FETCH_EASYSCHOLAR",
                journal: venue
              }, (response) => {
                if (response && response.success && response.data) {
                  const data = response.data;
                  
                  // Defend against elements being removed or updated in the DOM asynchronously
                  if (!card.parentNode) return;
                  const freshBadgeContainer = card.querySelector(".pp-scholar-badge-container");
                  if (!freshBadgeContainer) return;

                  if (data.sciif && ifBadge && ifBadge.parentNode) {
                    const valEl = ifBadge.querySelector(".pp-val");
                    if (valEl) valEl.innerText = `IF: ${data.sciif}`;
                    const est = ifBadge.querySelector(".pp-est");
                    if (est) est.remove();
                  }
                  if (data.sciUp && casBadge && casBadge.parentNode) {
                    const valEl = casBadge.querySelector(".pp-val");
                    if (valEl) valEl.innerText = `中科院${data.sciUp}`;
                    const est = casBadge.querySelector(".pp-est");
                    if (est) est.remove();

                    // Update CAS Class
                    casBadge.className = casBadge.className.replace(/pp-scholar-badge-cas-\d/, "");
                    let newCasClass = "pp-scholar-badge-cas-4";
                    if (data.sciUp.includes("1区")) newCasClass = "pp-scholar-badge-cas-1";
                    else if (data.sciUp.includes("2区")) newCasClass = "pp-scholar-badge-cas-2";
                    else if (data.sciUp.includes("3区")) newCasClass = "pp-scholar-badge-cas-3";
                    casBadge.classList.add(newCasClass);
                  }
                  if (data.sci && jcrBadge && jcrBadge.parentNode) {
                    let quartileVal = String(data.sci);
                    if (quartileVal.match(/^\d+$/)) quartileVal = `Q${quartileVal}`;

                    const valEl = jcrBadge.querySelector(".pp-val");
                    if (valEl) valEl.innerText = `JCR ${quartileVal}`;
                    const est = jcrBadge.querySelector(".pp-est");
                    if (est) est.remove();

                    // Update JCR Class
                    jcrBadge.className = jcrBadge.className.replace(/pp-scholar-badge-jcr-\d/, "");
                    let newJcrClass = "pp-scholar-badge-jcr-4";
                    if (quartileVal.includes("Q1")) newJcrClass = "pp-scholar-badge-jcr-1";
                    else if (quartileVal.includes("Q2")) newJcrClass = "pp-scholar-badge-jcr-2";
                    else if (quartileVal.includes("Q3")) newJcrClass = "pp-scholar-badge-jcr-3";
                    jcrBadge.classList.add(newJcrClass);
                  }

                  const refBadge = freshBadgeContainer.querySelector(".pp-scholar-badge-cite");

                  // 1. CCF Badge
                  if (data.ccf && settings.enable_ccf_badge !== false) {
                    let ccfBadge = freshBadgeContainer.querySelector(".pp-scholar-badge-ccf");
                    if (!ccfBadge) {
                      ccfBadge = document.createElement("span");
                      ccfBadge.className = "pp-scholar-badge pp-scholar-badge-ccf";
                      freshBadgeContainer.insertBefore(ccfBadge, refBadge);
                    }
                    ccfBadge.innerText = `CCF ${data.ccf}`;
                  }

                  // 2. CSSCI / PKU core Badge
                  if ((data.cssci || data.pku) && settings.enable_core_badge !== false) {
                    let coreBadge = freshBadgeContainer.querySelector(".pp-scholar-badge-core");
                    if (!coreBadge) {
                      coreBadge = document.createElement("span");
                      coreBadge.className = "pp-scholar-badge pp-scholar-badge-core";
                      freshBadgeContainer.insertBefore(coreBadge, refBadge);
                    }
                    const cores = [];
                    if (data.cssci) cores.push("南大核心");
                    if (data.pku) cores.push("北大核心");
                    coreBadge.innerText = cores.join(" / ");
                  }

                  // 3. SCI Warning Badge
                  if (data.sciwarn && settings.enable_warn_badge !== false) {
                    let warnBadge = freshBadgeContainer.querySelector(".pp-scholar-badge-warn");
                    if (!warnBadge) {
                      warnBadge = document.createElement("span");
                      warnBadge.className = "pp-scholar-badge pp-scholar-badge-warn";
                      freshBadgeContainer.insertBefore(warnBadge, refBadge);
                    }
                    warnBadge.innerText = `预警: ${data.sciwarn}`;
                  }
                }
              });
            }
          }
        }

        // Inject Citation Badge
        if (settings.enable_cite_badge !== false) {
          const citeBadge = document.createElement("span");
          citeBadge.className = "pp-scholar-badge pp-scholar-badge-cite";
          citeBadge.innerText = `被引: ${citations}`;
          badgeContainer.appendChild(citeBadge);
        }

      } else {
        if (isNatureIndex && settings.enable_ni) {
          card.classList.add("pp-scholar-ni-card");
        }
      }

      // 7. Inject Action Toolbars
      injectActionBar(card, {
        title: titleText,
        authors: authors,
        venue: venue,
        year: year,
        citations: citations,
        pdfUrl: pdfUrl,
        scholarUrl: titleLink,
        citeLink: citeLink
      }, settings);

      parsedPapers.push({
        el: card,
        title: titleText,
        citations: citations,
        year: year,
        venue: venue,
        isNatureIndex: isNatureIndex
      });
    });

    // 8. Run Levenshtein Title Clustering for de-duplication
    if (settings.enable_dedup) {
      runDuplicateClustering();
    }
  }

  // Inject Action Toolbars
  function injectActionBar(card, paper, settings) {
    const actionBar = document.createElement("div");
    actionBar.className = "pp-scholar-action-bar";
    actionBar.setAttribute("data-pp-theme", currentTheme);

    // 0. Direct PDF download when Google Scholar exposes a PDF-like link
    if (settings.enable_pdf_download_btn !== false && paper.pdfUrl) {
      const pdfBtn = document.createElement("button");
      pdfBtn.className = "pp-scholar-action-btn";
      pdfBtn.innerHTML = `${window.PP_ICONS.download} 下载 PDF`;
      pdfBtn.onclick = () => {
        const firstAuthor = paper.authors.length > 0 ? paper.authors[0] : "Unknown";
        const cleanName = `[${paper.venue || "Scholar"}] ${firstAuthor} - ${paper.title}`
          .replace(/[\/\\:*?"<>|]/g, "_")
          .substring(0, 100) + ".pdf";

        showToast("正在快速创建 PDF 下载任务...");
        safeSendMessage({
          action: "DOWNLOAD_PDF",
          url: paper.pdfUrl,
          urls: [
            { url: paper.pdfUrl, source: "scholar-pdf-link", reason: "Scholar exposed a direct PDF link", score: 96 },
            paper.scholarUrl ? { url: paper.scholarUrl, source: "scholar-landing", reason: "Scholar result landing page", score: 60 } : null
          ].filter(Boolean),
          filename: cleanName
        }, (response) => {
          if (response && response.success) {
            showToast("PDF 下载任务已创建");
            safeSendMessage({
              action: "ADD_FOOTPRINT",
              footprint: {
                title: paper.title,
                authors: paper.authors,
                journal: paper.venue,
                year: paper.year,
                pdfUrl: paper.pdfUrl,
                status: "downloaded"
              }
            });
          } else {
            showToast(`PDF 下载失败：${response?.error || response?.errorCode || "未确认正文 PDF"}`);
          }
        });
      };
      actionBar.appendChild(pdfBtn);
    }

    // 1. BibTeX
    if (settings.enable_bibtex_btn) {
      const bibBtn = document.createElement("button");
      bibBtn.className = "pp-scholar-action-btn";
      bibBtn.innerHTML = `${window.PP_ICONS.cite} 一键 BibTeX`;
      bibBtn.onclick = () => {
        const firstAuthorSurname = paper.authors.length > 0 ? 
          paper.authors[0].split(/\s+/).pop().replace(/[^a-zA-Z]/g, "") : "Unknown";
        const citationKey = `${firstAuthorSurname}${paper.year}${paper.title.split(/\s+/)[0].replace(/[^a-zA-Z]/g, "")}`;
        const bibText = `@article{${citationKey},\n` +
          `  title={${paper.title}},\n` +
          `  author={${paper.authors.join(" and ")}},\n` +
          `  journal={${paper.venue}},\n` +
          `  year={${paper.year}}\n` +
          `}`;
        
        robustCopyToClipboard(bibText).then(() => {
          showToast("BibTeX 已复制并完成本地格式化清洗！");
          safeSendMessage({
            action: "ADD_FOOTPRINT",
            footprint: {
              title: paper.title,
              authors: paper.authors,
              journal: paper.venue,
              year: paper.year,
              pdfUrl: paper.pdfUrl,
              status: "copied_bibtex"
            }
          });
        });
      };
      actionBar.appendChild(bibBtn);
    }

    // 2. Copy DOI
    if (settings.enable_scholar_copy_doi_btn) {
      const doiBtn = document.createElement("button");
      doiBtn.className = "pp-scholar-action-btn";
      doiBtn.innerHTML = `${window.PP_ICONS.copy} 复制 DOI`;
      doiBtn.onclick = () => {
        showToast("正在后台库检索并解析 DOI...");
        safeSendMessage({
          action: "FETCH_METADATA",
          title: paper.title
        }, (response) => {
          let textToCopy = "";
          let toastMsg = "";

          if (response && response.success && response.data && response.data.doi) {
            textToCopy = response.data.doi;
            toastMsg = `DOI 已复制: ${textToCopy}`;
            safeSendMessage({
              action: "ADD_FOOTPRINT",
              footprint: {
                title: paper.title,
                authors: paper.authors,
                journal: response.data.journal || paper.venue,
                year: response.data.year || paper.year,
                doi: textToCopy,
                pdfUrl: response.data.pdfUrl || paper.pdfUrl,
                status: "visited"
              }
            });
          } else {
            textToCopy = `${paper.authors.join(", ")}. ${paper.title} (${paper.year}).`;
            toastMsg = "未匹配到该文献的 DOI，已将标题与引用复制到剪贴板！";
          }

          robustCopyToClipboard(textToCopy).then(() => {
            showToast(toastMsg);
            const originalHTML = doiBtn.innerHTML;
            doiBtn.innerHTML = `${window.PP_ICONS.check} 已复制`;
            doiBtn.style.color = "#2dd4bf";
            setTimeout(() => {
              doiBtn.innerHTML = originalHTML;
              doiBtn.style.color = "";
            }, 1800);
          }).catch(() => {
            showToast("复制失败，请手动选择复制！");
          });
        });
      };
      actionBar.appendChild(doiBtn);
    }

    // 3. Markdown Note
    if (settings.enable_markdown_note) {
      const mdBtn = document.createElement("button");
      mdBtn.className = "pp-scholar-action-btn";
      mdBtn.innerHTML = `${window.PP_ICONS.markdown} 复制笔记 [MD]`;
      mdBtn.onclick = () => {
        const mdContent = `### 文献笔记：${paper.title}\n` +
          `- **作者**：${paper.authors.slice(0, 4).join(", ")}${paper.authors.length > 4 ? " 等" : ""}\n` +
          `- **发表期刊**：*${paper.venue}* (${paper.year})\n` +
          `- **引用量**：${paper.citations} 次\n` +
          `- **直链 PDF**：${paper.pdfUrl || "无直接 PDF"}\n` +
          `- **检索来源**：[谷歌学术](${paper.scholarUrl})\n\n` +
          `> **学术观点/研究方法/创新点**:\n` +
          `- \n`;
          
        robustCopyToClipboard(mdContent).then(() => {
          showToast("Markdown 笔记模板已复制到您的剪贴板！");
        });
      };
      actionBar.appendChild(mdBtn);
    }

    // 4. Star / Favorite Button directly in Scholar search results
    const starBtn = document.createElement("button");
    starBtn.className = "pp-scholar-action-btn pp-scholar-star-btn";
    starBtn.innerHTML = `⭐ 收藏`;
    starBtn.title = "将此论文加入精选文献收藏";
    starBtn.onclick = () => {
      safeSendMessage({
        action: "ADD_FOOTPRINT",
        footprint: {
          title: paper.title,
          authors: paper.authors,
          journal: paper.venue,
          year: paper.year,
          pdfUrl: paper.pdfUrl,
          starred: true,
          status: "visited"
        }
      }, (response) => {
        showToast("已成功将该文献加入精选收藏！");
        starBtn.innerHTML = `⭐ 已收藏`;
        starBtn.style.color = "#f59e0b";
      });
    };
    actionBar.appendChild(starBtn);

    if (actionBar.children.length > 0) {
      card.appendChild(actionBar);
    }
  }

  // Duplicate Clustering
  function runDuplicateClustering() {
    // 1. Skip already-folded duplicate items to avoid redundant work in infinite scrolling
    const cards = getScholarArticles().filter(c => c.dataset.foldedAsDuplicate !== "true");
    if (cards.length === 0) return;

    const clusters = [];
    const processed = new Set();

    for (let i = 0; i < cards.length; i++) {
      if (processed.has(i)) continue;
      
      const t1 = cards[i]._ppTitle || cards[i].dataset.title;
      if (!t1) continue;

      const cluster = [i];
      processed.add(i);

      for (let j = i + 1; j < cards.length; j++) {
        if (processed.has(j)) continue;
        const t2 = cards[j]._ppTitle || cards[j].dataset.title;
        if (!t2) continue;

        // 2. Length-difference fast filter: If the titles have a length difference > 18%,
        // their Levenshtein similarity cannot possibly exceed 0.82. Skip immediately to save 90% cpu cycles!
        const len1 = t1.length;
        const len2 = t2.length;
        const maxLen = Math.max(len1, len2);
        const minLen = Math.min(len1, len2);
        if (maxLen > 0 && (maxLen - minLen) / maxLen > 0.18) {
          continue;
        }

        const sim = getStringSimilarity(t1, t2);
        if (sim > 0.82) {
          cluster.push(j);
          processed.add(j);
        }
      }
      clusters.push(cluster);
    }

    clusters.forEach(cluster => {
      if (cluster.length <= 1) return;

      let primaryIndex = cluster[0];
      let maxScore = -1;

      cluster.forEach(idx => {
        const card = cards[idx];
        const isNi = card.classList.contains("pp-scholar-ni-card");
        const cites = parseInt(card._ppCite !== undefined ? card._ppCite : card.dataset.cite || "0", 10);
        const score = cites + (isNi ? 1000 : 0);
        if (score > maxScore) {
          maxScore = score;
          primaryIndex = idx;
        }
      });

      const primaryCard = cards[primaryIndex];
      const duplicates = cluster.filter(idx => idx !== primaryIndex);

      let dupContainer = primaryCard.querySelector(".pp-scholar-dup-container");
      let dupBody;
      let dupHeader;

      if (!dupContainer) {
        dupContainer = document.createElement("div");
        dupContainer.className = "pp-scholar-dup-container";
        dupContainer.setAttribute("data-pp-theme", currentTheme);
        
        dupHeader = document.createElement("div");
        dupHeader.className = "pp-scholar-dup-header";
        dupContainer.appendChild(dupHeader);

        dupBody = document.createElement("div");
        dupBody.className = "pp-scholar-dup-body";
        dupContainer.appendChild(dupBody);
        
        dupHeader.onclick = (e) => {
          e.stopPropagation();
          const isExpanded = dupBody.classList.toggle("pp-expanded");
          dupHeader.querySelector("span:last-child").innerText = isExpanded ? "关闭 ▲" : "展开 ▼";
        };

        primaryCard.appendChild(dupContainer);
      } else {
        dupBody = dupContainer.querySelector(".pp-scholar-dup-body");
        dupHeader = dupContainer.querySelector(".pp-scholar-dup-header");
      }

      // Append newly identified duplicates to primary card's duplicate drawer
      duplicates.forEach(idx => {
        const dupCard = cards[idx];
        const title = dupCard._ppTitle || dupCard.dataset.title;
        const venue = dupCard._ppVenue || dupCard.dataset.venue;
        const year = dupCard._ppYear || dupCard.dataset.year;
        const cites = dupCard._ppCite !== undefined ? dupCard._ppCite : dupCard.dataset.cite || "0";

        // Avoid adding duplicate rows if already present (e.g. from previous runs)
        const dupCardHref = dupCard.querySelector(".gs_rt a")?.href || '';
        const escapedDupHref = dupCardHref && window.CSS?.escape ? CSS.escape(dupCardHref) : "";
        const duplicateAlreadyListed = escapedDupHref
          ? dupBody.querySelector(`a[href="${escapedDupHref}"]`)
          : Array.from(dupBody.querySelectorAll("a[href]")).some(link => link.href === dupCardHref);
        if (dupCardHref && duplicateAlreadyListed) {
          dupCard.style.display = "none";
          dupCard.dataset.foldedAsDuplicate = "true";
          return;
        }

        const row = document.createElement("div");
        const meta = document.createElement("strong");
        meta.textContent = `[${venue}, ${year}年, 被引 ${cites}次]`;
        const link = document.createElement("a");
        link.href = dupCardHref || "#";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.color = "#0f6d5f";
        link.style.textDecoration = "underline";
        link.textContent = title || "Untitled";
        row.appendChild(meta);
        row.appendChild(document.createElement("br"));
        row.appendChild(link);
        dupBody.appendChild(row);

        dupCard.style.display = "none";
        dupCard.dataset.foldedAsDuplicate = "true";
      });

      // Update total dynamic duplicates count inside header
      const totalDups = dupBody.children.length;
      const isExpanded = dupBody.classList.contains("pp-expanded");
      dupHeader.textContent = "";
      const headerTitle = document.createElement("span");
      headerTitle.textContent = `已智能折叠另外 ${totalDups} 个重复条目 (预印本/会议版)`;
      const headerToggle = document.createElement("span");
      headerToggle.textContent = isExpanded ? "关闭 ▲" : "展开 ▼";
      dupHeader.appendChild(headerTitle);
      dupHeader.appendChild(headerToggle);
    });
  }

  function getStringSimilarity(s1, s2) {
    let longer = s1.toLowerCase().trim();
    let shorter = s2.toLowerCase().trim();
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    const longerLength = longer.length;
    if (longerLength === 0) {
      return 1.0;
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
  }

  function editDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }
    return costs[s2.length];
  }

  // Toast
  function showToast(message) {
    let toast = document.querySelector(".pp-scholar-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "pp-scholar-toast";
      toast.setAttribute("data-pp-theme", currentTheme);
      toast.innerHTML = `${window.PP_ICONS.check} <span class="pp-scholar-toast-msg"></span>`;
      document.body.appendChild(toast);
    } else {
      toast.setAttribute("data-pp-theme", currentTheme);
    }
    toast.querySelector(".pp-scholar-toast-msg").innerText = message;
    
    setTimeout(() => toast.classList.add("pp-show"), 10);
    setTimeout(() => {
      toast.classList.remove("pp-show");
    }, 2500);
  }

  // Clipboard Copiers
  function robustCopyToClipboard(text) {
    return new Promise((resolve, reject) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve).catch(() => {
          fallbackCopy(text) ? resolve() : reject();
        });
      } else {
        fallbackCopy(text) ? resolve() : reject();
      }
    });
  }

  function fallbackCopy(text) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch (e) {
      return false;
    }
  }

  function safeSendMessage(message, callback) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
        if (callback) callback({ success: false, error: "Extension context invalidated" });
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          if (callback) callback({ success: false, error: err.message });
        } else {
          if (callback) callback(response);
        }
      });
    } catch (e) {
      if (callback) callback({ success: false, error: e.message || "Message error" });
    }
  }

  function getCurrentPageDiagnostics() {
    const articles = getScholarArticles();
    return {
      ok: true,
      data: {
        pageType: "scholar",
        url: window.location.href,
        profileId: "scholar",
        doi: "",
        title: document.title || "Scholar search",
        journal: "",
        pdfCandidateCount: articles.filter(card => card.querySelector(".gs_ggs a")).length,
        firstPdfSource: "scholar-result",
        firstPdfUrl: articles.map(card => card.querySelector(".gs_ggs a")?.href || "").find(Boolean) || "",
        fastDownload: false,
        resultCount: articles.length,
        enhancedCount: articles.filter(card => card.dataset.ppEnhanced === "true").length,
        lastError: "",
        metricsSource: state.settings?.easyscholar_key ? "easyScholar" : "未配置数据源",
        cachedAt: null,
        stale: false
      },
      source: "content/scholar",
      cachedAt: Date.now()
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const action = message?.action || message?.type;
    if (action === "diagnostics.currentPage") {
      sendResponse(getCurrentPageDiagnostics());
      return false;
    }
    return false;
  });

  // =========================================================
  // Initializer Sequence
  // =========================================================
  function init() {
    if (!isScholarPage()) return;

    hookRouteChanges();
    startUrlFallbackWatcher();

    state.lastUrl = location.href;
    state.lastQueryKey = getQueryKey();
    loadPersistedState();

    fetchSettingsAndRun(() => {
      if (state.settings.enable_sorting_filter) {
        ensureSortingToolbar();
        startToolbarWatchdog();
      }
      const ok = processAllArticles(true, false);
      attachObserver();

      if (!ok) {
        state.initRetryCount += 1;
        if (state.initRetryCount <= 25) {
          setTimeout(init, 250);
          return;
        }
        return;
      }

      state.initialized = true;
    });
  }

  // Reactive settings listener
  chrome.storage.onChanged.addListener((changes) => {
    const keysChanged = Object.keys(changes).some(k => SETTINGS_KEYS.includes(k));
    if (keysChanged) {
      const oldPanel = document.querySelector(".pp-scholar-sidebar-panel");
      if (oldPanel) oldPanel.remove();
      
      const oldToolbar = document.getElementById("pp-scholar-sorting-toolbar");
      if (oldToolbar) oldToolbar.remove();

      document.querySelectorAll(".gs_r.gs_or.gs_scl").forEach(card => {
        delete card.dataset.ppEnhanced;
        card.classList.remove("pp-scholar-ni-card");
        card.classList.remove("pp-scholar-hidden-by-filter");
        card.style.order = "";
        
        const badges = card.querySelector(".pp-scholar-badge-container");
        if (badges) badges.remove();
        
        const actionBar = card.querySelector(".pp-scholar-action-bar");
        if (actionBar) actionBar.remove();
        
        const dupContainer = card.querySelector(".pp-scholar-dup-container");
        if (dupContainer) dupContainer.remove();
      });

      state.lastResultSetKey = '';
      state.lastArticleSignature = '';
      state.lastSourceSignature = '';

      fetchSettingsAndRun(() => {
        if (state.settings.enable_sorting_filter) {
          ensureSortingToolbar();
          startToolbarWatchdog();
        }
        refreshPage(true);
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

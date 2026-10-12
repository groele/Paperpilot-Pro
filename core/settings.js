(function(global) {
  const root = global.PaperPilotCore || {};
  // One flat settings contract for fresh installs, read fallbacks and presets.
  const DEFAULTS = Object.freeze({
    "auto_redirect": false,
    "pdf_download_save_as": false,
    "appearance_mode": "light",
    "enable_ni": true,
    "enable_sorting_filter": true,
    "enable_dedup": true,
    "enable_badges": true,
    "enable_metacard": true,
    "enable_markdown_note": true,
    "enable_metrics_display": false,
    "enable_metrics_auto_detect": false,
    "enable_bibtex_btn": true,
    "enable_scholar_copy_doi_btn": true,
    "enable_scholar_copy_gbt_btn": true,
    "enable_scholar_star_btn": true,
    "enable_journal_copy_doi_btn": true,
    "enable_journal_citation_tools": false,
    "enable_journal_copy_gbt_btn": true,
    "enable_journal_copy_bib_btn": true,
    "enable_journal_open_landing_btn": true,
    "enable_pdf_download_btn": false,
    "enable_ai_summary_btn": false,
    "enable_easyscholar": false,
    "enable_ccf_badge": true,
    "enable_core_badge": true,
    "enable_warn_badge": true,
    "enable_if_badge": true,
    "enable_cas_badge": true,
    "enable_jcr_badge": true,
    "enable_cite_badge": true,
    "enable_pdf_badge": true,
    "metacard_pinned": false,
    "enable_footprint_heatmap": true,
    "enable_footprint_stats": true,
    "enable_page_diagnostics": false,
    "enable_footprint_quick_filters": true,
    "enable_footprint_gbt_btn": true,
    "enable_footprint_bib_btn": true,
    "enable_footprint_star_btn": true,
    "overview_collapsed": true
});
  function value(key, stored) {
    const fallback = DEFAULTS[key];
    if (key === "appearance_mode" && !["system", "light", "dark", "violet", "cyan", "amber"].includes(stored)) return fallback;
    if (stored === undefined || (typeof fallback === "boolean" && typeof stored !== "boolean")) return fallback;
    return stored;
  }
  function withDefaults(stored = {}) {
    const result = {...DEFAULTS};
    for (const [key, storedValue] of Object.entries(stored || {})) result[key] = value(key, storedValue);
    return result;
  }
  function preset(name) {
    const base = {...DEFAULTS};
    // Toolbar disclosure is a separate layout preference, not a feature preset.
    delete base.overview_collapsed;
    if (name === "recommended" || name === "reset") return base;
    delete base.appearance_mode;
    delete base.metacard_pinned;
    delete base.enable_easyscholar;
    if (name === "minimal") return {...base, enable_sorting_filter:false, enable_markdown_note:false, enable_bibtex_btn:false, enable_scholar_copy_gbt_btn:false, enable_footprint_heatmap:false, enable_footprint_stats:false};
    if (name === "expert") return {...base, enable_metrics_display:true, enable_metrics_auto_detect:true, enable_journal_citation_tools:true, enable_pdf_download_btn:true, enable_ai_summary_btn:true, enable_page_diagnostics:true};
    return null;
  }
  root.settings = {DEFAULTS, value, withDefaults, preset};
  global.PaperPilotCore = root;
})(globalThis);

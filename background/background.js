try {
  importScripts(
    "../core/messaging.js",
    "../core/cache.js",
    "../core/sanitize.js",
    "../core/metadata.js",
    "../core/site-profiles.js",
    "../core/pdf.js",
    "../core/pdf-verifier.js",
    "../core/ai.js",
    "../core/citation.js",
    "page-activation.js"
  );
} catch (err) {
  console.warn("PaperPilot Pro: core modules could not be loaded", err);
}

const PP_CORE = globalThis.PaperPilotCore || {};
const PP_BACKGROUND = globalThis.PaperPilotBackground || {};

/**
 * PaperPilot Pro - Service Worker (background.js)
 * Handles CORS-free API calls, PDF verification, and footprint history management.
 */

function withMessageDuration(source, handler) {
  const start = Date.now();
  return Promise.resolve()
    .then(handler)
    .then(result => ({
      ...(result || {}),
      ok: result?.ok !== undefined ? result.ok : Boolean(result?.success || result?.valid),
      success: result?.success !== undefined ? result.success : Boolean(result?.ok || result?.valid),
      source: result?.source || source,
      durationMs: result?.durationMs ?? (Date.now() - start),
      diagnostics: result?.diagnostics || null
    }))
    .catch(error => ({
      ok: false,
      success: false,
      errorCode: "UNHANDLED_ERROR",
      error: error.message || String(error),
      source,
      durationMs: Date.now() - start,
      diagnostics: null
    }));
}

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get([
      "auto_redirect",
      "pdf_download_save_as",
      "pdf_naming",
      "pdf_download_dir",
      "ai_provider",
      "ai_model",
      "ai_base_url",
      "ai_api_key",
      "ai_prompt",
      "history",
      "pdf_cache",
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
      "pdf_landing_cache",
      "enable_pdf_download_btn",
      "enable_ai_summary_btn",
      "easyscholar_key",
      "easyscholar_cache",
      "enable_ccf_badge",
      "enable_core_badge",
      "enable_warn_badge",
      "enable_if_badge",
      "enable_cas_badge",
      "enable_jcr_badge",
      "enable_cite_badge",
      "enable_pdf_badge",
      "metacard_pinned"
    ], (result) => {
      const defaults = {
        auto_redirect: false,
        pdf_download_save_as: false,
        pdf_naming: "1", // "[{Journal}] {Author} - {Title}"
        pdf_download_dir: "PaperPilot Pro",
        ai_provider: "openai",
        ai_model: "gpt-4o-mini",
        ai_base_url: "https://api.openai.com/v1",
        ai_api_key: "",
        ai_prompt: "请用中文以3行精简要点总结以下学术论文摘要，以TL;DR形式呈现：",
        history: [],
        pdf_cache: {},
        appearance_mode: "system",
        enable_ni: true,
        enable_dedup: true,
        enable_sorting_filter: true,
        enable_badges: true,
        enable_metacard: true,
        enable_markdown_note: true,
        enable_metrics_display: true,
        enable_metrics_auto_detect: true,
        enable_bibtex_btn: true,
        enable_scholar_copy_doi_btn: true,
        enable_journal_copy_doi_btn: true,
        pdf_landing_cache: {},
        enable_pdf_download_btn: true,
        enable_ai_summary_btn: true,
        easyscholar_key: "",
        easyscholar_cache: {},
        enable_ccf_badge: true,
        enable_core_badge: true,
        enable_warn_badge: true,
        enable_if_badge: true,
        enable_cas_badge: true,
        enable_jcr_badge: true,
        enable_cite_badge: true,
        enable_pdf_badge: true,
        metacard_pinned: false
      };

    const updates = {};
    for (const key in defaults) {
      if (result[key] === undefined) {
        updates[key] = defaults[key];
      }
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        console.log("PaperPilot Pro: Default settings initialized.", updates);
      });
    }
  });
});

// Listener for messages from Content Scripts (scholar.js & journal.js) or Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.action || message.type;

  if (action === "ACTIVATE_JOURNAL_PAGE" || action === "page.activateJournal") {
    withMessageDuration("page-activation-service", () => PP_BACKGROUND.pageActivation.activate(sender, message.url))
      .then(result => sendResponse(result));
    return true;
  }

  if (action === "CHECK_PDF_CORS" || action === "pdf.verify") {
    withMessageDuration("pdf-service", () => checkPdfUrl(message.url))
      .then(result => sendResponse(result))
      .catch(err => {
        console.error("PDF head check failed for url:", message.url, err);
        sendResponse({ valid: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }

  if (action === "FETCH_METADATA" || action === "metadata.fetch") {
    withMessageDuration("metadata-service", () => fetchPaperMetadata(message.doi, message.title, message.journal, message.pageUrl))
      .then(result => sendResponse(result))
      .catch(err => {
        console.error("Fetch metadata failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (action === "ADD_FOOTPRINT" || action === "history.add") {
    withMessageDuration("history-service", () => addFootprint(message.footprint))
      .then(result => sendResponse(result))
      .catch(err => {
        console.error("Add footprint failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (action === "AI_SUMMARIZE" || action === "ai.summarize") {
    withMessageDuration("ai-service", () => callAISummarize(message.abstract, message.title))
      .then(result => sendResponse(result))
      .catch(err => {
        console.error("AI summarization failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (action === "TEST_AI_CONNECTION" || action === "ai.test") {
    withMessageDuration("ai-service", () => testAIConnection())
      .then(result => sendResponse(result))
      .catch(err => {
        console.error("AI connection test failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (action === "FETCH_EASYSCHOLAR" || action === "metadata.easyscholar") {
    withMessageDuration("easyscholar-service", () => fetchEasyScholarForScholar(message.journal))
      .then(result => sendResponse(result))
      .catch(err => {
        console.error("FETCH_EASYSCHOLAR API query failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (action === "UPDATE_PDF_DOWNLOAD_SETTINGS" || action === "pdf.settings.update") {
    applyPdfRuntimePreferences({
      saveAs: typeof message.saveAs === "boolean" ? message.saveAs : undefined,
      downloadDir: typeof message.downloadDir === "string" ? message.downloadDir : undefined
    });
    sendResponse({ ok: true, success: true, source: "download-settings" });
    return false;
  }

  if (action === "DOWNLOAD_PDF" || action === "pdf.download") {
    withMessageDuration("download-service", () => downloadPdf(
      message.url,
      message.filename,
      message.urls || message.candidates || [],
      { tabId: sender?.tab?.id, pageUrl: message.pageUrl || sender?.url || sender?.tab?.url || "" }
    ))
      .then(result => sendResponse(result))
      .catch(err => {
        console.error("PDF download failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

function sanitizeDownloadSegment(segment) {
  return PP_CORE.pdf?.sanitizeDownloadSegment
    ? PP_CORE.pdf.sanitizeDownloadSegment(segment)
    : String(segment || "").replace(/[<>:"\\|?*\x00-\x1F]/g, "_").replace(/\.+$/g, "").trim();
}

function buildDownloadFilename(downloadDir, filename) {
  return PP_CORE.pdf?.buildDownloadFilename
    ? PP_CORE.pdf.buildDownloadFilename(downloadDir, filename)
    : `${sanitizeDownloadSegment(filename || "paper.pdf")}`;
}

// Active download trackers to match dynamic PDF downloads for forced renaming
const activeDownloads = new Map(); // downloadId -> { finalFilename, saveAs }
const activeDownloadsByUrl = new Map(); // url -> queued download descriptors

function queueActiveDownloadUrl(url, descriptor) {
  if (!url) return;
  const key = normalizeDownloadUrlKey(url);
  const queue = activeDownloadsByUrl.get(key) || [];
  queue.push(descriptor);
  activeDownloadsByUrl.set(key, queue);
}

function removeActiveDownloadDescriptor(descriptor) {
  if (!descriptor) return;
  for (const [url, queue] of activeDownloadsByUrl.entries()) {
    const remaining = queue.filter(item => item !== descriptor);
    if (remaining.length) activeDownloadsByUrl.set(url, remaining);
    else activeDownloadsByUrl.delete(url);
  }
}

function findActiveDownloadDescriptor(item) {
  const byId = activeDownloads.get(item.id);
  if (byId) return byId;
  for (const rawUrl of [item.url, item.finalUrl]) {
    if (!rawUrl) continue;
    const queue = activeDownloadsByUrl.get(normalizeDownloadUrlKey(rawUrl));
    if (queue?.length) return queue[0];
  }
  return null;
}

function invalidateTrackedPdfCache(descriptor) {
  if (!descriptor) return;
  chrome.storage.local.get("pdf_download_cache", storage => {
    const cache = storage.pdf_download_cache || {};
    delete cache[normalizeDownloadUrlKey(descriptor.downloadUrl)];
    delete cache[normalizeDownloadUrlKey(descriptor.originalUrl)];
    if (descriptor.requestKey && cache[PDF_REQUEST_CACHE_KEY]) {
      delete cache[PDF_REQUEST_CACHE_KEY][descriptor.requestKey];
    }
    chrome.storage.local.set({ pdf_download_cache: cache });
  });
}

// Intercept filename determination to override server-side Content-Disposition headers (e.g. Wiley, Springer)
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const custom = findActiveDownloadDescriptor(item);
  if (custom) {
    const mime = (item.mime || "").toLowerCase();
    const finalUrl = item.finalUrl || item.url || "";
    const finalUrlLooksPdf = isTrustedBrowserPdfUrl(finalUrl);
    if (custom.requirePdf && ((mime && !mime.includes("pdf")) || (!mime && item.finalUrl && !finalUrlLooksPdf))) {
      chrome.downloads.cancel(item.id, () => {});
      invalidateTrackedPdfCache(custom);
      activeDownloads.delete(item.id);
      removeActiveDownloadDescriptor(custom);
      suggest({ filename: custom.finalFilename, conflictAction: "uniquify" });
      return;
    }
    suggest({
      filename: custom.finalFilename,
      conflictAction: "uniquify"
    });
    // Clean up
    activeDownloads.delete(item.id);
    removeActiveDownloadDescriptor(custom);
    return;
  }

  // Intercept and rename native browser downloads
  const mime = (item.mime || "").toLowerCase();
  const finalUrl = item.finalUrl || item.url || "";
  const finalUrlLooksPdf = isTrustedBrowserPdfUrl(finalUrl);
  const isPdf = mime.includes("pdf") ||
                finalUrlLooksPdf ||
                finalUrl.toLowerCase().endsWith(".pdf") ||
                item.filename.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    suggest();
    return;
  }

  chrome.storage.local.get(["pdf_cache", "pdf_naming", "pdf_download_dir"], (storage) => {
    try {
      const cache = storage.pdf_cache || {};
      const pattern = storage.pdf_naming || "1";
      const downloadDir = storage.pdf_download_dir || "PaperPilot Pro";

      let matchedMeta = null;

      // A. Match by pageUrl / referrer
      if (item.referrer) {
        for (const key in cache) {
          const paper = cache[key];
          if (paper && paper.pageUrl && isSameUrl(paper.pageUrl, item.referrer)) {
            matchedMeta = paper;
            break;
          }
        }
      }

      // B. Match by pdfUrl / download URL
      if (!matchedMeta) {
        for (const key in cache) {
          const paper = cache[key];
          if (paper && paper.pdfUrl && (isSameUrl(paper.pdfUrl, item.url) || isSameUrl(paper.pdfUrl, item.finalUrl))) {
            matchedMeta = paper;
            break;
          }
        }
      }

      // C. Match by extracting DOI
      if (!matchedMeta) {
        const doi = normalizeDoiForLookup(item.referrer) || normalizeDoiForLookup(item.url) || normalizeDoiForLookup(item.finalUrl);
        if (doi && cache[doi]) {
          matchedMeta = cache[doi];
        }
      }

      if (matchedMeta) {
        const firstAuthor = matchedMeta.authors && matchedMeta.authors.length > 0 ? matchedMeta.authors[0] : "Unknown";
        let name = `[${matchedMeta.journal}] ${firstAuthor} - ${matchedMeta.title}`;
        if (pattern === "2") {
          name = `[${matchedMeta.year}] ${matchedMeta.title}`;
        } else if (pattern === "3" && matchedMeta.doi) {
          name = matchedMeta.doi.replace(/\//g, "_");
        } else if (pattern === "4") {
          name = `${matchedMeta.title} (${matchedMeta.year})`;
        }

        const cleanName = name.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 100) + ".pdf";
        const finalFilename = buildDownloadFilename(downloadDir, cleanName);

        suggest({
          filename: finalFilename,
          conflictAction: "uniquify"
        });
      } else {
        suggest();
      }
    } catch (e) {
      console.error("PaperPilot Pro: Failed to determine native download filename", e);
      suggest();
    }
  });

  return true; // Asynchronous callback
});

// GC / Memory leak cleanup listener: Remove items from mapping when download completes, fails or is cancelled
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && (delta.state.current === "interrupted" || delta.state.current === "complete")) {
    const downloadId = delta.id;
    const tracked = activeDownloads.get(downloadId);
    if (tracked) {
      if (delta.state.current === "interrupted") invalidateTrackedPdfCache(tracked);
      activeDownloads.delete(downloadId);
      // Clean up corresponding URL tracker as well
      removeActiveDownloadDescriptor(tracked);
    }
  }
});

function uniqueUrls(urls) {
  return PP_CORE.pdf?.uniqueUrls ? PP_CORE.pdf.uniqueUrls(urls) : (urls || []).filter(Boolean);
}

function isTrustedBrowserPdfUrl(rawUrl) {
  return PP_CORE.pdf?.isTrustedBrowserPdfUrl ? PP_CORE.pdf.isTrustedBrowserPdfUrl(rawUrl) : /\.pdf(?:$|\?)/i.test(String(rawUrl || ""));
}

function normalizeDownloadUrlKey(rawUrl) {
  return PP_CORE.pdf?.normalizeDownloadUrlKey
    ? PP_CORE.pdf.normalizeDownloadUrlKey(rawUrl)
    : String(rawUrl || "").replace(/#.*$/, "").toLowerCase();
}

function isSameUrl(a, b) {
  if (!a || !b) return false;
  return normalizeDownloadUrlKey(a).replace(/\/$/, "") === normalizeDownloadUrlKey(b).replace(/\/$/, "");
}

const PDF_CHECK_BATCH_SIZE = 8;
const MAX_DOWNLOAD_CANDIDATES = 32;
const PDF_FAST_HEAD_TIMEOUT_MS = 700;
const PDF_HEAD_TIMEOUT_MS = 1400;
const PDF_RANGE_TIMEOUT_MS = 1800;
const PDF_DOWNLOAD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PDF_SIGNED_URL_CACHE_TTL_MS = 20 * 60 * 1000;
const PDF_FAILURE_CACHE_TTL_MS = 2 * 60 * 1000;
const PDF_REQUEST_CACHE_KEY = "__requests";
const PDF_URL_CACHE_MAX_ENTRIES = 320;
const PDF_REQUEST_CACHE_MAX_ENTRIES = 120;
const pdfDownloadSingleFlight = PP_CORE.cache?.createSingleFlight?.();
const pdfVerificationSingleFlight = PP_CORE.cache?.createSingleFlight?.();
const inFlightPdfDownloads = new Map();
let pdfRuntimeStatePromise = null;
let pdfRuntimeState = null;
const pdfRuntimeOverrides = {};
const pdfVerifier = PP_CORE.pdfVerifier?.create?.({
  fetchImpl: (...args) => fetch(...args),
  headTimeoutMs: PDF_HEAD_TIMEOUT_MS,
  rangeTimeoutMs: PDF_RANGE_TIMEOUT_MS,
  hedgeDelayMs: 140,
  maxPrefixBytes: 1024
});
const quickPdfVerifier = PP_CORE.pdfVerifier?.create?.({
  fetchImpl: (...args) => fetch(...args),
  headTimeoutMs: PDF_FAST_HEAD_TIMEOUT_MS,
  rangeTimeoutMs: PDF_RANGE_TIMEOUT_MS,
  hedgeDelayMs: 140,
  maxPrefixBytes: 1024
});

function isSignedPdfUrl(rawUrl) {
  return /[?&](?:md5|pid|token|signature|expires|downloadtoken|auth)=/i.test(String(rawUrl || ""));
}

function getPdfCacheTtl(recordOrUrl) {
  const url = typeof recordOrUrl === "string" ? recordOrUrl : recordOrUrl?.url;
  return isSignedPdfUrl(url) ? PDF_SIGNED_URL_CACHE_TTL_MS : PDF_DOWNLOAD_CACHE_TTL_MS;
}

function isFreshPdfCacheRecord(record, now = Date.now()) {
  return Boolean(record?.ok && record.cachedAt && now - record.cachedAt <= getPdfCacheTtl(record));
}

async function getPdfRuntimeState() {
  if (pdfRuntimeState) return pdfRuntimeState;
  if (!pdfRuntimeStatePromise) {
    pdfRuntimeStatePromise = getStorageAsync([
      "pdf_download_save_as",
      "pdf_download_dir",
      "pdf_download_cache"
    ]).then(config => {
      pdfRuntimeState = {
        saveAs: typeof pdfRuntimeOverrides.saveAs === "boolean"
          ? pdfRuntimeOverrides.saveAs
          : config.pdf_download_save_as === true,
        downloadDir: pdfRuntimeOverrides.downloadDir || config.pdf_download_dir || "PaperPilot Pro",
        downloadCache: config.pdf_download_cache && typeof config.pdf_download_cache === "object"
          ? config.pdf_download_cache
          : {}
      };
      return pdfRuntimeState;
    }).finally(() => {
      pdfRuntimeStatePromise = null;
    });
  }
  return pdfRuntimeStatePromise;
}

function applyPdfRuntimePreferences(preferences = {}) {
  if (typeof preferences.saveAs === "boolean") {
    pdfRuntimeOverrides.saveAs = preferences.saveAs;
    if (pdfRuntimeState) pdfRuntimeState.saveAs = preferences.saveAs;
  }
  if (typeof preferences.downloadDir === "string" && preferences.downloadDir.trim()) {
    pdfRuntimeOverrides.downloadDir = preferences.downloadDir;
    if (pdfRuntimeState) pdfRuntimeState.downloadDir = preferences.downloadDir;
  }
}

function updatePdfRuntimeState(changes) {
  if (changes.pdf_download_save_as) {
    applyPdfRuntimePreferences({ saveAs: changes.pdf_download_save_as.newValue === true });
  }
  if (changes.pdf_download_dir) {
    applyPdfRuntimePreferences({ downloadDir: changes.pdf_download_dir.newValue || "PaperPilot Pro" });
  }
  if (changes.pdf_download_cache) {
    if (pdfRuntimeState) pdfRuntimeState.downloadCache = changes.pdf_download_cache.newValue || {};
  }
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") updatePdfRuntimeState(changes);
  });
}

// Warm settings and the bounded verified-URL cache as soon as the MV3 worker
// starts so the first download click does not pay a storage round trip.
void getPdfRuntimeState().catch(() => {});

async function quickCheckPdfUrl(url, signal = null) {
  if (!quickPdfVerifier) return { valid: false, decisive: false, transient: true, errorCode: "PDF_VERIFIER_UNAVAILABLE" };
  return quickPdfVerifier.quickVerify(url, signal);
}

async function findFastTrustedPdfTarget(urlsToTry, explicitNonPdfUrls) {
  const trustedUrls = urlsToTry
    .map(candidate => typeof candidate === "string" ? { url: candidate } : candidate)
    .filter(candidate => PP_CORE.pdf?.shouldFastDownloadCandidate
      ? PP_CORE.pdf.shouldFastDownloadCandidate(candidate)
      : isTrustedBrowserPdfUrl(candidate.url))
    .slice(0, PDF_CHECK_BATCH_SIZE);
  if (trustedUrls.length === 0) return null;

  const results = [];
  const controller = new AbortController();

  const tasks = trustedUrls.map(async (candidateUrl) => {
    try {
      const result = await quickCheckPdfUrl(candidateUrl.url, controller.signal);
      const item = {
        candidateUrl,
        result
      };
      results.push(item);
      if (item.result.valid) return item;
      throw item;
    } catch (e) {
      throw e;
    }
  });

  try {
    const firstValid = await Promise.any(tasks);
    controller.abort(); // Cancel the other quick checks!
    return {
      originalUrl: firstValid.candidateUrl.url,
      finalUrl: firstValid.result.finalUrl || firstValid.candidateUrl.url,
      source: firstValid.candidateUrl.source || "quick-check"
    };
  } catch (err) {
    results.forEach(item => {
      if (item.result?.decisive) {
        explicitNonPdfUrls.add(normalizeDownloadUrlKey(item.candidateUrl.url));
      }
    });

  } finally {
    controller.abort();
  }

  return null;
}

async function findFirstVerifiedPdfUrl(urlsToTry, explicitNonPdfUrls = new Set(), verificationResults = []) {
  for (let i = 0; i < urlsToTry.length; i += PDF_CHECK_BATCH_SIZE) {
    const batch = urlsToTry
      .slice(i, i + PDF_CHECK_BATCH_SIZE)
      .map(candidate => typeof candidate === "string" ? { url: candidate } : candidate)
      .filter(candidate => !explicitNonPdfUrls.has(normalizeDownloadUrlKey(candidate.url)));
    if (batch.length === 0) continue;

    const batchController = new AbortController();

    try {
      const verified = await Promise.any(batch.map(async (candidate) => {
        const pdfCheck = await checkPdfUrl(candidate.url, batchController.signal);
        verificationResults.push({ candidate, result: pdfCheck });
        if (pdfCheck.decisive) {
          explicitNonPdfUrls.add(normalizeDownloadUrlKey(candidate.url));
        }
        if (!pdfCheck.valid) {
          throw new Error("Not a PDF response");
        }
        return {
          originalUrl: candidate.url,
          finalUrl: pdfCheck.finalUrl || candidate.url,
          source: candidate.source || "verified"
        };
      }));

      // Successfully verified one! Abort all other requests in this batch.
      batchController.abort();
      return verified;
    } catch (e) {
      // Promise.any throws AggregateError if all failed
    } finally {
      batchController.abort();
    }
  }
  return null;
}

function getPdfDownloadRequestKey(candidates) {
  const normalizedUrls = candidates
    .slice(0, MAX_DOWNLOAD_CANDIDATES)
    .map(candidate => normalizeDownloadUrlKey(candidate.url))
    .filter(Boolean);
  return PP_CORE.cache?.hashStringList?.(normalizedUrls) || `${normalizedUrls.length}:${normalizedUrls.join("|")}`;
}

function getStorageAsync(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function setStorageAsync(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

function getDownloadRequestCache(downloadCache) {
  if (!downloadCache[PDF_REQUEST_CACHE_KEY] || typeof downloadCache[PDF_REQUEST_CACHE_KEY] !== "object") {
    downloadCache[PDF_REQUEST_CACHE_KEY] = {};
  }
  return downloadCache[PDF_REQUEST_CACHE_KEY];
}

async function persistPdfDownloadCache(downloadCache) {
  const requestCache = getDownloadRequestCache(downloadCache);
  PP_CORE.cache?.pruneRecordObject?.(requestCache, {
    maxEntries: PDF_REQUEST_CACHE_MAX_ENTRIES,
    ttlMs: PDF_DOWNLOAD_CACHE_TTL_MS
  });
  PP_CORE.cache?.pruneRecordObject?.(downloadCache, {
    maxEntries: PDF_URL_CACHE_MAX_ENTRIES,
    ttlMs: PDF_DOWNLOAD_CACHE_TTL_MS,
    preserveKeys: [PDF_REQUEST_CACHE_KEY]
  });
  if (pdfRuntimeState) pdfRuntimeState.downloadCache = downloadCache;
  await setStorageAsync({ pdf_download_cache: downloadCache });
}

function buildPdfDownloadDiagnostics(candidateSummary, attempted, options = {}) {
  return {
    candidateCount: candidateSummary.length,
    attemptedCount: attempted.length,
    firstSource: candidateSummary[0]?.source || "",
    cacheHit: options.cacheHit || "none",
    fastPath: Boolean(options.fastPath),
    verificationMode: options.verificationMode || "unknown",
    discoveryMode: options.discoveryMode || "candidate-cache",
    transport: options.transport || "unknown",
    fallbackUsed: Boolean(options.fallbackUsed),
    durationMs: Number.isFinite(options.durationMs) ? options.durationMs : 0
  };
}

function startChromePdfDownload(downloadUrl, originalUrl, finalFilename, saveAs, source, requestKey = "", fallbackUsed = false) {
  return new Promise((resolve) => {
    const downloadItem = { finalFilename, saveAs, requirePdf: true, downloadUrl, originalUrl, requestKey };
    queueActiveDownloadUrl(downloadUrl, downloadItem);
    if (downloadUrl !== originalUrl) queueActiveDownloadUrl(originalUrl, downloadItem);

    chrome.downloads.download({
      url: downloadUrl,
      filename: finalFilename,
      conflictAction: "uniquify",
      saveAs
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        removeActiveDownloadDescriptor(downloadItem);
        resolve({
          success: false,
          ok: false,
          errorCode: "PDF_DOWNLOAD_FAILED",
          error: chrome.runtime.lastError.message,
          fallbackUrl: originalUrl,
          source
        });
        return;
      }

      activeDownloads.set(downloadId, downloadItem);
      resolve({
        success: true,
        ok: true,
        downloadId,
        filename: finalFilename,
        source,
        transport: "chrome-download",
        fallbackUsed,
        fallbackUrl: originalUrl
      });
    });
  });
}

function startPageContextPdfDownload(tabId, pageUrl, downloadUrl, filename, source) {
  if (!Number.isInteger(tabId) || tabId < 0 || !downloadUrl) {
    return Promise.resolve({
      success: false,
      ok: false,
      errorCode: "PDF_PAGE_CONTEXT_UNAVAILABLE",
      error: "Current Chrome tab is unavailable",
      fallbackUrl: downloadUrl,
      source
    });
  }

  return new Promise(resolve => {
    chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: "MAIN",
      func: (url, requestedFilename) => {
        const clickAnchor = (anchor, fallbackName) => {
          if (!anchor) return false;
          if (fallbackName && !anchor.download) anchor.download = fallbackName;
          anchor.click();
          return true;
        };

        const anchors = Array.from(document.querySelectorAll("a[href],area[href]"));
        const matching = anchors.find(anchor => anchor.href === url || anchor.getAttribute("href") === url);
        if (clickAnchor(matching, requestedFilename)) return { ok: true, mode: "page-link" };

        const fallback = document.createElement("a");
        fallback.href = url;
        fallback.download = requestedFilename || "paper.pdf";
        fallback.target = "_blank";
        fallback.rel = "noopener";
        document.documentElement.appendChild(fallback);
        fallback.click();
        setTimeout(() => fallback.remove(), 1000);
        return { ok: true, mode: url.startsWith("blob:") ? "page-blob-anchor" : "page-anchor-fallback" };
      },
      args: [downloadUrl, filename]
    }, result => {
      const error = chrome.runtime.lastError;
      const pageResult = result?.[0]?.result;
      if (error || !pageResult?.ok) {
        resolve({
          success: false,
          ok: false,
          errorCode: pageResult?.errorCode || "PDF_PAGE_CONTEXT_FAILED",
          error: error?.message || pageResult?.error || "Page-context download failed",
          fallbackUrl: downloadUrl,
          source
        });
        return;
      }

      resolve({
        success: true,
        ok: true,
        filename,
        source,
        transport: "page-context",
        fallbackUsed: true,
        pageMode: result[0].result.mode,
        fallbackUrl: pageUrl || downloadUrl
      });
    });
  });
}

function summarizePdfCandidates(candidates) {
  return candidates.slice(0, MAX_DOWNLOAD_CANDIDATES).map(candidate => ({
    url: candidate.url,
    source: candidate.source || "unknown",
    score: candidate.score || 0,
    reason: candidate.reason || "",
    browserFallback: Boolean(candidate.browserFallback),
    requiresBrowser: Boolean(candidate.requiresBrowser),
    transport: candidate.transport || (candidate.requiresBrowser ? "page-context" : "chrome-download")
  }));
}

function verifyPdfCandidates(activeCandidates, requestKey) {
  const run = async () => {
    const explicitNonPdfUrls = new Set();
    const verificationResults = [];
    const httpCandidates = activeCandidates.filter(candidate => {
      if (candidate.requiresBrowser || PP_CORE.pdf?.isPageActionPdfUrl?.(candidate.url)) return false;
      return /^https?:\/\//i.test(candidate.url);
    });
    const fastTarget = await findFastTrustedPdfTarget(httpCandidates, explicitNonPdfUrls);
    const verified = fastTarget || await findFirstVerifiedPdfUrl(httpCandidates, explicitNonPdfUrls, verificationResults);
    const fallbackUrl = verified ? "" : httpCandidates.find(candidate => {
      return isTrustedBrowserPdfUrl(candidate.url) &&
        !candidate.browserFallback &&
        !explicitNonPdfUrls.has(normalizeDownloadUrlKey(candidate.url));
    })?.url || "";
    const pageFallbackKeys = new Set(verificationResults
      .filter(item => ["PDF_AUTH_REQUIRED", "PDF_NETWORK_ERROR", "PDF_TIMEOUT"].includes(item.result?.errorCode))
      .map(item => normalizeDownloadUrlKey(item.candidate?.url)));
    return {
      verified,
      fallbackUrl,
      explicitNonPdfUrls,
      verificationResults,
      pageCandidate: activeCandidates.find(candidate =>
        candidate.requiresBrowser || candidate.browserFallback || pageFallbackKeys.has(normalizeDownloadUrlKey(candidate.url))
      ) || null,
      pageFallbackKeys
    };
  };
  return pdfVerificationSingleFlight
    ? pdfVerificationSingleFlight.run(requestKey, run)
    : run();
}

function shouldDispatchNativeImmediately(candidate) {
  if (!candidate || Number(candidate.score || 0) < 96) return false;
  if (candidate.browserFallback || candidate.requiresBrowser) return false;
  return PP_CORE.pdf?.shouldFastDownloadCandidate
    ? PP_CORE.pdf.shouldFastDownloadCandidate(candidate)
    : isTrustedBrowserPdfUrl(candidate.url);
}

function verifyNativeDownloadInBackground(candidate, requestKey, downloadCache, downloadId) {
  void verifyPdfCandidates([candidate], requestKey)
    .then(({ verified, verificationResults }) => {
      if (verified) {
        const cachedAt = Date.now();
        const cacheRecord = {
          ok: true,
          cachedAt,
          url: verified.finalUrl,
          originalUrl: verified.originalUrl,
          source: verified.source || candidate.source || "native-guarded"
        };
        downloadCache[normalizeDownloadUrlKey(verified.finalUrl)] = cacheRecord;
        if (verified.originalUrl && verified.originalUrl !== verified.finalUrl) {
          downloadCache[normalizeDownloadUrlKey(verified.originalUrl)] = cacheRecord;
        }
        getDownloadRequestCache(downloadCache)[requestKey] = cacheRecord;
        return persistPdfDownloadCache(downloadCache);
      }

      const decisiveFailure = verificationResults.find(item => item.result?.decisive);
      if (!decisiveFailure) return null;
      downloadCache[normalizeDownloadUrlKey(candidate.url)] = {
        ok: false,
        cachedAt: Date.now(),
        url: candidate.url,
        errorCode: decisiveFailure.result.errorCode || "PDF_NOT_CONFIRMED"
      };
      chrome.downloads.cancel(downloadId, () => void chrome.runtime.lastError);
      return persistPdfDownloadCache(downloadCache);
    })
    .catch(() => {});
}

async function performPdfDownload(preparedCandidates, filename, requestKey, context = {}) {
  const startedAt = Date.now();
  const runtime = await getPdfRuntimeState();
  const downloadCache = runtime.downloadCache;
  const requestCache = getDownloadRequestCache(downloadCache);
  const now = Date.now();
  const saveAs = typeof context.saveAs === "boolean" ? context.saveAs : runtime.saveAs;
  const finalFilename = saveAs ? (filename || "paper.pdf") : buildDownloadFilename(runtime.downloadDir, filename);
  const candidateSummary = summarizePdfCandidates(preparedCandidates);
  const cachedRequest = requestCache[requestKey];
  if (isFreshPdfCacheRecord(cachedRequest) && cachedRequest.url) {
    const attempted = [cachedRequest.url];
    const result = await startChromePdfDownload(
      cachedRequest.url,
      cachedRequest.originalUrl || cachedRequest.url,
      finalFilename,
      saveAs,
      cachedRequest.source || "pdf-request-cache",
      requestKey
    );
    if (result.ok) {
      return {
        ...result,
        candidates: candidateSummary,
        attempted,
        fallbackUrl: cachedRequest.originalUrl || cachedRequest.url,
        diagnostics: buildPdfDownloadDiagnostics(candidateSummary, attempted, {
          cacheHit: "request",
          fastPath: true,
          verificationMode: "request-cache",
          transport: result.transport,
          durationMs: Date.now() - startedAt
        })
      };
    }
    // Signed publisher links can expire before the 24-hour cache TTL. Remove
    // the stale route and continue through fresh candidate verification.
    delete requestCache[requestKey];
    delete downloadCache[normalizeDownloadUrlKey(cachedRequest.url)];
    if (cachedRequest.originalUrl) delete downloadCache[normalizeDownloadUrlKey(cachedRequest.originalUrl)];
  }

  const candidatesForAttempt = preparedCandidates.filter(candidate => {
    const cached = downloadCache[normalizeDownloadUrlKey(candidate.url)];
    return !(cached && cached.ok === false && now - cached.cachedAt <= PDF_FAILURE_CACHE_TTL_MS);
  });
  const activeCandidates = candidatesForAttempt.length ? candidatesForAttempt : preparedCandidates;

  const cachedCandidate = activeCandidates.find(candidate => {
    const cached = downloadCache[normalizeDownloadUrlKey(candidate.url)];
    return isFreshPdfCacheRecord(cached);
  });
  if (cachedCandidate) {
    const cached = downloadCache[normalizeDownloadUrlKey(cachedCandidate.url)];
    const cachedUrl = cached?.url || cachedCandidate.url;
    const attempted = [cachedUrl];
    const result = await startChromePdfDownload(cachedUrl, cachedCandidate.url, finalFilename, saveAs, cachedCandidate.source || "pdf-cache", requestKey);
    if (result.ok) {
      return {
        ...result,
        candidates: candidateSummary,
        attempted,
        diagnostics: buildPdfDownloadDiagnostics(candidateSummary, attempted, {
          cacheHit: "url",
          fastPath: true,
          verificationMode: "url-cache",
          transport: result.transport,
          durationMs: Date.now() - startedAt
        })
      };
    }
    delete downloadCache[normalizeDownloadUrlKey(cachedCandidate.url)];
    delete downloadCache[normalizeDownloadUrlKey(cachedUrl)];
  }

  const nativeFastCandidate = activeCandidates.find(shouldDispatchNativeImmediately);
  if (nativeFastCandidate) {
    const attempted = [nativeFastCandidate.url];
    const result = await startChromePdfDownload(
      nativeFastCandidate.url,
      nativeFastCandidate.url,
      finalFilename,
      saveAs,
      nativeFastCandidate.source || "native-fast-path",
      requestKey
    );
    if (result.ok) {
      verifyNativeDownloadInBackground(nativeFastCandidate, requestKey, downloadCache, result.downloadId);
      return {
        ...result,
        candidates: candidateSummary,
        attempted,
        diagnostics: buildPdfDownloadDiagnostics(candidateSummary, attempted, {
          fastPath: true,
          verificationMode: "native-guarded",
          discoveryMode: "native-direct",
          transport: result.transport,
          durationMs: Date.now() - startedAt
        })
      };
    }
  }

  const resolved = await verifyPdfCandidates(activeCandidates, requestKey);
  const { verified, fallbackUrl, explicitNonPdfUrls, verificationResults, pageCandidate, pageFallbackKeys } = resolved;
  const source = verified
    ? verified.source || "verified-candidate"
    : fallbackUrl ? "trusted-fallback-unverified" : "";

  if (!verified && !fallbackUrl && !pageCandidate) {
    verificationResults.forEach(({ candidate, result }) => {
      if (!result?.decisive) return;
      downloadCache[normalizeDownloadUrlKey(candidate.url)] = {
        ok: false,
        cachedAt: now,
        url: candidate.url,
        errorCode: result.errorCode || "PDF_NOT_CONFIRMED"
      };
    });
    void persistPdfDownloadCache(downloadCache).catch(() => {});
    return {
      success: false,
      ok: false,
      errorCode: "PDF_NOT_CONFIRMED",
      error: "候选链接均未返回 PDF 文件，已取消下载以避免保存 HTML 页面",
      candidates: candidateSummary,
      attempted: candidateSummary.map(item => item.url),
      fallbackUrl: candidateSummary[0]?.url || "",
      source: "pdf-verification",
      diagnostics: buildPdfDownloadDiagnostics(candidateSummary, candidateSummary.map(item => item.url), {
        verificationMode: "failed",
        durationMs: Date.now() - startedAt
      })
    };
  }

  const downloadUrl = verified ? verified.finalUrl : fallbackUrl;
  const originalUrl = verified ? verified.originalUrl : fallbackUrl;
  const pageUrl = context.pageUrl || "";
  const canUsePageContext = Number.isInteger(context.tabId) && context.tabId >= 0;
  const forceNativeSaveAs = Boolean(saveAs && pageCandidate && !verified);
  const usePageContext = Boolean(!saveAs && pageCandidate && !verified && canUsePageContext && (
    !fallbackUrl || pageCandidate.requiresBrowser || pageCandidate.browserFallback ||
    pageFallbackKeys?.has(normalizeDownloadUrlKey(pageCandidate.url))
  ));
  const selectedDownloadUrl = forceNativeSaveAs ? pageCandidate.url : downloadUrl;
  const selectedOriginalUrl = forceNativeSaveAs ? pageCandidate.url : originalUrl;
  const result = forceNativeSaveAs
    ? await startChromePdfDownload(selectedDownloadUrl, selectedOriginalUrl, finalFilename, true, "native-save-as-fallback", requestKey, true)
    : usePageContext
    ? await startPageContextPdfDownload(context.tabId, pageUrl, pageCandidate.url, finalFilename, pageCandidate.source || "page-context")
    : await startChromePdfDownload(downloadUrl, originalUrl, finalFilename, saveAs, source, requestKey);
  const attempted = uniqueUrls([
    ...verificationResults.map(item => item.candidate?.url),
    selectedDownloadUrl
  ]);
  // Persist only byte/header-verified targets. A browser fallback merely means
  // that a download task was accepted; it may still resolve to a login HTML page.
  if (result.ok && verified) {
    const cacheRecord = {
      ok: true,
      cachedAt: now,
      url: downloadUrl,
      originalUrl,
      source: source || "verified-candidate"
    };
    downloadCache[normalizeDownloadUrlKey(downloadUrl)] = cacheRecord;
    if (originalUrl && originalUrl !== downloadUrl) {
      downloadCache[normalizeDownloadUrlKey(originalUrl)] = cacheRecord;
    }
    requestCache[requestKey] = cacheRecord;
    void persistPdfDownloadCache(downloadCache).catch(() => {});
  }
  return {
    ...result,
    candidates: candidateSummary,
    attempted,
    fallbackUrl: selectedOriginalUrl,
    diagnostics: buildPdfDownloadDiagnostics(candidateSummary, attempted, {
      fastPath: Boolean(verified && source === "quick-check"),
      verificationMode: verified ? "verified" : "browser-fallback",
      transport: result.transport,
      fallbackUsed: Boolean(result.fallbackUsed),
      discoveryMode: forceNativeSaveAs
        ? "native-save-as-fallback"
        : (usePageContext ? "page-context-fallback" : "verified-candidate"),
      durationMs: Date.now() - startedAt
    })
  };
}

function downloadPdf(url, filename, candidateUrls = [], context = {}) {
  const preparedCandidates = (PP_CORE.pdf?.preparePdfCandidates
    ? PP_CORE.pdf.preparePdfCandidates([url, ...candidateUrls])
    : uniqueUrls([url, ...candidateUrls]).map(item => ({ url: item, score: isTrustedBrowserPdfUrl(item) ? 90 : 0 }))
  ).slice(0, MAX_DOWNLOAD_CANDIDATES);

  if (preparedCandidates.length === 0) {
    return Promise.resolve({
      success: false,
      ok: false,
      errorCode: "PDF_URL_MISSING",
      error: "Missing PDF URL",
      candidates: [],
      attempted: [],
      fallbackUrl: "",
      source: "candidate-collector"
    });
  }

  const requestKey = getPdfDownloadRequestKey(preparedCandidates);
  const flightKey = `${requestKey}|${String(filename || "paper.pdf")}`;
  if (pdfDownloadSingleFlight) {
    return pdfDownloadSingleFlight.run(flightKey, () => performPdfDownload(preparedCandidates, filename, requestKey, context));
  }
  if (inFlightPdfDownloads.has(flightKey)) {
    return inFlightPdfDownloads.get(flightKey);
  }

  const promise = performPdfDownload(preparedCandidates, filename, requestKey, context)
    .finally(() => {
      inFlightPdfDownloads.delete(flightKey);
    });
  inFlightPdfDownloads.set(flightKey, promise);
  return promise;
}

function normalizeDoiForLookup(doi) {
  if (PP_CORE.metadata?.extractDoi) {
    return PP_CORE.metadata.extractDoi([doi]);
  }
  const normalized = String(doi || "").trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[?#].*$/, "");
  return /^10\.\d{4,9}\/\S+$/i.test(normalized) ? normalized : "";
}

function isWeakMetadataTitle(title, doi = "") {
  return PP_CORE.metadata?.isWeakTitle ? PP_CORE.metadata.isWeakTitle(title, doi) : !String(title || "").trim();
}

function applyCrossrefItem(metadata, item) {
  return PP_CORE.metadata?.applyCrossrefItem ? PP_CORE.metadata.applyCrossrefItem(metadata, item) : metadata;
}

/**
 * Sniffs and verifies if a URL points to a valid PDF.
 * Uses a CORS-free Fetch with standard HEAD, or GET with Range headers (bytes=0-1023)
 * to read the %PDF file header magic bytes without downloading the entire file.
 */
async function checkPdfUrl(url, parentSignal = null) {
  if (!pdfVerifier) {
    return { valid: false, decisive: false, transient: true, errorCode: "PDF_VERIFIER_UNAVAILABLE" };
  }
  return pdfVerifier.verify(url, parentSignal);
}

/**
 * Queries Unpaywall & OpenAlex APIs concurrently to retrieve open access PDF links,
 * journal metrics (JCR quartiles, IF) and formats metadata, using cache if available.
 */
async function fetchPaperMetadata(doi, title, clientJournal, pageUrl = "") {
  // If DOI is missing, try to resolve via title using OpenAlex
  let paperDoi = normalizeDoiForLookup(doi);
  const cacheKey = paperDoi || `title_${title}`;

  // Fetch the easyScholar key to determine if we should bypass a stale estimate cache
  const settings = await chrome.storage.local.get("easyscholar_key");
  const secretKey = (settings.easyscholar_key || "").trim();

  // Check cache first (incorporating 7-day Cache Expiration & Eviction mechanism)
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7-day TTL
  const storage = await chrome.storage.local.get("pdf_cache");
  const cache = storage.pdf_cache || {};
  if (cache[cacheKey]) {
    const cachedData = cache[cacheKey];
    if (pageUrl && cachedData.pageUrl !== pageUrl) {
      cachedData.pageUrl = pageUrl;
      await chrome.storage.local.set({ pdf_cache: cache });
    }
    const cachedAt = cachedData.cachedAt || 0;
    const expiresAt = cachedData.expiresAt || (cachedAt + CACHE_TTL_MS);
    const isExpired = Date.now() > expiresAt;
    cachedData.expiresAt = expiresAt;
    cachedData.stale = isExpired;

    if (!isExpired && !isWeakMetadataTitle(cachedData.title, cachedData.doi)) {
      // If a key is configured but cached metrics did not come from a trusted source,
      // ignore cache hit to trigger a fresh easyScholar query.
      if (!secretKey || cachedData.metricsSource === "easyScholar") {
        return {
          success: true,
          ok: true,
          fromCache: true,
          data: cachedData,
          source: cachedData.source || cachedData.metricsSource || "cache",
          cachedAt: cachedData.cachedAt || null,
          expiresAt: cachedData.expiresAt || null,
          stale: false
        };
      }
    } else {
      console.log("PaperPilot Pro: Metadata cache expired or legacy for key:", cacheKey);
    }
  }

  let metadata = PP_CORE.metadata?.createBaseMetadata
    ? PP_CORE.metadata.createBaseMetadata({ doi: paperDoi, title, journal: clientJournal })
    : {
        doi: paperDoi,
        title,
        pdfUrl: "",
        journal: clientJournal || "",
        publisher: "",
        year: new Date().getFullYear(),
        authors: [],
        impactFactor: "N/A",
        jcrQuartile: "N/A",
        casPartition: "N/A",
        citeScore: "N/A",
        oaStatus: "Closed",
        isEstimated: false,
        metricsSource: "unconfigured",
        ccfRank: "",
        isCssci: false,
        isPku: false,
        sciWarn: "",
        sources: []
      };

  // Start easyScholar query immediately in parallel if journal/clientJournal is available
  let easyScholarPromise = null;
  const initialJournal = clientJournal || metadata.journal;
  if (secretKey && initialJournal) {
    easyScholarPromise = enqueueEasyScholar(initialJournal, secretKey).then(rankData => {
      if (rankData) {
        mapEasyScholarRank(metadata, rankData);
      }
    }).catch(err => console.warn("easyScholar lookup failed:", err.message));
  }

  // 1. Resolve DOI & fetch OpenAlex/Unpaywall in parallel if DOI is present
  if (metadata.doi) {
    const promises = [];

    // OpenAlex lookup
    const openAlexUrl = `https://api.openalex.org/works/https://doi.org/${metadata.doi}`;
    promises.push(fetch(openAlexUrl, {
      headers: { "User-Agent": "mailto:paperpilot@gmail.com" }
    }).then(async (oaResponse) => {
      if (oaResponse.ok) {
        const oaData = await oaResponse.json();
        const work = oaData.results ? oaData.results[0] : oaData;
        if (work && PP_CORE.metadata?.applyOpenAlexWork) {
          PP_CORE.metadata.applyOpenAlexWork(metadata, work);
        }
      }
    }).catch(e => console.warn("OpenAlex lookup failed:", e.message)));

    // Unpaywall lookup
    promises.push(fetch(`https://api.unpaywall.org/v2/${metadata.doi}?email=paperpilot@gmail.com`).then(async (upResponse) => {
      if (upResponse.ok) {
        const upData = await upResponse.json();
        if (upData.best_oa_location) {
          if (PP_CORE.metadata?.applyUnpaywall) {
            PP_CORE.metadata.applyUnpaywall(metadata, upData);
          } else {
            metadata.pdfUrl = upData.best_oa_location.url_for_pdf || upData.best_oa_location.url || "";
            metadata.oaStatus = upData.oa_status || "Open";
          }
        }
      }
    }).catch(e => console.warn("Unpaywall lookup failed:", e.message)));

    await Promise.all(promises);

    // Crossref fallback if title is weak after OpenAlex
    if (isWeakMetadataTitle(metadata.title, metadata.doi)) {
      try {
        const crResponse = await fetch(`https://api.crossref.org/works/${encodeURIComponent(metadata.doi)}`);
        if (crResponse.ok) {
          const crData = await crResponse.json();
          applyCrossrefItem(metadata, crData.message);
        }
      } catch (e) {
        console.warn("Crossref DOI lookup failed:", e.message);
      }
    }
  } else {
    // DOI is missing, sequentially resolve DOI via title first
    if (title) {
      try {
        const openAlexUrl = `https://api.openalex.org/works?filter=title.search:${encodeURIComponent(title)}&limit=1`;
        const oaResponse = await fetch(openAlexUrl, {
          headers: { "User-Agent": "mailto:paperpilot@gmail.com" }
        });
        if (oaResponse.ok) {
          const oaData = await oaResponse.json();
          const work = oaData.results ? oaData.results[0] : oaData;
          if (work && PP_CORE.metadata?.applyOpenAlexWork) {
            PP_CORE.metadata.applyOpenAlexWork(metadata, work);
          }
        }
      } catch (e) {
        console.warn("OpenAlex title lookup failed:", e.message);
      }
    }

    // Crossref lookup fallback if DOI is still missing
    if (!metadata.doi && title && !isWeakMetadataTitle(title)) {
      try {
        const crResponse = await fetch(`https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=1`);
        if (crResponse.ok) {
          const crData = await crResponse.json();
          if (crData.message && crData.message.items && crData.message.items.length > 0) {
            applyCrossrefItem(metadata, crData.message.items[0]);
          }
        }
      } catch (e) {
        console.warn("Crossref title lookup failed:", e.message);
      }
    }

    // If DOI was resolved, query Unpaywall
    if (metadata.doi && !metadata.pdfUrl) {
      try {
        const upResponse = await fetch(`https://api.unpaywall.org/v2/${metadata.doi}?email=paperpilot@gmail.com`);
        if (upResponse.ok) {
          const upData = await upResponse.json();
          if (upData.best_oa_location) {
            if (PP_CORE.metadata?.applyUnpaywall) {
              PP_CORE.metadata.applyUnpaywall(metadata, upData);
            } else {
              metadata.pdfUrl = upData.best_oa_location.url_for_pdf || upData.best_oa_location.url || "";
              metadata.oaStatus = upData.oa_status || "Open";
            }
          }
        }
      } catch (e) {
        console.warn("Unpaywall lookup failed:", e.message);
      }
    }
  }

  // 2. Double check and verify the fetched PDF URL
  if (metadata.pdfUrl) {
    const check = await checkPdfUrl(metadata.pdfUrl);
    if (!check.valid) {
      metadata.pdfUrl = "";
    } else {
      metadata.pdfUrl = check.finalUrl || metadata.pdfUrl;
    }
  }

  // 3. Await the early-started easyScholar lookup or trigger one sequentially if it wasn't started
  if (easyScholarPromise) {
    await easyScholarPromise;
  } else if (secretKey && metadata.journal) {
    try {
      const rankData = await enqueueEasyScholar(metadata.journal, secretKey);
      if (rankData) {
        mapEasyScholarRank(metadata, rankData);
      }
    } catch (err) {
      console.warn("easyScholar lookup failed:", err.message);
    }
  }

  // Map JCR Quartile to CAS Partition (only if not resolved by easyScholar)
  if (metadata.jcrQuartile && metadata.jcrQuartile !== "N/A" && metadata.casPartition === "N/A") {
    if (metadata.jcrQuartile.includes("Q1")) {
      metadata.casPartition = "1区";
    } else if (metadata.jcrQuartile.includes("Q2")) {
      metadata.casPartition = "2区";
    } else if (metadata.jcrQuartile.includes("Q3")) {
      metadata.casPartition = "3区";
    } else if (metadata.jcrQuartile.includes("Q4")) {
      metadata.casPartition = "4区";
    }
  }

  // Cache final metadata with timestamp for expiration eviction
  metadata.pageUrl = pageUrl || metadata.pageUrl || "";
  metadata.cachedAt = Date.now();
  metadata.expiresAt = metadata.cachedAt + CACHE_TTL_MS;
  metadata.stale = false;
  metadata.source = metadata.sources && metadata.sources.length ? metadata.sources.join(", ") : "local";
  cache[cacheKey] = metadata;
  PP_CORE.cache?.pruneRecordObject?.(cache, {
    maxEntries: 500,
    ttlMs: 4 * CACHE_TTL_MS
  });
  await chrome.storage.local.set({ pdf_cache: cache });

  return {
    success: true,
    ok: true,
    fromCache: false,
    data: metadata,
    source: metadata.source,
    cachedAt: metadata.cachedAt,
    expiresAt: metadata.expiresAt,
    stale: metadata.stale
  };
}

/**
 * Adds a paper to the footprint history.
 * Enforces a strict maximum of 100 footprints, shifting out old items.
 * Deduplicates by DOI or title (moving matching item to top of history).
 */
async function addFootprint(footprint) {
  if (!footprint || (!footprint.title && !footprint.doi)) {
    return { success: false, ok: false, errorCode: "HISTORY_INVALID_RECORD", error: "Invalid footprint data" };
  }

  const storage = await chrome.storage.local.get("history");
  let history = storage.history || [];

  const timestamp = Date.now();
  const newItem = {
    title: footprint.title || "Unknown Title",
    authors: footprint.authors || [],
    journal: footprint.journal || "",
    year: footprint.year || new Date().getFullYear(),
    doi: footprint.doi || "",
    pdfUrl: footprint.pdfUrl || "",
    status: footprint.status || "visited", // 'visited', 'downloaded', 'copied_bibtex'
    time: timestamp
  };

  // Deduplicate
  history = history.filter(item => {
    const matchDoi = newItem.doi && item.doi && newItem.doi.toLowerCase() === item.doi.toLowerCase();
    const matchTitle = newItem.title && item.title && newItem.title.toLowerCase().trim() === item.title.toLowerCase().trim();
    return !matchDoi && !matchTitle;
  });

  // Put at the top
  history.unshift(newItem);

  // Cap at 100 entries
  if (history.length > 100) {
    history = history.slice(0, 100);
  }

  await chrome.storage.local.set({ history });
  return { success: true, ok: true, historyLength: history.length, source: "chrome.storage.local" };
}

/**
 * Interfaces optional AI API keys for a high-quality summary.
 * Fallback to local offline dynamic mock generator if API key is not configured.
 */
const AI_PROVIDER_DEFAULTS = {
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
  gemini: { model: "gemini-1.5-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  deepseek: { model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
  anthropic: { model: "claude-3-5-haiku-latest", baseUrl: "https://api.anthropic.com/v1" },
  openrouter: { model: "openai/gpt-4o-mini", baseUrl: "https://openrouter.ai/api/v1" },
  ollama: { model: "llama3.1", baseUrl: "http://127.0.0.1:11434" },
  custom: { model: "", baseUrl: "" }
};

function getAiDefaults(provider) {
  return AI_PROVIDER_DEFAULTS[provider] || AI_PROVIDER_DEFAULTS.openai;
}

function normalizeBaseUrl(baseUrl, fallback) {
  return String(baseUrl || fallback || "").trim().replace(/\/+$/, "");
}

function providerNeedsApiKey(provider) {
  return !["ollama", "custom"].includes(provider);
}

async function loadAiConfig() {
  const config = await chrome.storage.local.get([
    "ai_provider",
    "ai_model",
    "ai_base_url",
    "ai_api_key",
    "ai_prompt"
  ]);
  const provider = config.ai_provider || "openai";
  const defaults = getAiDefaults(provider);
  return {
    provider,
    model: (config.ai_model || defaults.model || "").trim(),
    baseUrl: normalizeBaseUrl(config.ai_base_url, defaults.baseUrl),
    apiKey: (config.ai_api_key || "").trim(),
    prompt: config.ai_prompt || "Please summarize this abstract in 3 sentences:"
  };
}

function buildAcademicMessages(prompt, title, abstract, testOnly = false) {
  if (testOnly) {
    return [
      { role: "system", content: "You are a concise academic assistant." },
      { role: "user", content: "Connection test. Reply with OK." }
    ];
  }
  return [
    { role: "system", content: "You are a helpful academic assistant. Be concise and do not invent paper details." },
    { role: "user", content: `${prompt}\n\nTitle: ${title || ""}\nAbstract: ${abstract || ""}` }
  ];
}

async function fetchJsonWithTimeout(endpoint, options, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { ...options, signal: controller.signal });
    let body = null;
    try {
      body = await response.json();
    } catch (_) {}
    if (!response.ok) {
      const details = body?.error?.message || body?.message || `HTTP ${response.status}`;
      throw new Error(details);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function extractCompatibleChatText(data) {
  return data?.choices?.[0]?.message?.content ||
         data?.choices?.[0]?.text ||
         data?.output_text ||
         "";
}

async function callAIProvider({ provider, model, baseUrl, apiKey, prompt, title, abstract, testOnly = false }) {
  if (!model) {
    throw new Error("AI model is empty");
  }
  if (providerNeedsApiKey(provider) && !apiKey) {
    throw new Error("Missing API key for selected provider");
  }

  const messages = buildAcademicMessages(prompt, title, abstract, testOnly);
  const userText = messages.map(item => `${item.role}: ${item.content}`).join("\n");

  if (provider === "gemini") {
    const endpoint = `${normalizeBaseUrl(baseUrl, getAiDefaults(provider).baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const data = await fetchJsonWithTimeout(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userText }] }],
        generationConfig: { temperature: testOnly ? 0 : 0.4, maxOutputTokens: testOnly ? 16 : 700 }
      })
    });
    return data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || "";
  }

  if (provider === "anthropic") {
    const endpoint = `${normalizeBaseUrl(baseUrl, getAiDefaults(provider).baseUrl)}/messages`;
    const data = await fetchJsonWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: testOnly ? 16 : 700,
        temperature: testOnly ? 0 : 0.4,
        system: messages[0].content,
        messages: [{ role: "user", content: messages[1].content }]
      })
    });
    return data?.content?.map(item => item.text || "").join("").trim() || "";
  }

  if (provider === "ollama") {
    const endpoint = `${normalizeBaseUrl(baseUrl, getAiDefaults(provider).baseUrl)}/api/chat`;
    const data = await fetchJsonWithTimeout(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: testOnly ? 0 : 0.4 }
      })
    }, 30000);
    return data?.message?.content?.trim() || "";
  }

  const defaultBase = getAiDefaults(provider).baseUrl;
  const endpoint = `${normalizeBaseUrl(baseUrl, defaultBase)}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const data = await fetchJsonWithTimeout(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: testOnly ? 0 : 0.4,
      max_tokens: testOnly ? 16 : 700
    })
  });
  return extractCompatibleChatText(data).trim();
}

async function testAIConnection() {
  const config = await loadAiConfig();
  const text = await callAIProvider({
    ...config,
    title: "Connection test",
    abstract: "Return OK if the API request is valid.",
    testOnly: true
  });
  return {
    success: true,
    ok: true,
    provider: config.provider,
    model: config.model,
    sample: text || "OK"
  };
}

async function callAISummarize(abstract, title) {
  const config = await loadAiConfig();

  try {
    if (PP_CORE.ai?.summarize) {
      const result = await PP_CORE.ai.summarize({
        ...config,
        title,
        abstract
      });
      return {
        ...result,
        success: result.ok,
        summary: result.data?.summary || "",
        provider: result.data?.provider || config.provider,
        model: result.data?.model || config.model
      };
    }
    const summaryText = await callAIProvider({ ...config, title, abstract });
    return { success: true, ok: true, summary: summaryText, provider: config.provider, source: `ai/${config.provider}` };
  } catch (err) {
    const code = err.code === "AI_API_KEY_MISSING" || err.code === "AI_MODEL_MISSING" ? err.code : "AI_PROVIDER_ERROR";
    return {
      success: false,
      ok: false,
      summary: "",
      provider: config.provider,
      source: `ai/${config.provider}`,
      errorCode: code,
      error: err.message
    };
  }
}

// FIFO rate-limiting queue for easyScholar API (max 2 requests per second)
let easyscholarQueue = [];
let isProcessingQueue = false;
const RATE_LIMIT_MS = 600; // Keep safe interval > 500ms (2 req/s)

function enqueueEasyScholar(journalName, secretKey) {
  return new Promise((resolve) => {
    easyscholarQueue.push({ journalName, secretKey, resolve });
    processEasyScholarQueue();
  });
}

function processEasyScholarQueue() {
  if (isProcessingQueue || easyscholarQueue.length === 0) return;
  isProcessingQueue = true;

  const { journalName, secretKey, resolve } = easyscholarQueue.shift();
  fetchEasyScholarDirect(journalName, secretKey)
    .then(result => {
      resolve(result);
    })
    .catch(err => {
      console.warn("easyScholar request failed:", err);
      resolve(null);
    })
    .finally(() => {
      setTimeout(() => {
        isProcessingQueue = false;
        processEasyScholarQueue();
      }, RATE_LIMIT_MS);
    });
}

async function fetchEasyScholarDirect(journalName, secretKey) {
  if (!journalName || !secretKey) return null;
  const url = `https://www.easyscholar.cc/open/getPublicationRank?secretKey=${encodeURIComponent(secretKey)}&publicationName=${encodeURIComponent(journalName)}`;
  try {
    console.log("PaperPilot Pro: Querying easyScholar API for", journalName);
    const response = await fetch(url);
    if (response.ok) {
      const json = await response.json();
      console.log("PaperPilot Pro: easyScholar API raw response for", journalName, json);
      if (json && (json.code == 200 || json.code == "200" || json.msg === "SUCCESS") && json.data) {
        return json.data;
      }
    } else {
      console.warn("PaperPilot Pro: easyScholar HTTP status error:", response.status);
    }
  } catch (e) {
    console.warn("fetchEasyScholarDirect error for", journalName, e.message);
  }
  return null;
}

function mapEasyScholarRank(metadata, rankData) {
  if (PP_CORE.metadata?.applyEasyScholarRank) {
    PP_CORE.metadata.applyEasyScholarRank(metadata, rankData);
    return;
  }
  if (!rankData || !rankData.officialRank || !rankData.officialRank.all) return;
  const all = rankData.officialRank.all;

  // Set isEstimated to false as we have official ranks resolved from easyScholar
  metadata.isEstimated = false;
  metadata.metricsSource = "easyScholar";

  // 1. Impact Factor
  if (all.sciif) {
    metadata.impactFactor = String(all.sciif);
  }

  // 2. JCR Quartile
  if (all.sci) {
    let quartile = String(all.sci);
    if (quartile.match(/^\d+$/)) quartile = `Q${quartile}`;
    metadata.jcrQuartile = quartile;
  }

  // 3. CAS Partition
  const cas = all.sciUp || all.sciBase;
  if (cas) {
    metadata.casPartition = cas;
  }

  // 4. Special Chinese Ranks
  if (all.ccf) {
    metadata.ccfRank = String(all.ccf);
  }
  if (all.cssci && (all.cssci === "是" || all.cssci === "收录")) {
    metadata.isCssci = true;
  }
  if (all.pku && (all.pku === "是" || all.pku === "收录")) {
    metadata.isPku = true;
  }
  if (all.sciwarn && all.sciwarn !== "无" && all.sciwarn !== "否") {
    metadata.sciWarn = String(all.sciwarn);
  }
}

async function fetchEasyScholarForScholar(journalName) {
  if (!journalName) return { success: false, error: "Journal name empty" };
  const settings = await chrome.storage.local.get(["easyscholar_key", "easyscholar_cache"]);
  const secretKey = (settings.easyscholar_key || "").trim();
  if (!secretKey) return { success: false, error: "No easyScholar secretKey configured" };

  const cache = settings.easyscholar_cache || {};
  const cacheKey = journalName.toLowerCase().trim();
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  if (cache[cacheKey]) {
    cache[cacheKey].expiresAt = cache[cacheKey].expiresAt || ((cache[cacheKey].cachedAt || 0) + CACHE_TTL_MS);
    cache[cacheKey].stale = Date.now() > cache[cacheKey].expiresAt;
  }
  if (cache[cacheKey] && !cache[cacheKey].stale) {
    return {
      success: true,
      ok: true,
      data: cache[cacheKey],
      fromCache: true,
      source: "easyScholar",
      cachedAt: cache[cacheKey].cachedAt || null,
      expiresAt: cache[cacheKey].expiresAt || null,
      stale: false
    };
  }

  // Enqueue easyScholar API request
  const rankData = await enqueueEasyScholar(journalName, secretKey);
  if (rankData) {
    const all = rankData.officialRank?.all || {};
    const formatted = {
      sciif: all.sciif || null,
      sci: all.sci || null,
      sciUp: all.sciUp || all.sciBase || null,
      ccf: all.ccf || null,
      cssci: all.cssci === "是" || all.cssci === "收录",
      pku: all.pku === "是" || all.pku === "收录",
      sciwarn: all.sciwarn && all.sciwarn !== "无" && all.sciwarn !== "否" ? all.sciwarn : null,
      source: "easyScholar",
      cachedAt: Date.now(),
      expiresAt: Date.now() + CACHE_TTL_MS,
      stale: false
    };
    cache[cacheKey] = formatted;
    await chrome.storage.local.set({ easyscholar_cache: cache });
    return { success: true, ok: true, data: formatted, fromCache: false, source: "easyScholar", cachedAt: formatted.cachedAt };
  }

  return { success: false, error: "No ranks matched in easyScholar API" };
}

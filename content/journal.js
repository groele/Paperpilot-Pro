/**
 * PaperPilot Pro - Journal Abstract Metacard Injector
 * Extracts Dublin Core & Highwire metadata, queries Unpaywall, and handles float card interactions.
 */

(function() {
  if (globalThis.__PAPERPILOT_JOURNAL_LOADED__) return;
  globalThis.__PAPERPILOT_JOURNAL_LOADED__ = true;

  let paperMeta = null;
  let cardEl = null;
  let currentTheme = "system";
  let pdfUrlCandidateCache = null;
  let siteProfileCache = null;
  let lastPdfDownloadStatus = null;
  let lastPdfDiscoveryDiagnostics = null;
  let initGeneration = 0;
  let storageListenerInstalled = false;
  const PDF_URL_CANDIDATE_CACHE_MS = 15000;
  const PDF_EMPTY_CANDIDATE_CACHE_MS = 1200;
  const MAX_PDF_URL_CANDIDATES = 32;

  function getIcon(name, fallback = "") {
    const icon = window.PP_ICONS?.[name];
    if (icon) return icon;
    if (name === "pin") {
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pp-feather pp-feather-pin"><path d="M12 17v5"></path><path d="M5 17h14"></path><path d="M7 9l2-7h6l2 7"></path><path d="M8 9h8l2 8H6l2-8z"></path></svg>`;
    }
    if (name === "pin_off") {
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pp-feather pp-feather-pin-off"><path d="M12 17v5"></path><path d="M5 17h14"></path><path d="M7 9l2-7h6l2 7"></path><path d="M8 9h8l2 8H6l2-8z"></path><line x1="4" y1="4" x2="20" y2="20"></line></svg>`;
    }
    if (name === "minimize") {
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pp-feather pp-feather-minus"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    }
    return fallback;
  }

  function robustCopyToClipboard(text) {
    if (!text) return Promise.reject(new Error("Empty copy text"));
    if (navigator.clipboard && (window.isSecureContext || location.protocol === 'https:')) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (successful) resolve();
        else reject(new Error("execCommand copy failed"));
      } catch (err) {
        reject(err);
      }
    });
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

  const PDF_PRIORITY_SELECTORS = [
    "a.c-pdf-download__link",
    "a[data-track-action='download pdf']",
    "a[data-track-action='Pdf download']",
    "a[data-track-action='PDF download']",
    "a[aria-label*='Download PDF' i]",
    "a[title*='Download PDF' i]",
    "a.pdf-download-btn",
    "a.c-pdf__button",
    "a.wd-jnl-art-pdf",
    "a.al-link.pdf",
    "a.download-pdf",
    "a.download-pdf-link",
    "a.article-pdf-download",
    "a.article-tools__pdf",
    "a.article-header__download-pdf",
    "a[data-testid*='pdf' i]",
    "a[data-test*='pdf' i]",
    "a[data-aa-name*='pdf' i]",
    "a[aria-label*='PDF' i]",
    "a[aria-label*='Download' i][href*='pdf' i]",
    ".pdf-link a",
    "a[download][href*='pdf']",
    "a[href*='/pdfdirect/']",
    "a[href*='/article-pdf/']",
    "a[href*='/content/pdf/']",
    "a[href*='/doi/pdf/']",
    "a[href*='/doi/epdf/']",
    "a[href*='/pdfdownload/']",
    "a[href*='/pdffile/']",
    "a[href*='/pdfft']",
    "a[href*='/viewer/'][href*='pdf' i]",
    "a[href*='download=pdf' i]",
    "a[href*='downloadpdf' i]",
    "a[href*='type=printable' i]",
    "a[title*='PDF' i]",
    "a.c-article-pdf-preview",
    "a[href*='pdf'][role='button']",
    "a[href$='.pdf']",
    "a[href*='.pdf?']"
  ];

  const PDF_META_SELECTORS = [
    "meta[name='citation_pdf_url']",
    "meta[property='citation_pdf_url']",
    "meta[name='eprints.document_url']",
    "meta[name='prism.pdf']",
    "meta[name='bepress_citation_pdf_url']",
    "meta[name='wkhealth_pdf_url']",
    "link[type='application/pdf']",
    "link[rel='alternate'][type='application/pdf']"
  ];

  const PDF_EMBED_SELECTORS = [
    "iframe[src]",
    "embed[src]",
    "object[data]",
    "iframe[data-src]",
    "embed[data-src]"
  ];

  function getIcon(name, fallback = "") {
    const icon = window.PP_ICONS?.[name];
    if (icon) return icon;
    if (name === "pin") {
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pp-feather pp-feather-pin"><path d="M12 17v5"></path><path d="M5 17h14"></path><path d="M7 9l2-7h6l2 7"></path><path d="M8 9h8l2 8H6l2-8z"></path></svg>`;
    }
    if (name === "pin_off") {
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pp-feather pp-feather-pin-off"><path d="M12 17v5"></path><path d="M5 17h14"></path><path d="M7 9l2-7h6l2 7"></path><path d="M8 9h8l2 8H6l2-8z"></path><line x1="4" y1="4" x2="20" y2="20"></line></svg>`;
    }
    if (name === "minimize") {
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pp-feather pp-feather-minus"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    }
    return fallback;
  }

  function getCurrentSiteProfile() {
    const href = window.location.href;
    if (siteProfileCache && siteProfileCache.href === href) {
      return siteProfileCache.profile;
    }

    const profile = window.PaperPilotCore?.siteProfiles?.resolve?.(href) || null;
    siteProfileCache = { href, profile };
    return profile;
  }

  function escapeHtml(value) {
    return window.PaperPilotCore?.sanitize?.escapeHtml
      ? window.PaperPilotCore.sanitize.escapeHtml(value)
      : String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return window.PaperPilotCore?.sanitize?.escapeAttr
      ? window.PaperPilotCore.sanitize.escapeAttr(value)
      : escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getCandidateUrl(candidate) {
    return typeof candidate === "string" ? candidate : candidate?.url || "";
  }

  function normalizeUrlForCompare(rawUrl) {
    try {
      const url = new URL(rawUrl, window.location.href);
      url.hash = "";
      return url.href.replace(/\/$/, "").toLowerCase();
    } catch (e) {
      return String(rawUrl || "").replace(/#.*$/, "").replace(/\/$/, "").toLowerCase();
    }
  }

  function isSameUrl(a, b) {
    return normalizeUrlForCompare(a) === normalizeUrlForCompare(b);
  }

  function querySelectorAllSafe(selectors) {
    const selectorList = Array.isArray(selectors) ? selectors.join(",") : selectors;
    try {
      return Array.from(document.querySelectorAll(selectorList));
    } catch (e) {
      if (!Array.isArray(selectors)) return [];
      const nodes = [];
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(node => nodes.push(node));
        } catch (_) {}
      });
      return nodes;
    }
  }

  function isSupplementaryPdfElement(el) {
    const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.toLowerCase();
    return text.includes("supplementary") ||
      text.includes("supplemental") ||
      text.includes("supporting information") ||
      text.includes("peer review") ||
      text.includes("citation") ||
      text.includes("references") ||
      text.includes("bibtex") ||
      text.includes("ris");
  }

  function isPublisherChallengePage() {
    const title = (document.title || "").toLowerCase();
    const bodyPreview = (document.body?.textContent || "").slice(0, 1200).toLowerCase();
    const challengeHints = [
      "just a moment",
      "checking your browser",
      "enable javascript and cookies",
      "verify you are human",
      "access denied",
      "attention required",
      "unusual traffic"
    ];
    return challengeHints.some(hint => title.includes(hint) || bodyPreview.includes(hint));
  }

  function isLikelyPdfUrl(rawUrl) {
    if (!rawUrl) return false;
    let url;
    try {
      url = new URL(rawUrl, window.location.href);
    } catch (e) {
      return false;
    }
    const href = url.href.toLowerCase();
    const path = url.pathname.toLowerCase();
    return path.endsWith(".pdf") ||
      path.includes("/pdf/") ||
      path.includes("/pdfdirect/") ||
      path.includes("/epdf/") ||
      path.includes("/article-pdf/") ||
      path.includes("/content/pdf/") ||
      path.includes("/download/pdf") ||
      path.includes("/pdffile/") ||
      path.includes("/pdfft") ||
      href.includes(".pdf?") ||
      href.includes("pdf=true") ||
      url.searchParams.has("downloadpdf") ||
      url.searchParams.get("download") === "pdf" ||
      url.searchParams.get("type") === "printable" ||
      ["file", "url", "src", "pdf"].some(param => isLikelyPdfParamValue(url.searchParams.get(param)));
  }

  function isLikelyPdfParamValue(value) {
    if (!value) return false;
    let decoded = String(value).toLowerCase();
    try {
      decoded = decodeURIComponent(value).toLowerCase();
    } catch (e) {}
    return decoded.includes(".pdf") ||
      decoded.includes("/pdf/") ||
      decoded.includes("/pdfdirect/") ||
      decoded.includes("/epdf/") ||
      decoded.includes("/article-pdf/") ||
      decoded.includes("/content/pdf/");
  }

  function extractPdfUrlFromViewerParams(rawUrl) {
    try {
      const url = new URL(rawUrl, window.location.href);
      for (let param of ["file", "url", "src", "pdf"]) {
        const value = url.searchParams.get(param);
        if (isLikelyPdfParamValue(value)) {
          return new URL(value, window.location.href).href;
        }
      }
    } catch (e) {}
    return "";
  }

  function getScienceDirectPii(rawUrl = window.location.href) {
    let url;
    try {
      url = new URL(rawUrl, window.location.href);
    } catch (e) {
      return "";
    }

    const host = url.hostname.toLowerCase();
    if (!host.includes("sciencedirect.com") && !host.includes("elsevier.com")) return "";

    const source = `${url.pathname}${url.search}`;
    const patterns = [
      /\/science\/article\/pii\/([^/?#]+)/i,
      /\/reader\/sd\/pii\/([^/?#]+)/i,
      /[?&]pii=([^&#]+)/i,
      /[?&]pid=([^&#]+)/i
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        return decodeURIComponent(match[1]).replace(/\.pdf$/i, "");
      }
    }

    return "";
  }

  function hasScienceDirectSignedPdfParams(url) {
    return Boolean(url.searchParams.get("md5") && url.searchParams.get("pid"));
  }

  function finalizeScienceDirectDownloadUrl(url) {
    url.searchParams.set("download", "true");
    if (!url.searchParams.has("isDTMRedir")) {
      url.searchParams.set("isDTMRedir", "true");
    }
    return url.href;
  }

  function normalizeScienceDirectPdfUrl(candidate, rawUrl = window.location.href) {
    if (!candidate) return "";
    let url;
    try {
      url = new URL(candidate, rawUrl);
    } catch (e) {
      return "";
    }

    const host = url.hostname.toLowerCase();
    if (!host.includes("sciencedirect.com") && !host.includes("elsevier.com")) {
      return url.href;
    }

    const pii = getScienceDirectPii(url.href);
    if (!pii) return url.href;

    const path = url.pathname.toLowerCase();
    if ((path.includes("/pdfft") || path.endsWith("/pdf") || path.includes("/pdf/")) && hasScienceDirectSignedPdfParams(url)) {
      return finalizeScienceDirectDownloadUrl(url);
    }

    return "";
  }

  function preparePdfCandidateUrl(candidate, baseUrl = window.location.href) {
    if (!candidate) return "";
    try {
      const url = new URL(candidate, baseUrl);
      const host = url.hostname.toLowerCase();
      if (host.includes("sciencedirect.com") || host.includes("elsevier.com")) {
        return normalizeScienceDirectPdfUrl(url.href, baseUrl);
      }
      return url.href;
    } catch (e) {
      return candidate;
    }
  }

  function getScienceDirectPdfUrlFromDom() {
    const host = window.location.hostname.toLowerCase();
    if (!host.includes("sciencedirect.com") && !host.includes("elsevier.com")) {
      return "";
    }

    const selectors = [
      "a[href*='/pdfft']",
      "a[href*='/science/article/pii/'][href*='pdf' i]",
      "a[href*='/reader/sd/pii/']",
      "a[data-aa-name*='pdf' i]",
      "a[data-testid*='pdf' i]",
      "a[aria-label*='pdf' i]",
      "a[title*='pdf' i]",
      "button[data-aa-name*='pdf' i]",
      "button[data-testid*='pdf' i]",
      "button[aria-label*='pdf' i]",
      "[data-pii]",
      "[data-pii-value]",
      "[data-article-pii]"
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;

      const href = el.href || el.getAttribute("href") || el.getAttribute("data-href") || el.getAttribute("data-url") || "";
      const normalizedHref = normalizeScienceDirectPdfUrl(href);
      if (normalizedHref) return normalizedHref;

      const pii = el.getAttribute("data-pii") || el.getAttribute("data-pii-value") || el.getAttribute("data-article-pii") || "";
      if (pii) continue;
    }

    const scripts = Array.from(document.scripts || []);
    let scannedChars = 0;
    for (const script of scripts) {
      const text = script.textContent || "";
      if (!text || !/(pdfft|reader\/sd\/pii|science\/article\/pii)/i.test(text)) continue;
      scannedChars += text.length;
      if (scannedChars > 2000000) break;

      const encodedUrlMatch = text.match(/(?:https?:\\?\/\\?\/[^"'<>\s]+sciencedirect\.com[^"'<>\s]+|\/science\/article\/pii\/[^"'<>\s]+\/(?:pdf|pdfft)[^"'<>\s]*)/i);
      if (encodedUrlMatch && encodedUrlMatch[0]) {
        const candidate = encodedUrlMatch[0]
          .replace(/\\u002F/g, "/")
          .replace(/\\u0026/g, "&")
          .replace(/\\\//g, "/")
          .replace(/&amp;/g, "&");
        const normalized = normalizeScienceDirectPdfUrl(candidate);
        if (normalized) return normalized;
      }
    }

    return "";
  }

  function inferPublisherPdfUrlFromCurrentPage(rawUrl = window.location.href) {
    let url;
    try {
      url = new URL(cleanProxyUrl(rawUrl));
    } catch (e) {
      return "";
    }

    const host = url.hostname.toLowerCase();
    const path = url.pathname;

    // Nature / Springer Nature article pages expose stable PDFs at /articles/{article-id}.pdf.
    if (host.includes("nature.com") && /\/articles\/[^/?#]+$/i.test(path) && !isLikelyPdfUrl(url.href)) {
      return `${url.origin}${path}.pdf`;
    }

    if (host.includes("sciencedirect.com") || host.includes("elsevier.com")) {
      const pii = getScienceDirectPii(url.href);
      if (pii) return "";
    }

    return "";
  }

  function addUrlCandidate(candidates, rawUrl, baseUrl = window.location.href, seen = null, details = {}) {
    if (!rawUrl) return;
    try {
      const parsed = new URL(rawUrl, baseUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
      const url = parsed.href;
      const key = normalizeUrlForCompare(url);
      if (seen) {
          if (seen.has(key)) return;
          seen.add(key);
        }
      if (!candidates.some(candidate => getCandidateUrl(candidate) === url)) {
        candidates.push({
          url,
          source: details.source || "dom-link-scan",
          text: details.text || "",
          reason: details.reason || "",
          score: details.score || 0
        });
      }
    } catch (e) {
      const key = normalizeUrlForCompare(rawUrl);
      if (seen) {
        if (seen.has(key)) return;
        seen.add(key);
      }
      if (!candidates.some(candidate => getCandidateUrl(candidate) === rawUrl)) {
        candidates.push({
          url: rawUrl,
          source: details.source || "dom-link-scan",
          text: details.text || "",
          reason: details.reason || "",
          score: details.score || 0
        });
      }
    }
  }

  function collectPdfUrlCandidates() {
    const cacheKey = normalizeUrlForCompare(window.location.href);
    if (pdfUrlCandidateCache &&
        pdfUrlCandidateCache.key === cacheKey &&
        Date.now() - pdfUrlCandidateCache.createdAt < (pdfUrlCandidateCache.urls.length ? PDF_URL_CANDIDATE_CACHE_MS : PDF_EMPTY_CANDIDATE_CACHE_MS)) {
      return pdfUrlCandidateCache.urls.slice();
    }

    const discovery = window.PaperPilotCore?.pdfDiscovery?.collect?.(document, window.location, {
      maxCandidates: MAX_PDF_URL_CANDIDATES,
      maxNodes: 3000,
      maxShadowRoots: 16,
      maxElementsPerRoot: 2500,
      maxScriptChars: 400000,
      deferDeepScan: true
    });
    if (discovery) {
      const specialized = [
        getScienceDirectPdfUrlFromDom(),
        inferPublisherPdfUrlFromCurrentPage(window.location.href),
        extractPdfUrlFromViewerParams(window.location.href)
      ].filter(Boolean).map(url => ({
        url: preparePdfCandidateUrl(url),
        source: "publisher-specialized",
        reason: "publisher-specific page extraction",
        score: 97
      }));
      const urls = window.PaperPilotCore?.pdf?.preparePdfCandidates
        ? window.PaperPilotCore.pdf.preparePdfCandidates([
            ...specialized,
            ...(discovery.candidates || [])
          ], { baseUrl: window.location.href }).slice(0, MAX_PDF_URL_CANDIDATES)
        : [...specialized, ...(discovery.candidates || [])].slice(0, MAX_PDF_URL_CANDIDATES);
      lastPdfDiscoveryDiagnostics = discovery.diagnostics || null;
      pdfUrlCandidateCache = {
        key: cacheKey,
        createdAt: Date.now(),
        urls
      };
      return urls.slice();
    }

    const candidates = [];
    const seen = new Set();
    const add = (rawUrl, baseUrl = window.location.href, details = {}) => {
      if (candidates.length >= MAX_PDF_URL_CANDIDATES) return;
      addUrlCandidate(candidates, rawUrl, baseUrl, seen, details);
    };

    querySelectorAllSafe(PDF_PRIORITY_SELECTORS).forEach(el => {
      if (!isSupplementaryPdfElement(el)) {
        const rawUrl = el.href || el.getAttribute("href") || el.getAttribute("data-href") || el.getAttribute("data-url") || "";
        add(preparePdfCandidateUrl(rawUrl), window.location.href, {
          source: "explicit-pdf-button",
          text: `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`.trim(),
          reason: "matched priority PDF selector",
          score: 96
        });
      }
    });

    querySelectorAllSafe(PDF_META_SELECTORS).forEach(el => {
      const name = el.getAttribute("name") || el.getAttribute("property") || el.getAttribute("rel") || "";
      const pdfMetaSource = /citation_pdf_url/i.test(name) ? "citation_pdf_url" : "pdf-meta";
      add(preparePdfCandidateUrl(el.content || el.href || el.getAttribute("href") || ""), window.location.href, {
        source: pdfMetaSource,
        text: name,
        reason: "matched PDF metadata tag",
        score: /citation_pdf_url/i.test(name) ? 94 : 90
      });
    });

    querySelectorAllSafe(PDF_EMBED_SELECTORS).forEach(el => {
      const candidate = el.getAttribute("src") || el.getAttribute("data") || el.getAttribute("data-src") || "";
      if (candidate && isLikelyPdfUrl(candidate)) {
        add(preparePdfCandidateUrl(candidate), window.location.href, {
          source: "embedded-pdf-viewer",
          reason: "matched embedded PDF viewer",
          score: 84
        });
      }
    });

    if (candidates.length < MAX_PDF_URL_CANDIDATES) {
      const allLinks = document.links || document.querySelectorAll("a[href]");
      for (const link of allLinks) {
        if (candidates.length >= MAX_PDF_URL_CANDIDATES) break;
        if (isSupplementaryPdfElement(link)) continue;
        const href = link.href || "";
        const lowerHref = href.toLowerCase();
        const text = `${link.textContent || ""} ${link.getAttribute("aria-label") || ""} ${link.getAttribute("title") || ""}`.toLowerCase();
        const trimmedText = text.trim();
        if (isLikelyPdfUrl(href) ||
            trimmedText === "pdf" ||
            text.includes("download pdf") ||
            text.includes("open pdf") ||
            text.includes("pdf full text") ||
            text.includes("下载pdf") ||
            (text.includes("pdf") && (lowerHref.includes("download") || lowerHref.includes("article") || lowerHref.includes("doi") || lowerHref.includes("pii")))) {
          add(preparePdfCandidateUrl(href), window.location.href, {
            source: "dom-link-scan",
            text,
            reason: "matched page PDF link scan",
            score: trimmedText === "pdf" || text.includes("download pdf") ? 82 : 70
          });
        }
      }
    }

    add(inferPublisherPdfUrlFromCurrentPage(window.location.href), window.location.href, {
      source: "publisher-rule:page-inference",
      reason: "inferred from current publisher URL",
      score: 92
    });
    add(extractPdfUrlFromViewerParams(window.location.href), window.location.href, {
      source: "viewer-param",
      reason: "extracted from PDF viewer parameter",
      score: 88
    });

    const urls = candidates.filter(Boolean).slice(0, MAX_PDF_URL_CANDIDATES);
    pdfUrlCandidateCache = {
      key: cacheKey,
      createdAt: Date.now(),
      urls
    };
    return urls.slice();
  }

  function buildDownloadUrlCandidates() {
    const siteProfile = getCurrentSiteProfile();
    const candidates = [
      ...(siteProfile?.pdfCandidates || []),
      ...collectPdfUrlCandidates(),
      paperMeta?.pdfUrl ? { url: paperMeta.pdfUrl, source: "metadata-pdf-url", reason: "enriched metadata PDF URL", score: 88 } : null,
      { url: inferPublisherPdfUrlFromCurrentPage(window.location.href), source: "publisher-rule:page-inference", reason: "inferred from current publisher URL", score: 92 },
      { url: extractPdfUrlFromViewerParams(window.location.href), source: "viewer-param", reason: "extracted from PDF viewer parameter", score: 88 }
    ];

    if (paperMeta?.pdfUrl) {
      const landingDerived = inferPublisherPdfUrlFromCurrentPage(paperMeta.pdfUrl);
      if (landingDerived) {
        candidates.push({
          url: landingDerived,
          source: "publisher-rule:metadata-landing",
          reason: "inferred from metadata landing URL",
          score: 92
        });
      }
    }

    return candidates.filter(candidate => getCandidateUrl(candidate));
  }

  function getPdfCandidateDiagnostics() {
    const rawCandidates = buildDownloadUrlCandidates();
    const siteProfile = getCurrentSiteProfile();
    const prepared = window.PaperPilotCore?.pdf?.preparePdfCandidates
      ? window.PaperPilotCore.pdf.preparePdfCandidates(rawCandidates)
      : rawCandidates.map(url => ({ url, source: "page", score: 0 }));
    const first = prepared[0] || null;
    return {
      count: prepared.length,
      firstSource: first?.source || "无",
      fast: Boolean(first && window.PaperPilotCore?.pdf?.shouldFastDownloadCandidate?.(first)),
      firstUrl: first?.url || "",
      lastError: lastPdfDownloadStatus?.errorCode || "",
      profileId: siteProfile?.id || "unknown",
      discovery: lastPdfDiscoveryDiagnostics
    };
  }

  function formatPdfDownloadError(response) {
    const code = response?.errorCode || "";
    const map = {
      PDF_URL_MISSING: "未发现可下载的 PDF 候选链接",
      PDF_NOT_CONFIRMED: "候选链接未确认是正文 PDF",
      PDF_AUTH_REQUIRED: "出版商要求登录或机构访问",
      PDF_HTML_RESPONSE: "候选链接返回的是网页而不是 PDF",
      PDF_TIMEOUT: "PDF 校验超时，可尝试重新下载",
      PDF_NETWORK_ERROR: "网络请求失败，请检查代理或机构网络",
      PDF_DOWNLOAD_FAILED: "浏览器下载任务创建失败",
      PDF_PAGE_CONTEXT_UNAVAILABLE: "当前页面无法执行原生 PDF 下载",
      PDF_PAGE_CONTEXT_FAILED: "页面上下文 PDF 下载失败"
    };
    return map[code] || response?.error || "PDF 下载失败";
  }

  function updatePdfDiagnostics(response = null) {
    if (response) lastPdfDownloadStatus = response;
    const target = cardEl?.querySelector("#pp-jc-pdf-diag");
    if (!target) return;
    const diagnostics = getPdfCandidateDiagnostics();
    const parts = [
      `站点 ${diagnostics.profileId}`,
      `候选 ${diagnostics.count}`,
      `首选 ${diagnostics.firstSource}`,
      diagnostics.fast ? "快速下载" : "需校验"
    ];
    const perf = response?.diagnostics || null;
    if (perf) {
      const cacheLabel = perf.cacheHit === "request"
        ? "请求缓存命中"
        : (perf.cacheHit === "url" ? "URL缓存命中" : "");
      if (cacheLabel) parts.push(cacheLabel);
      if (perf.verificationMode) parts.push(perf.verificationMode);
      if (Number.isFinite(perf.attemptedCount)) parts.push(`尝试 ${perf.attemptedCount}`);
      if (perf.discoveryMode && perf.discoveryMode !== "candidate-cache") parts.push(`发现 ${perf.discoveryMode}`);
      if (perf.transport) parts.push(`传输 ${perf.transport}`);
      if (perf.fallbackUsed) parts.push("页面回退");
      if (Number.isFinite(perf.durationMs) && perf.durationMs > 0) parts.push(`${perf.durationMs}ms`);
    }
    if (response && !response.ok && !response.success) {
      parts.push(formatPdfDownloadError(response));
    }
    target.textContent = parts.join(" · ");
    if (diagnostics.firstUrl) target.title = diagnostics.firstUrl;
  }

  function inferJournalFromHost(rawUrl = window.location.href) {
    let host = "";
    try {
      host = new URL(cleanProxyUrl(rawUrl)).hostname.toLowerCase();
    } catch (e) {
      host = window.location.hostname.toLowerCase();
    }

    const hostMap = [
      ["nature.com", "Nature Portfolio"],
      ["science.org", "Science"],
      ["sciencedirect.com", "ScienceDirect"],
      ["springer.com", "Springer"],
      ["springerlink.com", "Springer"],
      ["wiley.com", "Wiley Online Library"],
      ["pubs.acs.org", "ACS Publications"],
      ["ieee.org", "IEEE Xplore"],
      ["arxiv.org", "arXiv"],
      ["biorxiv.org", "bioRxiv"],
      ["medrxiv.org", "medRxiv"],
      ["cell.com", "Cell Press"],
      ["thelancet.com", "The Lancet"],
      ["plos.org", "PLOS"],
      ["mdpi.com", "MDPI"],
      ["frontiersin.org", "Frontiers"],
      ["tandfonline.com", "Taylor & Francis Online"],
      ["sagepub.com", "SAGE Journals"],
      ["oup.com", "Oxford Academic"],
      ["cambridge.org", "Cambridge Core"],
      ["rsc.org", "Royal Society of Chemistry"],
      ["aps.org", "APS Journals"],
      ["pnas.org", "PNAS"],
      ["aip.org", "AIP Publishing"],
      ["iopscience.iop.org", "IOPscience"],
      ["spiedigitallibrary.org", "SPIE Digital Library"],
      ["dl.acm.org", "ACM Digital Library"],
      ["jstor.org", "JSTOR"],
      ["projecteuclid.org", "Project Euclid"],
      ["jstage.jst.go.jp", "J-STAGE"],
      ["pmc.ncbi.nlm.nih.gov", "PubMed Central"],
      ["pubmed.ncbi.nlm.nih.gov", "PubMed"],
      ["ncbi.nlm.nih.gov", "NCBI"]
    ];

    return hostMap.find(([domain]) => host.includes(domain))?.[1] || "";
  }

  function isCurrentPdfSurface() {
    const contentType = (document.contentType || "").toLowerCase();
    return contentType.includes("pdf") || isLikelyPdfUrl(window.location.href);
  }

  // Institutional Proxy & VPN (EZproxy / Bupt vpn) URL cleaner
  function cleanProxyUrl(urlString) {
    if (!urlString) return "";
    try {
      const url = new URL(urlString);
      let host = url.hostname.toLowerCase();
      
      // 1. Strip EZproxy patterns
      const proxyPatterns = [
        /\.ezp\./i,
        /\.ezproxy\./i,
        /\.proxy\./i,
        /\.libproxy\./i
      ];
      for (let pattern of proxyPatterns) {
        const match = host.split(pattern);
        if (match.length > 1) {
          host = match[0];
          break;
        }
      }
      
      // 2. Strip VPN patterns
      if (host.includes(".vpn.") || host.includes("-vpn-") || host.includes("-s.vpn.")) {
        const parts = host.split(/\.vpn\.|-s\.vpn\.|-vpn-/i);
        if (parts.length > 0) {
          host = parts[0];
        }
      }
      
      // 3. General flattened domain normalization (convert link-springer-com to link.springer.com)
      if (host.includes("-com") || host.includes("-org") || host.includes("-net") || host.includes("-edu") || host.includes("-gov") || host.includes("-co-uk")) {
        host = host.replace(/-com\b/g, ".com")
                   .replace(/-org\b/g, ".org")
                   .replace(/-net\b/g, ".net")
                   .replace(/-edu\b/g, ".edu")
                   .replace(/-gov\b/g, ".gov")
                   .replace(/-co-uk\b/g, ".co.uk")
                   .replace(/-gov-cn\b/g, ".gov.cn");
        host = host.replace(/-/g, ".");
      }
      
      if (url.searchParams.has("url")) {
        const targetUrl = url.searchParams.get("url");
        if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
          return cleanProxyUrl(targetUrl);
        }
      }
      
      url.hostname = host;
      return url.href;
    } catch (e) {
      return urlString;
    }
  }

  function updateAllThemes() {
    const card = document.getElementById("pp-journal-metacard");
    if (card) {
      card.setAttribute("data-pp-theme", currentTheme);
    }
    const toasts = document.querySelectorAll(".pp-jc-toast");
    toasts.forEach(t => t.setAttribute("data-pp-theme", currentTheme));
  }

  function flattenJsonLd(value, output = []) {
    if (!value) return output;
    if (Array.isArray(value)) {
      value.forEach(item => flattenJsonLd(item, output));
      return output;
    }
    if (typeof value !== "object") return output;

    output.push(value);
    if (value["@graph"]) flattenJsonLd(value["@graph"], output);
    return output;
  }

  function getJsonLdNodes() {
    const nodes = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        flattenJsonLd(JSON.parse(script.textContent || ""), nodes);
      } catch (_) {}
    });
    return nodes;
  }

  function getJsonLdArticle() {
    const articleTypes = new Set([
      "ScholarlyArticle",
      "MedicalScholarlyArticle",
      "Report",
      "Article",
      "CreativeWork",
      "TechArticle"
    ]);

    return getJsonLdNodes().find(node => {
      const rawType = node["@type"];
      const types = Array.isArray(rawType) ? rawType : [rawType];
      return types.some(type => articleTypes.has(String(type || "").replace(/^schema:/i, ""))) &&
             (node.headline || node.name || node.doi || node.identifier);
    }) || null;
  }

  function normalizeJsonLdText(value) {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "object") {
      return (value.name || value.headline || value.value || value["@value"] || "").trim?.() || "";
    }
    return String(value).trim();
  }

  function extractDoiFromCandidates(candidates) {
    const coreExtractor = window.PaperPilotCore?.metadata?.extractDoi;
    if (typeof coreExtractor === "function") {
      return coreExtractor(candidates);
    }

    const doiRegex = /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*|info:doi\/)?(10\.\d{4,9}\/[^\s"'<>]+)/ig;
    for (const candidate of candidates.flat(Infinity)) {
      if (candidate === null || candidate === undefined) continue;
      const text = typeof candidate === "string"
        ? candidate
        : (normalizeJsonLdText(candidate) || JSON.stringify(candidate));
      doiRegex.lastIndex = 0;
      let match;
      while ((match = doiRegex.exec(text))) {
        const doi = String(match[1] || match[0])
          .trim()
          .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
          .replace(/^info:doi\//i, "")
          .replace(/^doi:\s*/i, "")
          .replace(/[?#].*$/, "")
          .replace(/[.,;:)\]}]+$/g, "");
        if (/^10\.\d{4,9}\/\S+$/i.test(doi)) return doi;
      }
    }
    return "";
  }

  function extractJsonLdDoi(article) {
    if (!article) return "";
    const candidates = [
      article.doi,
      article.identifier,
      article.sameAs,
      article.url,
      article.mainEntityOfPage
    ];

    return extractDoiFromCandidates(candidates);
  }

  function hasAcademicMetadata() {
    let path = window.location.pathname.toLowerCase();
    let host = window.location.hostname.toLowerCase();

    try {
      const cleaned = new URL(cleanProxyUrl(window.location.href));
      path = cleaned.pathname.toLowerCase();
      host = cleaned.hostname.toLowerCase();
    } catch (e) {}

    // 1. Exclude homepages, empty paths, and standard help/search directories
    if (path === "/" || path === "/index.html" || path === "/index.htm" || path === "/index.php") {
      return false;
    }
    
    // Ignore search, collections, browse, login, help pages, etc.
    const nonArticlePatterns = [
      /\/search\b/, /\/browse\b/, /\/explore\b/, /\/collections\b/, 
      /\/subjects\b/, /\/about\b/, /\/help\b/, /\/terms\b/, 
      /\/privacy\b/, /\/contact\b/, /\/login\b/, /\/register\b/
    ];
    if (nonArticlePatterns.some(pat => pat.test(path))) {
      return false;
    }

    // Publisher anti-bot / access challenge pages can inherit academic URLs but do not expose article data.
    // Stop here so stale metadata is not shown and HTML challenge pages are never offered as PDF downloads.
    if (isPublisherChallengePage()) {
      return false;
    }

    // 2. High-confidence Academic Metadata tags (og:type removed)
    const academicKeys = [
      "citation_title", "citation_doi", "citation_journal_title", "citation_author",
      "citation_publication_date", "dc.identifier.doi", "dc.identifier", "dc.title",
      "dc.date", "dc.creator", "prism.doi", "prism.publicationName", "prism.coverDate",
      "bepress_citation_doi", "eprints.title", "wkhealth_title", "article:doi",
      "article:published_time", "rft_id", "rft.jtitle", "rft.atitle", "dc.publisher"
    ];
    const hasMetaTags = academicKeys.some(key => {
      const el = document.querySelector(`meta[name="${key}"], meta[property="${key}"]`);
      return el && el.content && el.content.trim().length > 0;
    });
    if (hasMetaTags || getJsonLdArticle()) return true;

    // 3. Fallback: known academic publisher domain AND specific article indicators
    const academicDomains = [
      "nature.com", "science.org", "sciencedirect.com", "springer.com", "springerlink.com",
      "wiley.com", "onlinelibrary.wiley.com", "pubs.acs.org", "ieee.org", "ieeexplore.ieee.org",
      "arxiv.org", "biorxiv.org", "medrxiv.org", "cell.com", "thelancet.com",
      "plos.org", "journals.plos.org", "mdpi.com", "frontiersin.org", "tandfonline.com",
      "sagepub.com", "oup.com", "academic.oup.com", "cambridge.org", "rsc.org",
      "aps.org", "journals.aps.org", "pnas.org", "jbc.org", "aip.org",
      "pubs.aip.org", "iopscience.iop.org", "optica.org", "spiedigitallibrary.org",
      "royalsocietypublishing.org", "annualreviews.org", "nejm.org", "jamanetwork.com",
      "bmj.com", "lww.com", "karger.com", "hindawi.com", "degruyter.com", "emerald.com",
      "dl.acm.org", "asa.scitation.org", "scitation.org", "jstage.jst.go.jp", "copernicus.org",
      "egusphere.copernicus.org", "agu.org", "physiology.org", "ahajournals.org",
      "asm.org", "aacrjournals.org", "psychiatryonline.org", "thieme-connect.de",
      "ametsoc.org", "worldscientific.com", "jto.org", "jci.org", "jps.jp",
      "biomedcentral.com", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
      "pmc.ncbi.nlm.nih.gov", "jstor.org", "projecteuclid.org", "muse.jhu.edu",
      "elife.org", "peerj.com", "f1000research.com", "ssrn.com", "researchsquare.com",
      "preprints.org", "chemrxiv.org", "eartharxiv.org", "zenodo.org", "figshare.com",
      "osf.io", "doaj.org", "scielo.org", "redalyc.org", "europepmc.org",
      "siam.org", "ams.org", "maa.org", "edpsciences.org", "cshlp.org",
      "microbiologyresearch.org", "genetics.org", "rupress.org", "portlandpress.com",
      "brill.com", "mitpressjournals.org", "journals.uchicago.edu", "ucpress.edu",
      "allenpress.com", "ingentaconnect.com", "cabi.org", "ajol.info"
    ];

    const isAcademicHost = academicDomains.some(domain => host.includes(domain));
    if (!isAcademicHost) return false;

    // Must have at least one article-related URL path segment, DOI pattern, or DOM abstract container
    const articleKeywords = [
      "/article", "/doi", "/abs", "/pdf", "/content", "/document", 
      "/pubmed", "/pmc", "/journal", "/pii/", "/fulltext", "/download", "/pdf/", "/epdf/",
      "/reader", "/view", "/record", "/chapter", "/proceedings", "/paper", "/preprint",
      "/articles/", "/article-pdf/", "/stamp/", "/stable/", "/core/journals/"
    ];
    const hasArticleKeyword = articleKeywords.some(kw => path.includes(kw));

    const doiRegex = /\b10\.\d{4,9}\/[-._;()/:a-z0-9]+\b/i;
    const hasDoiInUrl = doiRegex.test(window.location.href);

    const hasAbstractEl = !!document.querySelector(".abstract, [class*='abstract'], #abstract, article.abstract, .abstract-content, #abstract-content");

    return isCurrentPdfSurface() || hasArticleKeyword || hasDoiInUrl || hasAbstractEl;
  }

  // Initialize
  function init() {
    const generation = ++initGeneration;
    if (!hasAcademicMetadata()) return false;

    // 1. Extract metadata from the current abstract page
    paperMeta = extractPageMetadata();
    console.log("PaperPilot Pro: Page metadata extracted:", paperMeta);

    if (!paperMeta.doi && !paperMeta.title) {
      console.log("PaperPilot Pro: No DOI or Title resolved on this page. Stopping.");
      return false;
    }

    // 2. Query Background for cache/Unpaywall/OpenAlex resolution
    safeSendMessage({
      action: "FETCH_METADATA",
      doi: paperMeta.doi,
      title: paperMeta.title,
      journal: paperMeta.journal,
      pageUrl: window.location.href
    }, (response) => {
      if (generation !== initGeneration) return;
      if (response && response.success && response.data) {
        const enriched = response.data;
        console.log("PaperPilot Pro: Metadata enriched successfully:", enriched);
        
        // Merge enriched data (including DOI)
        paperMeta.doi = enriched.doi || paperMeta.doi;
        paperMeta.pdfUrl = enriched.pdfUrl || paperMeta.pdfUrl;
        paperMeta.journal = enriched.journal || paperMeta.journal;
        paperMeta.authors = enriched.authors.length > 0 ? enriched.authors : paperMeta.authors;
        paperMeta.year = enriched.year || paperMeta.year;
        paperMeta.impactFactor = enriched.impactFactor;
        paperMeta.jcrQuartile = enriched.jcrQuartile;
        paperMeta.casPartition = enriched.casPartition || "N/A";
        paperMeta.citeScore = enriched.citeScore;
        paperMeta.oaStatus = enriched.oaStatus;
        paperMeta.isEstimated = false;
        paperMeta.ccfRank = enriched.ccfRank || "";
        paperMeta.isCssci = enriched.isCssci || false;
        paperMeta.isPku = enriched.isPku || false;
        paperMeta.sciWarn = enriched.sciWarn || "";
        paperMeta.metricsSource = enriched.metricsSource || "";
        paperMeta.source = enriched.source || response.source || "";
        paperMeta.cachedAt = enriched.cachedAt || response.cachedAt || null;

        // Auto Log to history as 'visited'
        logFootprint("visited");

        // 3. Handle Auto-Redirect if enabled
        chrome.storage.local.get(["auto_redirect", "pdf_landing_cache"], (config) => {
          if (generation !== initGeneration) return;
          if (config.auto_redirect && paperMeta.pdfUrl && !isSameUrl(paperMeta.pdfUrl, window.location.href)) {
            const landingCache = config.pdf_landing_cache || {};
            landingCache[paperMeta.pdfUrl] = window.location.href;
            chrome.storage.local.set({ pdf_landing_cache: landingCache }, () => {
              showToast("正在自动直链跳转至 PDF 全文页...");
              setTimeout(() => {
                window.location.href = paperMeta.pdfUrl;
              }, 1200);
            });
          } else {
            // 4. Inject Metacard float dashboard
            injectMetacard();
          }
        });
      } else {
        // Enriched failed, fallback to native metadata injection
        injectMetacard();
      }
    });

    // Load theme
    chrome.storage.local.get("appearance_mode", (res) => {
      if (res.appearance_mode) {
        currentTheme = res.appearance_mode;
        updateAllThemes();
      }
    });

    // Listen for storage changes
    if (!storageListenerInstalled) {
      storageListenerInstalled = true;
      chrome.storage.onChanged.addListener((changes) => {
      if (changes.appearance_mode) {
        currentTheme = changes.appearance_mode.newValue;
        updateAllThemes();
      }
      const shouldRedraw = changes.enable_metacard ||
                           changes.enable_metrics_display ||
                           changes.enable_metrics_auto_detect ||
                           changes.enable_copy_doi_btn ||
                           changes.enable_scholar_copy_doi_btn ||
                           changes.enable_journal_copy_doi_btn ||
                           changes.enable_pdf_download_btn ||
                           changes.enable_ai_summary_btn ||
                           changes.enable_ccf_badge ||
                           changes.enable_core_badge ||
                           changes.enable_warn_badge ||
                           changes.enable_if_badge ||
                           changes.enable_cas_badge ||
                           changes.enable_jcr_badge ||
                           changes.enable_cite_badge ||
                           changes.enable_pdf_badge ||
                           changes.easyscholar_key;
      if (shouldRedraw) {
        const card = document.getElementById("pp-journal-metacard");
        if (card) card.remove();
        chrome.storage.local.get("enable_metacard", (config) => {
          if (config.enable_metacard !== false) {
            injectMetacard();
          }
        });
      }
      });
    }
    return true;
  }

  // Local DOM PDF Link Sniffer for both OA and Institutional Paid Databases
  function sniffLocalPdfUrl() {
    // 0. Current document can already be the PDF surface (publisher PDF URL, browser PDF viewer, or ePDF route).
    const viewerPdfUrl = extractPdfUrlFromViewerParams(window.location.href);
    if (viewerPdfUrl) {
      return viewerPdfUrl;
    }
    if (isCurrentPdfSurface()) {
      return window.location.href;
    }

    const scienceDirectPdfUrl = getScienceDirectPdfUrlFromDom();
    if (scienceDirectPdfUrl) {
      return scienceDirectPdfUrl;
    }

    const collectedPdfUrl = getCandidateUrl(collectPdfUrlCandidates()[0]);
    if (collectedPdfUrl) {
      return collectedPdfUrl;
    }

    return inferPublisherPdfUrlFromCurrentPage() || "";
  }

  // Dublin Core & Highwire standard academic metadata extraction
  function extractPageMetadata() {
    const jsonLdArticle = getJsonLdArticle();
    const siteProfile = getCurrentSiteProfile();
    const getMeta = (names) => {
      for (let name of names) {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        if (el && el.content) return el.content.trim();
      }
      return "";
    };
    const getMetaCandidates = (names) => {
      const wanted = new Set(names.map(name => String(name).toLowerCase()));
      return Array.from(document.querySelectorAll("meta[name], meta[property]"))
        .filter(el => wanted.has(String(el.getAttribute("name") || el.getAttribute("property") || "").toLowerCase()))
        .map(el => (el.content || "").trim())
        .filter(Boolean);
    };

    // DOI Sniffer
    const doiMetaNames = [
      "citation_doi", "dc.identifier", "prism.doi", "doi", "dc.identifier.doi",
      "bepress_citation_doi", "eprints.id_number", "article:doi", "rft_id",
      "dc.Identifier", "dc.identifier.uri", "DC.Identifier", "DC.identifier"
    ];
    const doiLinkCandidates = Array.from(document.querySelectorAll("a[href*='doi.org/'], a[href*='/doi/10.']"))
      .flatMap(link => [link.href, link.textContent || ""]);
    const doi = extractDoiFromCandidates([
      ...(siteProfile?.doiCandidates || []),
      ...getMetaCandidates(doiMetaNames),
      extractJsonLdDoi(jsonLdArticle),
      window.location.href,
      ...doiLinkCandidates,
      document.body?.textContent?.slice(0, 20000) || ""
    ]);

    // Title Sniffer
    let title = getMeta([
      "citation_title", "dc.title", "prism.title", "og:title", "twitter:title",
      "bepress_citation_title", "eprints.title", "wkhealth_title", "rft.atitle",
      "DC.Title", "dc.Title", "article:title"
    ]) || normalizeJsonLdText(jsonLdArticle?.headline || jsonLdArticle?.name);
    if (!title) {
      const titleEl = document.querySelector("h1, [data-test='article-title'], [data-testid='article-title'], [data-article-title], [itemprop='headline'], [itemprop='name'], .article-title, .c-article-title, .publicationContentTitle, .citation__title, .hlFld-Title, .document-title, .chapter-title, .wi-article-title, .ArticleTitle, .NLM_article-title");
      title = (titleEl?.textContent || document.title).split(" - ")[0].split(" | ")[0].split(" - Nature")[0].trim();
    }

    // Abstract Sniffer
    let abstract = getMeta([
      "citation_abstract", "dc.description", "description", "og:description",
      "twitter:description", "bepress_citation_abstract", "eprints.abstract",
      "DC.Description", "dc.Description", "article:description"
    ]) || normalizeJsonLdText(jsonLdArticle?.abstract || jsonLdArticle?.description);
    if (!abstract || abstract.length < 50) {
      const abstractEl = document.querySelector(".abstract, [class*='abstract'], #abstract, article.abstract, .abstract-content, #abstract-content, [data-test='abstract'], [data-testid='abstract'], [itemprop='description'], .article-section__abstract, .c-article-section__content, .hlFld-Abstract, .abstractSection, .NLM_abstract, section[aria-labelledby*='abstract' i]");
      if (abstractEl) {
        abstract = abstractEl.innerText.replace(/abstract/i, "").trim();
      }
    }

    // Journal Venue name
    let journal = getMeta([
      "citation_journal_title", "citation_conference_title", "prism.publicationName",
      "citation_publisher", "dc.source", "og:site_name", "bepress_citation_journal_title",
      "eprints.publication", "journal_title", "container-title", "rft.jtitle",
      "rft.stitle", "DC.Source", "dc.Source", "dc.publisher", "article:publisher"
    ]) || normalizeJsonLdText(jsonLdArticle?.isPartOf || jsonLdArticle?.publisher);
    if (!journal) {
      journal = inferJournalFromHost();
    }

    // Authors list
    let authors = [];
    const authorEls = document.querySelectorAll('meta[name="citation_author"], meta[name="dc.creator"], meta[name="DC.Creator"], meta[name="article:author"], meta[property="article:author"]');
    authorEls.forEach(el => {
      if (el.content) authors.push(el.content.trim());
    });

    if (authors.length === 0) {
      const authorsMeta = getMeta(["citation_authors", "dc.creator", "DC.Creator", "bepress_citation_author", "eprints.creators_name", "rft.au"]);
      if (authorsMeta) {
        authors = authorsMeta.split(/[,;]/).map(a => a.trim());
      }
    }
    if (authors.length === 0 && jsonLdArticle?.author) {
      const jsonAuthors = Array.isArray(jsonLdArticle.author) ? jsonLdArticle.author : [jsonLdArticle.author];
      authors = jsonAuthors.map(normalizeJsonLdText).filter(Boolean);
    }

    // Year
    let year = new Date().getFullYear();
    const dateStr = getMeta([
      "citation_publication_date", "citation_date", "prism.coverDate", "dc.date",
      "article:published_time", "article:modified_time", "date", "bepress_citation_publication_date",
      "eprints.date", "DC.Date", "dc.Date", "prism.publicationDate", "epubdate", "pubdate"
    ]) || normalizeJsonLdText(jsonLdArticle?.datePublished || jsonLdArticle?.dateCreated);
    if (dateStr) {
      const yrMatch = dateStr.match(/\b(19|20)\d{2}\b/);
      if (yrMatch) year = parseInt(yrMatch[0]);
    }

    return {
      doi: doi || "",
      title: title || "",
      abstract: abstract || "",
      journal: journal || "",
      authors: authors,
      year: year,
      pdfUrl: sniffLocalPdfUrl() || "",
      impactFactor: "N/A",
      jcrQuartile: "N/A",
      casPartition: "N/A",
      citeScore: "N/A",
      oaStatus: "Closed",
      isEstimated: false,
      metricsSource: "unconfigured",
      source: "页面元数据",
      cachedAt: null,
      ccfRank: "",
      isCssci: false,
      isPku: false,
      sciWarn: ""
    };
  }

  // Deduce the original HTML landing page from redirect cache, DOI, or specific host rules
  function deduceLandingPage(rawUrl, doi, title, cachedLandingUrl) {
    // Rule 1: Check direct cache lookup first
    if (cachedLandingUrl) {
      return cachedLandingUrl;
    }

    // Rule 2: If DOI is valid, return doi.org URL
    if (doi && doi.trim().length > 0) {
      return `https://doi.org/${doi.trim()}`;
    }

    let host = window.location.hostname.toLowerCase();
    let url = rawUrl;
    try {
      url = cleanProxyUrl(rawUrl);
      host = new URL(url).hostname.toLowerCase();
    } catch (e) {}
    const href = url.toLowerCase();

    // Rule 3: arXiv PDF back-resolve
    if (host.includes("arxiv.org") && href.includes("/pdf/")) {
      const match = url.match(/\/pdf\/([^\s?#]+)/);
      if (match) {
        let id = match[1];
        if (id.endsWith(".pdf")) {
          id = id.slice(0, -4);
        }
        return `https://arxiv.org/abs/${id}`;
      }
    }

    // Rule 4: bioRxiv/medRxiv and preprint PDF back-resolve
    if ((host.includes("biorxiv.org") || host.includes("medrxiv.org")) && href.includes(".full.pdf")) {
      return url.replace(".full.pdf", "");
    }
    if ((host.includes("researchsquare.com") || host.includes("preprints.org")) && isLikelyPdfUrl(url)) {
      return doi ? `https://doi.org/${doi.trim()}` : url.replace(/\/pdf([?#].*)?$/i, "$1");
    }

    // Rule 5: Springer Link / Elsevier / IEEE PDF URL signature back-resolve
    // Springer Link
    if (host.includes("springer.com") && href.includes("/content/pdf/")) {
      const match = url.match(/\/content\/pdf\/(10\.\d{4,9}\/[^\s?#]+)\.pdf/i);
      if (match) {
        return `https://link.springer.com/article/${match[1]}`;
      }
    }

    // Elsevier (ScienceDirect)
    if ((host.includes("elsevier.com") || host.includes("sciencedirect.com")) && (href.includes("/reader/sd/pii/") || href.includes("/science/article/pii/"))) {
      const pii = getScienceDirectPii(url);
      if (pii) {
        return `https://www.sciencedirect.com/science/article/pii/${pii}`;
      }
    }

    // Nature Portfolio PDF pages generally keep the article id in /articles/.
    if (host.includes("nature.com") && href.includes(".pdf")) {
      return url.replace(/\.pdf([?#].*)?$/i, "$1");
    }

    // Wiley exposes both /doi/pdf/ and /doi/pdfdirect/ routes.
    if (host.includes("wiley.com") && (href.includes("/doi/pdf/") || href.includes("/doi/pdfdirect/") || href.includes("/doi/epdf/"))) {
      return url
        .replace(/\/doi\/pdfdirect\//i, "/doi/full/")
        .replace(/\/doi\/pdf\//i, "/doi/full/")
        .replace(/\/doi\/epdf\//i, "/doi/full/")
        .replace(/\.pdf([?#].*)?$/i, "$1");
    }

    // PubMed Central PDF paths are nested below the stable article id.
    if (host.includes("ncbi.nlm.nih.gov") && href.includes("/articles/") && href.includes("/pdf/")) {
      return url.replace(/\/pdf\/.*$/i, "/");
    }

    // MDPI PDFs can be converted back to the article page by dropping /pdf and .pdf suffix.
    if (host.includes("mdpi.com") && href.includes("/pdf")) {
      return url
        .replace(/\/pdf([?#].*)?$/i, "$1")
        .replace(/\.pdf([?#].*)?$/i, "$1");
    }

    // PLOS printable article file route.
    if (host.includes("plos.org") && href.includes("/article/file")) {
      const current = new URL(url);
      const id = current.searchParams.get("id");
      if (id) return `${current.origin}/article?id=${encodeURIComponent(id)}`;
    }

    // IEEE Xplore
    if (host.includes("ieee.org") && href.includes("/stamp/stamp.jsp")) {
      const match = url.match(/[?&]arnumber=(\d+)/i);
      if (match) {
        return `https://ieeexplore.ieee.org/document/${match[1]}`;
      }
    }

    // ACS / RSC / Wiley / Taylor / SAGE often expose PDF paths that keep the DOI suffix.
    if (href.includes("/doi/pdf/") || href.includes("/doi/epdf/") || href.includes("/doi/full/") || href.includes("/doi/abs/")) {
      return url
        .replace(/\/doi\/pdf\//i, "/doi/")
        .replace(/\/doi\/epdf\//i, "/doi/")
        .replace(/\/doi\/full\//i, "/doi/")
        .replace(/\/doi\/abs\//i, "/doi/")
        .replace(/\.pdf([?#].*)?$/i, "$1");
    }

    // PNAS / Science / BMJ style PDF endpoints often map back to the same path without .full.pdf/.pdf.
    if (href.includes(".full.pdf")) {
      return url.replace(/\.full\.pdf([?#].*)?$/i, "$1");
    }
    if (href.endsWith(".pdf") || href.includes(".pdf?")) {
      return url.replace(/\.pdf([?#].*)?$/i, "$1");
    }

    // Rule 6: Embedded DOI in URL path
    const doiRegex = /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/i;
    const urlDoi = url.match(doiRegex);
    if (urlDoi) {
      return `https://doi.org/${urlDoi[0]}`;
    }

    // Rule 7: Title Search fallback
    if (title && title.trim().length > 0) {
      return `https://scholar.google.com/scholar?q=${encodeURIComponent(title.trim())}`;
    }

    return null;
  }

  // Inject beautiful Glassmorphic Float Panel
  // Inject beautiful Glassmorphic Float Panel
  function injectMetacard() {
    chrome.storage.local.get([
      "enable_metacard",
      "enable_metrics_display",
      "enable_metrics_auto_detect",
      "enable_copy_doi_btn",
      "enable_journal_copy_doi_btn",
      "pdf_landing_cache",
      "enable_pdf_download_btn",
      "enable_ai_summary_btn",
      "enable_ccf_badge",
      "enable_core_badge",
      "enable_warn_badge",
      "enable_if_badge",
      "enable_cas_badge",
      "enable_jcr_badge",
      "enable_cite_badge",
      "enable_pdf_badge",
      "easyscholar_key",
      "metacard_pinned"
    ], (config) => {
      if (config.enable_metacard === false) {
        console.log("PaperPilot Pro: Metacard is disabled in settings. Skipping injection.");
        return;
      }
      if (document.getElementById("pp-journal-metacard")) return;

      cardEl = document.createElement("div");
      cardEl.id = "pp-journal-metacard";
      cardEl.className = "pp-jc-floating-card";
      cardEl.setAttribute("data-pp-theme", currentTheme);
      if (config.metacard_pinned === true) {
        cardEl.classList.add("pp-jc-pinned");
      }

      // Set minimized layout
      const isNi = checkNatureIndexMatch(paperMeta.journal);

      const hasEasyScholarKey = Boolean((config.easyscholar_key || "").trim());
      const autoDetectMetrics = config.enable_metrics_auto_detect !== false;
      const enable_metrics_display = config.enable_metrics_display !== false && (!autoDetectMetrics || hasEasyScholarKey);
      const enable_pdf_download_btn = config.enable_pdf_download_btn !== false;
      const enable_ai_summary_btn = config.enable_ai_summary_btn !== false;

      // Legacy fallback and new independent setting mapping
      let enable_journal_copy_doi_btn = config.enable_journal_copy_doi_btn;
      if (enable_journal_copy_doi_btn === undefined) {
        enable_journal_copy_doi_btn = config.enable_copy_doi_btn !== false;
      } else {
        enable_journal_copy_doi_btn = enable_journal_copy_doi_btn !== false;
      }

      // Deduce original landing page URL
      const currentUrl = window.location.href;
      const cachedLandingUrl = config.pdf_landing_cache ? config.pdf_landing_cache[currentUrl] : null;
      const resolvedLandingUrl = deduceLandingPage(currentUrl, paperMeta.doi, paperMeta.title, cachedLandingUrl);

      // Clean URL helper for comparison (ignores trailing slashes, hashes, query case, etc.)
      function cleanUrlForCompare(u) {
        if (!u) return "";
        try {
          const urlObj = new URL(u);
          return (urlObj.hostname + urlObj.pathname + urlObj.search).replace(/\/$/, "").toLowerCase();
        } catch(e) {
          return u.replace(/\/$/, "").toLowerCase();
        }
      }
      const showLandingBtn = resolvedLandingUrl && cleanUrlForCompare(resolvedLandingUrl) !== cleanUrlForCompare(currentUrl);
      const pdfDiagnostics = getPdfCandidateDiagnostics();
      const display = {
        journal: escapeHtml(paperMeta.journal || "学术期刊"),
        year: escapeHtml(paperMeta.year || "N/A"),
        title: escapeHtml(paperMeta.title || ""),
        doi: escapeHtml(paperMeta.doi || "暂无 DOI"),
        impactFactor: escapeHtml(paperMeta.impactFactor || "N/A"),
        casPartition: escapeHtml(paperMeta.casPartition || "N/A"),
        jcrQuartile: escapeHtml(paperMeta.jcrQuartile || "N/A"),
        citeScore: escapeHtml(paperMeta.citeScore || "N/A"),
        dataSource: escapeHtml(paperMeta.metricsSource || paperMeta.source || "未配置数据源"),
        ccfRank: escapeHtml(paperMeta.ccfRank || ""),
        sciWarn: escapeHtml(paperMeta.sciWarn || ""),
        pdfFirstUrlAttr: escapeAttr(pdfDiagnostics.firstUrl || ""),
        pdfFirstSource: escapeHtml(pdfDiagnostics.firstSource || "无"),
        pdfProfileId: escapeHtml(pdfDiagnostics.profileId || "unknown")
      };

      // Build float metacard DOM content
      cardEl.innerHTML = `
        <!-- Drag handle header -->
        <div class="pp-jc-card-header" id="pp-jc-card-hdr">
          <div class="pp-jc-card-header-main">
            <div class="pp-jc-card-logo">PP</div>
            <div class="pp-jc-card-brand-info">
              <div class="pp-jc-card-title">PaperPilot <span class="pp-jc-accent-text">Pro</span></div>
              <div class="pp-jc-card-subtitle">${display.journal}</div>
            </div>
          </div>
          <div class="pp-jc-card-header-actions">
            <button type="button" class="pp-jc-hdr-btn ${config.metacard_pinned === true ? 'pp-jc-active' : ''}" id="pp-jc-btn-pin" title="${config.metacard_pinned === true ? '取消固定侧边栏' : '固定侧边栏'}">
              ${config.metacard_pinned === true ? getIcon("pin_off", "⊘") : getIcon("pin", "⌖")}
            </button>
            <button type="button" class="pp-jc-hdr-btn" id="pp-jc-btn-min" title="最小化面板">${getIcon("minimize", "−")}</button>
            <button type="button" class="pp-jc-hdr-btn" id="pp-jc-btn-help" title="帮助与快捷键">?</button>
          </div>
        </div>

        <!-- Minimized representation inside round bubble -->
        <div class="pp-jc-minimized-pill" id="pp-jc-min-pill" title="点击展开 PaperPilot Pro">
          <div class="pp-jc-ripple-ring"></div>
          <div class="pp-jc-minimized-logo">${window.PP_ICONS.ai_sparkles}</div>
          <span class="pp-jc-minimized-tooltip">展开 PaperPilot</span>
        </div>

        <!-- Card Core Body -->
        <div class="pp-jc-card-content">
          <!-- Hero section -->
          <div class="pp-jc-hero-area">
            <div class="pp-jc-hero-journal-row">
              <span class="pp-jc-journal-badge ${isNi ? 'pp-ni-badge' : ''}">
                ${isNi ? "Nature Index 顶刊" : display.journal}
              </span>
              <span class="pp-jc-year-tag">${display.year} 年</span>
            </div>
            <div class="pp-jc-hero-title-box" id="pp-jc-title-box" title="点击复制完整文献标题">
              <h2 class="pp-jc-paper-title">${display.title}</h2>
            </div>
          </div>

          <!-- Status Banner -->
          <div class="pp-jc-status-banner ${paperMeta.pdfUrl ? 'pp-status-ok' : 'pp-status-warn'}">
            <span class="pp-status-dot"></span>
            <span>${paperMeta.pdfUrl ? '已搜寻到正文 PDF 直链 · 支持一键校验下载' : '当前无免费 OA 直链 · 可一键复制 DOI 或网页版'}</span>
          </div>

          <!-- Metadata DOI Field -->
          <div class="pp-jc-meta-field">
            <div class="pp-jc-meta-hdr">
              <span class="pp-jc-meta-lbl">DOI 数字对象标识符</span>
              <span class="pp-jc-in-place-badge" id="pp-jc-doi-badge">✓ 已成功复制到剪贴板</span>
            </div>
            <div class="pp-jc-meta-val-box" id="pp-jc-doi-val-box">
              <span class="pp-jc-meta-val">${display.doi}</span>
              ${paperMeta.doi ? `
                <button type="button" class="pp-jc-meta-copy-btn" id="pp-jc-btn-copy-doi" title="一键复制 DOI 标识符">
                  ${window.PP_ICONS.copy} 复制
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Metrics Drawer -->
          ${(enable_metrics_display && (
            config.enable_if_badge !== false ||
            config.enable_cas_badge !== false ||
            config.enable_jcr_badge !== false ||
            config.enable_cite_badge !== false ||
            (paperMeta.ccfRank && config.enable_ccf_badge !== false) ||
            ((paperMeta.isCssci || paperMeta.isPku) && config.enable_core_badge !== false) ||
            (paperMeta.sciWarn && config.enable_warn_badge !== false)
          )) ? `
          <div class="pp-jc-drawer">
            <div class="pp-jc-drawer-title" id="pp-jc-drawer-hdr">
              <span>📊 期刊分区与学术指标</span>
              <span id="pp-jc-drawer-arrow">▲</span>
            </div>
            <div class="pp-jc-drawer-body" id="pp-jc-drawer-body">
              ${(config.enable_if_badge !== false) ? `
              <div class="pp-jc-metric-row">
                <span class="pp-jc-metric-lbl">最新影响因子 (IF)</span>
                <span class="pp-jc-metric-val pp-val-if">${display.impactFactor}</span>
              </div>
              ` : ''}
              
              ${(config.enable_cas_badge !== false) ? `
              <div class="pp-jc-metric-row">
                <span class="pp-jc-metric-lbl">中科院分区</span>
                <span class="pp-jc-metric-val pp-val-cas">${display.casPartition}</span>
              </div>
              ` : ''}
              
              ${(config.enable_jcr_badge !== false) ? `
              <div class="pp-jc-metric-row">
                <span class="pp-jc-metric-lbl">JCR 分区</span>
                <span class="pp-jc-metric-val">${display.jcrQuartile}</span>
              </div>
              ` : ''}
              
              ${(config.enable_cite_badge !== false) ? `
              <div class="pp-jc-metric-row">
                <span class="pp-jc-metric-lbl">CiteScore</span>
                <span class="pp-jc-metric-val">${display.citeScore}</span>
              </div>
              ` : ''}

              <div class="pp-jc-metric-row">
                <span class="pp-jc-metric-lbl">数据来源</span>
                <span class="pp-jc-metric-val">${display.dataSource}</span>
              </div>
              
              ${(paperMeta.ccfRank && config.enable_ccf_badge !== false) ? `
              <div class="pp-jc-metric-row">
                <span class="pp-jc-metric-lbl">CCF 等级</span>
                <span class="pp-jc-metric-val pp-jc-metric-ccf">${display.ccfRank}</span>
              </div>
              ` : ''}
              
              ${((paperMeta.isCssci || paperMeta.isPku) && config.enable_core_badge !== false) ? `
              <div class="pp-jc-metric-row">
                <span class="pp-jc-metric-lbl">国内核心收录</span>
                <span class="pp-jc-metric-val pp-jc-metric-core">
                  ${[paperMeta.isCssci ? "南大核心" : "", paperMeta.isPku ? "北大核心" : ""].filter(Boolean).join(" / ")}
                </span>
              </div>
              ` : ''}
              
              ${(paperMeta.sciWarn && config.enable_warn_badge !== false) ? `
              <div class="pp-jc-metric-row pp-jc-warn-row">
                <span class="pp-jc-metric-lbl" style="color: #ef4444; font-weight: bold;">中科院预警</span>
                <span class="pp-jc-metric-val pp-jc-metric-warn">${display.sciWarn}</span>
              </div>
              ` : ''}
            </div>
          </div>
          ` : ''}

          <!-- Primary Actions -->
          <div class="pp-jc-actions-grid">
            ${showLandingBtn ? `
              <button type="button" class="pp-jc-action-btn pp-jc-btn-web" id="pp-jc-btn-open-landing">
                ${window.PP_ICONS.webpage} 打开论文网页端
              </button>
            ` : ''}

            ${(paperMeta.pdfUrl && enable_pdf_download_btn) ? `
              <button type="button" class="pp-jc-action-btn pp-jc-btn-download" id="pp-jc-btn-download">
                ${window.PP_ICONS.download} 一键下载 PDF 全文
              </button>
            ` : (!paperMeta.pdfUrl && enable_journal_copy_doi_btn) ? `
              <button type="button" class="pp-jc-action-btn pp-jc-btn-doi" id="pp-jc-btn-scihub-jump">
                ${window.PP_ICONS.copy} 一键复制 DOI
              </button>
            ` : ''}
            
            ${enable_ai_summary_btn ? `
            <button type="button" class="pp-jc-action-btn pp-jc-btn-ai" id="pp-jc-btn-ai-sum">
              ${window.PP_ICONS.ai_sparkles} AI 智能速读总结 (TL;DR)
            </button>
            <div class="pp-jc-ai-summary-box" id="pp-jc-ai-box"></div>
            ` : ''}
          </div>
        </div>
      `;

      document.body.appendChild(cardEl);

      // Make Card Draggable
      const header = cardEl.querySelector("#pp-jc-card-hdr");
      makeCardDraggable(cardEl, header);

      // Hook events
      bindMetacardEvents(resolvedLandingUrl);
    });
  }

  // Bind interactive actions in Metacard float dashboard
  function bindMetacardEvents(resolvedLandingUrl) {
    const pinBtn = cardEl.querySelector("#pp-jc-btn-pin");
    const minBtn = cardEl.querySelector("#pp-jc-btn-min");
    const pill = cardEl.querySelector("#pp-jc-min-pill");
    const drawerHdr = cardEl.querySelector("#pp-jc-drawer-hdr");
    const copyDoiBtn = cardEl.querySelector("#pp-jc-btn-copy-doi");
    const downloadBtn = cardEl.querySelector("#pp-jc-btn-download");
    const scihubJumpBtn = cardEl.querySelector("#pp-jc-btn-scihub-jump");
    const aiBtn = cardEl.querySelector("#pp-jc-btn-ai-sum");
    const helpBtn = cardEl.querySelector("#pp-jc-btn-help");
    const openLandingBtn = cardEl.querySelector("#pp-jc-btn-open-landing");
    const titleBox = cardEl.querySelector("#pp-jc-title-box");

    if (titleBox && paperMeta.title) {
      titleBox.onclick = () => {
        robustCopyToClipboard(paperMeta.title).then(() => {
          showToast("已将完整论文标题复制到剪贴板！");
        });
      };
    }

    const setPinnedState = (pinned) => {
      cardEl.classList.toggle("pp-jc-pinned", pinned);
      if (pinBtn) {
        pinBtn.classList.toggle("pp-jc-active", pinned);
        pinBtn.title = pinned ? "取消固定侧边栏" : "固定侧边栏";
        pinBtn.innerHTML = pinned ? getIcon("pin_off", "⊘") : getIcon("pin", "⌖");
      }
    };

    if (pinBtn) {
      pinBtn.onclick = (event) => {
        event.stopPropagation();
        const pinned = !cardEl.classList.contains("pp-jc-pinned");
        setPinnedState(pinned);
        chrome.storage.local.set({ metacard_pinned: pinned }, () => {
          showToast(pinned ? "侧边栏已固定" : "侧边栏已恢复可拖动");
        });
      };
    }

    // Open landing page logic
    if (openLandingBtn && resolvedLandingUrl) {
      openLandingBtn.onclick = () => {
        window.open(resolvedLandingUrl, "_blank");
      };
    }

    // Help box
    if (helpBtn) {
      helpBtn.onclick = () => {
        showToast("快捷键: Alt+P (展开/折叠面板), Alt+D (下载PDF), Alt+C (复制DOI)");
      };
    }

    // Minimize logic
    if (minBtn) {
      minBtn.onclick = (e) => {
        e.stopPropagation();
        cardEl.classList.add("pp-jc-minimized");
      };
    }

    // Keyboard Shortcuts Handler (Alt+P, Alt+D, Alt+C)
    const onGlobalKeydown = (e) => {
      if (e.altKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'p') {
          e.preventDefault();
          cardEl.classList.toggle("pp-jc-minimized");
          showToast(cardEl.classList.contains("pp-jc-minimized") ? "已折叠面板 (Alt+P)" : "已展开面板 (Alt+P)");
        } else if (key === 'd') {
          e.preventDefault();
          if (downloadBtn) downloadBtn.click();
          else showToast("当前页面未检测到可直接下载的 PDF");
        } else if (key === 'c') {
          e.preventDefault();
          if (copyDoiBtn) copyDoiBtn.click();
          else if (paperMeta.doi) {
            robustCopyToClipboard(paperMeta.doi).then(() => showToast("DOI 已复制到剪贴板 (Alt+C)"));
          }
        }
      }
    };
    window.removeEventListener("keydown", globalThis.__PAPERPILOT_METACARD_KEYBOARD__);
    globalThis.__PAPERPILOT_METACARD_KEYBOARD__ = onGlobalKeydown;
    window.addEventListener("keydown", onGlobalKeydown);

    if (pill) {
      pill.onclick = () => {
        cardEl.classList.remove("pp-jc-minimized");
      };
    }

    // DOI copy
    if (copyDoiBtn) {
      copyDoiBtn.onclick = () => {
        robustCopyToClipboard(paperMeta.doi).then(() => {
          showToast("✓ DOI 已成功写入剪贴板！");
          const valBox = cardEl.querySelector("#pp-jc-doi-val-box");
          const badge = cardEl.querySelector("#pp-jc-doi-badge");
          const origHTML = copyDoiBtn.innerHTML;

          if (valBox) valBox.classList.add("pp-copied-active");
          if (badge) badge.classList.add("pp-show");
          copyDoiBtn.innerHTML = `${getIcon("check", "✓")} 已复制`;
          copyDoiBtn.classList.add("pp-copied-success");

          setTimeout(() => {
            if (valBox) valBox.classList.remove("pp-copied-active");
            if (badge) badge.classList.remove("pp-show");
            copyDoiBtn.innerHTML = origHTML;
            copyDoiBtn.classList.remove("pp-copied-success");
          }, 2200);
        });
      };
    }

    // Toggle drawers
    if (drawerHdr) {
      drawerHdr.onclick = () => {
        const body = cardEl.querySelector("#pp-jc-drawer-body");
        const arrow = cardEl.querySelector("#pp-jc-drawer-arrow");
        if (body) {
          const isCollapsed = body.classList.toggle("pp-jc-collapsed");
          if (arrow) {
            arrow.innerText = isCollapsed ? "▼" : "▲";
          }
        }
      };
    }

    // Direct PDF downloader with auto rename
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        chrome.storage.local.get("pdf_naming", (config) => {
          const pattern = config.pdf_naming || "1";
          const firstAuthor = paperMeta.authors.length > 0 ? paperMeta.authors[0] : "Unknown";
          
          let name = `[${paperMeta.journal}] ${firstAuthor} - ${paperMeta.title}`;
          if (pattern === "2") {
            name = `[${paperMeta.year}] ${paperMeta.title}`;
          } else if (pattern === "3" && paperMeta.doi) {
            name = paperMeta.doi.replace(/\//g, "_");
          } else if (pattern === "4") {
            name = `${paperMeta.title} (${paperMeta.year})`;
          }

          // Clean characters invalid in filename
          const cleanName = name.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 100) + ".pdf";
          
          showToast("正在请求下载并自动批量规范重命名...");
          safeSendMessage({
            action: "DOWNLOAD_PDF",
            url: paperMeta.pdfUrl,
            urls: buildDownloadUrlCandidates(),
            filename: cleanName,
            pageUrl: window.location.href
          }, (response) => {
            if (response && response.success) {
              const savedPath = response.filename ? `：${response.filename}` : "";
              updatePdfDiagnostics(response);
              showToast(`PDF 下载任务已创建${savedPath}`);
              logFootprint("downloaded");
            } else {
              updatePdfDiagnostics(response);
              const error = formatPdfDownloadError(response);
              const fallback = response?.fallbackUrl ? "；可复制 DOI 或打开首选候选重试" : "";
              showToast(`PDF 下载失败：${error}${fallback}`);
            }
          });
        });
      };
    }

    // Copy DOI handler with interactive feedback
    const handleCopyDoi = (btn) => {
      if (!btn) return;
      if (!paperMeta.doi) {
        // Fallback: copy structured academic citation when no DOI is available
        const authorsStr = (paperMeta.authors && paperMeta.authors.length > 0) ? paperMeta.authors.join(", ") : "Unknown Author";
        const fallbackCitation = `${authorsStr}. ${paperMeta.title} (${paperMeta.year}).`;
        navigator.clipboard.writeText(fallbackCitation).then(() => {
          showToast("未匹配到该文献的 DOI，已将标题与引用复制到剪贴板！");
          logFootprint("copied_citation");
          // Button feedback
          const originalText = btn.innerHTML;
          btn.innerHTML = `${window.PP_ICONS.check} 已复制引用`;
          btn.style.color = "#2dd4bf";
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.color = "";
          }, 1800);
        }).catch(() => {
          showToast("复制失败，请手动选择复制！");
        });
        return;
      }
      navigator.clipboard.writeText(paperMeta.doi).then(() => {
        showToast("DOI 已成功复制到剪贴板！");
        logFootprint("copied_doi");

        // Button feedback
        const originalText = btn.innerHTML;
        btn.innerHTML = `${window.PP_ICONS.check} 已复制`;
        const originalBg = btn.style.background;
        const originalColor = btn.style.color;
        
        btn.style.color = "#2dd4bf"; // Success teal color
        
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = originalBg;
          btn.style.color = originalColor;
        }, 1800);
      }).catch(() => {
        showToast("复制失败，请手动选择复制！");
      });
    };

    if (scihubJumpBtn) scihubJumpBtn.onclick = () => handleCopyDoi(scihubJumpBtn);

    // Client-side AI summarize
    if (aiBtn) {
      aiBtn.onclick = () => {
        const aiBox = cardEl.querySelector("#pp-jc-ai-box");
        if (!aiBox) return;
        aiBtn.innerText = "AI 正在深度研读文献中...";
        aiBtn.disabled = true;

        safeSendMessage({
          action: "AI_SUMMARIZE",
          abstract: paperMeta.abstract,
          title: paperMeta.title
        }, (response) => {
          aiBtn.disabled = false;
          if (response && response.success) {
            aiBtn.innerText = "✨ AI 总结 (TL;DR) 已生成";
            aiBox.innerHTML = "";
            const label = document.createElement("strong");
            label.textContent = `AI 简述 (${response.provider || response.source || "provider"})：`;
            const body = document.createElement("div");
            body.textContent = response.summary || "";
            aiBox.appendChild(label);
            aiBox.appendChild(document.createElement("br"));
            aiBox.appendChild(body);
            aiBox.style.display = "block";
          } else {
            const errorCode = response?.errorCode || "";
            aiBtn.innerText = errorCode === "AI_API_KEY_MISSING" ? "AI 未配置 API Key" : "AI 总结失败";
            showToast(response?.error || "AI 未返回真实总结，请在 Popup 中检查 API 配置。");
          }
        });
      };
    }
  }

  // Draggable drag handle mechanics
  function makeCardDraggable(card, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      if (e.target.classList.contains("pp-jc-hdr-btn")) return; // Don't trigger on close/min btns
      if (card.classList.contains("pp-jc-pinned")) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      const maxTop = Math.max(10, window.innerHeight - 60);
      const maxLeft = Math.max(10, window.innerWidth - (card.offsetWidth || 100));
      const targetTop = Math.max(10, Math.min(maxTop, card.offsetTop - pos2));
      const targetLeft = Math.max(10, Math.min(maxLeft, card.offsetLeft - pos1));

      card.style.top = targetTop + "px";
      card.style.left = targetLeft + "px";
      card.style.right = "auto"; // Unlock right anchoring
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  // Match standard Nature Index Journals list
  function checkNatureIndexMatch(journalName) {
    const list = [
      "nature", "science", "cell", "american chemical society", "angewandte", "advanced materials",
      "physical review", "pnas", "cancer research", "neuron", "plos biology"
    ];
    const name = (journalName || "").toLowerCase();
    return list.some(item => name.includes(item));
  }

  // Logs Footprint history event to background database
  function logFootprint(status) {
    safeSendMessage({
      action: "ADD_FOOTPRINT",
      footprint: {
        title: paperMeta.title,
        authors: paperMeta.authors,
        journal: paperMeta.journal,
        year: paperMeta.year,
        doi: paperMeta.doi,
        pdfUrl: paperMeta.pdfUrl,
        status: status
      }
    });
  }

  function getCurrentPageDiagnostics(refresh = false) {
    if (refresh) {
      pdfUrlCandidateCache = null;
      siteProfileCache = null;
      lastPdfDownloadStatus = null;
      paperMeta = extractPageMetadata();
    }
    const meta = paperMeta || extractPageMetadata();
    const siteProfile = getCurrentSiteProfile();
    const rawCandidates = buildDownloadUrlCandidates();
    const preparedCandidates = window.PaperPilotCore?.pdf?.preparePdfCandidates
      ? window.PaperPilotCore.pdf.preparePdfCandidates(rawCandidates)
      : rawCandidates.map(candidate => typeof candidate === "string" ? { url: candidate, source: "page", score: 0 } : candidate);
    const first = preparedCandidates[0] || null;
    return {
      ok: true,
      data: {
        pageType: "journal",
        url: window.location.href,
        profileId: siteProfile?.id || "unknown",
        doi: meta.doi || "",
        title: meta.title || "",
        journal: meta.journal || "",
        pdfCandidateCount: preparedCandidates.length,
        firstPdfSource: first?.source || "",
        firstPdfUrl: first?.url || "",
        fastDownload: Boolean(first && window.PaperPilotCore?.pdf?.shouldFastDownloadCandidate?.(first)),
        lastError: lastPdfDownloadStatus?.errorCode || "",
        metricsSource: meta.metricsSource || meta.source || "未配置数据源",
        cachedAt: meta.cachedAt || null,
        stale: Boolean(meta.stale)
      },
      source: "content/journal",
      cachedAt: Date.now()
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const action = message?.action || message?.type;
    if (action === "diagnostics.currentPage" || action === "pdf.candidates") {
      sendResponse(getCurrentPageDiagnostics(Boolean(message.refresh)));
      return false;
    }
    return false;
  });

  // Injected notification toast
  function showToast(message) {
    let toast = document.querySelector(".pp-jc-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "pp-jc-toast";
      toast.setAttribute("data-pp-theme", currentTheme);
      toast.innerHTML = `${window.PP_ICONS.check} <span class="pp-jc-toast-msg"></span>`;
      document.body.appendChild(toast);
    } else {
      toast.setAttribute("data-pp-theme", currentTheme);
    }
    toast.querySelector(".pp-jc-toast-msg").innerText = message;
    
    setTimeout(() => toast.classList.add("pp-show"), 10);
    setTimeout(() => {
      toast.classList.remove("pp-show");
    }, 2800);
  }

  function getArticleIdentity() {
    const title = document.querySelector("meta[name='citation_title' i],meta[name='dc.title' i]")?.content || document.title || "";
    const doi = document.querySelector("meta[name='citation_doi' i],meta[name='dc.identifier' i],meta[name='prism.doi' i]")?.content || "";
    return `${window.location.href}|${doi.trim()}|${title.trim()}`;
  }

  function installPageLifecycleWatcher() {
    if (globalThis.__PAPERPILOT_JOURNAL_ROUTE_WATCHER__) return;
    globalThis.__PAPERPILOT_JOURNAL_ROUTE_WATCHER__ = true;
    let currentIdentity = getArticleIdentity();
    let timer = null;

    const checkRoute = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const nextIdentity = getArticleIdentity();
        if (nextIdentity === currentIdentity) return;
        currentIdentity = nextIdentity;
        pdfUrlCandidateCache = null;
        siteProfileCache = null;
        lastPdfDownloadStatus = null;
        lastPdfDiscoveryDiagnostics = null;
        paperMeta = null;
        cardEl?.remove();
        cardEl = null;
        init();
      }, 350);
    };

    // Article identity is represented by URL, title and citation metadata, so
    // watching the document head plus a low-frequency URL poll avoids a
    // permanent full-page subtree observer on mutation-heavy journal apps.
    if (document.head) {
      const observer = new MutationObserver(checkRoute);
      observer.observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }
    setInterval(() => {
      if (document.visibilityState !== "hidden") checkRoute();
    }, 1500);
    window.addEventListener("popstate", checkRoute, { passive: true });
    window.addEventListener("hashchange", checkRoute, { passive: true });
  }

  // Run initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init();
      installPageLifecycleWatcher();
    }, { once: true });
  } else {
    init();
    installPageLifecycleWatcher();
  }
})();

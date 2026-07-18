(function(global) {
  const root = global.PaperPilotCore || {};

  function getHeader(headers, name) {
    if (!headers) return "";
    if (typeof headers.get === "function") return headers.get(name) || "";
    const lower = String(name).toLowerCase();
    return headers[name] || headers[lower] || "";
  }

  function normalizeDownloadUrlKey(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      return url.href;
    } catch (e) {
      return String(rawUrl || "").replace(/#.*$/, "");
    }
  }

  function normalizeCandidateDedupeKey(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      // Only remove tracking parameters. Publisher download parameters may be
      // functional (or signed) and must remain part of the candidate identity.
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach(param => {
        url.searchParams.delete(param);
      });
      return url.href.replace(/\?$/, "");
    } catch (e) {
      return normalizeDownloadUrlKey(rawUrl);
    }
  }

  function uniqueUrls(urls) {
    const seen = new Set();
    return (urls || [])
      .filter(Boolean)
      .map(url => String(url).trim())
      .filter(Boolean)
      .filter(url => {
        const key = normalizeDownloadUrlKey(url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function isTrustedBrowserPdfUrl(rawUrl) {
    if (!rawUrl) return false;
    try {
      const url = new URL(rawUrl);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      if ((host.includes("sciencedirect.com") || host.includes("elsevier.com")) &&
          !(path.includes("/pdfft") && url.searchParams.get("md5") && url.searchParams.get("pid"))) {
        return false;
      }
      const formatHint = `${url.searchParams.get("format") || ""} ${url.searchParams.get("type") || ""} ${url.searchParams.get("download") || ""}`;
      return path.endsWith(".pdf") ||
        path.includes("/content/pdf/") ||
        path.includes("/article-pdf/") ||
        path.includes("/doi/pdf/") ||
        path.includes("/doi/epdf/") ||
        path.includes("/pdfdirect/") ||
        path.includes("/pdffile/") ||
        path.includes("/pdfft") ||
        path.endsWith("/_pdf") ||
        (/\bpdf\b/i.test(formatHint) && /article|paper|document|download|file/i.test(path));
    } catch (e) {
      return false;
    }
  }

  function isPageActionPdfUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return url.protocol === "blob:";
    } catch (e) {
      return false;
    }
  }

  function hasScienceDirectSignedPdfParams(url) {
    return Boolean(url.searchParams.get("md5") && url.searchParams.get("pid"));
  }

  function isScienceDirectUrl(rawUrl) {
    try {
      const host = new URL(rawUrl).hostname.toLowerCase();
      return host.includes("sciencedirect.com") || host.includes("elsevier.com");
    } catch (e) {
      return false;
    }
  }

  function isSupplementaryPdfCandidate(candidate) {
    const text = `${candidate?.text || ""} ${candidate?.title || ""} ${candidate?.reason || ""} ${candidate?.url || ""}`.toLowerCase();
    return /\b(?:supplementary|supplemental|references?|citations?|bibtex|ris)\b/i.test(text) ||
      text.includes("supporting information") ||
      text.includes("peer review");
  }

  function buildPublisherPdfCandidates(rawUrl) {
    const candidates = [];
    if (!rawUrl) return candidates;
    let url;
    try {
      url = new URL(rawUrl);
    } catch (e) {
      return candidates;
    }

    if (root.siteProfiles?.resolve) {
      const profile = root.siteProfiles.resolve(url.href);
      if (profile && profile.pdfCandidates && profile.pdfCandidates.length) {
        return profile.pdfCandidates.map(candidate => ({
          ...candidate,
          browserFallback: Boolean(candidate.requiresBrowser)
        }));
      }
    }

    return candidates;
  }

  function normalizePdfCandidate(input, context = {}) {
    const base = typeof input === "string" ? { url: input } : { ...(input || {}) };
    if (!base.url) return null;
    let url;
    try {
      url = new URL(base.url, context.baseUrl || undefined);
    } catch (e) {
      return null;
    }
    const pageAction = url.protocol === "blob:";
    if (url.protocol !== "http:" && url.protocol !== "https:" && !pageAction) return null;

    const candidate = {
      url: url.href,
      text: base.text || "",
      source: base.source || "unknown",
      reason: base.reason || "",
      score: Number.isFinite(base.score) ? base.score : 0,
      browserFallback: Boolean(base.browserFallback || pageAction || base.requiresBrowser),
      requiresBrowser: Boolean(base.requiresBrowser || pageAction),
      transport: base.transport || (pageAction ? "page-context" : "chrome-download")
    };

    if (pageAction) {
      candidate.score = Math.max(candidate.score, 86);
      candidate.reason = candidate.reason || "Page-owned blob PDF requires browser-context download";
      return candidate;
    }

    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const source = candidate.source.toLowerCase();
    const text = candidate.text.toLowerCase();
    let score = candidate.score;

    if (source.includes("explicit") || text === "pdf" || text.includes("download pdf") || text.includes("open pdf")) score = Math.max(score, 96);
    if (source.includes("meta") || source.includes("citation_pdf_url")) score = Math.max(score, 94);
    if (source.includes("publisher-rule")) score = Math.max(score, 92);
    if (source.includes("metadata") || source.includes("unpaywall") || source.includes("openalex")) score = Math.max(score, 88);
    if (path.endsWith(".pdf") || path.includes("/pdf/") || path.includes("/article-pdf/") || path.includes("/content/pdf/")) score = Math.max(score, 84);
    if (path.includes("/doi/pdf/") || path.includes("/doi/epdf/") || path.includes("/pdfdirect/") || path.includes("/pdfft")) score = Math.max(score, 88);
    if (host === "arxiv.org" && path.startsWith("/pdf/")) score = Math.max(score, 98);
    if (isScienceDirectUrl(url.href) && path.includes("/pdfft") && hasScienceDirectSignedPdfParams(url)) {
      score = Math.max(score, 96);
      candidate.browserFallback = false;
    } else if (isScienceDirectUrl(url.href) && (path.includes("/pdf") || path.includes("/pdfft"))) {
      score = Math.max(score, 80);
      candidate.browserFallback = true;
      candidate.reason = candidate.reason || "ScienceDirect unsigned PDF-like URL needs browser fallback";
    }

    candidate.score = score;
    return candidate;
  }

  function preparePdfCandidates(inputs, context = {}) {
    const expanded = [];
    (inputs || []).forEach(input => {
      const candidate = normalizePdfCandidate(input, context);
      if (candidate) expanded.push(candidate);
      const url = typeof input === "string" ? input : input?.url;
      buildPublisherPdfCandidates(url).forEach(ruleCandidate => expanded.push(normalizePdfCandidate(ruleCandidate, context)));
    });

    const seen = new Set();
    return expanded
      .filter(candidate => candidate && candidate.url)
      .filter(candidate => !isSupplementaryPdfCandidate(candidate))
      .sort((a, b) => b.score - a.score)
      .filter(candidate => {
        const key = normalizeCandidateDedupeKey(candidate.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function shouldFastDownloadCandidate(candidate) {
    return Boolean(candidate &&
      candidate.score >= 92 &&
      !candidate.browserFallback &&
      !candidate.requiresBrowser &&
      isTrustedBrowserPdfUrl(candidate.url));
  }

  function responseLooksPdf(response, firstChunk = null) {
    const contentType = getHeader(response.headers, "content-type").toLowerCase();
    const contentDisposition = getHeader(response.headers, "content-disposition").toLowerCase();
    let pdfHeader = false;
    if (firstChunk && firstChunk.length >= 5) {
      // ISO 32000 readers accept the PDF header within the first 1024 bytes.
      const limit = Math.min(firstChunk.length - 4, 1024);
      for (let index = 0; index <= limit; index += 1) {
        if (firstChunk[index] === 0x25 &&
            firstChunk[index + 1] === 0x50 &&
            firstChunk[index + 2] === 0x44 &&
            firstChunk[index + 3] === 0x46 &&
            firstChunk[index + 4] === 0x2D) {
          pdfHeader = true;
          break;
        }
      }
    }

    return contentType.includes("application/pdf") ||
      contentType.includes("/pdf") ||
      /(?:filename\*?\s*=|inline).*\.pdf(?:["';\s]|$)/i.test(contentDisposition) ||
      pdfHeader;
  }

  function responseLooksDefinitelyHtml(response) {
    const contentType = getHeader(response.headers, "content-type").toLowerCase();
    return contentType.includes("text/html") ||
      contentType.includes("application/xhtml") ||
      contentType.includes("application/json");
  }

  function prefixLooksLikeMarkup(firstChunk) {
    if (!firstChunk || firstChunk.length === 0) return false;
    const limit = Math.min(firstChunk.length, 512);
    let prefix = "";
    for (let index = 0; index < limit; index += 1) {
      const value = firstChunk[index];
      if (value === 0) continue;
      prefix += String.fromCharCode(value);
    }
    const trimmed = prefix.replace(/^\uFEFF?\s*/, "").toLowerCase();
    return trimmed.startsWith("<!doctype html") ||
      trimmed.startsWith("<html") ||
      trimmed.startsWith("<?xml") ||
      trimmed.startsWith("{") ||
      trimmed.startsWith("[");
  }

  function classifyPdfResponse(response, firstChunk = null) {
    const status = response?.status || 0;
    const finalUrl = response?.url || "";
    if (response?.ok && responseLooksPdf(response, firstChunk)) {
      return { valid: true, decisive: true, transient: false, errorCode: null, reason: "pdf-response", finalUrl };
    }
    if (status === 401 || status === 403) {
      return { valid: false, decisive: false, transient: true, errorCode: "PDF_AUTH_REQUIRED", reason: `HTTP ${status}`, finalUrl };
    }
    if (status === 404 || status === 410) {
      return { valid: false, decisive: true, transient: false, errorCode: "PDF_NOT_FOUND", reason: `HTTP ${status}`, finalUrl };
    }
    if (response && (responseLooksDefinitelyHtml(response) || prefixLooksLikeMarkup(firstChunk))) {
      return { valid: false, decisive: true, transient: false, errorCode: "PDF_HTML_RESPONSE", reason: "html-response", finalUrl };
    }
    return { valid: false, decisive: false, transient: false, errorCode: "PDF_NOT_CONFIRMED", reason: status ? `HTTP ${status}` : "not-confirmed", finalUrl };
  }

  function classifyPdfError(error) {
    const message = String(error?.message || error || "");
    if (/abort|timeout|timed out/i.test(message)) {
      return { valid: false, decisive: false, transient: true, errorCode: "PDF_TIMEOUT", reason: message };
    }
    if (/failed to fetch|network/i.test(message)) {
      return { valid: false, decisive: false, transient: true, errorCode: "PDF_NETWORK_ERROR", reason: message };
    }
    return { valid: false, decisive: false, transient: true, errorCode: "PDF_UNKNOWN_ERROR", reason: message };
  }

  function sanitizeDownloadSegment(segment) {
    return String(segment || "")
      .replace(/[<>:"\\|?*\x00-\x1F]/g, "_")
      .replace(/\.+$/g, "")
      .trim();
  }

  function buildDownloadFilename(downloadDir, filename) {
    const cleanFile = sanitizeDownloadSegment(filename || "paper.pdf").substring(0, 150) || "paper.pdf";
    const cleanDir = String(downloadDir || "")
      .split(/[\\/]+/)
      .map(sanitizeDownloadSegment)
      .filter(Boolean)
      .filter(part => part !== "." && part !== "..")
      .join("/");
    return cleanDir ? `${cleanDir}/${cleanFile}` : cleanFile;
  }

  root.pdf = {
    getHeader,
    normalizeDownloadUrlKey,
    normalizeCandidateDedupeKey,
    uniqueUrls,
    isTrustedBrowserPdfUrl,
    isPageActionPdfUrl,
    isSupplementaryPdfCandidate,
    buildPublisherPdfCandidates,
    preparePdfCandidates,
    shouldFastDownloadCandidate,
    responseLooksPdf,
    responseLooksDefinitelyHtml,
    prefixLooksLikeMarkup,
    classifyPdfResponse,
    classifyPdfError,
    sanitizeDownloadSegment,
    buildDownloadFilename
  };
  global.PaperPilotCore = root;
})(globalThis);

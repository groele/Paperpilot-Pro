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
      ["download", "downloadpdf", "downloadPdf", "utm_source", "utm_medium", "utm_campaign"].forEach(param => {
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
    return text.includes("supplementary") ||
      text.includes("supplemental") ||
      text.includes("supporting information") ||
      text.includes("peer review") ||
      text.includes("references") ||
      text.includes("citation") ||
      text.includes("bibtex") ||
      text.includes("ris");
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

    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    const lowerPath = path.toLowerCase();
    const doiPathMatch = path.match(/\/doi\/(?:full\/|abs\/)?(10\.[^?#]+)/i);
    const doiPath = doiPathMatch ? decodeURIComponent(doiPathMatch[1]).replace(/\/$/, "") : "";

    if (host.includes("nature.com") && /\/articles\/[^/?#]+$/i.test(path) && !lowerPath.endsWith(".pdf")) {
      candidates.push({
        url: `${url.origin}${path}.pdf`,
        source: "publisher-rule:nature",
        reason: "Nature article URL maps to .pdf",
        score: 98
      });
    }

    if (host.includes("science.org") && doiPath && !lowerPath.includes("/doi/pdf/")) {
      candidates.push({
        url: `${url.origin}/doi/pdf/${doiPath}`,
        source: "publisher-rule:science",
        reason: "Science DOI URL maps to /doi/pdf/{doi}",
        score: 94
      });
    }

    if ((host.includes("wiley.com") || host.includes("pubs.acs.org")) && doiPath && !lowerPath.includes("/doi/pdf/")) {
      candidates.push({
        url: `${url.origin}/doi/pdf/${doiPath}`,
        source: host.includes("pubs.acs.org") ? "publisher-rule:acs" : "publisher-rule:wiley",
        reason: "Publisher DOI URL maps to /doi/pdf/{doi}",
        score: 94
      });
    }

    if (host.includes("ieeexplore.ieee.org")) {
      const docMatch = path.match(/\/document\/(\d+)/i) || `${path}${url.search}`.match(/[?&]arnumber=(\d+)/i);
      if (docMatch && docMatch[1]) {
        candidates.push({
          url: `${url.origin}/stamp/stamp.jsp?tp=&arnumber=${docMatch[1]}`,
          source: "publisher-rule:ieee",
          reason: "IEEE document URL maps to stamp PDF viewer",
          score: 90
        });
      }
    }

    if (host.includes("frontiersin.org")) {
      const frontiersMatch = path.match(/\/articles\/(10\.[^/]+\/[^/]+)\/(?:full|abstract)?$/i);
      if (frontiersMatch && frontiersMatch[1]) {
        candidates.push({
          url: `${url.origin}/articles/${decodeURIComponent(frontiersMatch[1])}/pdf`,
          source: "publisher-rule:frontiers",
          reason: "Frontiers article URL maps to /pdf",
          score: 92
        });
      }
    }

    if (host === "arxiv.org" && /^\/abs\/[^/?#]+/i.test(path)) {
      candidates.push({
        url: `${url.origin}${path.replace(/^\/abs\//i, "/pdf/")}`,
        source: "publisher-rule:arxiv",
        reason: "arXiv abstract URL maps to /pdf/",
        score: 98
      });
    }

    if ((host.includes("springer.com") || host.includes("springerlink.com")) && /^\/article\/10\./i.test(path)) {
      candidates.push({
        url: `${url.origin}/content/pdf/${decodeURIComponent(path.replace(/^\/article\//i, ""))}.pdf`,
        source: "publisher-rule:springer",
        reason: "Springer DOI article URL maps to content/pdf",
        score: 92
      });
    }

    if ((host === "pmc.ncbi.nlm.nih.gov" || host.endsWith(".pmc.ncbi.nlm.nih.gov")) && /\/articles\/PMC\d+/i.test(path)) {
      candidates.push({
        url: `${url.origin}${path.replace(/\/$/, "")}/pdf/`,
        source: "publisher-rule:pmc",
        reason: "PMC article URL exposes PDF endpoint",
        score: 90
      });
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
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const candidate = {
      url: url.href,
      text: base.text || "",
      source: base.source || "unknown",
      reason: base.reason || "",
      score: Number.isFinite(base.score) ? base.score : 0,
      browserFallback: Boolean(base.browserFallback)
    };

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

  function classifyPdfResponse(response, firstChunk = null) {
    const status = response?.status || 0;
    const finalUrl = response?.url || "";
    if (response?.ok && responseLooksPdf(response, firstChunk)) {
      return { valid: true, errorCode: null, reason: "pdf-response", finalUrl };
    }
    if (status === 401 || status === 403) {
      return { valid: false, errorCode: "PDF_AUTH_REQUIRED", reason: `HTTP ${status}`, finalUrl };
    }
    if (status === 404 || status === 410) {
      return { valid: false, errorCode: "PDF_NOT_FOUND", reason: `HTTP ${status}`, finalUrl };
    }
    if (response && responseLooksDefinitelyHtml(response)) {
      return { valid: false, errorCode: "PDF_HTML_RESPONSE", reason: "html-response", finalUrl };
    }
    return { valid: false, errorCode: "PDF_NOT_CONFIRMED", reason: status ? `HTTP ${status}` : "not-confirmed", finalUrl };
  }

  function classifyPdfError(error) {
    const message = String(error?.message || error || "");
    if (/abort|timeout|timed out/i.test(message)) {
      return { valid: false, errorCode: "PDF_TIMEOUT", reason: message };
    }
    if (/failed to fetch|network/i.test(message)) {
      return { valid: false, errorCode: "PDF_NETWORK_ERROR", reason: message };
    }
    return { valid: false, errorCode: "PDF_UNKNOWN_ERROR", reason: message };
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
    isSupplementaryPdfCandidate,
    buildPublisherPdfCandidates,
    preparePdfCandidates,
    shouldFastDownloadCandidate,
    responseLooksPdf,
    responseLooksDefinitelyHtml,
    classifyPdfResponse,
    classifyPdfError,
    sanitizeDownloadSegment,
    buildDownloadFilename
  };
  global.PaperPilotCore = root;
})(globalThis);

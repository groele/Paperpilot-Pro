(function(global) {
  const root = global.PaperPilotCore || {};

  const PDF_META_NAMES = new Set([
    "citation_pdf_url",
    "bepress_citation_pdf_url",
    "wkhealth_pdf_url",
    "eprints.document_url",
    "prism.pdf",
    "dc.format.pdf",
    "pdf_url"
  ]);
  const URL_ATTRIBUTES = [
    "href",
    "src",
    "data",
    "data-src",
    "data-href",
    "data-url",
    "data-pdf-url",
    "data-download-url",
    "data-file",
    "data-document-url"
  ];
  const NEGATIVE_TEXT = /supplement(?:ary|al)|supporting information|peer review|references|citation|bibtex|\bris\b|dataset|poster|slides/i;
  const POSITIVE_TEXT = /(?:download|view|open|full[ -]?text|全文|下载|查看).{0,20}\bpdf\b|\bpdf\b.{0,20}(?:download|view|open|full[ -]?text|全文|下载|查看)|^\s*pdf\s*$/i;
  const PDF_PATH = /(?:\.pdf(?:$|[?#])|\/pdf(?:\/|$)|\/pdfdirect\/|\/epdf(?:\/|$)|\/article-pdf\/|\/content\/pdf\/|\/download\/pdf|\/pdffile\/|\/pdfft(?:$|[/?#])|\/stamp\/stamp\.jsp)/i;

  function decodePageEscapes(value) {
    return String(value || "")
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");
  }

  function toHttpUrl(rawUrl, baseUrl) {
    if (!rawUrl) return "";
    try {
      const url = new URL(decodePageEscapes(rawUrl), baseUrl || undefined);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      url.hash = "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function toResourceUrl(rawUrl, baseUrl) {
    if (!rawUrl) return "";
    try {
      const url = new URL(decodePageEscapes(rawUrl), baseUrl || undefined);
      if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "blob:") return "";
      if (url.protocol !== "blob:") url.hash = "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function looksLikePdfUrl(rawUrl, baseUrl) {
    const normalized = toHttpUrl(rawUrl, baseUrl);
    if (!normalized) return false;
    try {
      const url = new URL(normalized);
      const format = `${url.searchParams.get("format") || ""} ${url.searchParams.get("type") || ""} ${url.searchParams.get("download") || ""}`;
      return PDF_PATH.test(url.href) || /\bpdf\b/i.test(format) || ["file", "url", "src", "pdf"]
        .some(key => PDF_PATH.test(decodePageEscapes(url.searchParams.get(key) || "")));
    } catch (_) {
      return PDF_PATH.test(normalized);
    }
  }

  function extractViewerUrls(rawUrl, baseUrl, maxDepth = 2) {
    const results = [];
    let current = toHttpUrl(rawUrl, baseUrl);
    for (let depth = 0; current && depth < maxDepth; depth += 1) {
      let nested = "";
      try {
        const url = new URL(current);
        for (const key of ["file", "url", "src", "pdf", "document", "downloadUrl"]) {
          const value = url.searchParams.get(key);
          if (value && looksLikePdfUrl(value, current)) {
            nested = toHttpUrl(value, current);
            break;
          }
        }
      } catch (_) {}
      if (!nested || results.includes(nested)) break;
      results.push(nested);
      current = nested;
    }
    return results;
  }

  function elementText(element) {
    return [
      element?.textContent,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      element?.getAttribute?.("data-testid"),
      element?.getAttribute?.("data-test"),
      element?.getAttribute?.("data-aa-name")
    ].filter(Boolean).join(" ").trim().slice(0, 500);
  }

  function addCandidate(state, rawUrl, details = {}) {
    if (state.items.length >= state.maxCandidates) return;
    const url = toResourceUrl(rawUrl, state.baseUrl);
    if (!url) return;
    const key = root.pdf?.normalizeCandidateDedupeKey
      ? root.pdf.normalizeCandidateDedupeKey(url)
      : url.toLowerCase();
    if (state.seen.has(key)) return;
    const text = String(details.text || "").trim();
    if (NEGATIVE_TEXT.test(text) && !details.allowSupplement) return;
    state.seen.add(key);
    state.items.push({
      url,
      source: details.source || "dom-discovery",
      text,
      reason: details.reason || "discovered in page",
      score: Number(details.score || 0)
    });
    extractViewerUrls(url, state.baseUrl).forEach(viewerUrl => addCandidate(state, viewerUrl, {
      source: "viewer-param",
      reason: "extracted nested PDF URL from viewer parameter",
      score: Math.max(90, Number(details.score || 0))
    }));
  }

  function scanElement(element, state) {
    const tag = String(element?.tagName || "").toLowerCase();
    const text = elementText(element);
    const metaName = String(element?.getAttribute?.("name") || element?.getAttribute?.("property") || "").toLowerCase();
    const rel = String(element?.getAttribute?.("rel") || "").toLowerCase();
    const type = String(element?.getAttribute?.("type") || "").toLowerCase();

    if (tag === "meta" && PDF_META_NAMES.has(metaName)) {
      addCandidate(state, element.content || element.getAttribute("content"), {
        source: metaName === "citation_pdf_url" ? "citation_pdf_url" : "pdf-meta",
        text: metaName,
        reason: "PDF metadata tag",
        score: metaName === "citation_pdf_url" ? 99 : 96
      });
      return;
    }

    const explicitPdfType = type.includes("application/pdf") || (tag === "link" && rel.includes("alternate") && type.includes("pdf"));
    const positive = POSITIVE_TEXT.test(text);

    // Most pages contain hundreds of ordinary anchors. Inspect their primary
    // href first and avoid probing every data-* attribute unless the element
    // is already a plausible PDF control. This keeps discovery fast without
    // losing support for non-standard data attributes.
    if (tag === "a" || tag === "area") {
      const href = element?.getAttribute?.("href") || "";
      if (href) {
        if (looksLikePdfUrl(href, state.baseUrl) || positive) {
          addCandidate(state, href, {
            source: positive ? "explicit-pdf-control" : "dom-pdf-resource",
            text,
            reason: "matched anchor PDF signal",
            score: positive ? 95 : 86
          });
          return;
        }
      }
    }

    for (const attribute of URL_ATTRIBUTES) {
      const value = element?.getAttribute?.(attribute);
      if (!value) continue;
      const likelyUrl = looksLikePdfUrl(value, state.baseUrl);
      if (!likelyUrl && !positive && !explicitPdfType && !attribute.includes("pdf")) continue;
      addCandidate(state, value, {
        source: explicitPdfType ? "application-pdf-resource" : (positive ? "explicit-pdf-control" : "dom-pdf-resource"),
        text,
        reason: `matched ${attribute} PDF signal`,
        score: explicitPdfType ? 97 : (positive ? 95 : 86)
      });
    }
  }

  function discoverRoots(documentRef, maxNodes, maxShadowRoots) {
    const roots = [documentRef];
    const stack = [documentRef?.documentElement].filter(Boolean);
    let visited = 0;
    while (stack.length && visited < maxNodes && roots.length <= maxShadowRoots) {
      const node = stack.pop();
      visited += 1;
      if (node.shadowRoot) roots.push(node.shadowRoot);
      const children = node.children || [];
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    }
    return { roots, visited };
  }

  function scanJsonValue(value, state, keyHint = "", depth = 0) {
    if (depth > 8 || state.items.length >= state.maxCandidates) return;
    if (typeof value === "string") {
      const keySuggestsFile = /contenturl|downloadurl|fileurl|pdf|encoding|distribution|associatedmedia/i.test(keyHint);
      if ((keySuggestsFile || looksLikePdfUrl(value, state.baseUrl)) && looksLikePdfUrl(value, state.baseUrl)) {
        addCandidate(state, value, {
          source: "json-ld",
          reason: `structured data field ${keyHint || "value"}`,
          score: keySuggestsFile ? 93 : 84
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 80).forEach(item => scanJsonValue(item, state, keyHint, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      const format = String(value.fileFormat || value.encodingFormat || value.mimeType || "");
      if (/pdf/i.test(format)) {
        [value.contentUrl, value.downloadUrl, value.fileUrl, value.url].filter(Boolean).forEach(url => addCandidate(state, url, {
          source: "json-ld",
          reason: `structured PDF resource (${format})`,
          score: 95
        }));
      }
      Object.entries(value).slice(0, 120).forEach(([key, item]) => scanJsonValue(item, state, key, depth + 1));
    }
  }

  function scanScripts(documentRef, state, maxScriptChars) {
    const scripts = Array.from(documentRef?.scripts || []).slice(0, 80);
    let scannedChars = 0;
    for (const script of scripts) {
      if (scannedChars >= maxScriptChars || state.items.length >= state.maxCandidates) break;
      const text = String(script.textContent || "");
      if (!text) continue;
      const remaining = maxScriptChars - scannedChars;
      const sample = text.slice(0, remaining);
      scannedChars += sample.length;
      if ((script.type || "").toLowerCase().includes("ld+json")) {
        try {
          scanJsonValue(JSON.parse(sample), state);
        } catch (_) {}
      }
      if (!/(?:\.pdf|pdf_url|pdfUrl|downloadUrl|contentUrl|pdfft)/i.test(sample)) continue;
      const matches = sample.match(/(?:https?:\\?\/\\?\/|\/)[^"'<>\s\\]{3,500}(?:\.pdf|\/pdf(?:\/|\?|$)|\/pdfft)[^"'<>\s]{0,300}/gi) || [];
      matches.slice(0, 24).forEach(value => addCandidate(state, decodePageEscapes(value), {
        source: "inline-script",
        reason: "PDF URL embedded in bounded page script scan",
        score: 78
      }));
    }
    state.diagnostics.scriptChars = scannedChars;
  }

  function collect(documentRef, locationLike, options = {}) {
    const baseUrl = typeof locationLike === "string" ? locationLike : locationLike?.href;
    const state = {
      baseUrl,
      maxCandidates: Math.max(1, Number(options.maxCandidates || 64)),
      seen: new Set(),
      items: [],
      diagnostics: { roots: 0, nodesVisited: 0, elementsScanned: 0, scriptChars: 0 }
    };
    if (!documentRef || !baseUrl) return { candidates: [], diagnostics: state.diagnostics };

    if (String(documentRef.contentType || "").toLowerCase().includes("pdf") || looksLikePdfUrl(baseUrl, baseUrl)) {
      addCandidate(state, baseUrl, { source: "current-document", reason: "current document is a PDF surface", score: 100 });
    }
    extractViewerUrls(baseUrl, baseUrl).forEach(url => addCandidate(state, url, {
      source: "viewer-param",
      reason: "current URL contains nested PDF viewer URL",
      score: 98
    }));

    const discovery = discoverRoots(documentRef, Number(options.maxNodes || 3000), Number(options.maxShadowRoots || 16));
    state.diagnostics.roots = discovery.roots.length;
    state.diagnostics.nodesVisited = discovery.visited;
    const selector = "meta,link,a[href],area[href],iframe,embed,object,[data-pdf-url],[data-download-url],[data-file],[data-href],[data-url],[data-document-url]";
    discovery.roots.forEach(rootNode => {
      if (state.items.length >= state.maxCandidates) return;
      let elements = [];
      try {
        elements = Array.from(rootNode.querySelectorAll(selector)).slice(0, Number(options.maxElementsPerRoot || 2500));
      } catch (_) {}
      state.diagnostics.elementsScanned += elements.length;
      for (const element of elements) {
        scanElement(element, state);
        if (state.items.length >= state.maxCandidates) break;
      }
    });
    const hasHighConfidenceCandidate = state.items.some(item => Number(item.score || 0) >= 95);
    const shouldScanScripts = options.deferDeepScan !== true || !hasHighConfidenceCandidate;
    if (shouldScanScripts) {
      scanScripts(documentRef, state, Number(options.maxScriptChars || 400000));
      state.diagnostics.discoveryMode = hasHighConfidenceCandidate ? "full-after-priority" : "full";
    } else {
      state.diagnostics.discoveryMode = "priority-short-circuit";
      state.diagnostics.scriptChars = 0;
    }

    const prepared = root.pdf?.preparePdfCandidates
      ? root.pdf.preparePdfCandidates(state.items, { baseUrl })
      : state.items.sort((a, b) => b.score - a.score);
    return {
      candidates: prepared.slice(0, state.maxCandidates),
      diagnostics: state.diagnostics
    };
  }

  root.pdfDiscovery = {
    PDF_META_NAMES,
    toHttpUrl,
    toResourceUrl,
    looksLikePdfUrl,
    extractViewerUrls,
    collect
  };
  global.PaperPilotCore = root;
})(globalThis);

(function() {
  if (window.top !== window || globalThis.__PAPERPILOT_JOURNAL_LOADED__) return;

  const DELAYS = [0, 300, 1200, 4000, 12000], JSON_LD_TOTAL_BUDGET = 240000;
  const PDF_SEL = "a[href*='.pdf' i],a[href*='/pdf/' i],a[href*='/pdfft' i],a[download][href*='pdf' i],button[aria-label*='pdf' i],button[title*='pdf' i]";
  let inFlight = false, activated = false, destroyed = false, observer = null, bodyObserver = null, debounceTimer = null, stopTimer = null, lastUrl = window.location.href;
  const timers = new Set(), jsonLdCache = new WeakMap();

  function detectAcademicPage() {
    if (document.visibilityState === "hidden") return "";
    if (String(document.contentType || "").toLowerCase().includes("application/pdf")) return "pdf-document";

    const text = `${window.location.href} ${document.title || ""}`;
    const hasDoiRoute = /\b10\.\d{4,9}\//i.test(text);
    const directPdfControl = document.querySelector(PDF_SEL);
    if (directPdfControl || hasDoiRoute) return directPdfControl ? "pdf-control" : "doi-route";
    if (document.querySelector("meta[name='citation_pdf_url' i],meta[name='bepress_citation_pdf_url' i],link[type='application/pdf']")) return "pdf-metadata";

    const titleMeta = document.querySelector("meta[name='citation_title' i],meta[name='dc.title' i],meta[property='og:title']");
    const doiMeta = document.querySelector("meta[name='citation_doi' i],meta[name='dc.identifier' i],meta[name='prism.doi' i],meta[property='article:doi']");
    const articleType = document.querySelector("meta[name='citation_journal_title' i],meta[property='og:type'][content='article' i]");
    if (titleMeta && (doiMeta || articleType)) return "scholarly-metadata";

    let remaining = JSON_LD_TOTAL_BUDGET;
    for (const s of document.querySelectorAll("script[type='application/ld+json']")) {
      if (remaining <= 0) break;
      const text = String(s.textContent || "").slice(0, remaining);
      remaining -= text.length;
      const cached = jsonLdCache.get(s);
      const matched = cached?.text === text ? cached.matched : /\bScholarlyArticle\b|\bcitation_pdf_url\b|\bcontentUrl\b[^]{0,300}\bpdf\b/i.test(text);
      if (cached?.text !== text) jsonLdCache.set(s, { text, matched });
      if (matched) return "scholarly-jsonld";
    }
    return "";
  }

  function stop() {
    observer?.disconnect();
    bodyObserver?.disconnect();
    observer = bodyObserver = null;
    clearTimeout(debounceTimer);
    clearTimeout(stopTimer);
    timers.forEach(clearTimeout);
    timers.clear();
  }

  function destroy() {
    destroyed = true;
    stop();
  }

  function activate(reason) {
    if (destroyed || activated || inFlight || !reason) return;
    inFlight = true;
    try {
      if (!chrome?.runtime?.id) return (inFlight = false, destroy());
      chrome.runtime.sendMessage({ action: "ACTIVATE_JOURNAL_PAGE", url: window.location.href, reason }, res => {
        inFlight = false;
        const err = chrome.runtime.lastError;
        if (err && String(err.message || "").includes("Extension context invalidated")) return destroy();
        if (!err && res?.ok) return (activated = true, stop());
        schedule(600);
      });
    } catch (e) {
      inFlight = false;
      if (String(e?.message || "").includes("Extension context invalidated")) destroy();
    }
  }

  function check() {
    if (!destroyed && !activated && document.visibilityState !== "hidden") activate(detectAcademicPage());
  }

  function mutationMayExposeAcademicSignal(mutations) {
    return mutations.some(m => Array.from(m.addedNodes || []).some(n => {
      if (n.nodeType !== Node.ELEMENT_NODE) return false;
      if (n.matches?.(`meta,link[type='application/pdf'],${PDF_SEL}`)) return true;
      return Boolean(n.querySelector?.(`meta[name*='citation' i],link[type='application/pdf'],a[href*='doi.org' i],${PDF_SEL}`));
    }));
  }

  function schedule(delayMs) {
    if (destroyed) return;
    const t = setTimeout(() => {
      timers.delete(t);
      if (document.visibilityState !== "hidden") check();
    }, delayMs);
    timers.add(t);
  }

  function attachObservers() {
    if (destroyed || globalThis.__PAPERPILOT_JOURNAL_LOADED__) return;
    const makeObs = delay => new MutationObserver(m => {
      if (!mutationMayExposeAcademicSignal(m)) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(check, delay);
    });
    if (document.head && !observer) {
      observer = makeObs(180);
      observer.observe(document.head, { childList: true, subtree: true });
    }
    if (!bodyObserver) {
      const attach = () => {
        if (!document.body || bodyObserver || destroyed) return;
        bodyObserver = makeObs(220);
        bodyObserver.observe(document.body, { childList: true, subtree: true });
      };
      attach();
      setTimeout(attach, 500);
    }
    clearTimeout(stopTimer);
    stopTimer = setTimeout(stop, 30000);
    timers.add(stopTimer);
  }

  function onUrlChange() {
    if (destroyed) return;
    const cur = window.location.href;
    if (cur === lastUrl) return;
    lastUrl = cur;
    if (globalThis.__PAPERPILOT_JOURNAL_LOADED__) return stop();
    activated = false;
    attachObservers();
    schedule(100);
    schedule(800);
  }

  ["pushState", "replaceState"].forEach(m => {
    try {
      const orig = history[m];
      if (typeof orig === "function") {
        history[m] = function(...args) {
          const res = orig.apply(this, args);
          try { onUrlChange(); } catch (_) {}
          return res;
        };
      }
    } catch (_) {}
  });

  window.addEventListener("popstate", onUrlChange, { passive: true });
  window.addEventListener("hashchange", onUrlChange, { passive: true });
  DELAYS.forEach(schedule);
  attachObservers();
  document.addEventListener("visibilitychange", () => {
    if (!destroyed && document.visibilityState !== "hidden") check();
  }, { passive: true });
  window.addEventListener("pagehide", destroy, { once: true });
})();

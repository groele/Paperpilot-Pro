(function() {
  if (window.top !== window || globalThis.__PAPERPILOT_JOURNAL_LOADED__) return;

  const RETRY_DELAYS_MS = [0, 250, 1000, 3000, 8000, 20000];
  let activationInFlight = false;
  let activated = false;
  let observer = null;
  let bodyObserver = null;
  let debounceTimer = null;
  const timers = new Set();

  function detectAcademicPage() {
    const contentType = String(document.contentType || "").toLowerCase();
    if (contentType.includes("application/pdf")) return "pdf-document";

    const urlText = `${window.location.href} ${document.title || ""}`;
    const hasDoiRoute = /\b10\.\d{4,9}\//i.test(urlText);
    const directPdfControl = document.querySelector(
      "a[href*='.pdf' i],a[href*='/pdf/' i],a[href*='/pdfft' i],a[download][href*='pdf' i],button[aria-label*='pdf' i],button[title*='pdf' i]"
    );
    if (directPdfControl || hasDoiRoute) return directPdfControl ? "pdf-control" : "doi-route";

    if (document.querySelector("meta[name='citation_pdf_url' i],meta[name='bepress_citation_pdf_url' i],link[type='application/pdf']")) {
      return "pdf-metadata";
    }

    const titleMeta = document.querySelector("meta[name='citation_title' i],meta[name='dc.title' i],meta[property='og:title']");
    const doiMeta = document.querySelector("meta[name='citation_doi' i],meta[name='dc.identifier' i],meta[name='prism.doi' i],meta[property='article:doi']");
    const articleType = document.querySelector("meta[name='citation_journal_title' i],meta[property='og:type'][content='article' i]");
    if (titleMeta && (doiMeta || articleType)) return "scholarly-metadata";

    const jsonLd = Array.from(document.querySelectorAll("script[type='application/ld+json']")).slice(0, 12);
    return jsonLd.some(script => /\bScholarlyArticle\b|\bcitation_pdf_url\b|\bcontentUrl\b[^]{0,300}\bpdf\b/i.test(String(script.textContent || "").slice(0, 120000)))
      ? "scholarly-jsonld"
      : "";
  }

  function stop() {
    observer?.disconnect();
    bodyObserver?.disconnect();
    observer = null;
    bodyObserver = null;
    clearTimeout(debounceTimer);
    timers.forEach(clearTimeout);
    timers.clear();
  }

  function activate(reason) {
    if (activated || activationInFlight || !reason) return;
    activationInFlight = true;
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
        activationInFlight = false;
        return;
      }
      chrome.runtime.sendMessage({
        action: "ACTIVATE_JOURNAL_PAGE",
        url: window.location.href,
        reason
      }, response => {
        activationInFlight = false;
        const err = chrome.runtime.lastError;
        if (!err && response?.ok) {
          activated = true;
          stop();
          return;
        }
        scheduleCheck(600);
      });
    } catch (e) {
      activationInFlight = false;
    }
  }

  function check() {
    if (!activated) activate(detectAcademicPage());
  }

  function mutationMayExposeAcademicSignal(mutations) {
    return mutations.some(mutation => Array.from(mutation.addedNodes || []).some(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const element = node;
      if (element.matches?.("meta,link[type='application/pdf'],a[href],button[aria-label],button[title]")) return true;
      return Boolean(element.querySelector?.("meta[name*='citation' i],link[type='application/pdf'],a[href*='pdf' i],a[href*='doi.org' i],button[aria-label*='pdf' i],button[title*='pdf' i]"));
    }));
  }

  function scheduleCheck(delayMs) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      check();
    }, delayMs);
    timers.add(timer);
  }

  RETRY_DELAYS_MS.forEach(scheduleCheck);
  if (document.head) {
    observer = new MutationObserver(mutations => {
      if (!mutationMayExposeAcademicSignal(mutations)) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(check, 180);
    });
    observer.observe(document.head, { childList: true, subtree: true });
    const attachBodyObserver = () => {
      if (!document.body || bodyObserver) return;
      bodyObserver = new MutationObserver(mutations => {
        if (!mutationMayExposeAcademicSignal(mutations)) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(check, 220);
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    };
    attachBodyObserver();
    setTimeout(attachBodyObserver, 500);
    scheduleCheck(45000);
    const stopTimer = setTimeout(stop, 50000);
    timers.add(stopTimer);
  }
})();

(function() {
  if (window.top !== window || globalThis.__PAPERPILOT_JOURNAL_LOADED__) return;

  const RETRY_DELAYS_MS = [0, 250, 1000, 3000, 8000, 20000];
  let activationInFlight = false;
  let activated = false;
  let observer = null;
  let debounceTimer = null;
  const timers = new Set();

  function detectAcademicPage() {
    const contentType = String(document.contentType || "").toLowerCase();
    if (contentType.includes("application/pdf")) return "pdf-document";

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
    observer = null;
    clearTimeout(debounceTimer);
    timers.forEach(clearTimeout);
    timers.clear();
  }

  function activate(reason) {
    if (activated || activationInFlight || !reason) return;
    activationInFlight = true;
    chrome.runtime.sendMessage({
      action: "ACTIVATE_JOURNAL_PAGE",
      url: window.location.href,
      reason
    }, response => {
      activationInFlight = false;
      if (!chrome.runtime.lastError && response?.ok) {
        activated = true;
        stop();
        return;
      }
      scheduleCheck(600);
    });
  }

  function check() {
    if (!activated) activate(detectAcademicPage());
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
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(check, 180);
    });
    observer.observe(document.head, { childList: true, subtree: true, attributes: true });
    scheduleCheck(45000);
    const stopTimer = setTimeout(stop, 50000);
    timers.add(stopTimer);
  }
})();

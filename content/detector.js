(function() {
  if (window.top !== window || globalThis.__PAPERPILOT_JOURNAL_LOADED__) return;

  let activationSent = false;
  let debounceTimer = null;
  let observer = null;

  function detectAcademicPage() {
    const contentType = String(document.contentType || "").toLowerCase();
    if (contentType.includes("application/pdf")) return "pdf-document";

    const pdfMeta = document.querySelector("meta[name='citation_pdf_url' i],meta[name='bepress_citation_pdf_url' i],link[type='application/pdf']");
    if (pdfMeta) return "pdf-metadata";

    const titleMeta = document.querySelector("meta[name='citation_title' i],meta[name='dc.title' i],meta[property='og:title']");
    const doiMeta = document.querySelector("meta[name='citation_doi' i],meta[name='dc.identifier' i],meta[name='prism.doi' i],meta[property='article:doi']");
    const articleType = document.querySelector("meta[name='citation_journal_title' i],meta[property='og:type'][content='article' i]");
    if (titleMeta && (doiMeta || articleType)) return "scholarly-metadata";

    const jsonLd = Array.from(document.querySelectorAll("script[type='application/ld+json']")).slice(0, 12);
    if (jsonLd.some(script => /\bScholarlyArticle\b|\bcitation_pdf_url\b|\bcontentUrl\b[^]{0,300}\bpdf\b/i.test(String(script.textContent || "").slice(0, 120000)))) {
      return "scholarly-jsonld";
    }
    return "";
  }

  function activate(reason) {
    if (activationSent || !reason) return;
    activationSent = true;
    if (observer) observer.disconnect();
    chrome.runtime.sendMessage({
      action: "ACTIVATE_JOURNAL_PAGE",
      url: window.location.href,
      reason
    }, () => void chrome.runtime.lastError);
  }

  function check() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => activate(detectAcademicPage()), 120);
  }

  activate(detectAcademicPage());
  if (!activationSent && document.documentElement) {
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer?.disconnect(), 45000);
  }
})();

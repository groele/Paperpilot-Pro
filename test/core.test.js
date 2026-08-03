const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function loadCore(...files) {
  const sandbox = {
    URL,
    Date,
    Math,
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    DOMException,
    Uint8Array,
    PaperPilotCore: {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    vm.runInContext(source, sandbox, { filename: file });
  }

  return sandbox.PaperPilotCore;
}

function loadBackgroundHarness(options = {}) {
  const calls = { downloads: [], fetches: [], cancellations: [], messages: [] };
  const listeners = {};
  const storageData = {
    pdf_download_save_as: false,
    pdf_download_dir: "PaperPilot Pro",
    pdf_download_cache: {}
  };
  const sessionData = {};
  const createStorageArea = data => ({
    get(keys, callback) {
      const names = Array.isArray(keys) ? keys : [keys];
      const result = {};
      names.forEach(name => { if (name in data) result[name] = data[name]; });
      if (callback) queueMicrotask(() => callback(result));
      return Promise.resolve(result);
    },
    set(values, callback) {
      Object.assign(data, values);
      if (callback) queueMicrotask(() => callback());
      return Promise.resolve();
    }
  });
  const sandbox = {
    URL,
    Date,
    Math,
    performance,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    AbortController,
    DOMException,
    Uint8Array,
    console: { log() {}, warn() {}, error() {} },
    fetch: async (url, options = {}) => {
      calls.fetches.push({ url, method: options.method || "GET" });
      return {
        ok: true,
        status: 200,
        url,
        headers: { get: name => String(name).toLowerCase() === "content-type" ? (options.fetchMime || "application/pdf") : "" },
        body: null
      };
    },
    PaperPilotCore: {},
    PaperPilotBackground: {},
    chrome: {
      runtime: {
        lastError: null,
        onInstalled: { addListener(listener) { listeners.installed = listener; } },
        onMessage: { addListener(listener) { listeners.message = listener; } }
      },
      storage: {
        local: createStorageArea(storageData),
        session: createStorageArea(sessionData),
        onChanged: { addListener(listener) { listeners.storage = listener; } }
      },
      tabs: {
        query() { return Promise.resolve([]); },
        sendMessage(tabId, message) {
          calls.messages.push({ tabId, message });
          return Promise.resolve();
        }
      },
      downloads: {
        download(options, callback) {
          calls.downloads.push(options);
          callback(7);
        },
        cancel(downloadId, callback) {
          calls.cancellations.push(downloadId);
          callback?.();
        },
        onDeterminingFilename: { addListener(listener) { listeners.filename = listener; } },
        onChanged: { addListener(listener) { listeners.downloadChanged = listener; } }
      },
      scripting: {
        executeScript(_options, callback) { callback([{ result: { ok: true, mode: "page-link" } }]); },
        insertCSS(_options, callback) { callback?.(); }
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  sandbox.importScripts = (...files) => {
    files.forEach(file => {
      const source = fs.readFileSync(path.resolve(__dirname, "..", "background", file), "utf8");
      vm.runInContext(source, sandbox, { filename: file });
    });
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "background", "background.js"), "utf8"), sandbox, {
    filename: "background/background.js"
  });
  return { sandbox, calls, listeners, storageData, sessionData };
}

test("AI summary reports missing API key instead of creating a fake summary", async () => {
  const core = loadCore("core/messaging.js", "core/ai.js");

  const result = await core.ai.summarize({
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    prompt: "Summarize",
    title: "A real paper",
    abstract: "This abstract should not be simulated."
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AI_API_KEY_MISSING");
  assert.equal(result.source, "ai/openai");
  assert.equal(result.data.summary, "");
});

test("message responses include duration and diagnostics fields", () => {
  const core = loadCore("core/messaging.js");
  const result = core.messaging.response({
    ok: false,
    errorCode: "PDF_HTML_RESPONSE",
    error: "HTML response",
    data: null,
    source: "pdf-service",
    cachedAt: 123,
    durationMs: 42,
    diagnostics: { attempted: 3 }
  });

  assert.equal(result.ok, false);
  assert.equal(result.success, false);
  assert.equal(result.data, null);
  assert.equal(result.durationMs, 42);
  assert.deepEqual(result.diagnostics, { attempted: 3 });
});

test("message timing helper wraps async handlers", async () => {
  const core = loadCore("core/messaging.js");
  const result = await core.messaging.withTiming("metadata-service", async () => ({
    ok: true,
    success: true,
    data: { title: "Demo" }
  }));

  assert.equal(result.ok, true);
  assert.equal(result.success, true);
  assert.equal(result.source, "metadata-service");
  assert.equal(typeof result.durationMs, "number");
});

test("AI summary reports provider failure instead of falling back to a fake summary", async () => {
  const core = loadCore("core/messaging.js", "core/ai.js");

  const result = await core.ai.summarize({
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    prompt: "Summarize",
    title: "A real paper",
    abstract: "This abstract should not be simulated.",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "rate limited" } })
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "AI_PROVIDER_ERROR");
  assert.equal(result.data.summary, "");
  assert.match(result.error, /rate limited/);
});

test("metadata metrics stay unavailable without a trusted ranking source", () => {
  const core = loadCore("core/messaging.js", "core/metadata.js");

  const metadata = core.metadata.createBaseMetadata({
    doi: "https://doi.org/10.1000/demo",
    title: "Demo",
    journal: "Nature Energy"
  });

  assert.equal(metadata.doi, "10.1000/demo");
  assert.equal(metadata.impactFactor, "N/A");
  assert.equal(metadata.citeScore, "N/A");
  assert.equal(metadata.jcrQuartile, "N/A");
  assert.equal(metadata.casPartition, "N/A");
  assert.equal(metadata.isEstimated, false);
  assert.equal(metadata.metricsSource, "unconfigured");
});

test("metadata DOI extraction ignores Science article ids and recovers full DOI", () => {
  const core = loadCore("core/messaging.js", "core/metadata.js");

  const doi = core.metadata.extractDoi([
    "adh5083",
    "https://doi.org/10.1126/sciadv.adh5083",
    "Science Advances article"
  ]);

  assert.equal(doi, "10.1126/sciadv.adh5083");
  assert.equal(core.metadata.extractDoi(["adh5083"]), "");
  assert.equal(core.metadata.extractDoi(["doi:10.1126/science.abq1234."]), "10.1126/science.abq1234");
});

test("sanitizer escapes page-controlled text and attributes", () => {
  const core = loadCore("core/sanitize.js");

  assert.equal(
    core.sanitize.escapeHtml("</textarea><img src=x onerror=alert(1)>"),
    "&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;"
  );
  assert.equal(
    core.sanitize.escapeAttr(`" onmouseover="alert(1)`),
    "&quot; onmouseover=&quot;alert(1)"
  );
});

test("PDF responses classify HTML, auth, timeout and confirmed PDFs", () => {
  const core = loadCore("core/messaging.js", "core/pdf.js");

  const confirmedPdf = core.pdf.classifyPdfResponse({
    ok: true,
    status: 200,
    headers: { "content-type": "application/pdf" },
    url: "https://example.org/paper"
  });
  assert.equal(confirmedPdf.valid, true);
  assert.equal(confirmedPdf.errorCode, null);
  assert.equal(confirmedPdf.reason, "pdf-response");
  assert.equal(confirmedPdf.finalUrl, "https://example.org/paper");

  assert.equal(core.pdf.classifyPdfResponse({
    ok: true,
    status: 200,
    headers: { "content-type": "text/html" },
    url: "https://example.org/paper"
  }).errorCode, "PDF_HTML_RESPONSE");

  assert.equal(core.pdf.classifyPdfResponse({
    ok: false,
    status: 403,
    headers: {},
    url: "https://example.org/paper.pdf"
  }).errorCode, "PDF_AUTH_REQUIRED");

  assert.equal(core.pdf.classifyPdfError(new Error("The operation was aborted")).errorCode, "PDF_TIMEOUT");
});

test("PDF detection accepts a standards-compliant header within the first 1024 bytes", () => {
  const core = loadCore("core/pdf.js");
  const chunk = new Uint8Array([0, 0, 0, 0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
  assert.equal(core.pdf.responseLooksPdf({ headers: {}, ok: true }, chunk), true);
});

test("PDF response classification rejects markup disguised as binary data", () => {
  const core = loadCore("core/pdf.js");
  const html = new Uint8Array(Buffer.from("<!doctype html><title>Login</title>"));
  const result = core.pdf.classifyPdfResponse({
    ok: true,
    status: 200,
    headers: { "content-type": "application/octet-stream" },
    url: "https://example.org/paper.pdf"
  }, html);
  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "PDF_HTML_RESPONSE");
  assert.equal(result.decisive, true);
});

test("PDF candidates preserve page-owned blob resources for Chrome fallback", () => {
  const core = loadCore("core/pdf.js");
  const prepared = core.pdf.preparePdfCandidates([{
    url: "blob:https://publisher.example/2f6c0f2e-1f0f-4b54-8c2c-123456789abc",
    source: "explicit-pdf-button",
    text: "Download PDF"
  }]);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].requiresBrowser, true);
  assert.equal(prepared[0].transport, "page-context");
  assert.equal(core.pdf.shouldFastDownloadCandidate(prepared[0]), false);
});

test("PDF verifier accumulates split stream chunks and hedges only when HEAD is inconclusive", async () => {
  const core = loadCore("core/pdf.js", "core/pdf-verifier.js");
  const calls = [];
  const chunks = [
    new Uint8Array([0, 0]),
    new Uint8Array([0x25, 0x50]),
    new Uint8Array([0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
  ];
  const fetchImpl = async (_url, options) => {
    calls.push(options.method);
    if (options.method === "HEAD") {
      return { ok: true, status: 200, url: "https://example.org/paper", headers: {} };
    }
    let index = 0;
    return {
      ok: true,
      status: 206,
      url: "https://example.org/paper",
      headers: { "content-type": "application/octet-stream" },
      body: {
        getReader() {
          return {
            async read() {
              if (index >= chunks.length) return { done: true };
              return { done: false, value: chunks[index++] };
            },
            async cancel() {}
          };
        }
      }
    };
  };
  const verifier = core.pdfVerifier.create({ fetchImpl, hedgeDelayMs: 0 });
  const result = await verifier.verify("https://example.org/paper");
  assert.equal(result.valid, true);
  assert.deepEqual(calls, ["HEAD", "GET"]);

  const headOnlyCalls = [];
  const headOnly = core.pdfVerifier.create({
    hedgeDelayMs: 20,
    fetchImpl: async (_url, options) => {
      headOnlyCalls.push(options.method);
      return { ok: true, status: 200, url: "https://example.org/direct.pdf", headers: { "content-type": "application/pdf" } };
    }
  });
  assert.equal((await headOnly.verify("https://example.org/direct.pdf")).valid, true);
  assert.deepEqual(headOnlyCalls, ["HEAD"]);

  const headRejectsGetWorks = core.pdfVerifier.create({
    hedgeDelayMs: 0,
    fetchImpl: async (_url, options) => options.method === "HEAD"
      ? { ok: false, status: 404, url: "https://example.org/head-disabled", headers: {} }
      : { ok: true, status: 206, url: "https://example.org/head-disabled", headers: { "content-type": "application/pdf" } }
  });
  const recovered = await headRejectsGetWorks.verify("https://example.org/head-disabled");
  assert.equal(recovered.valid, true, "GET verification must recover when a publisher rejects HEAD");
});

test("PDF URL cache keys preserve case-sensitive paths", () => {
  const core = loadCore("core/pdf.js");
  assert.notEqual(
    core.pdf.normalizeDownloadUrlKey("https://example.org/Paper.pdf"),
    core.pdf.normalizeDownloadUrlKey("https://example.org/paper.pdf")
  );
});

test("cache helper expires and bounds persistent records", () => {
  const core = loadCore("core/cache.js");
  const records = {
    old: { cachedAt: 1 },
    a: { cachedAt: 90 },
    b: { cachedAt: 100 },
    keep: { cachedAt: 1 }
  };
  core.cache.pruneRecordObject(records, {
    now: 110,
    ttlMs: 50,
    maxEntries: 1,
    preserveKeys: ["keep"]
  });
  assert.deepEqual(Object.keys(records).sort(), ["b", "keep"]);
});

test("request cache hashing includes every candidate without exposing raw URLs", () => {
  const core = loadCore("core/cache.js");
  const shared = Array.from({ length: 16 }, (_, index) => `https://example.org/${index}.pdf`);
  const first = core.cache.hashStringList([...shared, "https://example.org/a.pdf"]);
  const second = core.cache.hashStringList([...shared, "https://example.org/b.pdf"]);
  assert.notEqual(first, second);
  assert.equal(first.includes("https://"), false);
});

test("PDF discovery extracts nested viewer URLs and recognizes query-based PDF routes", () => {
  const core = loadCore("core/pdf.js", "core/pdf-discovery.js");
  const viewer = "https://repo.example/viewer?file=" + encodeURIComponent("/files/Paper.PDF?token=abc");
  assert.deepEqual(
    Array.from(core.pdfDiscovery.extractViewerUrls(viewer, viewer)),
    ["https://repo.example/files/Paper.PDF?token=abc"]
  );
  assert.equal(core.pdfDiscovery.looksLikePdfUrl("https://repo.example/article/file?id=10.1/demo&type=pdf"), true);
});

test("PDF discovery skips a deep DOM scan for direct PDF and viewer surfaces", () => {
  const core = loadCore("core/pdf.js", "core/pdf-discovery.js");
  let scanned = false;
  const fakeDocument = {
    contentType: "application/pdf",
    documentElement: { children: [] },
    scripts: [],
    querySelectorAll() { scanned = true; return []; }
  };

  const result = core.pdfDiscovery.collect(fakeDocument, "https://repo.example/files/article.pdf", {
    deferDeepScan: true
  });

  assert.equal(result.diagnostics.discoveryMode, "terminal-short-circuit");
  assert.equal(result.diagnostics.elementsScanned, 0);
  assert.equal(scanned, false);
  assert.equal(result.candidates[0].url, "https://repo.example/files/article.pdf");
});

test("PDF discovery accepts explicit blob download controls", () => {
  const core = loadCore("core/pdf.js", "core/pdf-discovery.js");
  const element = {
    tagName: "A",
    textContent: "Download PDF",
    getAttribute(name) {
      if (name === "href") return "blob:https://repo.example/123";
      return "";
    }
  };
  const fakeDocument = {
    contentType: "text/html",
    documentElement: { children: [] },
    scripts: [],
    querySelectorAll() { return [element]; }
  };
  const result = core.pdfDiscovery.collect(fakeDocument, "https://repo.example/article", {
    maxCandidates: 8,
    maxNodes: 1,
    maxElementsPerRoot: 8,
    maxScriptChars: 0
  });
  assert.equal(result.candidates[0].url, "blob:https://repo.example/123");
  assert.equal(result.candidates[0].requiresBrowser, true);
});

test("PDF candidate preparation scores publisher rules and filters non-article PDFs", () => {
  const core = loadCore("core/messaging.js", "core/site-profiles.js", "core/pdf.js");

  const nature = core.pdf.buildPublisherPdfCandidates("https://www.nature.com/articles/s41586-026-00000-0");
  assert.equal(nature[0].url, "https://www.nature.com/articles/s41586-026-00000-0.pdf");
  assert.equal(nature[0].source, "publisher-rule:nature");

  const arxiv = core.pdf.buildPublisherPdfCandidates("https://arxiv.org/abs/2601.01234");
  assert.equal(arxiv[0].url, "https://arxiv.org/pdf/2601.01234");
  assert.equal(arxiv[0].source, "publisher-rule:arxiv");

  const prepared = core.pdf.preparePdfCandidates([
    { url: "https://example.org/supporting-information.pdf", text: "Supporting Information PDF", source: "dom" },
    { url: "https://example.org/article.pdf", text: "Download PDF", source: "explicit-pdf-button" },
    { url: "https://example.org/article.pdf?download=1", text: "Download PDF", source: "duplicate" }
  ]);

  assert.equal(prepared.length, 2);
  assert.equal(prepared[0].url, "https://example.org/article.pdf");
  assert.equal(prepared[0].score >= 90, true);
  assert.equal(prepared[1].url, "https://example.org/article.pdf?download=1");
});

test("PDF publisher rules cover common journal hosts", () => {
  const core = loadCore("core/messaging.js", "core/site-profiles.js", "core/pdf.js");

  const science = core.pdf.buildPublisherPdfCandidates("https://www.science.org/doi/10.1126/sciadv.adh5083");
  assert.equal(science[0].url, "https://www.science.org/doi/pdf/10.1126/sciadv.adh5083");
  assert.equal(science[0].source, "publisher-rule:science");

  const wiley = core.pdf.buildPublisherPdfCandidates("https://onlinelibrary.wiley.com/doi/10.1002/adma.202412345");
  assert.equal(wiley[0].url, "https://onlinelibrary.wiley.com/doi/pdf/10.1002/adma.202412345");

  const acs = core.pdf.buildPublisherPdfCandidates("https://pubs.acs.org/doi/10.1021/acs.nanolett.5c00001");
  assert.equal(acs[0].url, "https://pubs.acs.org/doi/pdf/10.1021/acs.nanolett.5c00001");

  const ieee = core.pdf.buildPublisherPdfCandidates("https://ieeexplore.ieee.org/document/1234567");
  assert.equal(ieee[0].url, "https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=1234567");

  const frontiers = core.pdf.buildPublisherPdfCandidates("https://www.frontiersin.org/articles/10.3389/fphy.2026.1234567/full");
  assert.equal(frontiers[0].url, "https://www.frontiersin.org/articles/10.3389/fphy.2026.1234567/pdf");

  const sage = core.pdf.buildPublisherPdfCandidates("https://journals.sagepub.com/doi/10.1177/00000000261234567");
  assert.equal(sage[0].url, "https://journals.sagepub.com/doi/pdf/10.1177/00000000261234567");

  const aps = core.pdf.buildPublisherPdfCandidates("https://link.aps.org/abstract/10.1103/PhysRevDemo.1.1");
  assert.equal(aps[0].url, "https://link.aps.org/pdf/10.1103/PhysRevDemo.1.1");
});

test("site profiles expose DOI, PDF, metadata and challenge signals for common publishers", () => {
  const core = loadCore("core/messaging.js", "core/metadata.js", "core/site-profiles.js");
  const cases = [
    ["science", "https://www.science.org/doi/10.1126/sciadv.adh5083", "https://www.science.org/doi/pdf/10.1126/sciadv.adh5083"],
    ["nature", "https://www.nature.com/articles/s41586-026-00000-0", "https://www.nature.com/articles/s41586-026-00000-0.pdf"],
    ["wiley", "https://onlinelibrary.wiley.com/doi/10.1002/adma.202412345", "https://onlinelibrary.wiley.com/doi/pdf/10.1002/adma.202412345"],
    ["acs", "https://pubs.acs.org/doi/10.1021/acs.nanolett.5c00001", "https://pubs.acs.org/doi/pdf/10.1021/acs.nanolett.5c00001"],
    ["rsc", "https://pubs.rsc.org/en/content/articlelanding/2026/nr/d6nr00001a", "https://pubs.rsc.org/en/content/articlepdf/2026/nr/d6nr00001a"],
    ["ieee", "https://ieeexplore.ieee.org/document/1234567", "https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=1234567"],
    ["sciencedirect", "https://www.sciencedirect.com/science/article/pii/S1234567890", ""],
    ["mdpi", "https://www.mdpi.com/2072-4292/18/1/123", "https://www.mdpi.com/2072-4292/18/1/123/pdf"],
    ["frontiers", "https://www.frontiersin.org/articles/10.3389/fphy.2026.1234567/full", "https://www.frontiersin.org/articles/10.3389/fphy.2026.1234567/pdf"],
    ["tandf", "https://www.tandfonline.com/doi/full/10.1080/00000000.2026.1234567", "https://www.tandfonline.com/doi/pdf/10.1080/00000000.2026.1234567"],
    ["arxiv", "https://arxiv.org/abs/2601.01234", "https://arxiv.org/pdf/2601.01234"],
    ["pmc", "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/", "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/pdf/"],
    ["biorxiv", "https://www.biorxiv.org/content/10.1101/2026.01.01.123456v1", "https://www.biorxiv.org/content/10.1101/2026.01.01.123456v1.full.pdf"],
    ["pnas", "https://www.pnas.org/doi/10.1073/pnas.1234567890", "https://www.pnas.org/doi/pdf/10.1073/pnas.1234567890"],
    ["oup", "https://academic.oup.com/nsr/article/10/1/123/1234567", ""],
    ["cambridge", "https://www.cambridge.org/core/journals/demo/article/abs/demo/ABC123", ""],
    ["iop", "https://iopscience.iop.org/article/10.1088/1361-6528/abc123", "https://iopscience.iop.org/article/10.1088/1361-6528/abc123/pdf"],
    ["acm", "https://dl.acm.org/doi/10.1145/1234567.1234568", "https://dl.acm.org/doi/pdf/10.1145/1234567.1234568"]
  ];

  for (const [id, url, expectedPdf] of cases) {
    const profile = core.siteProfiles.resolve(url);
    assert.equal(profile.id, id);
    assert.equal(Array.isArray(profile.doiCandidates), true);
    assert.equal(Array.isArray(profile.pdfCandidates), true);
    assert.equal(Array.isArray(profile.metadataSelectors), true);
    assert.equal(Array.isArray(profile.challengeSignals), true);
    if (expectedPdf) {
      assert.equal(profile.pdfCandidates[0].url, expectedPdf);
      assert.equal(profile.pdfCandidates[0].kind, "profile");
      assert.match(profile.pdfCandidates[0].confidence, /^(high|medium|low)$/);
    }
  }
});

test("IOP presentation routes do not become part of the DOI", () => {
  const core = loadCore("core/metadata.js", "core/site-profiles.js");
  for (const route of ["meta", "pdf", "full", "abstract"]) {
    const profile = core.siteProfiles.resolve(`https://iopscience.iop.org/article/10.1088/2053-1583/ae28e0/${route}`);
    assert.equal(profile.id, "iop");
    assert.deepEqual(Array.from(profile.doiCandidates), ["10.1088/2053-1583/ae28e0"]);
    assert.equal(profile.pdfCandidates[0].url, "https://iopscience.iop.org/article/10.1088/2053-1583/ae28e0/pdf");
  }

  // `/meta` is not globally stripped: it may be a legitimate DOI suffix
  // when supplied as an authoritative DOI value rather than an IOP UI route.
  assert.equal(core.metadata.extractDoi(["doi:10.1234/example/meta"]), "10.1234/example/meta");
});

test("modular site adapters cover eLife, PeerJ, PLOS and J-STAGE", () => {
  const core = loadCore("core/metadata.js", "core/site-profiles.js");
  const cases = [
    ["https://elifesciences.org/articles/12345", "elife", "https://elifesciences.org/articles/12345.pdf"],
    ["https://peerj.com/articles/1234/", "peerj", "https://peerj.com/articles/1234.pdf"],
    ["https://journals.plos.org/plosone/article?id=10.1371/journal.pone.1234567", "plos", "type=printable"],
    ["https://www.jstage.jst.go.jp/article/demo/1/2/1/_article", "jstage", "/_pdf"]
  ];
  for (const [url, id, pdfPart] of cases) {
    const profile = core.siteProfiles.resolve(url);
    assert.equal(profile.id, id);
    assert.equal(profile.pdfCandidates.length, 1);
    assert.equal(profile.pdfCandidates[0].url.includes(pdfPart), true);
  }
  assert.equal(typeof core.siteProfiles.register, "function");
});

test("conference and repository adapters resolve stable PDF routes", () => {
  const core = loadCore("core/metadata.js", "core/site-profiles.js");
  const cases = [
    ["https://openreview.net/forum?id=Demo123", "openreview", "https://openreview.net/pdf?id=Demo123"],
    ["https://aclanthology.org/2026.acl-long.1/", "acl-anthology", "https://aclanthology.org/2026.acl-long.1.pdf"],
    ["https://proceedings.mlr.press/v235/demo24a.html", "pmlr", "https://proceedings.mlr.press/v235/demo24a.pdf"],
    ["https://papers.nips.cc/paper_files/paper/2025/hash/demo-Abstract-Conference.html", "neurips", "demo-Paper-Conference.pdf"],
    ["https://openaccess.thecvf.com/content/CVPR2026/html/Demo_Paper_CVPR_2026_paper.html", "cvf", "/papers/Demo_Paper_CVPR_2026_paper.pdf"]
  ];
  for (const [url, id, expected] of cases) {
    const profile = core.siteProfiles.resolve(url);
    assert.equal(profile.id, id);
    assert.equal(profile.pdfCandidates[0].url.includes(expected), true);
  }
});

test("fast PDF download only applies to trusted PDF-like URLs", () => {
  const core = loadCore("core/messaging.js", "core/pdf.js");

  assert.equal(core.pdf.shouldFastDownloadCandidate({
    url: "https://publisher.example/article/download",
    source: "explicit-pdf-button",
    score: 96,
    browserFallback: false
  }), false);

  assert.equal(core.pdf.shouldFastDownloadCandidate({
    url: "https://publisher.example/article.pdf",
    source: "explicit-pdf-button",
    score: 96,
    browserFallback: false
  }), true);
});

test("journal content collects up to 32 structured PDF candidates", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "content/journal.js"), "utf8");

  assert.match(source, /const MAX_PDF_URL_CANDIDATES = 32;/);
  assert.match(source, /source:\s*"explicit-pdf-button"/);
  assert.match(source, /"citation_pdf_url"/);
  assert.match(source, /source:\s*pdfMetaSource/);
});

test("background DOI lookup rejects suffix-only identifiers", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");

  assert.match(source, /PP_CORE\.metadata\?\.extractDoi/);
});

test("metadata cache records expiry and stale state", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");

  assert.match(source, /expiresAt/);
  assert.match(source, /stale/);
});

test("background fast PDF verification races candidates instead of waiting for full batch", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");
  const fnStart = source.indexOf("async function findFastTrustedPdfTarget");
  const fnEnd = source.indexOf("async function findFirstVerifiedPdfUrl");
  const fnSource = source.slice(fnStart, fnEnd);

  assert.match(fnSource, /Promise\.any/);
  assert.doesNotMatch(fnSource, /await Promise\.all\(trustedUrls/);
});

test("background PDF downloads cache successful request keys and expose performance diagnostics", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");

  assert.match(source, /PDF_REQUEST_CACHE_KEY/);
  assert.match(source, /cacheHit:\s*"request"/);
  assert.match(source, /cacheHit:\s*"url"/);
  assert.match(source, /candidateCount/);
  assert.match(source, /attemptedCount/);
  assert.match(source, /verificationMode/);
});

test("high-confidence PDF dispatch creates the native Chrome task before blocking verification", async () => {
  const { sandbox, calls } = loadBackgroundHarness();
  const candidate = {
    url: "https://repository.example/article.pdf",
    source: "explicit-pdf-control",
    reason: "explicit PDF button",
    score: 96
  };
  const startedAt = performance.now();
  const result = await sandbox.downloadPdf(candidate.url, "article.pdf", [candidate]);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.verificationMode, "native-guarded");
  assert.equal(result.diagnostics.discoveryMode, "native-direct");
  assert.equal(calls.downloads.length, 1);
  assert.equal(calls.downloads[0].url, candidate.url);
  assert.ok(result.diagnostics.durationMs < 50, `reported dispatch took ${result.diagnostics.durationMs} ms`);
  assert.ok(elapsedMs < 100, `native dispatch took ${elapsedMs.toFixed(1)} ms`);
});

test("accepted native PDF tasks survive ambiguous MIME and mismatched background probes", async () => {
  const { sandbox, calls, listeners } = loadBackgroundHarness({ fetchMime: "text/html" });
  const candidate = {
    url: "https://publisher.example/article.pdf",
    source: "explicit-pdf-control",
    reason: "explicit PDF button",
    score: 96
  };
  const result = await sandbox.downloadPdf(candidate.url, "article.pdf", [candidate]);
  let filenameSuggestion = null;

  listeners.filename({
    id: result.downloadId,
    url: candidate.url,
    finalUrl: candidate.url,
    mime: "application/octet-stream",
    filename: "article.pdf"
  }, suggestion => {
    filenameSuggestion = suggestion;
  });
  await new Promise(resolve => setTimeout(resolve, 25));

  assert.equal(result.ok, true);
  assert.equal(calls.downloads.length, 1);
  assert.equal(calls.cancellations.length, 0);
  assert.equal(filenameSuggestion.filename, "PaperPilot Pro/article.pdf");
});

test("favorites persist through later footprint events and stay visible to the Popup filter", async () => {
  const { sandbox, storageData } = loadBackgroundHarness();

  const first = await sandbox.addFootprint({ title: "Durable favorite", doi: "10.1000/favorite", starred: true });
  const second = await sandbox.addFootprint({ title: "Durable favorite", doi: "10.1000/favorite", status: "downloaded" });

  assert.equal(first.starred, true);
  assert.equal(second.starred, true);
  assert.equal(storageData.history.length, 1);
  assert.equal(storageData.history[0].starred, true);
  assert.equal(storageData.history[0].status, "downloaded");
});

test("concurrent footprint writes are serialized without dropping either record", async () => {
  const { sandbox, storageData } = loadBackgroundHarness();

  await Promise.all([
    sandbox.addFootprint({ title: "First concurrent record", doi: "10.1000/first" }),
    sandbox.addFootprint({ title: "Second concurrent record", doi: "10.1000/second", starred: true })
  ]);

  assert.equal(storageData.history.length, 2);
  assert.equal(storageData.history.some(item => item.doi === "10.1000/first"), true);
  assert.equal(storageData.history.some(item => item.doi === "10.1000/second" && item.starred), true);
  assert.equal(storageData.history_revision, 2);
});

test("history replacement rejects a stale revision without overwriting new records", async () => {
  const { sandbox, storageData } = loadBackgroundHarness();
  const snapshot = await sandbox.getHistorySnapshot();

  await sandbox.addFootprint({ title: "New record", doi: "10.1000/new" });
  const staleReplace = await sandbox.replaceHistorySnapshot([], snapshot.revision);

  assert.equal(staleReplace.success, false);
  assert.equal(staleReplace.errorCode, "HISTORY_CONFLICT");
  assert.equal(storageData.history.length, 1);
  assert.equal(storageData.history[0].doi, "10.1000/new");
});

test("public settings broker never exposes API secrets to content scripts", async () => {
  const { sandbox, storageData } = loadBackgroundHarness();
  storageData.ai_api_key = "sk-private";
  storageData.easyscholar_key = "private-ranking-key";
  storageData.appearance_mode = "dark";

  const result = await sandbox.getPublicSettings(["appearance_mode", "ai_api_key", "easyscholar_key"]);
  const update = await sandbox.setPublicSettings(
    { metacard_pinned: true, ai_api_key: "attempted-leak" },
    { tab: { id: 1, url: "https://publisher.example/article" }, url: "https://publisher.example/article" }
  );

  assert.equal(result.success, true);
  assert.equal(result.settings.appearance_mode, "dark");
  assert.equal(result.settings.ai_api_key, undefined);
  assert.equal(result.settings.easyscholar_key, undefined);
  assert.equal(update.success, true);
  assert.equal(storageData.metacard_pinned, true);
  assert.equal(storageData.ai_api_key, "sk-private");
});

test("native download tracking persists the download id after the Chrome task is created", async () => {
  const { sandbox, sessionData } = loadBackgroundHarness();
  const candidate = { url: "https://repository.example/article.pdf", source: "explicit-pdf-control", score: 96 };

  const result = await sandbox.downloadPdf(candidate.url, "article.pdf", [candidate]);
  const trackedIds = sessionData.__active_downloads_by_id || [];

  assert.equal(result.ok, true);
  assert.equal(trackedIds.some(([id]) => id === result.downloadId), true);
});

test("native download lifecycle reports creation and completion back to the source tab", async () => {
  const { sandbox, calls, listeners, sessionData } = loadBackgroundHarness();
  const candidate = { url: "https://repository.example/article.pdf", source: "explicit-pdf-control", score: 96 };

  const result = await sandbox.downloadPdf(candidate.url, "article.pdf", [candidate], {
    tabId: 12,
    pageUrl: "https://repository.example/article"
  });
  listeners.downloadChanged({ id: result.downloadId, state: { current: "complete" } });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(result.ok, true);
  assert.deepEqual(calls.messages.map(item => item.message.phase), ["created", "complete"]);
  assert.equal(calls.messages.every(item => item.tabId === 12), true);
  assert.equal((sessionData.__active_downloads_by_id || []).length, 0);
});

test("journal content caches site profile resolution per URL", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "content/journal.js"), "utf8");

  assert.match(source, /siteProfileCache/);
  assert.match(source, /function getCurrentSiteProfile/);
  assert.match(source, /siteProfileCache\.href === href/);
  assert.match(source, /cacheHit/);
  assert.match(source, /verificationMode/);
  assert.match(source, /attemptedCount/);
});

test("Chrome download path exposes transport, fallback and discovery diagnostics", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");

  assert.match(source, /transport: "chrome-download"/);
  assert.match(source, /transport: "page-context"/);
  assert.match(source, /fallbackUsed/);
  assert.match(source, /discoveryMode/);
  assert.match(source, /pdfVerificationSingleFlight/);
  assert.match(source, /PDF_SIGNED_URL_CACHE_TTL_MS/);
  assert.match(source, /world: "MAIN"/);
  assert.match(source, /shouldDispatchNativeImmediately/);
  assert.match(source, /verifyNativeDownloadInBackground/);
  assert.match(source, /verificationMode: "native-guarded"/);
  assert.match(source, /discoveryMode: "native-direct"/);
  assert.doesNotMatch(source, /readAsDataURL|startDataUrlPdfDownload|page-data-url/);
});

test("PDF Save As preference is prewarmed and synchronized without per-click storage reads", () => {
  const journal = fs.readFileSync(path.join(__dirname, "..", "content/journal.js"), "utf8");
  const scholar = fs.readFileSync(path.join(__dirname, "..", "content/scholar.js"), "utf8");
  const background = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");
  const popup = fs.readFileSync(path.join(__dirname, "..", "popup/popup.js"), "utf8");

  assert.doesNotMatch(journal, /saveAs: config\.pdf_download_save_as/);
  assert.doesNotMatch(scholar, /chrome\.storage\.local\.get\("pdf_download_save_as"/);
  assert.match(background, /UPDATE_PDF_DOWNLOAD_SETTINGS/);
  assert.match(background, /void getPdfRuntimeState\(\)\.catch/);
  assert.match(background, /pdfRuntimeOverrides/);
  assert.match(popup, /UPDATE_PDF_DOWNLOAD_SETTINGS/);
  assert.match(background, /forceNativeSaveAs/);
  assert.match(background, /args: \[downloadUrl, filename\]/);
  assert.match(background, /activeDownloadsReadyPromise/);
  assert.match(background, /syncActiveDownloadsToSession\(\);/);
  assert.doesNotMatch(background, /easyScholar API raw response/);
});

test("broad detector activates for DOI and PDF controls without full-document observer", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "content/detector.js"), "utf8");

  assert.match(source, /hasDoiRoute/);
  assert.match(source, /directPdfControl/);
  assert.match(source, /bodyObserver/);
  assert.match(source, /mutationMayExposeAcademicSignal/);
  assert.doesNotMatch(source, /observer\.observe\(document\.documentElement/);
});

test("Scholar rendering avoids estimated metric labels and unsafe duplicate selectors", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "content/scholar.js"), "utf8");
  const journal = fs.readFileSync(path.join(__dirname, "..", "content/journal.js"), "utf8");
  const background = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");

  assert.doesNotMatch(source, /\(估\)/);
  assert.match(source, /CSS\.escape/);
  assert.doesNotMatch(source, /easyscholar_key/);
  assert.doesNotMatch(journal, /easyscholar_key/);
  assert.match(background, /EASYSCHOLAR_STATUS/);
});

test("ScienceDirect candidates distinguish signed direct PDFs from browser fallbacks", () => {
  const core = loadCore("core/messaging.js", "core/pdf.js");

  const signed = core.pdf.preparePdfCandidates([
    "https://www.sciencedirect.com/science/article/pii/S1234567890/pdfft?md5=abc&pid=1"
  ]);
  assert.equal(signed[0].browserFallback, false);
  assert.equal(core.pdf.shouldFastDownloadCandidate(signed[0]), true);

  const unsigned = core.pdf.preparePdfCandidates([
    "https://www.sciencedirect.com/science/article/pii/S1234567890/pdf"
  ]);
  assert.equal(unsigned[0].browserFallback, true);
  assert.equal(core.pdf.shouldFastDownloadCandidate(unsigned[0]), false);
});

test("manifest uses only a lightweight detector for broad page coverage", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.deepEqual(manifest.host_permissions, ["http://*/*", "https://*/*"]);

  const broad = manifest.content_scripts.filter(script => (script.matches || []).includes("http://*/*"));
  assert.equal(broad.length, 1);
  assert.deepEqual(broad[0].js, ["content/detector.js"]);
  assert.equal((broad[0].css || []).length, 0);
  const scripts = JSON.stringify(manifest.content_scripts.flatMap(script => script.js || []));
  assert.equal(scripts.includes("core/site-profiles.js"), true);
  assert.equal(scripts.includes("core/pdf-discovery.js"), true);
  assert.equal(manifest.permissions.includes("scripting"), true);
});

test("journal runtime is guarded, SPA-aware and delegates discovery to the core module", () => {
  const journal = fs.readFileSync(path.join(__dirname, "..", "content/journal.js"), "utf8");
  const background = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");
  const activation = fs.readFileSync(path.join(__dirname, "..", "background/page-activation.js"), "utf8");
  assert.match(journal, /__PAPERPILOT_JOURNAL_LOADED__/);
  assert.match(journal, /pdfDiscovery\?\.collect/);
  assert.match(journal, /installPageLifecycleWatcher/);
  assert.match(journal, /PDF_URL_CANDIDATE_CACHE_MS = 30000/);
  assert.match(background, /ACTIVATE_JOURNAL_PAGE/);
  assert.match(activation, /JOURNAL_RUNTIME_FILES/);
  assert.match(activation, /PAGE_ACTIVATION_INCOMPLETE/);
  assert.match(background, /pruneRecordObject/);
});

test("dynamic page activation is origin-bound, confirmed and idempotent", async () => {
  const calls = [];
  let loaded = false;
  const sandbox = {
    URL,
    PaperPilotBackground: {},
    chrome: {
      runtime: { lastError: null },
      scripting: {
        executeScript(details, callback) {
          calls.push(["executeScript", Boolean(details.files)]);
          if (details.files) {
            loaded = true;
            callback([]);
          } else {
            callback([{ result: loaded }]);
          }
        },
        insertCSS(_details, callback) {
          calls.push(["insertCSS", true]);
          callback();
        }
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "background/page-activation.js"), "utf8"), sandbox);

  const sender = { tab: { id: 7, url: "https://repository.example/article" }, frameId: 0, url: "https://repository.example/article" };
  const first = await sandbox.PaperPilotBackground.pageActivation.activate(sender, sender.url);
  assert.equal(first.ok, true);
  assert.equal(first.alreadyActive, false);
  assert.deepEqual(calls.map(item => item[0]), ["executeScript", "insertCSS", "executeScript", "executeScript"]);

  calls.length = 0;
  const second = await sandbox.PaperPilotBackground.pageActivation.activate(sender, sender.url);
  assert.equal(second.alreadyActive, true);
  assert.deepEqual(calls.map(item => item[0]), ["executeScript"]);

  const denied = await sandbox.PaperPilotBackground.pageActivation.activate(sender, "https://attacker.example/article");
  assert.equal(denied.errorCode, "PAGE_ACTIVATION_DENIED");
});

test("popup and content scripts expose current-page diagnostics", () => {
  const popup = fs.readFileSync(path.join(__dirname, "..", "popup/popup.js"), "utf8");
  const journal = fs.readFileSync(path.join(__dirname, "..", "content/journal.js"), "utf8");
  const scholar = fs.readFileSync(path.join(__dirname, "..", "content/scholar.js"), "utf8");

  assert.match(popup, /diagnostics\.currentPage/);
  assert.match(popup, /btn-refresh-page-diagnostics/);
  assert.match(popup, /btn-open-first-pdf/);
  assert.match(journal, /getCurrentPageDiagnostics/);
  assert.match(scholar, /getCurrentPageDiagnostics/);
});

test("Popup exposes a post-calendar favorite shortcut and reveals filtered records", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "popup/popup.html"), "utf8");
  const popup = fs.readFileSync(path.join(__dirname, "..", "popup/popup.js"), "utf8");

  const quickFilterIndex = html.indexOf('id="footprint-quick-filters"');
  const calendarIndex = html.indexOf('id="footprint-heatmap-card"');
  assert.ok(quickFilterIndex > calendarIndex);
  assert.match(html, /pp-popup-version">v2\.1\.1/);
  assert.match(html, /id="setting-enable-easyscholar"/);
  assert.match(popup, /enable_easyscholar: enableEasyScholarInput\.checked/);
  assert.match(html, /id="footprint-quick-filters"[\s\S]*data-filter="starred"/);
  assert.match(popup, /function selectFootprintFilter/);
  assert.match(popup, /historyList\?\.scrollIntoView/);
});

test("Dashboard Overview exposes and synchronizes the PDF save-as shortcut", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "popup/popup.html"), "utf8");
  const popup = fs.readFileSync(path.join(__dirname, "..", "popup/popup.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "popup/popup.css"), "utf8");

  assert.match(html, /id="overview-pdf-download-save-as"/);
  assert.match(html, /id="setting-pdf-download-save-as"/);
  assert.match(popup, /function syncPdfDownloadSaveAsControls/);
  assert.match(popup, /function persistPdfDownloadSaveAs/);
  assert.match(popup, /changes\.pdf_download_save_as/);
  assert.match(css, /\.pp-popup-overview-control/);
});

test("citation exports create unique stable keys and include provenance fields", () => {
  const core = loadCore("core/messaging.js", "core/citation.js");

  const entries = core.citation.buildBibtexEntries([
    {
      title: "A <strong>Paper</strong>",
      authors: ["Ada Lovelace"],
      journal: "Journal",
      year: 2026,
      doi: "10.1000/demo",
      url: "https://doi.org/10.1000/demo",
      source: "Crossref"
    },
    {
      title: "A Paper",
      authors: ["Ada Lovelace"],
      journal: "Journal",
      year: 2026,
      doi: "10.1000/demo2",
      url: "https://doi.org/10.1000/demo2",
      source: "OpenAlex"
    }
  ], { accessed: "2026-07-01" });

  assert.match(entries, /@article\{Lovelace2026Paper,/);
  assert.match(entries, /@article\{Lovelace2026Paper2,/);
  assert.match(entries, /doi=\{10\.1000\/demo\}/);
  assert.match(entries, /url=\{https:\/\/doi\.org\/10\.1000\/demo\}/);
  assert.match(entries, /note=\{Source: Crossref; Accessed: 2026-07-01\}/);
  assert.doesNotMatch(entries, /<strong>/);
});

test("background script includes native download interceptor and pageUrl tracking", () => {
  const scholar = fs.readFileSync(path.join(__dirname, "..", "content/scholar.js"), "utf8");
  const journal = fs.readFileSync(path.join(__dirname, "..", "content/journal.js"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");

  assert.match(source, /function isSameUrl/);
  assert.match(source, /metadata\.pageUrl/);
  assert.match(source, /chrome\.downloads\.onDeterminingFilename\.addListener/);
  assert.match(source, /pdf_cache/);
  assert.match(source, /item\.referrer/);
  assert.match(source, /syncActiveDownloadsToSession/);
  assert.match(source, /setAccessLevel/);
  assert.match(source, /HISTORY_CONFLICT/);
  assert.match(source, /PDF_DOWNLOAD_STATUS/);
  assert.match(source, /fetchResponseWithTimeout/);
  assert.doesNotMatch(scholar, /chrome\.storage\.local/);
  assert.doesNotMatch(journal, /chrome\.storage\.local/);
});

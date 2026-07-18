const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");

function loadCore(...files) {
  const sandbox = {
    URL,
    Date,
    Math,
    console,
    performance,
    PaperPilotCore: {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    vm.runInContext(source, sandbox, { filename: file });
  }
  return sandbox.PaperPilotCore;
}

function matchPattern(pattern, rawUrl) {
  const escaped = pattern
    .split("*")
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(rawUrl);
}

function assertContentScriptRouting() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const scholarScript = manifest.content_scripts.find(script => (script.js || []).includes("content/scholar.js"));
  const journalScript = manifest.content_scripts.find(script => (script.js || []).includes("content/journal.js"));
  const routes = [
    ["https://example.com/news", false, false],
    ["https://scholar.google.com/scholar?q=wse2", true, false],
    ["https://www.science.org/doi/10.1126/sciadv.adh5083", false, true],
    ["https://onlinelibrary.wiley.com/doi/10.1002/adma.202412345", false, true],
    ["https://pubs.acs.org/doi/10.1021/acs.nanolett.5c00001", false, true],
    ["https://ieeexplore.ieee.org/document/1234567", false, true],
    ["https://www.nature.com/articles/s41586-026-00000-0", false, true],
    ["https://arxiv.org/abs/2601.01234", false, true],
    ["https://openreview.net/forum?id=Demo123", false, true],
    ["https://aclanthology.org/2026.acl-long.1/", false, true],
    ["https://proceedings.mlr.press/v235/demo24a.html", false, true],
    ["https://papers.nips.cc/paper_files/paper/2025/hash/demo-Abstract-Conference.html", false, true],
    ["https://openaccess.thecvf.com/content/CVPR2026/html/demo.html", false, true],
    ["https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/", false, true]
  ];

  for (const [url, scholarExpected, journalExpected] of routes) {
    const scholarMatched = scholarScript.matches.some(pattern => matchPattern(pattern, url));
    const journalMatched = journalScript.matches.some(pattern => matchPattern(pattern, url));
    assert.equal(scholarMatched, scholarExpected, `Scholar routing mismatch for ${url}`);
    assert.equal(journalMatched, journalExpected, `Journal routing mismatch for ${url}`);
  }
}

function assertPublisherProfiles() {
  const core = loadCore("core/metadata.js", "core/site-profiles.js", "core/pdf.js");
  const urls = [
    "https://www.science.org/doi/10.1126/sciadv.adh5083",
    "https://onlinelibrary.wiley.com/doi/10.1002/adma.202412345",
    "https://pubs.acs.org/doi/10.1021/acs.nanolett.5c00001",
    "https://ieeexplore.ieee.org/document/1234567",
    "https://www.nature.com/articles/s41586-026-00000-0",
    "https://arxiv.org/abs/2601.01234",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/"
  ];
  for (const url of urls) {
    const profile = core.siteProfiles.resolve(url);
    assert.notEqual(profile.id, "unknown", `Profile should resolve for ${url}`);
    const candidates = core.pdf.preparePdfCandidates(profile.pdfCandidates);
    assert.equal(candidates.length > 0, true, `PDF candidate should resolve for ${url}`);
    assert.equal(candidates[0].kind || "profile", "profile", `Profile candidate kind missing for ${url}`);
  }
}

function assertPerformanceBudgets() {
  const core = loadCore("core/metadata.js", "core/site-profiles.js", "core/pdf.js", "core/pdf-discovery.js");
  const urls = [];
  for (let i = 0; i < 1000; i += 1) {
    urls.push({
      url: `https://www.science.org/doi/10.1126/sciadv.${String(i).padStart(6, "0")}`,
      source: "fixture",
      text: "Download PDF"
    });
  }
  const start = performance.now();
  const candidates = core.pdf.preparePdfCandidates(urls);
  const elapsed = performance.now() - start;
  assert.equal(candidates.length > 0, true);
  assert.equal(elapsed < 180, true, `1000 candidate preparation took ${elapsed.toFixed(2)}ms`);

  const scholarParseStart = performance.now();
  const scholarRows = Array.from({ length: 100 }, (_, index) => ({
    title: `Demo paper ${index}`,
    citations: index * 3,
    year: 2026 - (index % 8),
    venue: index % 3 === 0 ? "Nature" : "Other"
  }));
  const enhanced = scholarRows
    .map(row => ({ ...row, score: row.citations + (row.venue === "Nature" ? 1000 : 0) }))
    .sort((a, b) => b.score - a.score);
  const scholarElapsed = performance.now() - scholarParseStart;
  assert.equal(enhanced.length, 100);
  assert.equal(scholarElapsed < 300, true, `100 Scholar fixture parse took ${scholarElapsed.toFixed(2)}ms`);

  const fakeElements = Array.from({ length: 1200 }, (_, index) => ({
    tagName: "A",
    textContent: index % 200 === 0 ? "Download PDF" : "Article link",
    getAttribute(name) {
      if (name === "href") return index % 200 === 0 ? `/paper-${index}.pdf` : `/article/${index}`;
      return "";
    }
  }));
  const fakeDocument = {
    contentType: "text/html",
    documentElement: { children: [] },
    scripts: [],
    querySelectorAll() { return fakeElements; }
  };
  const measureDiscovery = () => {
    const discoveryStart = performance.now();
    const discovery = core.pdfDiscovery.collect(fakeDocument, "https://repository.example/article/1", {
      maxCandidates: 32,
      maxNodes: 100,
      maxElementsPerRoot: 1500,
      maxScriptChars: 0,
      deferDeepScan: true
    });
    return { discovery, elapsed: performance.now() - discoveryStart };
  };
  measureDiscovery();
  const discoveryRuns = Array.from({ length: 5 }, measureDiscovery);
  const discovery = discoveryRuns[0].discovery;
  const discoveryTimes = discoveryRuns.map(run => run.elapsed).sort((a, b) => a - b);
  const discoveryMedian = discoveryTimes[Math.floor(discoveryTimes.length / 2)];
  const discoveryMax = discoveryTimes[discoveryTimes.length - 1];
  assert.equal(discovery.candidates.length, 6);
  assert.equal(discoveryMedian < 80, true, `1200-node PDF discovery median took ${discoveryMedian.toFixed(2)}ms`);
  assert.equal(discoveryMax < 180, true, `1200-node PDF discovery max took ${discoveryMax.toFixed(2)}ms`);

  const detectorBytes = fs.statSync(path.join(root, "content/detector.js")).size;
  assert.equal(detectorBytes < 5000, true, `All-page detector is too large: ${detectorBytes} bytes`);
  const detector = fs.readFileSync(path.join(root, "content/detector.js"), "utf8");
  assert.equal(detector.includes("observer.observe(document.documentElement"), false, "Detector must not observe the full page subtree");
  const journal = fs.readFileSync(path.join(root, "content/journal.js"), "utf8");
  assert.equal(journal.includes("observer.observe(document.documentElement"), false, "Journal SPA watcher must not observe the full page subtree");
}

function assertPackageExcludesTests() {
  const distDir = path.join(root, "dist");
  if (!fs.existsSync(distDir)) return;
  const zips = fs.readdirSync(distDir).filter(name => name.endsWith(".zip"));
  if (zips.length === 0) return;
  const latest = zips.map(name => path.join(distDir, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (fs.statSync(latest).mtimeMs < fs.statSync(path.join(root, "manifest.json")).mtimeMs) return;
  const listing = require("node:child_process").execFileSync("tar", ["-tf", latest], { encoding: "utf8" });
  assert.equal(listing.includes("core/site-profiles.js"), true);
  assert.equal(listing.includes("test/"), false);
  assert.equal(listing.includes("scripts/"), false);
}

assertContentScriptRouting();
assertPublisherProfiles();
assertPerformanceBudgets();
assertPackageExcludesTests();
console.log("E2E fixture checks passed.");

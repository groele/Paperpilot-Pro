const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = [
  "manifest.json",
  "background/background.js",
  "background/page-activation.js",
  "content/detector.js",
  "content/scholar.js",
  "content/journal.js",
  "popup/popup.js",
  "popup/popup.html",
  "core/messaging.js",
  "core/cache.js",
  "core/sanitize.js",
  "core/metadata.js",
  "core/site-profiles.js",
  "core/pdf.js",
  "core/pdf-verifier.js",
  "core/pdf-discovery.js",
  "core/ai.js",
  "core/citation.js",
  "scripts/e2e.js",
  "scripts/browser-smoke.js"
];

let failed = false;

for (const file of files) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required file: ${file}`);
    failed = true;
    continue;
  }

  if (file.endsWith(".json")) {
    JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } else if (file.endsWith(".js")) {
    new Function(fs.readFileSync(fullPath, "utf8"));
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const popupVersion = fs.readFileSync(path.join(root, "popup/popup.html"), "utf8").match(/class="pp-popup-version">v([^<]+)</)?.[1];
const readmeVersion = fs.readFileSync(path.join(root, "README.md"), "utf8").match(/badge\/version-([\d.]+)-/)?.[1];
if ([packageVersion, popupVersion, readmeVersion].some(version => version !== manifest.version)) {
  console.error("Manifest, package, popup, and README versions must agree.");
  failed = true;
}
const broadScripts = (manifest.content_scripts || []).filter(script =>
  (script.matches || []).includes("http://*/*") || (script.matches || []).includes("https://*/*")
);
if (broadScripts.some(script => JSON.stringify(script.js || []) !== JSON.stringify(["content/detector.js"]) || (script.css || []).length > 0)) {
  console.error("Only the lightweight detector may inject on every http/https page.");
  failed = true;
}

const background = fs.readFileSync(path.join(root, "background/background.js"), "utf8");
if (/Math\.random\(\)\s*\*\s*\d/.test(background)) {
  console.error("Background metadata must not use random impact-factor or CiteScore estimates.");
  failed = true;
}
if (/local-heuristic-model|generateContextualMockSummary/.test(background)) {
  console.error("AI summary must not silently fall back to a fake local heuristic summary.");
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("Static checks passed.");

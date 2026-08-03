const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function loadMetadata() {
  const context = vm.createContext({ console });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(root, "core", "metadata.js"), "utf8"), context);
  return context.PaperPilotCore.metadata;
}

test("title matching normalizes punctuation and rejects unrelated search hits", () => {
  const metadata = loadMetadata();
  assert.equal(metadata.isTitleMatch(
    "Excitonic polarization anisotropy: a programmable interface",
    "Excitonic Polarization Anisotropy—A Programmable Interface"
  ), true);
  assert.equal(metadata.isTitleMatch(
    "Excitonic polarization anisotropy in layered semiconductors",
    "Quantum transport in superconducting nanowires"
  ), false);
  assert.ok(metadata.titleSimilarity("Alpha beta gamma", "Alpha beta gamma delta") > 0.8);
});

test("CSL JSON maps DOI metadata and records negotiated provenance", () => {
  const metadataCore = loadMetadata();
  const record = metadataCore.createBaseMetadata();
  metadataCore.applyCslJson(record, {
    DOI: "https://doi.org/10.1000/example",
    title: "Negotiated title",
    "container-title": "Journal of Tests",
    issued: { "date-parts": [[2026]] },
    author: [{ given: "Ada", family: "Lovelace" }]
  });
  assert.equal(record.doi, "10.1000/example");
  assert.equal(record.title, "Negotiated title");
  assert.deepEqual(Array.from(record.sources), ["DOI CSL JSON"]);
});

test("background metadata pipeline is single-flight, versioned and keeps credentials private", () => {
  const source = fs.readFileSync(path.join(root, "background", "background.js"), "utf8");
  assert.match(source, /application\/vnd\.citationstyles\.csl\+json/);
  assert.match(source, /metadataSingleFlight\.run/);
  assert.match(source, /cacheSchemaVersion\s*=\s*METADATA_CACHE_SCHEMA_VERSION/);
  assert.match(source, /metadataTitleMatches\(title,/);
  assert.match(source, /easyScholarFlights/);
  assert.doesNotMatch(source.match(/PUBLIC_SETTING_KEYS[\s\S]*?\]\);/)?.[0] || "", /openalex_api_key|scholarly_contact_email|easyscholar_key/);
});

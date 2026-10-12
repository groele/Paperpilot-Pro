const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCore() {
  const context = vm.createContext({ URL, console });
  context.globalThis = context;
  for (const file of ["metadata", "site-profiles", "citation"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "core", `${file}.js`), "utf8"), context);
  }
  return context.PaperPilotCore;
}

const core = loadCore();
const m = core.metadata;
const sici = "10.1002/(SICI)1099-0844(199912)17:4<290::AID-CBF849>3.0.CO;2-P";

for (const [input, expected] of [
  ["doi:10.1126/science.abq1234.", "10.1126/science.abq1234"],
  ["https://DX.DOI.ORG/10.1000%2FABC%28demo%29?utm_source=test#cite", "10.1000/ABC(demo)"],
  ["https://doi.org/10.1000/res%23test", "10.1000/res#test"],
  ["https://doi.org/10.1000/res%3Ftest", "10.1000/res?test"],
  ["https://doi.org/10.1000/100%25growth", "10.1000/100%growth"],
  ["See https://doi.org/10.1000%2Fdemo?utm_source=test .", "10.1000/demo"],
  ["urn:doi:10.1000/ABC", "10.1000/ABC"],
  ["info:doi/10.1000/ABC", "10.1000/ABC"],
  ["DOI：１０．１０００／ABC", "10.1000/ABC"],
  ["doi: 10.1000 /\nABC", "10.1000/ABC"],
  ["10.1000/de\u200bmo\u00ad", "10.1000/demo"],
  ["(10.1000/demo(2026)).", "10.1000/demo(2026)"],
  ["[10.1000/demo[1]].", "10.1000/demo[1]"],
  [sici, sici],
  [sici.replace("<", "&lt;").replace(">", "&gt;"), sici],
  ["DOI: 10.1000/demo；这是说明。", "10.1000/demo"],
  ["10.1000/demo</a>", "10.1000/demo"],
  ["https://iopscience.iop.org/article/10.1088/2053-1583/ae28e0/meta", "10.1088/2053-1583/ae28e0"],
  ["https://link.springer.com/content/pdf/10.1007/s12345-026-00001-2.pdf", "10.1007/s12345-026-00001-2"],
  ["doi:10.1234/example/meta", "10.1234/example/meta"],
  ["https://example.test/article?doi=10.1000%2Fdemo&tracking=1", "10.1000/demo"],
  ["https://example.test/redirect?url=https%3A%2F%2Fdoi.org%2F10.1000%252Fdemo", "10.1000/demo"],
  ["https://example.test/search?q=10.1000%2Fwrong", ""],
  ["110.1000/demo", ""],
  ["id10.1000/demo", ""],
  ["10.123/demo", ""],
  ["10.1234567890/demo", ""],
  ["10.1000/", ""],
  ["adh5083", ""],
  ["https://doi.org/not-a-doi", ""]
]) {
  test(`DOI parsing: ${JSON.stringify(input)}`, () => assert.equal(m.extractDoi(input), expected));
}

test("structured identifiers skip unrelated fields, deduplicate and preserve authority", () => {
  assert.equal(m.extractDoi({ propertyID: "DOI", value: "10.1000/demo" }), "10.1000/demo");
  assert.equal(m.extractDoi({ description: "Reference: 10.1000/wrong" }), "");
  assert.equal(m.extractDoi({ propertyID: "ISBN", value: "10.1000/wrong" }), "");
  assert.deepEqual(Array.from(m.extractDois(["10.1000/DEMO", "10.1000/demo", "10.1000/other"])), ["10.1000/DEMO", "10.1000/other"]);
  assert.equal(m.normalizeDoi("10.1000/demo."), "10.1000/demo.");
  assert.equal(m.normalizeDoi("not-a-doi"), "");
});

test("malformed URL encoding never aborts a site profile", () => {
  assert.doesNotThrow(() => core.siteProfiles.resolve("https://iopscience.iop.org/article/10.1088/example%ZZ/meta"));
});

test("DOI link construction round-trips reserved characters and SICI identifiers", () => {
  for (const doi of [sici, "10.1000/res#test", "10.1000/res?test", "10.1000/100%growth"]) {
    assert.equal(m.normalizeDoi(m.doiUrl(doi)), doi);
  }
});

test("citation exports preserve SICI angle brackets in DOI fields", () => {
  const paper = { title: "Legacy article", doi: sici, authors: [], year: 1999 };
  assert.ok(core.citation.buildBibtexEntries([paper]).includes(sici));
  assert.ok(core.citation.buildRisEntries([paper]).includes(sici));
  assert.equal(core.citation.buildCslJson([paper])[0].DOI, sici);
});

test("similar titles cannot silently change numbers, negation or short-title identity", () => {
  assert.equal(m.isTitleMatch("Valley polarization in 2D layered semiconductors", "Valley polarization in 3D layered semiconductors"), false);
  assert.equal(m.isTitleMatch("Valley polarization without magnetic fields in layered semiconductors", "Valley polarization with magnetic fields in layered semiconductors"), false);
  assert.equal(m.isTitleMatch("Quantum transport", "Quantum transport phenomena"), false);
  assert.equal(m.isTitleMatch("Conversion of spin to charge in layered semiconductor heterostructures", "Conversion of charge to spin in layered semiconductor heterostructures"), false);
  assert.equal(m.isTitleMatch("Valley polarization in layered semiconductor heterostructures", "Valley polarization in layered semiconductor heterostructures: experiments"), true);
});

test("title resolution finds later exact hits and rejects ambiguous DOI assignments", () => {
  const title = "Valley polarization in layered semiconductor heterostructures";
  const candidates = [
    { source: "openalex", item: { title: "Unrelated quantum transport", doi: "10.1000/wrong" } },
    { source: "openalex", item: { title, doi: "https://doi.org/10.1000/correct" } },
    { source: "crossref", item: { title: [title], DOI: "10.1000/CORRECT" } }
  ];
  assert.equal(m.selectTitleResult(title, candidates).doi, "10.1000/correct");
  candidates.push({ source: "crossref", item: { title: [title], DOI: "10.1000/conflict" } });
  assert.equal(m.selectTitleResult(title, candidates), null);
  assert.equal(m.selectTitleResult(title, [{ source: "openalex", item: { title, doi: null } }]), null);
});

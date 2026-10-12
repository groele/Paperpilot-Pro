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
  ["https://doi.org/not-a-doi", ""],
  ["10.1000%2Fdemo%23suffix", "10.1000/demo#suffix"],
  ["doi:10%2E1000/demo", "10.1000/demo"],
  ["https%3A%2F%2Fdoi.org%2F10.1000%252Fdemo", "10.1000/demo"],
  ["https://doi.org/10.1000%2Fbad%ZZ", "10.1000/bad%ZZ"],
  ["https://doi.org/search/10.1000/wrong", ""],
  ["See https://doi.org/10.1000/demo.", "10.1000/demo"],
  ["doi: 10.1000&nbsp;/demo", "10.1000/demo"],
  ["10.1000/&#x1F52C;", "10.1000/🔬"]
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

test("one identifier cannot silently select the first DOI from a conflicting field", () => {
  assert.equal(m.normalizeDoi("10.1000/one;10.1000/two"), "");
  assert.equal(m.normalizeDoi(["10.1000/one", "10.1000/ONE"]), "10.1000/one");
  assert.equal(m.extractDoi({propertyID:"not-doi",value:"10.1000/wrong"}), "");
  assert.deepEqual(Array.from(m.extractDois("10.1000/one;10.1000/two")), ["10.1000/one","10.1000/two"]);
});

test("authoritative Unicode identifiers and literal percent sequences round-trip", () => {
  for (const doi of ["10.1000/研究，补充", "10.1000/literal%2Fsequence", "10.1000/registered.", sici]) {
    assert.equal(m.normalizeDoi(doi), doi);
    assert.equal(m.normalizeDoi(m.doiUrl(doi)), doi);
  }
});

test("DOI comparison follows ASCII-only folding rather than Unicode case folding", () => {
  assert.equal(m.doiKey('10.1000/Á.ABC'),'10.1000/Á.abc');
  assert.notEqual(m.doiKey('10.1000/Á.abc'),m.doiKey('10.1000/á.abc'));
  assert.equal(m.extractDois(['10.1000/Á.abc','10.1000/á.abc']).length,2);
});

test("DOI evidence uses source priority and refuses conflicting corroboration", () => {
  const primary={source:"metadata",priority:100,values:["10.1000/one","10.1000/two"],authoritative:true};
  assert.equal(m.selectDoiEvidence([primary]).ambiguous,true);
  assert.equal(m.selectDoiEvidence([primary,{source:"url",priority:80,values:"10.1000/two"}]).doi,"10.1000/two");
  assert.equal(m.selectDoiEvidence([primary,{source:"metadata",priority:90,values:"10.1000/two"}]).doi,"");
  assert.equal(m.selectDoiEvidence([primary,{source:"url",priority:80,values:"10.1000/two"},{source:"jsonld",priority:90,values:"10.1000/one"}]).doi,"");
  assert.equal(m.selectDoiEvidence([{source:"doi",priority:100,values:"10.1000/correct"},{source:"dc",priority:70,values:"10.1000/wrong"}]).doi,"10.1000/correct");
  assert.equal(m.selectDoiEvidence([{source:"url",priority:80,values:"10.1000/one"},{source:"canonical",priority:80,values:"10.1000/two"}]).ambiguous,true);
});

test("DOI parsing bounds hostile structured input without constructing truncated identifiers", () => {
  const cycle={}; cycle.identifier=[cycle,cycle,cycle];
  assert.equal(m.normalizeDoi(cycle), "");
  assert.equal(m.extractDoi('10.1000/'+ 'x'.repeat(16001)), "");
  assert.equal(m.extractDois(Array.from({length:100},(_,i)=>`10.1000/${i}`).join(' ')).length,64);
});

test("a bounded scan cannot conceal contradictory identifiers beyond its limit", () => {
  const repeated = Array(128).fill('10.1000/one');
  repeated.push('10.1000/two');
  const deep = { identifier: '10.1000/one', sameAs: { identifier: { identifier: { identifier: { identifier: { identifier: { identifier: { identifier: { identifier: '10.1000/two' } } } } } } } } };
  for (const value of [repeated, deep]) {
    assert.equal(m.inspectDois(value).complete, false);
    assert.equal(m.normalizeDoi(value), '');
    const result = m.selectDoiEvidence([{source:'metadata',priority:100,authoritative:true,values:value},{source:'url',priority:80,values:'10.1000/one'}]);
    assert.equal(result.doi, '');
    assert.equal(result.ambiguous, true);
  }
  assert.equal(m.normalizeDoi(Array(128).fill('10.1000/one')), '10.1000/one');
});

test("literal punctuation and Unicode suffixes survive authoritative DOI round trips", () => {
  for (const doi of ['10.1000/end)', '10.1000/end]', '10.1000/end\"', "10.1000/end'", '10.1000/a\u200db', '10.1000/path/https://example.test/AbC']) {
    assert.equal(m.normalizeDoi(doi), doi);
    assert.equal(m.normalizeDoi(m.doiUrl(doi)), doi);
  }
  assert.equal(m.extractDoi('(10.1000/end).'), '10.1000/end');
});

test("combining individually complete sources cannot hide a later tied conflict", () => {
  const groups = Array.from({length:129},(_,index)=>({source:`source-${index}`,priority:100,values:index===128?'10.1000/two':'10.1000/one'}));
  assert.equal(m.selectDoiEvidence(groups).doi,'');
  assert.equal(m.selectDoiEvidence(groups).ambiguous,true);
});

test("invalid UTF-16 cannot crash DOI resolver links and supplementary entities stay intact", () => {
  assert.equal(m.normalizeDoi('10.1000/\ud800'), '');
  assert.equal(m.doiUrl('10.1000/\udc00'), '');
  assert.equal(m.normalizeDoi(m.doiUrl('10.1000/🔬')), '10.1000/🔬');
  assert.doesNotThrow(()=>m.decodeHtmlEntities('&#x110000; &#55296;'));
});

test("malformed URL encoding never aborts a site profile", () => {
  assert.doesNotThrow(() => core.siteProfiles.resolve("https://iopscience.iop.org/article/10.1088/example%ZZ/meta"));
});

test("publisher profiles cannot turn a conflicting URL into the first DOI", () => {
  const profile=core.siteProfiles.resolve('https://example.test/article/10.1000/one?doi=10.1000%2Ftwo');
  assert.equal(profile.doiCandidates.length,0);
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

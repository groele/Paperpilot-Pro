const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ URL, console });
context.globalThis = context;
for (const file of ['metadata','citation','library']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..','core',`${file}.js`),'utf8'),context);
const library = context.PaperPilotCore.library;

test('paper identity never merges distinct DOI records with identical titles', () => {
  assert.equal(library.samePaper({title:'Identical title',doi:'10.1000/a'}, {title:'Identical title',doi:'10.1000/b'}),false);
  assert.equal(library.samePaper({doi:'https://doi.org/10.1000/A'},{doi:'10.1000/a'}),true);
  assert.equal(library.samePaper({title:'Introduction',year:2025},{title:'Introduction',year:2026}),false);
});

test('DOI identity folds ASCII case while preserving distinct Unicode suffixes', () => {
  assert.equal(library.samePaper({doi:'10.1000/Á.ABC'},{doi:'10.1000/Á.abc'}),true);
  assert.equal(library.samePaper({doi:'10.1000/Á.abc'},{doi:'10.1000/á.abc'}),false);
  const result=library.importRecords([{title:'Same title',doi:'10.1000/Á.abc'}],[{title:'Same title',doi:'10.1000/á.abc'}]);
  assert.equal(result.history.length,2);
});
test('revisits preserve notes, bibliography, favorites and previous download actions', () => {
  const record = library.mergeRecord(library.normalizeRecord({title:'Full article',doi:'10.1000/a',journal:'Journal',year:2025,pdfUrl:'https://example.test/p.pdf',notes:'Research notes',starred:true,status:'downloaded'}), {title:'Full article',doi:'10.1000/a',journal:'',year:null,status:'visited'},1000);
  assert.equal(record.notes,'Research notes'); assert.equal(record.journal,'Journal'); assert.equal(record.year,2025);
  assert.equal(record.starred,true); assert.equal(library.hasAction(record,'downloaded'),true);
  assert.equal(record.pdfUrl,'https://example.test/p.pdf');
});
test('unknown years and dates remain unknown and ISO timestamps survive migration', () => {
  const unknown = library.normalizeRecord({title:'Undated article',year:null});
  assert.equal(unknown.year,null); assert.equal(unknown.time,0);
  assert.equal(library.normalizeRecord({title:'Known date',time:'2026-10-01T00:00:00Z'}).time,Date.parse('2026-10-01T00:00:00Z'));
});
test('ranked search combines words, fields, phrases and accent-insensitive authors', () => {
  const rows = [{title:'Valley polarization',authors:['José Smith'],doi:'10.1000/a',year:2026,notes:'Low temperature measurements'}, {title:'Transport',authors:['Ada Lovelace'],year:2025,notes:'Valley polarization'}];
  assert.equal(library.search(rows,'valley')[0],rows[0]);
  assert.deepEqual(Array.from(library.search(rows,'author:Jose year:2026 valley')), [rows[0]]);
  assert.deepEqual(Array.from(library.search(rows,'notes:"low temperature"')), [rows[0]]);
  assert.deepEqual(Array.from(library.search(rows,'doi:https://doi.org/10.1000/a')), [rows[0]]);
  assert.equal(library.search(rows,'valley unrelated').length,0);
});

test('DOI queries preserve Unicode identity for full, partial and unqualified searches', () => {
  const rows = [{title:'First paper',doi:'10.1000/Á.ABC'}, {title:'Second paper',doi:'10.1000/á.abc'}];
  for (const query of ['doi:10.1000/Á.abc', 'doi:Á.ABC', '10.1000/Á.abc', 'doi:https://doi.org/10.1000/%C3%81.abc']) {
    assert.deepEqual(Array.from(library.search(rows, query)), [rows[0]]);
  }
  assert.deepEqual(Array.from(library.search(rows,'doi:10.1000/á.ABC')), [rows[1]]);
});

test('out-of-range imported timestamps stay unknown instead of poisoning calendar dates', () => {
  for (const time of [1e20, Infinity, '999999999999999999999', 'not-a-date']) {
    assert.equal(library.normalizeRecord({title:'Paper',time}).time,0);
  }
  assert.equal(library.normalizeRecord({title:'Paper',time:8640000000000000}).time,8640000000000000);
});
test('duplicate indexing cannot bridge conflicting DOI identities via a missing DOI', () => {
  const groups = library.duplicateGroups([{title:'Same article'}, {title:'Same article',doi:'10.1000/a'}, {title:'Same article',doi:'10.1000/b'}]);
  assert.deepEqual(Array.from(groups, group=>Array.from(group)),[[0,1],[2]]);
  const near = library.duplicateGroups([{title:'Spin to charge conversion'}, {title:'Charge to spin conversion'}]);
  assert.equal(near.length,2);
});
test('duplicate indexing handles 1000 distinct long titles within a bounded budget', () => {
  const rows = Array.from({length:1000},(_,i)=>({title:`A distinctive experimental study of valley polarization in sample ${i}`,doi:`10.1000/${i}`}));
  const started = performance.now();
  assert.equal(library.duplicateGroups(rows).length,1000);
  assert.ok(performance.now()-started<500);
});

test('backup imports retain distinct DOI editions, deduplicate canonical identifiers and keep local notes', () => {
  const existing = [{title:'Same title',doi:'10.1000/a',notes:'Recent local notes'}];
  const result = library.importRecords(existing,[{title:'Same title',doi:'https://doi.org/10.1000/A',notes:'Older notes'},{title:'Same title',doi:'10.1000/b'}]);
  assert.equal(result.added,1); assert.equal(result.history.length,2);
  assert.equal(result.history.find(row=>row.doi==='10.1000/a').notes,'Recent local notes');
});

test('copied backup IDs cannot merge unrelated papers or address two records at once', () => {
  assert.equal(library.samePaper({id:'copied-id',title:'First article'},{id:'copied-id',title:'Different article'}),false);
  const result=library.importRecords([],[{id:'copied-id',title:'First article',doi:'10.1000/a'},{id:'copied-id',title:'Second article',doi:'10.1000/b'}]);
  assert.equal(result.history.length,2);
  assert.equal(new Set(result.history.map(library.recordKey)).size,2);
  const repaired=library.normalizeRecords([{id:'shared',title:'A'},{id:'shared',title:'B'},{id:'shared#2',title:'C'},null]);
  assert.equal(repaired[2].id,'shared#2');
  assert.equal(repaired.length,3);
  assert.equal(new Set(repaired.map(library.recordKey)).size,3);
});

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

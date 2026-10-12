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

test('metadata flush coalesces callers, reports failure and can retry', async () => {
  const {sandbox,storageData} = loadBackgroundHarness();
  const cache = await sandbox.getOrLoadMetadataCache();
  cache.demo = {title:'First'};
  const first = sandbox.scheduleMetadataCacheFlush();
  cache.second = {title:'Second'};
  const second = sandbox.scheduleMetadataCacheFlush();
  const result = await Promise.race([Promise.all([first,second]), new Promise(resolve => setTimeout(()=>resolve('hung'),250))]);
  assert.deepEqual(Array.from(result),[true,true]);
  assert.equal(storageData.pdf_cache.second.title,'Second');
  const original = sandbox.chrome.storage.local.set;
  cache.third = {title:'Third'};
  sandbox.chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  assert.equal(await sandbox.scheduleMetadataCacheFlush(),false);
  sandbox.chrome.storage.local.set = original;
  assert.equal(await sandbox.scheduleMetadataCacheFlush(),true);
});

test('an own cache echo cannot discard newly completed records, and external replacements invalidate', async () => {
  const {sandbox,listeners} = loadBackgroundHarness();
  const cache = await sandbox.getOrLoadMetadataCache();
  cache.first = {title:'First'};
  await sandbox.scheduleMetadataCacheFlush();
  cache.second = {title:'Second'};
  listeners.storage({pdf_cache:{newValue:{first:{title:'First'}}}},'local');
  assert.equal((await sandbox.getOrLoadMetadataCache()).second.title,'Second');
  listeners.storage({pdf_cache:{newValue:{replacement:{title:'Replacement'}}}},'local');
  assert.equal(Object.keys(await sandbox.getOrLoadMetadataCache()).join(','),'replacement');
});

test('cache clearing defeats a delayed storage load and settles cancelled flushes', async () => {
  const {sandbox,listeners,storageData} = loadBackgroundHarness();
  let release;
  const original = sandbox.chrome.storage.local.get;
  sandbox.chrome.storage.local.get = keys => keys === 'pdf_cache' ? new Promise(resolve => { release=resolve; }) : original(keys);
  const load = sandbox.getOrLoadMetadataCache();
  storageData.pdf_cache = {};
  listeners.storage({pdf_cache:{oldValue:{old:{title:'Old'}},newValue:{}}},'local');
  release({pdf_cache:{old:{title:'Old'}}});
  assert.equal(Object.keys(await load).length,0);
  const pending = sandbox.scheduleMetadataCacheFlush();
  listeners.storage({pdf_cache:{oldValue:{},newValue:undefined}},'local');
  assert.equal(await pending,false);
  assert.equal(Object.keys(await sandbox.getOrLoadMetadataCache()).length,0);
});

test('late metadata results cannot refill a cleared cache or join a new generation', async () => {
  const releases = [];
  let started;
  const ready = new Promise(resolve => { started=resolve; });
  const {sandbox,listeners,storageData} = loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:()=>{ started(); return new Promise(resolve=>{releases.push(resolve);}); }})});
  const first = sandbox.fetchPaperMetadata('', 'A distinctive article title for cache generation', 'Journal');
  await ready;
  while (releases.length < 2) await new Promise(resolve=>setTimeout(resolve,1));
  listeners.storage({pdf_cache:{newValue:{}}},'local');
  storageData.pdf_cache = {};
  sandbox.fetch = async () => ({ok:true,status:200,json:async()=>null});
  const second = sandbox.fetchPaperMetadata('', 'A distinctive article title for cache generation', 'Journal');
  assert.notEqual(first, second);
  const newResult = await second;
  releases.forEach(resolve=>resolve(null));
  assert.equal((await first).errorCode,'METADATA_CONTEXT_CHANGED');
  assert.equal(newResult.success,true);
  await sandbox.scheduleMetadataCacheFlush();
  assert.equal(Object.keys(storageData.pdf_cache).length,1);
  assert.equal(Object.values(storageData.pdf_cache)[0].cachedAt,newResult.data.cachedAt);
});

test('legacy metadata cache entries refresh under the new recognition schema', async () => {
  const {sandbox,storageData} = loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:async()=>null})});
  storageData.pdf_cache = {'10.1000/test':{doi:'10.1000/test',title:'A trusted looking old title',cacheSchemaVersion:4,cachedAt:Date.now(),expiresAt:Date.now()+100000}};
  const result = await sandbox.fetchPaperMetadata('10.1000/test','The current local article title','Journal');
  assert.equal(result.fromCache,false);
  assert.equal(result.data.title,'The current local article title');
  assert.equal(result.data.cacheSchemaVersion,5);
});

test('provider error logs omit credential queries and signed URLs from thrown errors', async () => {
  const url = 'https://api.openalex.org/works?api_key=qa-secret&mailto=qa-contact@example.test';
  const {sandbox} = loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:async()=>{throw new Error(url);}})});
  const warnings = [];
  sandbox.console.warn = (...args)=>warnings.push(args.join(' '));
  assert.equal(await sandbox.fetchJsonResponse(url),null);
  assert.equal(warnings.length,1);
  assert.match(warnings[0],/api\.openalex\.org/);
  assert.doesNotMatch(warnings[0],/qa-secret|qa-contact|api_key|mailto/);
});

test('PDF dedupe preserves signed query bytes and case-sensitive resource identity', () => {
  const core = loadCore('core/pdf.js');
  const url = 'https://EXAMPLE.test/Article.PDF?token=A%20B%7e%2f&literal=+&flag&broken=%ZZ';
  const key = core.pdf.normalizeCandidateDedupeKey(url);
  assert.equal(key,'https://example.test/Article.PDF?token=A%20B%7e%2f&literal=+&flag&broken=%ZZ');
  assert.equal(core.pdf.normalizeCandidateDedupeKey(url+'&utm_source=test#page=2'),key);
  assert.notEqual(key,core.pdf.normalizeCandidateDedupeKey(url.replace('Article','article')));
  assert.notEqual(key,core.pdf.normalizeCandidateDedupeKey(url.replace('A%20B','a%20b')));
});

test("all favorites survive beyond the regular history capacity", () => {
  const {sandbox}=loadBackgroundHarness();
  const records=Array.from({length:550},(_,i)=>({title:`Favorite ${i}`,doi:`10.1000/fav-${i}`,starred:true}));
  assert.equal(sandbox.trimHistoryWithStarredProtection(records).length,550);
});

test("invalid notes cannot insert an empty history record", async () => {
  const {sandbox,storageData}=loadBackgroundHarness();
  const result=await sandbox.updateFootprintNotes('', '', 'Orphaned note');
  assert.equal(result.success,false);
  assert.equal(storageData.history?.length || 0,0);
  const invalid=await sandbox.addFootprint({doi:'not-a-doi',title:' '});
  assert.equal(invalid.success,false);
});

test("metadata JSON body stalls time out even after successful headers", async () => {
  const {sandbox}=loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:()=>new Promise(()=>{})})});
  await assert.rejects(sandbox.fetchResponseWithTimeout('https://example.org/stalled',{},20),/Timed out/);
});

test("AI connection and summary reject empty replies instead of claiming success", async () => {
  const {sandbox,storageData}=loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:async()=>({choices:[]})})});
  Object.assign(storageData,{ai_provider:'custom',ai_model:'qa',ai_base_url:'https://example.org'});
  await assert.rejects(sandbox.testAIConnection(),/未返回有效内容/);
  const summary=await sandbox.callAISummarize('An abstract','A paper');
  assert.equal(summary.success,false);
  assert.equal(summary.errorCode,'AI_RESPONSE_EMPTY');
});

test("extension updates preserve every existing feature switch and citation section preference", async () => {
  const {listeners,storageData}=loadBackgroundHarness();
  Object.assign(storageData,{enable_journal_citation_tools:false,enable_journal_copy_gbt_btn:false,enable_scholar_star_btn:false,enable_footprint_stats:false});
  listeners.installed();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(storageData.enable_journal_citation_tools,false);
  assert.equal(storageData.enable_journal_copy_gbt_btn,false);
  assert.equal(storageData.enable_scholar_star_btn,false);
  assert.equal(storageData.enable_footprint_stats,false);
});

test("fresh installation uses the compact screenshot defaults and matching reset preset", async () => {
  const {sandbox,listeners,storageData}=loadBackgroundHarness();
  listeners.installed();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(storageData.appearance_mode,'light');
  for(const key of ['enable_metrics_display','enable_metrics_auto_detect','enable_journal_citation_tools','enable_pdf_download_btn','enable_ai_summary_btn','enable_page_diagnostics']) assert.equal(storageData[key],false,key);
  for(const key of ['enable_metacard','enable_ni','enable_journal_copy_doi_btn','enable_journal_open_landing_btn','enable_footprint_heatmap']) assert.equal(storageData[key],true,key);
  const reset=sandbox.PaperPilotCore.settings.preset('reset');
  for(const [key,value] of Object.entries(reset)) assert.equal(storageData[key],value,key);
});

test("upgrading preserves explicit expanded-card preferences, keys, notes and history", async () => {
  const {listeners,storageData}=loadBackgroundHarness();
  Object.assign(storageData,{appearance_mode:'dark',enable_ai_summary_btn:true,enable_journal_citation_tools:true,enable_pdf_download_btn:true,enable_metrics_display:true,ai_api_key:'private-fixture-key',history:[{title:'Preserved article',notes:'Preserved notes'}]});
  listeners.installed();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(storageData.appearance_mode,'dark');
  for(const key of ['enable_ai_summary_btn','enable_journal_citation_tools','enable_pdf_download_btn','enable_metrics_display']) assert.equal(storageData[key],true,key);
  assert.equal(storageData.ai_api_key,'private-fixture-key');
  assert.equal(storageData.history[0].notes,'Preserved notes');
});

test("public setting reads apply missing defaults without exposing credentials", async () => {
  const {sandbox,storageData}=loadBackgroundHarness();
  storageData.ai_api_key='private-fixture-key';
  const result=await sandbox.getPublicSettings(['enable_ai_summary_btn','appearance_mode','ai_api_key']);
  assert.equal(result.settings.enable_ai_summary_btn,false);
  assert.equal(result.settings.appearance_mode,'light');
  assert.equal(result.settings.ai_api_key,undefined);
});

test("automatic journal metrics respect the automatic-detection switch", async () => {
  for(const enabled of [false,true]) {
    const {sandbox,calls,storageData}=loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:async()=>null})});
    Object.assign(storageData,{enable_easyscholar:true,easyscholar_key:'fixture-key',enable_metrics_auto_detect:enabled});
    await sandbox.fetchPaperMetadata('10.1000/automatic-metrics','Journal metrics test article','Fixture journal');
    assert.equal(calls.fetches.some(call=>call.url.includes('easyscholar.cc')),enabled);
  }
});

test("queued automatic metrics are skipped after disable and late replies cannot survive key rotation", async () => {
  const first=loadBackgroundHarness();
  Object.assign(first.storageData,{enable_easyscholar:true,easyscholar_key:'fixture-key',enable_metrics_auto_detect:true});
  assert.equal(await first.sandbox.enqueueEasyScholar('---','fixture-key',true),null);
  const queued=first.sandbox.enqueueEasyScholar('Fixture journal','fixture-key',true);
  first.storageData.enable_metrics_auto_detect=false;
  assert.equal(await queued,null);
  assert.equal(first.calls.fetches.length,0);
  let release;
  const second=loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:()=>new Promise(resolve=>{release=resolve;})})});
  Object.assign(second.storageData,{enable_easyscholar:true,easyscholar_key:'old-fixture-key',enable_metrics_auto_detect:true});
  const pending=second.sandbox.enqueueEasyScholar('Fixture journal','old-fixture-key',true);
  while(!release) await new Promise(resolve=>setImmediate(resolve));
  second.storageData.easyscholar_key='new-fixture-key';
  release({code:200,data:{officialRank:{}}});
  assert.equal(await pending,null);
});

test("an identifier-less revisit cannot bridge or erase conflicting DOI editions", async () => {
  const {sandbox,storageData}=loadBackgroundHarness();
  await sandbox.addFootprint({title:'Shared article title',doi:'10.1000/a',notes:'Notes A'});
  await sandbox.addFootprint({title:'Shared article title',doi:'10.1000/b',notes:'Notes B'});
  const ambiguous=await sandbox.updateFootprintNotes('', 'Shared article title', 'Unknown edition');
  assert.equal(ambiguous.errorCode,'HISTORY_AMBIGUOUS');
  await sandbox.addFootprint({title:'Shared article title'});
  await sandbox.addFootprint({title:'Shared article title'});
  assert.equal(storageData.history.length,3);
  assert.equal(storageData.history.find(row=>row.doi==='10.1000/a').notes,'Notes A');
  assert.equal(storageData.history.find(row=>row.doi==='10.1000/b').notes,'Notes B');
});

test("legacy DOI preference migrates once without overwriting independent settings", async () => {
  const {listeners,storageData}=loadBackgroundHarness();
  Object.assign(storageData,{enable_copy_doi_btn:false,enable_scholar_copy_doi_btn:true});
  listeners.installed();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(storageData.enable_scholar_copy_doi_btn,true);
  assert.equal(storageData.enable_journal_copy_doi_btn,false);
  assert.equal('enable_copy_doi_btn' in storageData,false);
});

test("PDF prefix reading stays bounded when headers arrive but the body stalls", async () => {
  const core=loadCore('core/pdf.js','core/pdf-verifier.js');
  let cancelled=false;
  const verifier=core.pdfVerifier.create({headTimeoutMs:20,rangeTimeoutMs:25,hedgeDelayMs:0,fetchImpl:async(_url,options)=>({
    ok:true,status:200,url:'https://example.org/stalled',headers:{'content-type':'application/octet-stream'},
    body:options.method==='HEAD'?null:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{cancelled=true;}})}
  })});
  let timer;
  try {
    const result=await Promise.race([verifier.verify('https://example.org/stalled'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Stalled PDF body left verification pending')),200);})]);
    assert.equal(result.valid,false);
    assert.equal(cancelled,true);
  } finally {clearTimeout(timer);}
});

function loadBackgroundHarness(options = {}) {
  const fetchResponse = options.fetchResponse;
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
    },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
      if (callback) queueMicrotask(callback);
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
      if (fetchResponse) return fetchResponse(url);
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

test("DOI lookup refuses foreign and missing identifiers from every provider", async () => {
  for (const rawDoi of ['10.1000/wrong', undefined]) {
    const {sandbox}=loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:async()=>({
      DOI:rawDoi,doi:rawDoi,title:'Foreign paper title',best_oa_location:{url_for_pdf:'https://example.org/wrong.pdf'}
    })})});
    const result=await sandbox.fetchPaperMetadata('10.1000/requested','Requested research article title','Requested journal');
    assert.equal(result.data.doi,'10.1000/requested');
    assert.equal(result.data.title,'Requested research article title');
    assert.equal(result.data.pdfUrl,'');
    assert.equal(result.data.sources.length,0);
  }
});

test("title-resolved DOI cannot inherit a foreign Unpaywall PDF", async () => {
  const title='Valley polarization in layered semiconductor heterostructures';
  const {sandbox}=loadBackgroundHarness({fetchResponse:url=>({ok:true,status:200,json:async()=>
    url.includes('api.openalex.org')?{results:[{title,doi:'https://doi.org/10.1000/correct'}]}:
    url.includes('api.crossref.org')?{message:{items:[]}}:
    {doi:'10.1000/foreign',best_oa_location:{url_for_pdf:'https://example.org/foreign.pdf'}}
  })});
  const result=await sandbox.fetchPaperMetadata('',title,'Fixture journal');
  assert.equal(result.data.doi,'10.1000/correct');
  assert.equal(result.data.pdfUrl,'');
});

test("metadata cache and request flights keep distinct Unicode DOI identities", async () => {
  const {sandbox,calls}=loadBackgroundHarness({fetchResponse:()=>({ok:true,status:200,json:async()=>null})});
  const upper='10.1000/Á.abc',lower='10.1000/á.abc';
  assert.notEqual(sandbox.getMetadataFlightKey(upper,'Same paper'),sandbox.getMetadataFlightKey(lower,'Same paper'));
  const first=await sandbox.fetchPaperMetadata(upper,'Same article title in Unicode','Fixture journal');
  const second=await sandbox.fetchPaperMetadata(lower,'Same article title in Unicode','Fixture journal');
  assert.equal(first.fromCache,false);
  assert.equal(second.fromCache,false);
  assert.equal(calls.fetches.length,6);
});

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

test("citation_pdf_url metadata is not mistaken for a downloadable citation", () => {
  const core=loadCore('core/pdf.js','core/pdf-discovery.js');
  const meta={tagName:'META',content:'/paper.pdf',getAttribute:key=>key==='name'?'citation_pdf_url':''};
  const document={contentType:'text/html',documentElement:{children:[]},scripts:[],querySelectorAll:()=>[meta]};
  const result=core.pdfDiscovery.collect(document,'https://repository.example/paper',{maxNodes:1,maxScriptChars:0});
  assert.equal(result.candidates[0].url,'https://repository.example/paper.pdf');
  assert.equal(result.candidates[0].source,'citation_pdf_url');
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
  const {sandbox}=loadBackgroundHarness();
  assert.equal(sandbox.normalizeDoiForLookup('adh5083'),'');
  assert.equal(sandbox.normalizeDoiForLookup('10.1000/one;10.1000/two'),'');
  assert.equal(sandbox.normalizeDoiForLookup('https://doi.org/10.1000%2Fvalid'),'10.1000/valid');
});

test('history keeps conflicting DOI records and preserves enriched metadata on revisits', async () => {
  const {sandbox, storageData} = loadBackgroundHarness();
  await sandbox.addFootprint({title:'Shared title',doi:'10.1000/A',journal:'Full journal',notes:'Saved notes',status:'downloaded'});
  await sandbox.addFootprint({title:'Shared title',doi:'10.1000/a',journal:'',status:'visited'});
  assert.equal(storageData.history.length,1);
  assert.equal(storageData.history[0].journal,'Full journal');
  assert.equal(storageData.history[0].notes,'Saved notes');
  assert.ok(storageData.history[0].actions.includes('downloaded'));
  await sandbox.addFootprint({title:'Shared title',doi:'10.1000/B'});
  assert.equal(storageData.history.length,2);
});

test('record edits address stable identity across concurrent page additions; undo preserves new records', async () => {
  const {sandbox, storageData} = loadBackgroundHarness();
  await sandbox.addFootprint({title:'Original article',doi:'10.1000/original',notes:'Before edit'});
  const key = storageData.history[0].id;
  await Promise.all([
    sandbox.addFootprint({title:'New page article',doi:'10.1000/new'}),
    sandbox.mutateHistoryItem({key,patch:{notes:'After edit'}})
  ]);
  assert.equal(storageData.history.find(row=>row.id===key).notes,'After edit');
  const deleted = await sandbox.mutateHistoryItem({key,remove:true});
  await sandbox.addFootprint({title:'Third article',doi:'10.1000/third'});
  const restored = await sandbox.mutateHistoryItem({restore:deleted.removed,index:deleted.index});
  assert.equal(restored.history.length,3);
  assert.equal(restored.history.find(row=>row.id===key).notes,'After edit');
  const conflict = await sandbox.mutateHistoryItem({key,patch:{doi:'10.1000/third'}});
  assert.equal(conflict.errorCode,'HISTORY_DUPLICATE');
});

test('an invalidated old flight cannot delete the replacement request', async () => {
  const core = loadCore('core/cache.js');
  const flights = core.cache.createSingleFlight();
  let resolveOld, resolveNew;
  const old = flights.run('same',()=>new Promise(resolve=>{resolveOld=resolve;}));
  await Promise.resolve(); flights.clear();
  const replacement = flights.run('same',()=>new Promise(resolve=>{resolveNew=resolve;}));
  await Promise.resolve(); resolveOld('old'); await old;
  assert.equal(flights.has('same'),true);
  resolveNew('new'); await replacement;
  assert.equal(flights.size,0);
});

test("background title lookup evaluates later hits through the real service pipeline", async () => {
  const title = "Valley polarization in layered semiconductor heterostructures";
  const { sandbox, calls } = loadBackgroundHarness({
    fetchResponse(url) {
      const data = String(url).includes("openalex") ? { results: [
        { title: "Unrelated quantum transport", doi: "10.1000/wrong" },
        { title, doi: "https://doi.org/10.1000/correct", publication_year: 2026 }
      ] } : { message: { items: [] } };
      return { ok: true, json: async () => data };
    }
  });
  const result = await sandbox.fetchPaperMetadata("", title, "");
  assert.equal(result.data.doi, "10.1000/correct");
  assert.equal(result.data.title, title);
  assert.ok(calls.fetches.some(call => call.url.includes("per-page=5")));
  assert.ok(calls.fetches.some(call => call.url.includes("rows=5")));
});

test("background refuses ambiguous title matches and retries unresolved metadata soon", async () => {
  const title = "Valley polarization in layered semiconductor heterostructures";
  const { sandbox } = loadBackgroundHarness({
    fetchResponse(url) {
      const data = String(url).includes("openalex")
        ? { results: [{ title, doi: "10.1000/one" }] }
        : { message: { items: [{ title: [title], DOI: "10.1000/two" }] } };
      return { ok: true, json: async () => data };
    }
  });
  const result = await sandbox.fetchPaperMetadata("", title, "");
  assert.equal(result.data.doi, "");
  assert.ok(result.data.expiresAt - result.data.cachedAt <= 300000);
});

test("DOI enrichment cannot replace the requested article with another DOI", async () => {
  const { sandbox } = loadBackgroundHarness({
    fetchResponse() {
      return { ok: true, json: async () => ({ DOI: "10.1000/wrong", doi: "10.1000/wrong", title: "Unrelated article", publication_year: 2026 }) };
    }
  });
  const result = await sandbox.fetchPaperMetadata("10.1000/requested", "Requested article title", "");
  assert.equal(result.data.doi, "10.1000/requested");
  assert.equal(result.data.title, "Requested article title");
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
  assert.match(html, /pp-popup-version">v\d+\.\d+\.\d+/);
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

test("Action popup has intrinsic bounds while standalone extension tabs adapt to their viewport", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "popup/popup.html"), "utf8");
  const popup = fs.readFileSync(path.join(__dirname, "..", "popup/popup.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "popup/popup.css"), "utf8");

  assert.match(html, /class="pp-popup-container"/);
  assert.match(html, /id="btn-toggle-overview"/);
  assert.match(html, /class="pp-overview-collapsible-body"/);
  assert.match(css, /html\s*\{[\s\S]*width:\s*420px;/);
  assert.match(css, /html\s*\{[^}]*min-width:\s*420px;/);
  assert.match(css, /html\s*\{[^}]*min-height:\s*600px;/);
  assert.doesNotMatch(css, /html\s*\{[^}]*100v[wh]/);
  assert.match(css, /html\[data-pp-surface="page"\]\s*\{[^}]*max-width:\s*100vw;/);
  assert.match(popup, /getViews\(\{ type: "popup" \}\)/);
  assert.match(css, /backdrop-filter:\s*none/);
  assert.match(css, /\.pp-popup-body\s*\{\s*flex:\s*1 1 auto;\s*min-height:\s*0;/);
  assert.match(css, /\.pp-popup-section\s*\{[\s\S]*overflow-y:\s*auto;/);
  assert.match(css, /\.pp-popup-container\.pp-settings-mode\s+\.pp-popup-info-card\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.pp-popup-info-card\.pp-collapsed\s+\.pp-overview-collapsible-body\s*\{[\s\S]*display:\s*none/);
  assert.match(popup, /let popupInitialized = false/);
  assert.match(popup, /if \(popupInitialized\) return/);
  assert.match(popup, /DOMContentLoaded", initPopup, \{ once: true \}/);
  assert.match(popup, /function setOverviewCollapsed/);
  assert.match(popup, /overview_collapsed/);
  assert.match(popup, /btnQuickThemeToggle\.textContent = THEME_ICONS/);
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

test("BibTeX exports safely escape LaTeX special characters and handle structured author objects", () => {
  const core = loadCore("core/messaging.js", "core/citation.js");

  const entries = core.citation.buildBibtexEntries([
    {
      title: "Deep Learning & AI: A 95% Survey on GPT_4 & BERT #1 ($100M Scale)",
      authors: [
        { family: "Vaswani", given: "Ashish" },
        { name: "Noam Shazeer" },
        { literal: "The Attention Team" }
      ],
      journal: "IEEE Trans. Pattern Anal. & Mach. Intell.",
      year: 2024,
      doi: "10.1000/182_deep_ai",
      url: "https://example.com/paper?id=123&test=1"
    }
  ]);

  // Special LaTeX characters must be escaped in text fields:
  assert.match(entries, /title=\{Deep Learning \\& AI: A 95\\% Survey on GPT\\_4 \\& BERT \\#1 \(\\\$100M Scale\)\}/);
  assert.match(entries, /journal=\{IEEE Trans\. Pattern Anal\. \\& Mach\. Intell\.\}/);
  assert.match(entries, /author=\{Ashish Vaswani and Noam Shazeer and The Attention Team\}/);

  // Verbatim fields (DOI and URL) should NOT have backslashes:
  assert.match(entries, /doi=\{10\.1000\/182_deep_ai\}/);
  assert.match(entries, /url=\{https:\/\/example\.com\/paper\?id=123&test=1\}/);

  // RIS generation handles structured authors and standard ER terminator:
  const ris = core.citation.buildRisEntries([
    {
      title: "Attention Is All You Need",
      authors: [{ family: "Vaswani", given: "Ashish" }],
      year: 2017,
      doi: "10.48550/arXiv.1706.03762"
    }
  ]);
  assert.match(ris, /AU  - Vaswani, Ashish/);
  assert.match(ris, /ER  - \n/);
});

test("site profiles and challenge detection intercept CARSI, Shibboleth and campus SSO gateways", () => {
  const core = loadCore("core/site-profiles.js");
  const signals = core.siteProfiles.COMMON_CHALLENGE_SIGNALS;

  assert.equal(signals.includes("carsi"), true);
  assert.equal(signals.includes("shibboleth"), true);
  assert.equal(signals.includes("统一身份认证"), true);
  assert.equal(signals.includes("单点登录"), true);

  const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "background/background.js"), "utf8");
  const journalSource = fs.readFileSync(path.join(__dirname, "..", "content/journal.js"), "utf8");

  assert.match(backgroundSource, /scheduleMetadataCacheFlush/);
  assert.match(backgroundSource, /getOrLoadMetadataCache/);
  assert.match(journalSource, /carsi\.edu\.cn/);
  assert.match(journalSource, /isWakeupDelay/);
});

test("Nature Index matching accurately identifies top journals and strictly rejects false-positive compound names", () => {
  const core = loadCore("core/nature-index.js");
  const { isNatureIndex, getNatureIndexMatch } = core.natureIndex;

  // 1. Positive matches
  const truePositives = [
    "Nature",
    "nature",
    "Nature Communications",
    "Nat. Commun.",
    "Science",
    "Science Advances",
    "Cell",
    "Molecular Cell",
    "Physical Review Letters",
    "Phys. Rev. Lett.",
    "PRL",
    "Journal of the American Chemical Society",
    "JACS",
    "Advanced Materials",
    "Adv. Mater.",
    "Angewandte Chemie International Edition",
    "Angew. Chem. Int. Ed.",
    "PNAS",
    "Proceedings of the National Academy of Sciences",
    "Geology",
    "Neuron",
    "The Lancet"
  ];
  for (const journal of truePositives) {
    assert.equal(isNatureIndex(journal), true, `Expected "${journal}" to match Nature Index`);
  }

  // 2. Strict False-Positive rejections
  const trueNegatives = [
    "Science of The Total Environment",
    "Computational Materials Science",
    "Materials Science and Engineering: A",
    "Journal of Materials Science",
    "Frontiers in Plant Science",
    "Scientific Reports",
    "Cellular Oncology",
    "Cellular and Molecular Life Sciences",
    "Cell Biology International",
    "Engineering Geology",
    "Marine Geology",
    "Economic Geology",
    "Water Science and Technology",
    "Computer Science Review",
    "Information Sciences",
    "Breast Cancer Research and Treatment",
    "PLOS ONE",
    "Nature and Science"
  ];
  for (const journal of trueNegatives) {
    assert.equal(isNatureIndex(journal), false, `Expected "${journal}" to NOT match Nature Index`);
  }
});

test("History eviction strictly preserves starred records when capacity exceeds 500", async () => {
  const harness = loadBackgroundHarness();
  const { sandbox, listeners } = harness;

  // Pre-seed 495 unstarred records and 5 starred records
  const initialRecords = [];
  for (let i = 0; i < 500; i++) {
    initialRecords.push({
      title: `Old Paper ${i}`,
      doi: `10.1000/old-${i}`,
      journal: "Test Journal",
      year: 2020,
      starred: i < 5, // First 5 are starred
      time: 1000 + i
    });
  }

  await sandbox.chrome.storage.local.set({ history: initialRecords, history_revision: 1 });

  // Add 20 new unstarred footprints
  for (let j = 0; j < 20; j++) {
    const res = await new Promise(resolve => {
      listeners.message({
        action: "ADD_FOOTPRINT",
        footprint: {
          title: `New Paper ${j}`,
          doi: `10.1000/new-${j}`,
          journal: "New Journal",
          year: 2026,
          starred: false
        }
      }, {}, resolve);
    });
    assert.equal(res.success, true);
  }

  const storage = await sandbox.chrome.storage.local.get("history");
  const finalHistory = storage.history;
  assert.equal(finalHistory.length, 500);

  // All 5 original starred papers MUST still exist
  for (let i = 0; i < 5; i++) {
    const found = finalHistory.find(item => item.doi === `10.1000/old-${i}`);
    assert.ok(found, `Starred paper 10.1000/old-${i} must NOT be evicted`);
    assert.equal(found.starred, true);
  }
});

test("GB/T 7714-2015 citation generation conforms to Chinese and Western author standards", () => {
  const core = loadCore("core/citation.js");
  const { buildGbt7714Entries, formatGbtAuthors } = core.citation;

  // 1. Author formatting tests
  assert.equal(formatGbtAuthors(["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"]), "Vaswani A, Shazeer N, Parmar N, et al.");
  assert.equal(formatGbtAuthors(["李德毅", "杜圉"]), "李德毅, 杜圉");
  assert.equal(formatGbtAuthors(["张三", "李四", "王五", "赵六"]), "张三, 李四, 王五, 等");

  // 2. Journal paper entries
  const papers = [
    {
      authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"],
      title: "Attention Is All You Need",
      journal: "Advances in Neural Information Processing Systems",
      year: 2017,
      doi: "10.48550/arXiv.1706.03762"
    },
    {
      authors: ["李德毅", "杜圉"],
      title: "不确定性人工智能",
      journal: "软件学报",
      year: 2004,
      doi: "10.1360/jos151583"
    }
  ];

  const formattedNumbered = buildGbt7714Entries(papers, { numbered: true });
  assert.match(formattedNumbered, /\[1\] Vaswani A, Shazeer N, Parmar N, et al\. Attention Is All You Need\[J\]\. Advances in Neural Information Processing Systems, 2017\. DOI: 10\.48550\/arXiv\.1706\.03762\./);
  assert.match(formattedNumbered, /\[2\] 李德毅, 杜圉\. 不确定性人工智能\[J\]\. 软件学报, 2004\. DOI: 10\.1360\/jos151583\./);

  const formattedUnnumbered = buildGbt7714Entries([papers[0]], { numbered: false });
  assert.equal(formattedUnnumbered.startsWith("[1]"), false);
  assert.match(formattedUnnumbered, /^Vaswani A, Shazeer N, Parmar N, et al\. Attention Is All You Need\[J\]/);
});

test("Footprint notes persist through background mutation and update actions", async () => {
  const harness = loadBackgroundHarness();
  const { sandbox, listeners } = harness;

  const addRes = await new Promise(resolve => {
    listeners.message({
      action: "ADD_FOOTPRINT",
      footprint: {
        title: "Deep Residual Learning for Image Recognition",
        doi: "10.1109/CVPR.2016.90",
        journal: "CVPR",
        year: 2016,
        notes: "### AI 研读\n提出残差学习架构（ResNet），解决梯度消失与退化问题。"
      }
    }, {}, resolve);
  });
  assert.equal(addRes.success, true);

  let storage = await sandbox.chrome.storage.local.get("history");
  assert.equal(storage.history[0].notes, "### AI 研读\n提出残差学习架构（ResNet），解决梯度消失与退化问题。");

  // Update existing notes via SAVE_FOOTPRINT_NOTES
  const updateRes = await new Promise(resolve => {
    listeners.message({
      action: "SAVE_FOOTPRINT_NOTES",
      doi: "10.1109/CVPR.2016.90",
      title: "Deep Residual Learning for Image Recognition",
      notes: "更新后的笔记内容：ResNet-152 达到 3.57% top-5 错误率。"
    }, {}, resolve);
  });
  assert.equal(updateRes.success, true);

  storage = await sandbox.chrome.storage.local.get("history");
  assert.equal(storage.history[0].notes, "更新后的笔记内容：ResNet-152 达到 3.57% top-5 错误率。");

  // Save notes directly on a paper that doesn't exist yet in history (must not deadlock!)
  const newPaperRes = await new Promise(resolve => {
    listeners.message({
      action: "SAVE_FOOTPRINT_NOTES",
      doi: "10.1038/s41586-021-03819-2",
      title: "Highly accurate protein structure prediction with AlphaFold",
      notes: "### AI 研读\nAlphaFold 2 实现了近原子分辨率的蛋白质结构预测。"
    }, {}, resolve);
  });
  assert.equal(newPaperRes.success, true);
  storage = await sandbox.chrome.storage.local.get("history");
  const alphaFoldRecord = storage.history.find(item => item.doi === "10.1038/s41586-021-03819-2");
  assert.ok(alphaFoldRecord);
  assert.equal(alphaFoldRecord.notes, "### AI 研读\nAlphaFold 2 实现了近原子分辨率的蛋白质结构预测。");
});

test("Popup UI and citation parser support notes search, chips, and PubMed/NLM author styles", () => {
  const core = loadCore("core/citation.js");
  const { formatGbtAuthors, formatGbtAuthor } = core.citation;

  // PubMed / MEDLINE author styles without commas should preserve surname first
  assert.equal(formatGbtAuthor("Vaswani A"), "Vaswani A");
  assert.equal(formatGbtAuthor("Smith J."), "Smith J");
  assert.equal(formatGbtAuthor("Doe J R"), "Doe J R");
  assert.equal(formatGbtAuthors(["Vaswani A", "Shazeer N"]), "Vaswani A, Shazeer N");

  // Verify popup HTML markup contains notes quick filter and notes search placeholder
  const html = fs.readFileSync(path.resolve(__dirname, "../popup/popup.html"), "utf8");
  assert.match(html, /data-filter="notes"/);
  assert.match(html, /placeholder=".*笔记内容.*"/);
});

test("Modular feature switches provide granular toggles across Scholar, Metacard, and Footprint UI", async () => {
  const { sandbox, storageData } = loadBackgroundHarness();
  const html = fs.readFileSync(path.resolve(__dirname, "../popup/popup.html"), "utf8");

  // All new toggle controls must exist in popup.html
  const requiredSwitchIds = [
    "setting-enable-scholar-copy-gbt-btn",
    "setting-enable-scholar-star-btn",
    "setting-enable-journal-copy-gbt-btn",
    "setting-enable-journal-copy-bib-btn",
    "setting-enable-journal-open-landing-btn",
    "setting-enable-footprint-heatmap",
    "setting-enable-footprint-stats",
    "setting-enable-page-diagnostics",
    "setting-enable-footprint-quick-filters",
    "setting-enable-footprint-gbt-btn",
    "setting-enable-footprint-bib-btn",
    "setting-enable-footprint-star-btn"
  ];

  for (const id of requiredSwitchIds) {
    assert.match(html, new RegExp(`id="${id}"`), `Missing switch ${id} in popup.html`);
  }

  // Ensure public settings broker allows querying these new feature settings
  const publicKeys = [
    "enable_scholar_copy_gbt_btn",
    "enable_scholar_star_btn",
    "enable_journal_copy_gbt_btn",
    "enable_journal_copy_bib_btn",
    "enable_journal_open_landing_btn",
    "enable_footprint_heatmap",
    "enable_footprint_stats",
    "enable_page_diagnostics",
    "enable_footprint_quick_filters",
    "enable_footprint_gbt_btn",
    "enable_footprint_bib_btn",
    "enable_footprint_star_btn"
  ];
  for (const key of publicKeys) {
    storageData[key] = true;
  }
  storageData.ai_api_key = "sk-leak-secret";

  const result = await sandbox.getPublicSettings([...publicKeys, "ai_api_key"]);
  assert.equal(result.success, true);
  for (const key of publicKeys) {
    assert.equal(result.settings[key], true, `Public setting ${key} should match stored value`);
  }
  assert.equal(result.settings.ai_api_key, undefined, "Private secret must not be exposed by getPublicSettings");
});


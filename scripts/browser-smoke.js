const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require(process.env.PP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'output/playwright');
fs.mkdirSync(out, {recursive:true});
let mode = 'normal', requests = 0, aborted = 0;
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/doi-fixture/')) {
    const name = new URL(req.url, 'http://fixture.test').pathname.split('/')[2];
    const title = `DOI recognition fixture ${name}`;
    let metadata = '', article = '', jsonLd = '';
    if (name === 'metadata') metadata = '<meta name="dc.identifier" content="10.1000/wrong"><meta name="CITATION_DOI" content="10.1000/current">';
    if (name === 'labeled') article = '<p>DOI: 10.1000/current(2026).</p>';
    if (name === 'ambiguous') article = '<a href="https://doi.org/10.1000/one">DOI</a><a href="https://doi.org/10.1000/two">DOI</a>';
    if (name.startsWith('metadata-conflict')) metadata = '<meta name="citation_doi" content="10.1000/wrong"><meta name="citation_doi" content="10.1000/current">';
    if (name === 'metadata-conflict-reverse') metadata = '<meta name="citation_doi" content="10.1000/current"><meta name="citation_doi" content="10.1000/wrong">';
    if (name === 'generic-metadata') metadata = '<meta name="dc.identifier" content="10.1000/wrong">';
    if (name === 'encoded-metadata') metadata = '<meta name="citation_doi" content="10%2E1000%2Fcurrent">';
    if (name === 'unicode-metadata') metadata = '<meta name="citation_doi" content="10.1000/研究，补充">';
    if (name === 'literal-metadata') metadata = '<meta name="citation_doi" content="10.1000/literal)">';
    if (name === 'bounded-conflict') metadata = Array(128).fill('<meta name="citation_doi" content="10.1000/one">').join('') + '<meta name="citation_doi" content="10.1000/two">';
    if (name === 'unmarked-references') article = '<section><h2>References</h2><p>DOI: 10.1000/reference</p><a href="https://doi.org/10.1000/reference">DOI</a></section>';
    if (name === 'inline-reference') article = '<p>Prior research <a href="https://doi.org/10.1000/reference">DOI</a> motivates our study.</p><p>DOI: 10.1000/current</p>';
    if (name === 'hidden-identifier') article = '<div style="display:none" data-doi="10.1000/wrong"></div><p>DOI: 10.1000/current</p>';
    if (name === 'structured-identifier') article = '<span data-doi="10.1000/current">Article identifier</span><p>DOI: 10.1000/wrong</p>';
    if (name === 'truncated-label') article = `<p>DOI: 10.1000/${'x'.repeat(2500)}</p>`;
    if (name === 'jsonld') jsonLd = `<script type="application/ld+json">${JSON.stringify({
      '@graph': [
        {'@type':'ScholarlyArticle',headline:'A related article',identifier:'10.1000/wrong'},
        {'@type':'https://schema.org/ScholarlyArticle',headline:title,identifier:{propertyID:'DOI',value:'10.1000/current'}}
      ]
    })}</script>`;
    if (name === 'jsonld-conflict') jsonLd = `<script type="application/ld+json">${JSON.stringify([
      {'@type':'ScholarlyArticle',headline:title,identifier:'10.1000/one'},
      {'@type':'ScholarlyArticle',headline:title,identifier:'10.1000/two'}
    ])}</script>`;
    if (name === 'jsonld-query') jsonLd = `<script type="application/ld+json">${JSON.stringify([
      {'@type':'ScholarlyArticle',headline:title,identifier:'10.1000/wrong',url:`http://${req.headers.host}/doi-fixture/jsonld-query?paper=1`},
      {'@type':'ScholarlyArticle',headline:title,identifier:'10.1000/current',url:`http://${req.headers.host}/doi-fixture/jsonld-query?paper=2`}
    ])}</script>`;
    if (name === 'jsonld-wrong-title') jsonLd = `<script type="application/ld+json">${JSON.stringify({
      '@type':'ScholarlyArticle',headline:'Unrelated research on superconducting circuits',identifier:'10.1000/wrong',url:`http://${req.headers.host}${req.url}`
    })}</script>`;
    if (name === 'jsonld-owner') jsonLd = `<script type="application/ld+json">${JSON.stringify({'@graph':[
      {'@type':'ScholarlyArticle','@id':'#related',headline:title,identifier:'10.1000/wrong'},
      {'@type':'WebPage',url:`http://${req.headers.host}${req.url}`,mainEntity:{'@id':'#current'}},
      {'@type':'ScholarlyArticle','@id':'#current',headline:title,identifier:'10.1000/current'}
    ]})}</script>`;
    const journalMeta = name === 'encoded' ? '' : '<meta name="citation_journal_title" content="Fixture Journal">';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="citation_title" content="${title}">${journalMeta}${metadata}${jsonLd}</head><body>
      <section id="references"><p>DOI: 10.1000/reference</p><a href="https://doi.org/10.1000/reference">Reference DOI</a></section>
      <aside class="related"><a href="https://doi.org/10.1000/related">Related DOI</a></aside>
      <main><h1>${title}</h1><section class="abstract">An article for browser verification.</section>${article}</main></body></html>`;
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  if (req.url === '/v1/chat/completions') {
    requests++;
    const current = mode;
    if (current === 'error') { res.writeHead(503, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:'QA provider unavailable'}})); return; }
    res.writeHead(200, {'Content-Type':'text/event-stream'});
    if (current === 'empty') { res.end('data: [DONE]\n\n'); return; }
    let ticks = 0;
    const timer = setInterval(() => {
      res.write(`data: ${JSON.stringify({choices:[{delta:{content:++ticks===1?'论文陈述：测试摘要。\n':'待验证推断：请核验全文。'}}]})}\n\n`);
      if (current !== 'slow' && ticks >= 3) { clearInterval(timer); res.end('data: [DONE]\n\n'); }
    }, 100);
    res.on('close', () => { clearInterval(timer); if (current === 'slow') aborted++; });
    return;
  }
  if (req.url === '/compact-reference' || req.url === '/compact-undated') {
    const title='Interfacial ferroelectricity at naturally-formed van der Waals interfaces';
    const date=req.url==='/compact-reference'?'<meta name="citation_publication_date" content="2026-01-01">':'';
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="citation_title" content="${title}"><meta name="citation_doi" content="10.1038/s41467-026-78336-9"><meta name="citation_journal_title" content="Nature Communications"><meta name="citation_pdf_url" content="/test/fixtures/paperpilot-runtime.pdf">${date}</head><body><main><h1>${title}</h1><section class="abstract">A controlled article fixture for default-card verification.</section></main></body></html>`);
    return;
  }
  if (req.url === '/paper' || req.url === '/no-abstract') {
    let html = fs.readFileSync(path.join(root, 'test/fixtures/academic-repository.html'), 'utf8');
    if (req.url === '/no-abstract') html = html.replace(/<section class="abstract">.*?<\/section>/s, '');
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
  }
  res.writeHead(404); res.end();
});
const checks = [];
function pass(name) { checks.push(name); console.log('PASS', name); }
async function until(fn, label, timeout=10000) {
  const end=Date.now()+timeout;
  while (Date.now()<end) { if(await fn()) return; await new Promise(r=>setTimeout(r,50)); }
  throw new Error('Timed out: '+label);
}
async function evaluateExtensionWorld(context, page, fn) {
  const cdp=await context.newCDPSession(page);
  const worlds=[];
  cdp.on('Runtime.executionContextCreated',event=>worlds.push(event.context));
  try {
    await cdp.send('Runtime.enable');
    for(const world of worlds) {
      const probe=await cdp.send('Runtime.evaluate',{contextId:world.id,expression:'Boolean(globalThis.chrome?.runtime?.id)',returnByValue:true});
      if(!probe.result.value) continue;
      const response=await cdp.send('Runtime.evaluate',{contextId:world.id,expression:`(${fn.toString()})()`,returnByValue:true,awaitPromise:true});
      if(response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    }
    throw Error('Extension isolated world unavailable');
  } finally {await cdp.detach();}
}
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'paperpilot-smoke-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath:process.env.PP_CHROMIUM_EXECUTABLE || undefined,
    channel:process.env.PP_CHROMIUM_EXECUTABLE ? undefined : 'chromium', headless:true,
    ignoreDefaultArgs:['--disable-extensions'],
    acceptDownloads:true, downloadsPath:path.join(out,'downloads'),
    args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,`--explicitly-allowed-ports=${server.address().port}`],
    viewport:{width:1100,height:800}
  });
  try {
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:15000});
    const extensionId=new URL(worker.url()).host;
    console.log('Extension loaded:', extensionId);
    await until(()=>worker.evaluate(async()=>Boolean((await chrome.storage.local.get('ai_preset')).ai_preset)), 'installation defaults');
    const errors=[];
    context.on('page', p=>p.on('pageerror',e=>errors.push(e.message)));
    // Keep third-party metadata deterministic; the local provider uses the real fetch/stream pipeline.
    await worker.evaluate(() => {
      const realFetch = globalThis.fetch;
      globalThis.fetch = (url, options) => String(url).startsWith('http://127.0.0.1:')
        ? realFetch(url, options) : Promise.resolve(new Response('{}',{status:503}));
    });
    const cacheRace = await worker.evaluate(async () => {
      const previousFetch = globalThis.fetch;
      const pendingBodies = [];
      try {
        await chrome.storage.local.set({pdf_cache:{}});
        globalThis.fetch = async () => ({ok:true,status:200,json:()=>new Promise(resolve=>pendingBodies.push(resolve))});
        const old = fetchPaperMetadata('', 'A distinct cache race fixture article', 'Fixture Journal');
        const waitFor = async read => { const end=Date.now()+5000; while (!read()) { if(Date.now()>end) throw Error('Cache race fixture timeout'); await new Promise(resolve=>setTimeout(resolve,5)); } };
        await waitFor(()=>pendingBodies.length >= 2);
        await chrome.storage.local.set({pdf_cache:{clearMarker:{cachedAt:Date.now()}}});
        // Wait for the genuine browser storage event, not a mocked listener.
        await waitFor(()=>memoryMetadataCache?.clearMarker);
        await chrome.storage.local.remove('pdf_cache');
        await waitFor(()=>memoryMetadataCache && Object.keys(memoryMetadataCache).length===0);
        pendingBodies.forEach(resolve=>resolve(null));
        const oldResult = await old;
        globalThis.fetch = previousFetch;
        const fresh = await fetchPaperMetadata('', 'A distinct cache race fixture article', 'Fixture Journal');
        const settled = await Promise.all([scheduleMetadataCacheFlush(),scheduleMetadataCacheFlush()]);
        return {oldCode:oldResult.errorCode, fresh:fresh.success, settled, keys:Object.keys((await chrome.storage.local.get('pdf_cache')).pdf_cache || {})};
      } finally { globalThis.fetch=previousFetch; pendingBodies.forEach(resolve=>resolve(null)); }
    });
    assert.equal(cacheRace.oldCode,'METADATA_CONTEXT_CHANGED');
    assert.equal(cacheRace.fresh,true);
    assert.deepEqual(cacheRace.settled,[true,true]);
    assert.equal(cacheRace.keys.length,1);
    pass('Real worker cache deletion rejects late provider bodies, starts a fresh flight and settles coalesced flushes');
    const defaultsPage=await context.newPage();
    await defaultsPage.goto(origin+'/compact-reference');
    const defaultCard=defaultsPage.locator('#pp-journal-metacard');
    await defaultCard.waitFor();
    await until(()=>defaultCard.getAttribute('data-pp-theme').then(theme=>theme==='light'),'fresh card light theme');
    assert.equal(await defaultsPage.locator('.pp-jc-year-tag').textContent(),'2026 年');
    assert.match(await defaultsPage.locator('.pp-jc-journal-badge').textContent(),/Nature Index/);
    assert.match(await defaultsPage.locator('.pp-jc-status-banner').textContent(),/PDF 候选/);
    assert.equal(await defaultsPage.locator('#pp-jc-btn-copy-doi').isVisible(),true);
    assert.equal(await defaultsPage.locator('#pp-jc-btn-open-landing').isVisible(),true);
    for(const selector of ['.pp-jc-citation-field','.pp-jc-drawer','#pp-jc-btn-download','.pp-jc-ai-section','#pp-jc-btn-copy-doi-action']) assert.equal(await defaultsPage.locator(selector).count(),0,selector);
    const compactBounds=await defaultCard.boundingBox();
    assert.ok(compactBounds.height<410,JSON.stringify(compactBounds));
    await defaultCard.screenshot({path:path.join(out,'default-card-reference.png')});
    await evaluateExtensionWorld(context,defaultsPage,()=>{
      window.qaOriginalSend=chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage=(message,callback)=>message.action==='SET_PUBLIC_SETTINGS'?callback({success:false,error:'QA pin failure'}):window.qaOriginalSend(message,callback);
    });
    await defaultsPage.locator('#pp-jc-btn-pin').click();
    assert.equal(await defaultCard.evaluate(element=>element.classList.contains('pp-jc-pinned')),false);
    assert.match(await defaultsPage.locator('.pp-jc-toast').last().textContent(),/保存失败/);
    await evaluateExtensionWorld(context,defaultsPage,()=>{chrome.runtime.sendMessage=window.qaOriginalSend;});
    await worker.evaluate(()=>chrome.storage.local.set({enable_ni:false,enable_journal_copy_doi_btn:false}));
    await defaultsPage.locator('#pp-jc-btn-copy-doi').waitFor({state:'detached'});
    assert.equal(await defaultsPage.locator('.pp-jc-journal-badge.pp-ni-badge').count(),0);
    await evaluateExtensionWorld(context,defaultsPage,()=>{
      window.qaCopies=0;
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{window.qaCopies++;throw Error('QA clipboard denied');}}});
      window.qaOriginalExec=document.execCommand;
      document.execCommand=()=>false;
    });
    await defaultsPage.keyboard.press('Alt+c');
    assert.equal(await evaluateExtensionWorld(context,defaultsPage,()=>window.qaCopies),0);
    await worker.evaluate(()=>chrome.storage.local.set({enable_ni:true,enable_journal_copy_doi_btn:true}));
    await defaultsPage.locator('#pp-jc-btn-copy-doi').waitFor();
    await defaultsPage.locator('#pp-jc-btn-copy-doi').click();
    await until(()=>defaultsPage.locator('.pp-jc-toast').last().textContent().then(text=>text.includes('复制失败')),'clipboard failure surfaced');
    assert.equal(await defaultsPage.locator('#pp-jc-doi-badge').evaluate(element=>element.classList.contains('pp-show')),false);
    await evaluateExtensionWorld(context,defaultsPage,()=>{delete navigator.clipboard;document.execCommand=window.qaOriginalExec;});
    await defaultsPage.goto(origin+'/compact-undated');
    await defaultCard.waitFor();
    assert.equal(await defaultsPage.locator('.pp-jc-year-tag').textContent(),'年份未标注');
    await evaluateExtensionWorld(context,defaultsPage,()=>{
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>{window.qaResolveCopy=resolve;})}});
    });
    await defaultsPage.locator('#pp-jc-btn-copy-doi').click();
    await defaultsPage.evaluate(()=>{
      history.pushState({},'', '/replacement-article');
      document.querySelector('meta[name="citation_doi"]').content='10.1000/replacement';
      document.querySelector('meta[name="citation_title"]').content='A replacement article after navigation';
      document.querySelector('h1').textContent='A replacement article after navigation';
    });
    await until(()=>defaultsPage.locator('#pp-jc-doi-val-box .pp-jc-meta-val').textContent().then(text=>text==='10.1000/replacement'),'SPA replacement identity');
    await evaluateExtensionWorld(context,defaultsPage,()=>window.qaResolveCopy());
    await until(()=>worker.evaluate(async()=>{
      const rows=(await chrome.storage.local.get('history')).history || [];
      return rows.some(row=>row.doi==='10.1038/s41467-026-78336-9' && row.actions?.includes('copied_doi'));
    }),'delayed copy retains its original paper identity');
    assert.equal(await worker.evaluate(async()=>((await chrome.storage.local.get('history')).history || []).some(row=>row.doi==='10.1000/replacement' && row.actions?.includes('copied_doi'))),false);
    assert.equal(await defaultsPage.locator('#pp-jc-doi-badge').evaluate(element=>element.classList.contains('pp-show')),false);
    await defaultsPage.close();
    pass('Fresh screenshot defaults: compact/light card, no advanced tools, truthful year/PDF state, NI/DOI switches, shortcut gating, failed pin and clipboard rollback');
    await worker.evaluate(async origin=>{
      await chrome.storage.local.set({ai_provider:'custom',ai_base_url:origin+'/v1',ai_model:'qa-model',ai_api_key:'',ai_preset:'methodology',ai_prompt:'我的自定义分析要求',enable_ai_summary_btn:true,enable_metacard:true,enable_metrics_display:true,enable_metrics_auto_detect:false,enable_journal_citation_tools:true,enable_pdf_download_btn:true});
    },origin);
    const doiPage = await context.newPage();
    for (const [route, expected] of [
      ['url/10.1000/current', '10.1000/current'],
      ['metadata', '10.1000/current'],
      ['jsonld', '10.1000/current'],
      ['labeled', '10.1000/current(2026)'],
      ['reference-only', '暂无 DOI'],
      ['ambiguous', '暂无 DOI'],
      ['encoded/10.1000%2Fdemo%23value', '10.1000/demo#value'],
      ['metadata-conflict','暂无 DOI'],
      ['metadata-conflict/10.1000/current','10.1000/current'],
      ['metadata-conflict-reverse/10.1000/current','10.1000/current'],
      ['generic-metadata/10.1000/current','10.1000/current'],
      ['encoded-metadata','10.1000/current'],
      ['unicode-metadata','10.1000/研究，补充'],
      ['literal-metadata','10.1000/literal)'],
      ['bounded-conflict','暂无 DOI'],
      ['unmarked-references','暂无 DOI'],
      ['inline-reference','10.1000/current'],
      ['hidden-identifier','10.1000/current'],
      ['structured-identifier','10.1000/current'],
      ['jsonld-conflict','暂无 DOI'],
      ['jsonld-query?paper=2','10.1000/current'],
      ['jsonld-wrong-title','暂无 DOI'],
      ['jsonld-owner','10.1000/current'],
      ['url-query-conflict/10.1000/one?doi=10.1000%2Ftwo','暂无 DOI'],
      ['truncated-label','暂无 DOI']
    ]) {
      await doiPage.goto(`${origin}/doi-fixture/${route}`);
      const field = doiPage.locator('#pp-jc-doi-val-box .pp-jc-meta-val');
      await field.waitFor();
      assert.equal(await field.textContent(), expected, route);
      const duplicateIds=await doiPage.evaluate(()=>{const ids=Array.from(document.querySelectorAll('[id]'),el=>el.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});
      assert.deepEqual(duplicateIds,[],route);
    }
    await doiPage.close();
    pass('DOI browser fixtures: 25 scenarios covering evidence conflicts, JSON-LD identity, reference exclusion, encoding, literal Unicode suffixes and incomplete scans');
    const article=await context.newPage();
    await article.goto(origin+'/paper');
    await article.locator('#pp-journal-metacard').waitFor();
    console.log('Card preset', await article.locator('#pp-journal-metacard').getAttribute('data-ai-preset'));
    await article.locator('[data-preset="methodology"][aria-pressed="true"]').waitFor({timeout:10000});
    pass('Real MV3 detector activation and persisted analysis preset');
    const popup=await context.newPage();
    await popup.setViewportSize({width:420,height:600});
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await until(()=>popup.locator('#btn-toggle-overview').getAttribute('aria-expanded').then(x=>x==='false'),'compact library defaults');
    await popup.locator('#btn-toggle-overview').click();
    const academic=popup.locator('#status-academic');
    await until(()=>academic.getAttribute('aria-disabled').then(x=>x==='false'),'popup ready');
    await academic.click();
    await article.locator('.pp-jc-ai-section').waitFor({state:'detached'});
    assert.equal(await popup.locator('#setting-enable-ai-summary-btn').isChecked(),false);
    await popup.reload();
    await until(()=>academic.getAttribute('aria-disabled').then(x=>x==='false'),'popup reloaded');
    assert.equal(await academic.getAttribute('aria-pressed'),'false');
    await academic.focus(); await popup.keyboard.press('Space');
    await article.locator('.pp-jc-ai-section').waitFor();
    pass('Overview OFF/ON, keyboard activation, persistence, live content synchronization');
    await popup.locator('#status-metacard').click();
    await article.locator('#pp-journal-metacard').waitFor({state:'detached'});
    assert.match(await popup.locator('#overview-academic-hint').textContent(),/同时开启/);
    await popup.locator('#status-metacard').click();
    await article.locator('.pp-jc-ai-section').waitFor();
    pass('Metacard dependency is explained and restores correctly');
    await popup.evaluate(() => {
      window.qaOriginalSet = chrome.storage.local.set;
      chrome.storage.local.set = (data, callback) => {
        Object.defineProperty(chrome.runtime, 'lastError', {configurable:true,value:{message:'QA storage failure'}});
        try { callback(); } finally { delete chrome.runtime.lastError; }
      };
    });
    await academic.click();
    assert.equal(await academic.getAttribute('aria-pressed'),'true');
    assert.equal(await popup.locator('#setting-enable-ai-summary-btn').isChecked(),true);
    await popup.evaluate(() => { chrome.storage.local.set = window.qaOriginalSet; delete window.qaOriginalSet; });
    assert.equal(await worker.evaluate(async()=> (await chrome.storage.local.get('enable_ai_summary_btn')).enable_ai_summary_btn),true);
    pass('Injected storage failure rolls back Overview and setting without false success');

    await popup.locator('#tab-btn-set').click();
    assert.equal(await popup.locator('#panel-foot').evaluate(el=>el.inert),true);
    await popup.locator('[data-category="citation"].pp-category-chip').click();
    const citationMaster = popup.locator('#setting-enable-journal-citation-tools');
    const gbtToggle = popup.locator('#setting-enable-journal-copy-gbt-btn');
    const bibToggle = popup.locator('#setting-enable-journal-copy-bib-btn');
    await gbtToggle.uncheck();
    await article.locator('#pp-jc-btn-copy-gb').waitFor({state:'detached'});
    assert.equal(await article.locator('#pp-jc-btn-copy-bib').isVisible(),true);
    await bibToggle.uncheck();
    await article.locator('.pp-jc-citation-field').waitFor({state:'detached'});
    await gbtToggle.check();
    await article.locator('#pp-jc-btn-copy-gb').waitFor();
    await citationMaster.uncheck();
    await article.locator('.pp-jc-citation-field').waitFor({state:'detached'});
    await popup.reload();
    await popup.locator('#tab-btn-set').click();
    await until(()=>citationMaster.isChecked().then(checked=>!checked),'citation master persisted');
    assert.equal(await gbtToggle.isChecked(),true);
    assert.equal(await bibToggle.isChecked(),false);
    await article.reload();
    await article.locator('#pp-journal-metacard').waitFor();
    assert.equal(await article.locator('.pp-jc-citation-field').count(),0);
    await citationMaster.check();
    await article.locator('#pp-jc-btn-copy-gb').waitFor();
    assert.equal(await article.locator('#pp-jc-btn-copy-bib').count(),0);
    await bibToggle.check();
    await article.locator('#pp-jc-btn-copy-bib').waitFor();
    await popup.evaluate(() => {
      window.qaOriginalSet = chrome.storage.local.set;
      chrome.storage.local.set = (data, callback) => {
        Object.defineProperty(chrome.runtime, 'lastError', {configurable:true,value:{message:'QA citation storage failure'}});
        try { callback(); } finally { delete chrome.runtime.lastError; }
      };
    });
    await citationMaster.click();
    await until(()=>citationMaster.isChecked(),'citation setting failure rollback');
    assert.equal(await article.locator('.pp-jc-citation-field').isVisible(),true);
    await popup.evaluate(() => { chrome.storage.local.set = window.qaOriginalSet; delete window.qaOriginalSet; });
    await popup.locator('[data-category="core"].pp-category-chip').click();
    await popup.locator('#setting-search-input').fill('BibTeX');
    assert.equal(await bibToggle.isVisible(),true);
    await popup.locator('#btn-clear-settings-search').click();
    assert.equal(await bibToggle.isVisible(),false);
    await popup.locator('[data-category="buttons"].pp-category-chip').click();
    const landingToggle = popup.locator('#setting-enable-journal-open-landing-btn');
    assert.equal(await article.locator('#pp-jc-btn-open-landing').isVisible(),true);
    await landingToggle.uncheck();
    await article.locator('#pp-jc-btn-open-landing').waitFor({state:'detached'});
    await landingToggle.check();
    await article.locator('#pp-jc-btn-open-landing').waitFor();
    await popup.locator('[data-category="all"].pp-category-chip').click();
    await popup.evaluate(() => {
      window.qaInputSet = chrome.storage.local.set;
      window.qaInputGet = chrome.storage.local.get;
      chrome.storage.local.set = (data, callback) => {
        if (!('pdf_download_dir' in data)) return window.qaInputSet.call(chrome.storage.local,data,callback);
        Object.defineProperty(chrome.runtime,'lastError',{configurable:true,value:{message:'QA input storage failure'}});
        try { callback(); } finally { delete chrome.runtime.lastError; }
      };
      chrome.storage.local.get = (keys, callback) => {
        if (Array.isArray(keys) && keys.length===1 && keys[0]==='pdf_download_dir' && callback) {
          return window.qaInputGet.call(chrome.storage.local,keys,values=>{window.qaLateInputRestore=()=>callback(values);});
        }
        return window.qaInputGet.call(chrome.storage.local,keys,callback);
      };
    });
    await popup.locator('#setting-pdf-download-dir').fill('An edit that fails to save');
    await until(()=>popup.evaluate(()=>typeof window.qaLateInputRestore==='function'),'failed input restore paused');
    await popup.evaluate(()=>{chrome.storage.local.set=window.qaInputSet;chrome.storage.local.get=window.qaInputGet;});
    await popup.locator('#setting-pdf-download-dir').fill('Latest successful edit');
    await until(()=>worker.evaluate(async()=> (await chrome.storage.local.get('pdf_download_dir')).pdf_download_dir==='Latest successful edit'),'new input saved');
    await popup.evaluate(()=>window.qaLateInputRestore());
    assert.equal(await popup.locator('#setting-pdf-download-dir').inputValue(),'Latest successful edit');
    pass('A delayed failed-input rollback cannot overwrite a newer successfully saved edit');
    await popup.locator('.pp-settings-presets-bar > summary').click();
    await popup.locator('.pp-preset-btn[data-preset="minimal"]').click();
    await article.locator('.pp-jc-citation-field').waitFor({state:'detached'});
    assert.equal(await citationMaster.isChecked(),false);
    await popup.locator('.pp-preset-btn[data-preset="recommended"]').click();
    await until(()=>citationMaster.isChecked().then(checked=>!checked),'recommended compact citation defaults');
    assert.equal(await popup.locator('#setting-enable-ai-summary-btn').isChecked(),false);
    await popup.locator('.pp-preset-btn[data-preset="expert"]').click();
    await article.locator('#pp-jc-btn-copy-bib').waitFor();
    await worker.evaluate(()=>chrome.storage.local.set({appearance_mode:'dark',enable_footprint_heatmap:false}));
    await until(()=>popup.locator('html').getAttribute('data-pp-theme').then(theme=>theme==='dark'),'pre-preset saved dark theme');
    await until(()=>popup.locator('#footprint-heatmap-card').evaluate(element=>element.style.display==='none'),'external heatmap switch sync');
    await popup.evaluate(()=>{
      window.qaOriginalSet=chrome.storage.local.set;
      chrome.storage.local.set=(_data,callback)=>{
        Object.defineProperty(chrome.runtime,'lastError',{configurable:true,value:{message:'QA preset save failure'}});
        try{callback();}finally{delete chrome.runtime.lastError;}
      };
    });
    await popup.locator('.pp-preset-btn[data-preset="recommended"]').click();
    await until(()=>popup.locator('html').getAttribute('data-pp-theme').then(theme=>theme==='dark'),'failed preset restores saved appearance');
    await until(()=>citationMaster.isChecked(),'failed preset restores citation switch');
    assert.equal(await popup.locator('#setting-enable-ai-summary-btn').isChecked(),true);
    assert.equal(await popup.locator('#status-academic').getAttribute('aria-pressed'),'true');
    assert.equal(await popup.locator('#footprint-heatmap-card').evaluate(element=>element.style.display==='none'),true);
    await popup.evaluate(()=>{chrome.storage.local.set=window.qaOriginalSet;});
    await worker.evaluate(()=>chrome.storage.local.set({appearance_mode:'light',enable_footprint_heatmap:true}));
    await popup.locator('.pp-settings-presets-bar > summary').click();
    pass('Citation controls: independent GB/Bib, master hiding, saved child preferences, popup/article reload, live landing control and global settings search');
    assert.equal(await popup.locator('#setting-ai-preset').inputValue(),'methodology');
    await popup.locator('#setting-ai-preset').selectOption('custom');
    await article.locator('[data-preset="custom"][aria-pressed="true"]').waitFor();
    assert.equal(await popup.locator('#setting-ai-prompt').inputValue(),'我的自定义分析要求');
    await popup.locator('#setting-enable-ai-summary-btn').uncheck();
    await until(()=>academic.getAttribute('aria-pressed').then(x=>x==='false'),'reverse synchronization');
    await popup.locator('#setting-enable-ai-summary-btn').check();
    await article.locator('.pp-jc-ai-section').waitFor();
    pass('Settings-to-Overview sync, custom prompt preservation, hidden-panel focus isolation');
    await article.bringToFront();
    const generate=article.locator('#pp-jc-btn-ai-sum');
    const status=article.locator('#pp-jc-ai-status');
    await generate.click();
    await until(()=>status.textContent().then(t=>t.includes('分析完成')),'completed stream');
    assert.match(await article.locator('#pp-jc-ai-content').textContent(),/论文陈述/);
    assert.equal(await article.locator('#pp-jc-ai-copy').isVisible(),true);
    pass('Real service-worker HTTP streaming and completed analysis');
    mode='slow';
    await generate.click();
    await until(()=>article.locator('#pp-jc-ai-content').textContent().then(t=>t.includes('论文陈述')),'slow stream chunk');
    const requestsBeforeToggle = requests, abortedBeforeToggle = aborted;
    await popup.locator('#setting-enable-journal-citation-tools').uncheck();
    await article.locator('.pp-jc-citation-field').waitFor({state:'detached'});
    assert.equal(await article.locator('#pp-jc-ai-box').getAttribute('aria-busy'),'true');
    assert.equal(requests,requestsBeforeToggle);
    assert.equal(aborted,abortedBeforeToggle);
    await popup.locator('#setting-enable-journal-citation-tools').check();
    await article.locator('.pp-jc-citation-field').waitFor();
    await worker.evaluate(async () => {
      await chrome.storage.local.set({enable_journal_copy_gbt_btn:false});
      await chrome.storage.local.set({enable_journal_copy_bib_btn:false});
      await chrome.storage.local.set({enable_journal_copy_gbt_btn:true,enable_journal_copy_bib_btn:true});
    });
    await article.locator('#pp-jc-btn-copy-gb').waitFor();
    await article.locator('#pp-jc-btn-copy-bib').waitFor();
    assert.equal(await article.locator('#pp-jc-ai-box').getAttribute('aria-busy'),'true');
    assert.equal(aborted,abortedBeforeToggle);
    assert.match(await article.locator('#pp-jc-ai-content').textContent(),/论文陈述/);
    pass('Changing citation visibility preserves an active AI stream and its content');
    await article.locator('#pp-jc-ai-stop').click();
    await until(()=>Promise.resolve(aborted>0),'provider abort');
    assert.match(await status.textContent(),/已停止/);
    const before=requests;
    await article.locator('[data-preset="novelty"]').click();
    await new Promise(r=>setTimeout(r,200));
    assert.equal(requests,before);
    pass('Stop cancels upstream request; selecting a perspective does not auto-send');
    await generate.click();
    await until(()=>article.locator('#pp-jc-ai-content').textContent().then(t=>t.includes('论文陈述')),'stream before disabling');
    await popup.bringToFront();
    await popup.locator('#tab-btn-foot').click();
    await academic.click();
    await article.locator('.pp-jc-ai-section').waitFor({state:'detached'});
    await until(()=>Promise.resolve(aborted>=2),'disable abort');
    await academic.click(); await article.locator('.pp-jc-ai-section').waitFor();
    await article.bringToFront();
    mode='error'; await generate.click();
    await until(()=>status.textContent().then(t=>t.includes('QA provider unavailable')),'provider error');
    assert.equal(await generate.isEnabled(),true);
    mode='empty'; await generate.click();
    await until(()=>status.textContent().then(t=>t.includes('未返回有效内容')),'empty response');
    mode='normal'; await generate.click();
    await until(()=>status.textContent().then(t=>t.includes('分析完成')),'retry after failure');
    pass('Disable abort, provider failure, empty response and retry recovery');
    for(const [width,height] of [[1100,800],[320,480]]) {
      await article.setViewportSize({width,height});
      const r=await article.locator('#pp-journal-metacard').boundingBox();
      assert.ok(r.x>=0 && r.x+r.width<=width+1 && r.y+r.height<=height+1,JSON.stringify(r));
      await article.locator('#pp-jc-ai-content').scrollIntoViewIfNeeded();
      await article.screenshot({path:path.join(out,`article-${width}.png`)});
    }
    pass('Article card viewport bounds and scroll reachability at 1100/320 px');
    await popup.bringToFront();
    await popup.locator('#tab-btn-foot').click();
    for (const theme of ['light','dark']) {
      await worker.evaluate(theme=>chrome.storage.local.set({appearance_mode:theme}),theme);
      await until(()=>popup.locator('html').getAttribute('data-pp-theme').then(x=>x===theme),'theme sync');
      for(const [width,height] of [[420,600]]) {
        await popup.setViewportSize({width,height});
        assert.ok(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
        await academic.scrollIntoViewIfNeeded();
        assert.ok(await popup.locator('.pp-popup-container').evaluate(el=>el.scrollWidth<=el.clientWidth),'container overflow');
        await popup.locator('.pp-popup-container').evaluate(el=>{el.scrollTop=0;});
        await popup.screenshot({path:path.join(out,`overview-${theme}-${width}.png`)});
        await popup.locator('#tab-btn-set').click();
        await popup.locator('#setting-ai-preset').scrollIntoViewIfNeeded();
        assert.equal(await popup.locator('#setting-ai-preset').isVisible(),true);
        await popup.locator('#tab-btn-foot').click();
      }
    }
    pass('Popup light/dark, 420x600, bottom settings reachable without horizontal overflow');
    await article.setViewportSize({width:1100,height:800}); await article.bringToFront();
    await article.goto(origin+'/no-abstract');
    await article.locator('#pp-jc-btn-ai-sum').waitFor();
    assert.equal(await article.locator('#pp-jc-btn-ai-sum').isDisabled(),true);
    assert.match(await article.locator('#pp-jc-ai-status').textContent(),/未检测到摘要/);
    pass('Missing abstract blocks unsupported analysis');
    await article.goBack();
    await article.locator('#pp-jc-btn-ai-sum').waitFor();
    assert.equal(await article.locator('#pp-journal-metacard').count(),1);
    assert.equal(await article.locator('#pp-jc-btn-ai-sum').isEnabled(),true);
    pass('Back navigation restores one functional card');

    await worker.evaluate(async () => {
      const now = Date.now();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);
      const rows = [
        {title:'Valley polarization in layered semiconductors',doi:'10.1000/valley',authors:['José Zhang'],year:2026,journal:'Fixture Journal',notes:'Low temperature measurement notes',starred:true,status:'visited',actions:['visited','downloaded'],time:now},
        ...Array.from({length:64},(_,i)=>({title:`Optical response in semiconductor sample ${i}`,doi:`10.1000/sample-${i}`,authors:['Ada Lovelace'],year:2025-i%5,journal:'Fixture Journal',status:'visited',time:i<10?yesterday.getTime():now}))
      ];
      await chrome.storage.local.set({history:rows,history_revision:100,overview_collapsed:true,appearance_mode:'light'});
    });
    await popup.bringToFront();
    await popup.locator('#tab-btn-foot').click();
    await until(()=>popup.locator('.pp-foot-card').count().then(n=>n===30),'bounded library rendering');
    assert.notEqual(await popup.locator('.pp-library-activity').getAttribute('open'),null);
    assert.equal(await popup.locator('#heatmap-grid').isVisible(),true);
    assert.equal(await popup.locator('.pp-calendar-cell').count(),28);
    const yesterdayCell = popup.locator('.pp-calendar-cell').filter({has:popup.locator('.pp-calendar-count', {hasText:/^10篇$/})});
    await yesterdayCell.press('Enter');
    await until(()=>popup.locator('.pp-foot-card').count().then(n=>n===10),'calendar filters yesterday records');
    assert.equal(await popup.locator('.pp-calendar-cell.active').getAttribute('aria-pressed'),'true');
    assert.match(await popup.locator('#heatmap-active-text').textContent(),/10 篇/);
    await popup.locator('#btn-reset-heatmap-filter').click();
    await until(()=>popup.locator('.pp-foot-card').count().then(n=>n===30),'calendar reset restores library');
    await popup.locator('#library-advanced-filters').evaluate(element=>{element.open=true;});
    await popup.locator('#btn-date-3days').click();
    assert.match(await popup.locator('#heatmap-active-text').textContent(),/近 3 天.*65 篇/);
    await popup.locator('#btn-reset-heatmap-filter').click();
    await popup.locator('#library-advanced-filters').evaluate(element=>{element.open=false;});
    await popup.locator('.pp-library-activity > summary').click();
    assert.equal(await popup.locator('#heatmap-grid').isVisible(),false);
    await popup.locator('.pp-library-activity > summary').click();
    assert.equal(await popup.locator('#heatmap-grid').isVisible(),true);
    await popup.locator('#history-search').scrollIntoViewIfNeeded();
    await popup.locator('#history-search').fill('author:Jose year:2026 valley');
    await until(()=>popup.locator('.pp-foot-card').count().then(n=>n===1),'compound ranked search');
    await popup.locator('.pp-foot-more summary').click();
    await popup.locator('.pp-foot-edit-btn').click();
    await popup.locator('#record-edit-notes-input').fill('Updated research notes');
    await popup.locator('#record-edit-notes-input').press('/');
    assert.equal(await popup.locator('#record-edit-notes-input').inputValue(),'Updated research notes/');
    assert.equal(await popup.locator('#tab-btn-foot').getAttribute('aria-selected'),'true');
    await worker.evaluate(()=>addFootprint({title:'Concurrent new article',doi:'10.1000/concurrent',year:2026}));
    await popup.locator('#record-edit-form button[type="submit"]').click();
    await until(()=>worker.evaluate(async()=>{
      const rows=(await chrome.storage.local.get('history')).history;
      return rows.find(row=>row.doi==='10.1000/valley')?.notes==='Updated research notes/' && Boolean(rows.find(row=>row.doi==='10.1000/concurrent'));
    }),'atomic edit amid page additions');
    await popup.locator('.pp-foot-more summary').click();
    await popup.locator('.pp-foot-del-btn').click();
    await popup.locator('#popup-toast-undo').waitFor();
    await popup.locator('#popup-toast-undo').click();
    await until(()=>popup.locator('.pp-foot-card').count().then(n=>n===1),'undo restores matching article');
    await popup.locator('#history-search').fill('unfindable-search-term');
    await until(()=>popup.locator('#history-empty').isVisible(),'search empty state');
    await popup.locator('#setting-export-format').selectOption('json');
    assert.equal(await popup.locator('#btn-export-all').isEnabled(),true);
    await popup.locator('#btn-export-all').click();
    await until(()=>worker.evaluate(async()=>{
      const downloads=await chrome.downloads.search({limit:1,orderBy:['-startTime']});
      return downloads[0]?.state==='complete';
    }),'native JSON backup download');
    const backupPath = await worker.evaluate(async()=> (await chrome.downloads.search({limit:1,orderBy:['-startTime']}))[0].filename);
    const backup = JSON.parse(fs.readFileSync(backupPath,'utf8'));
    assert.equal(backup.history.length,66);
    assert.equal(backup.history.find(row=>row.doi==='10.1000/valley').notes,'Updated research notes/');
    await popup.locator('#file-import-history').setInputFiles({name:'fixture-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:'paperpilot.history',version:1,history:[
      {title:'Valley polarization in layered semiconductors',doi:'10.1000/different-edition',year:2026},
      {title:'Valley polarization in layered semiconductors',doi:'https://doi.org/10.1000/valley',year:2026}
    ]}))});
    await until(()=>worker.evaluate(async()=> (await chrome.storage.local.get('history')).history.length===67),'atomic import preserving distinct DOI editions');
    await popup.locator('#library-reset-filters').click();
    await until(()=>popup.locator('.pp-foot-card').count().then(n=>n===30),'filter reset');
    await popup.locator('#library-sort').selectOption('year');
    assert.match(await popup.locator('.pp-foot-meta-row').first().textContent(),/2026/);
    await popup.locator('#library-sort').selectOption('auto');
    await popup.locator('#panel-foot').evaluate(el=>{el.scrollTop=0;});
    await until(()=>popup.locator('#popup-toast').getAttribute('class').then(x=>!x.includes('pp-show')),'idle library screenshot');
    for (const theme of ['light','dark']) {
      await worker.evaluate(theme=>chrome.storage.local.set({appearance_mode:theme}),theme);
      await until(()=>popup.locator('html').getAttribute('data-pp-theme').then(x=>x===theme),'workbench theme');
      await popup.screenshot({path:path.join(out,`workbench-library-${theme}.png`)});
    }
    await popup.locator('#tab-btn-set').click();
    await popup.locator('[data-category="citation"].pp-category-chip').click();
    for (const [width, theme] of [[420,'light'],[420,'dark'],[320,'light']]) {
      await popup.setViewportSize({width,height:650});
      await worker.evaluate(theme=>chrome.storage.local.set({appearance_mode:theme}),theme);
      await until(()=>popup.locator('html').getAttribute('data-pp-theme').then(x=>x===theme),'settings theme');
      await popup.locator('#panel-set').evaluate(el=>{el.scrollTop=0;});
      const categories=await popup.locator('#settings-category-tabs').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
      assert.ok(categories.scroll<=categories.width+1,JSON.stringify(categories));
      const toggleBounds=await popup.locator('#setting-enable-journal-citation-tools').evaluate(el=>el.closest('label').getBoundingClientRect().toJSON());
      assert.ok(toggleBounds.x>=0 && toggleBounds.right<=width,JSON.stringify(toggleBounds));
      assert.ok(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await popup.locator('#setting-enable-journal-citation-tools').isVisible(),true);
      await popup.waitForTimeout(350); // Capture the settled theme/category transitions.
      await popup.screenshot({path:path.join(out,`settings-citation-${theme}-${width}.png`)});
    }
    await popup.setViewportSize({width:420,height:600});
    await popup.locator('#setting-search-input').fill('DOI');
    await until(()=>popup.locator('#nav-pill').boundingBox().then(r=>r.x>200),'settings navigation settles');
    await popup.screenshot({path:path.join(out,'workbench-settings-search.png')});
    assert.equal(await popup.locator('#history-search').isVisible(),false);
    pass('Library: default reading calendar, keyboard date filtering/reset, collapse/expand, 30-row batches, compound search, concurrent edit, notes typing, undo, native full JSON backup, atomic import, empty-state recovery and sorting');

    await context.route('https://scholar.google.com/**', route=>route.fulfill({status:200,contentType:'text/html',body:fs.readFileSync(path.join(root,'test/fixtures/scholar-workbench.html'),'utf8')}));
    const scholar = await context.newPage();
    await scholar.goto('https://scholar.google.com/scholar?q=paperpilot-fixture');
    await until(()=>scholar.locator('.gs_r[data-pp-enhanced="true"]').count().then(n=>n===5),'real Scholar runtime');
    assert.equal(await scholar.locator('.gs_r[data-folded-as-duplicate="true"]').count(),1);
    assert.equal(await scholar.locator('.pp-scholar-dup-header').getAttribute('aria-expanded'),'false');
    await scholar.locator('.pp-scholar-dup-header').press('Enter');
    assert.equal(await scholar.locator('.pp-scholar-dup-header').getAttribute('aria-expanded'),'true');
    assert.equal(await scholar.locator('.gs_r:visible').count(),4);
    await popup.locator('#setting-search-input').fill('收藏');
    await popup.locator('#setting-enable-scholar-star-btn').uncheck();
    await until(()=>scholar.locator('.pp-scholar-star-btn').count().then(n=>n===0),'Scholar favorite control');
    await popup.locator('#setting-search-input').fill('国标');
    await popup.locator('#setting-enable-scholar-copy-gbt-btn').uncheck();
    await until(()=>scholar.locator('.pp-scholar-action-btn').filter({hasText:'国标 GB'}).count().then(n=>n===0),'Scholar citation control');
    await scholar.reload();
    await until(()=>scholar.locator('.gs_r[data-pp-enhanced="true"]').count().then(n=>n===5),'Scholar reloaded');
    assert.equal(await scholar.locator('.pp-scholar-star-btn').count(),0);
    assert.equal(await scholar.locator('.pp-scholar-action-btn').filter({hasText:'国标 GB'}).count(),0);
    await popup.locator('#setting-enable-scholar-copy-gbt-btn').check();
    await until(()=>scholar.locator('.pp-scholar-action-btn').filter({hasText:'国标 GB'}).count().then(n=>n>0),'Scholar citation restored');
    await popup.locator('#setting-search-input').fill('收藏');
    await popup.locator('#setting-enable-scholar-star-btn').check();
    await until(()=>scholar.locator('.pp-scholar-star-btn').count().then(n=>n>0),'Scholar favorite restored');
    pass('Scholar GB and favorite switches update open results, persist across reload and restore');
    await scholar.locator('#pp-sort-citations').waitFor();
    await scholar.locator('#pp-sort-citations').click();
    await scholar.locator('#pp-slider-cite').evaluate(el=>{el.value='10';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await until(()=>scholar.locator('.gs_r:visible').count().then(n=>n===3),'Scholar citation filtering');
    await scholar.reload();
    await scholar.locator('#pp-slider-cite').waitFor();
    assert.equal(await scholar.locator('#pp-slider-cite').inputValue(),'10');
    assert.ok((await scholar.locator('#pp-sort-citations').getAttribute('class')).includes('active'));
    await until(()=>scholar.locator('.gs_r:visible').count().then(n=>n===3),'Scholar restored filter');
    await popup.locator('#setting-search-input').fill('排序');
    await popup.locator('#setting-enable-sorting-filter').uncheck();
    await scholar.locator('#pp-scholar-sorting-toolbar').waitFor({state:'detached'});
    await scholar.locator('.pp-scholar-sidebar-panel').waitFor({state:'detached'});
    assert.equal(await scholar.locator('.gs_r:visible').count(),4);
    await popup.locator('#setting-enable-sorting-filter').check();
    await scholar.locator('#pp-sort-citations').waitFor();
    await until(()=>scholar.locator('.gs_r:visible').count().then(n=>n===3),'Scholar filter re-enabled');
    await scholar.locator('#pp-scholar-sorting-toolbar').evaluate(el=>el.remove());
    await scholar.locator('#pp-sort-citations').waitFor();
    await scholar.goto('https://scholar.google.com/scholar?q=other-fixture-query');
    await scholar.locator('#pp-slider-cite').waitFor();
    assert.equal(await scholar.locator('#pp-slider-cite').inputValue(),'0');
    assert.equal(await scholar.locator('.gs_r:visible').count(),4);
    pass('Scholar sorting/filtering works, persists per query, disables/restores correctly and repairs a replaced toolbar');

    await popup.locator('#tab-btn-foot').click();
    const beforeClear=await worker.evaluate(async()=> (await chrome.storage.local.get('history')).history.length);
    await worker.evaluate(()=>{
      globalThis.qaOriginalSet=chrome.storage.local.set;
      chrome.storage.local.set=async(data,...args)=>{
        if ('history' in data) throw new Error('QA clear failure');
        return globalThis.qaOriginalSet.call(chrome.storage.local,data,...args);
      };
    });
    popup.once('dialog',dialog=>dialog.accept());
    await popup.locator('#btn-clear-history').click();
    await until(()=>popup.locator('#popup-toast-msg').textContent().then(t=>t.includes('QA clear failure')),'failed clear notice');
    assert.equal(await worker.evaluate(async()=> (await chrome.storage.local.get('history')).history.length),beforeClear);
    assert.equal(await popup.locator('.pp-foot-card').count(),30);
    await worker.evaluate(()=>{chrome.storage.local.set=globalThis.qaOriginalSet;delete globalThis.qaOriginalSet;});
    const popupDuplicateIds=await popup.evaluate(()=>{const ids=Array.from(document.querySelectorAll('[id]'),el=>el.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});
    assert.deepEqual(popupDuplicateIds,[]);
    pass('Failed library clear preserves stored and visible records; no duplicate popup IDs');
    await scholar.screenshot({path:path.join(out,'workbench-scholar.png'),fullPage:true});
    pass('Scholar: real content runtime, DOI-aware indexed clustering, conflicting identities retained and keyboard-accessible source drawer');

    assert.deepEqual(errors,[]);
    pass('No uncaught page exceptions');
    fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({checks,requests,aborted,errors},null,2));
  } catch(error) {
    for (const [i,p] of context.pages().entries()) {
      await p.screenshot({path:path.join(out,`failure-${i}.png`)}).catch(()=>{});
      fs.writeFileSync(path.join(out,`failure-${i}.html`), await p.content().catch(()=>''));
    }
    throw error;
  } finally {
    await context.close();
    const resolvedProfile=path.resolve(profile);
    const tempRoot=path.resolve(os.tmpdir())+path.sep;
    if (resolvedProfile.startsWith(tempRoot) && path.basename(resolvedProfile).startsWith('paperpilot-smoke-')) {
      fs.rmSync(resolvedProfile,{recursive:true,force:true,maxRetries:3});
    }
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());

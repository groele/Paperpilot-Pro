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
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'paperpilot-smoke-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath:process.env.PP_CHROMIUM_EXECUTABLE || undefined,
    channel:process.env.PP_CHROMIUM_EXECUTABLE ? undefined : 'chromium', headless:true,
    ignoreDefaultArgs:['--disable-extensions'],
    args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],
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
    await worker.evaluate(async origin=>{
      await chrome.storage.local.set({ai_provider:'custom',ai_base_url:origin+'/v1',ai_model:'qa-model',ai_api_key:'',ai_preset:'methodology',ai_prompt:'我的自定义分析要求',enable_ai_summary_btn:true,enable_metacard:true,enable_metrics_auto_detect:false});
    },origin);
    const article=await context.newPage();
    await article.goto(origin+'/paper');
    await article.locator('#pp-journal-metacard').waitFor();
    console.log('Card preset', await article.locator('#pp-journal-metacard').getAttribute('data-ai-preset'));
    await article.locator('[data-preset="methodology"][aria-pressed="true"]').waitFor({timeout:10000});
    pass('Real MV3 detector activation and persisted analysis preset');
    const popup=await context.newPage();
    await popup.setViewportSize({width:420,height:600});
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
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
    await popup.bringToFront(); await academic.click();
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
      for(const [width,height] of [[420,600],[320,480]]) {
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
    pass('Popup light/dark, 420x600 and 320x480, bottom settings reachable without horizontal overflow');
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

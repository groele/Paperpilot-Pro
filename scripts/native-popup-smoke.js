const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const extensionRoot = path.resolve(process.env.PP_EXTENSION_ROOT || root);
const out = path.join(root, 'output/playwright');
fs.mkdirSync(out, { recursive: true });

async function until(read, label, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await read()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
}

// Action popups are separate Chrome targets, absent from Playwright's tab list.
async function attachPopup(cdp, targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  let nextId = 0;
  const pending = new Map();
  const onMessage = event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  cdp.on('Target.receivedMessageFromTarget', onMessage);
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(error => {
      pending.delete(id); clearTimeout(timer); reject(error);
    });
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  const click = async selector => {
    const bounds = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing control');
      const r = element.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
    })()`);
    assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.x >= 0 && bounds.x < bounds.viewportWidth && bounds.y >= 0 && bounds.y < bounds.viewportHeight, `${selector}: ${JSON.stringify(bounds)}`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bounds.x, y: bounds.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bounds.x, y: bounds.y, button: 'left', clickCount: 1 });
  };
  return {
    evaluate, click, send,
    async screenshot(filename) {
      const result = await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(out, filename), Buffer.from(result.data, 'base64'));
    },
    dispose() {
      cdp.off('Target.receivedMessageFromTarget', onMessage);
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Popup closed')); }
      pending.clear();
    }
  };
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'paperpilot-native-popup-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.PP_CHROMIUM_EXECUTABLE || undefined,
    channel: process.env.PP_CHROMIUM_EXECUTABLE ? undefined : 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`],
    viewport: { width: 1100, height: 800 }
  });
  let popup;
  const results = [];
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await until(() => worker.evaluate(async () => Boolean((await chrome.storage.local.get('ai_preset')).ai_preset)), 'installation defaults');
    await worker.evaluate(() => {
      const history = Array.from({ length: 18 }, (_, index) => {
        const day = new Date();
        day.setDate(day.getDate() - index % 9);
        day.setHours(12, 0, 0, 0);
        return {title:`Native reading sample ${index}`,doi:`10.1000/native-${index}`,status:'visited',time:day.getTime()};
      });
      history.push({title:'Undated reading sample',doi:'10.1000/native-undated',status:'visited',time:null});
      return chrome.storage.local.set({ history, history_revision: 100, overview_collapsed: true, enable_journal_citation_tools: true, enable_ni: true });
    });
    const extensionId = new URL(worker.url()).host;
    const host = context.pages()[0] || await context.newPage();
    const cdp = await context.browser().newBrowserCDPSession();
    const windowId = await worker.evaluate(async () => (await chrome.windows.getLastFocused()).id);
    let citationEnabled = true, niEnabled = true;
    for (let iteration = 0; iteration < 3; iteration++) {
      const theme = iteration === 1 ? 'dark' : 'light';
      await worker.evaluate(theme => chrome.storage.local.set({ appearance_mode: theme, overview_collapsed: true }), theme);
      await host.bringToFront();
      await until(() => worker.evaluate(async windowId => {
        try { await chrome.action.openPopup({ windowId }); return true; }
        catch (_) { return false; }
      }, windowId), 'open/reopen native action popup');
      let target;
      await until(async () => {
        target = (await cdp.send('Target.getTargets')).targetInfos.find(info => info.url === `chrome-extension://${extensionId}/popup/popup.html`);
        return Boolean(target);
      }, 'native action popup target');
      popup = await attachPopup(cdp, target.targetId);
      await until(() => popup.evaluate('document.documentElement.dataset.ppSurface === "action" && document.querySelector("#status-ni")?.getAttribute("aria-disabled") === "false"'), 'native popup ready');
      const dimensions = await popup.evaluate('({width:innerWidth,height:innerHeight,native:chrome.extension.getViews({type:"popup"}).includes(window),container:document.querySelector(".pp-popup-container").getBoundingClientRect().toJSON()})');
      assert.equal(dimensions.native, true);
      assert.ok(dimensions.width >= 420 && dimensions.width <= 450 && dimensions.height >= 450 && dimensions.height <= 600, JSON.stringify(dimensions));
      assert.ok(dimensions.container.bottom <= dimensions.height && dimensions.container.right <= dimensions.width);
      const calendar = await popup.evaluate('({open:document.querySelector(".pp-library-activity").open,cells:document.querySelectorAll(".pp-calendar-cell").length,bounds:document.querySelector("#heatmap-grid").getBoundingClientRect().toJSON()})');
      assert.equal(calendar.open,true);
      assert.equal(calendar.cells,28);
      assert.equal(await popup.evaluate('document.querySelector(".pp-calendar-cell.is-today .pp-calendar-count").textContent'),'2篇');
      assert.ok(calendar.bounds.top>=0 && calendar.bounds.bottom<=dimensions.height,JSON.stringify(calendar));
      await popup.screenshot(`native-popup-calendar-${iteration}-${theme}.png`);
      assert.equal(await popup.evaluate('document.querySelector("#setting-enable-journal-citation-tools").checked'), citationEnabled);
      if (await popup.evaluate('document.querySelector("#btn-toggle-overview").getAttribute("aria-expanded") === "false"')) await popup.click('#btn-toggle-overview');
      await popup.click('#status-ni');
      niEnabled = !niEnabled;
      await until(() => worker.evaluate(async () => (await chrome.storage.local.get('enable_ni')).enable_ni).then(value => value === niEnabled), 'native feature switch saved');
      await popup.click('#tab-btn-set');
      await until(() => popup.evaluate('document.querySelector("#panel-set").classList.contains("active") && getComputedStyle(document.querySelector("#panel-set")).opacity === "1"'), 'native settings panel');
      await popup.click('.pp-category-chip[data-category="citation"]');
      await popup.click('#setting-enable-journal-citation-tools');
      citationEnabled = !citationEnabled;
      await until(() => worker.evaluate(async () => (await chrome.storage.local.get('enable_journal_citation_tools')).enable_journal_citation_tools).then(value => value === citationEnabled), 'native citation switch saved');
      await popup.screenshot(`native-popup-settings-${iteration}-${theme}.png`);
      await popup.click('.pp-category-chip[data-category="ai"]');
      await popup.evaluate('document.querySelector("#panel-set").scrollTop = document.querySelector("#panel-set").scrollHeight');
      const bottom = await popup.evaluate('({control:document.querySelector("#btn-test-ai-connection").getBoundingClientRect().toJSON(),height:innerHeight})');
      assert.ok(bottom.control.top >= 0 && bottom.control.bottom <= bottom.height, JSON.stringify(bottom));
      await popup.click('#tab-btn-foot');
      await until(() => popup.evaluate('document.querySelector("#panel-foot").classList.contains("active")'), 'native library panel');
      await popup.evaluate('document.querySelector("#history-search").scrollIntoView({block:"center"})');
      await popup.click('#history-search');
      await popup.evaluate('document.querySelector(".pp-foot-card").scrollIntoView({block:"start"})');
      const library = await popup.evaluate('({bounds:document.querySelector(".pp-foot-card").getBoundingClientRect().toJSON(),width:document.querySelector("#panel-foot").clientWidth,scroll:document.querySelector("#panel-foot").scrollWidth})');
      assert.ok(library.bounds.top>=0 && library.bounds.top<dimensions.height && library.scroll<=library.width,JSON.stringify(library));
      results.push({ iteration, theme, width: dimensions.width, height: dimensions.height, citationEnabled, niEnabled, settingsOpened: true, bottomControlReachable: true, calendarVisible: true, libraryReachable: true });
      popup.dispose(); popup = null;
      await cdp.send('Target.closeTarget', { targetId: target.targetId });
      await until(async () => !(await cdp.send('Target.getTargets')).targetInfos.some(info => info.targetId === target.targetId), 'native popup closed');
      console.log(`PASS native action popup ${iteration + 1}: ${dimensions.width}x${dimensions.height}, feature/settings controls and persistence`);
    }
    fs.writeFileSync(path.join(out, 'native-popup-results.json'), JSON.stringify({ results }, null, 2));
  } catch (error) {
    await popup?.screenshot('native-popup-failure.png').catch(() => {});
    throw error;
  } finally {
    popup?.dispose();
    await context.close();
    const resolved = path.resolve(profile), temp = path.resolve(os.tmpdir()) + path.sep;
    if (resolved.startsWith(temp) && path.basename(resolved).startsWith('paperpilot-native-popup-')) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

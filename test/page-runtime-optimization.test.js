const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("site profiles expose multilingual challenge and login signals", () => {
  const sandbox = { URL, PaperPilotCore: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("core/site-profiles.js"), sandbox);
  const signals = Array.from(sandbox.PaperPilotCore.siteProfiles.COMMON_CHALLENGE_SIGNALS);
  for (const expected of ["verify you are human", "需要登录", "ログインしてください", "로그인이 필요합니다", "accès refusé", "anmeldung erforderlich", "acceso denegado"]) {
    assert.ok(signals.includes(expected), `missing challenge signal: ${expected}`);
  }
});

test("detector pauses scans while hidden and cleans up on pagehide", () => {
  const listeners = {};
  let queryCount = 0;
  let messages = 0;
  const document = {
    visibilityState: "hidden",
    contentType: "text/html",
    title: "Article 10.1000/test",
    head: null,
    querySelector() { queryCount += 1; return null; },
    querySelectorAll() { queryCount += 1; return []; },
    addEventListener(type, listener) { listeners[`document:${type}`] = listener; }
  };
  const sandbox = {
    document,
    window: {
      top: null,
      location: { href: "https://example.test/article/10.1000/test" },
      addEventListener(type, listener) { listeners[`window:${type}`] = listener; }
    },
    chrome: { runtime: { id: "test", lastError: null, sendMessage() { messages += 1; } } },
    setTimeout(fn) { return { fn }; },
    clearTimeout() {},
    MutationObserver: class {},
    Node: { ELEMENT_NODE: 1 }
  };
  sandbox.window.top = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("content/detector.js"), sandbox);
  assert.equal(queryCount, 0);
  assert.equal(messages, 0);
  assert.equal(typeof listeners["window:pagehide"], "function");
});

test("runtime source keeps JSON-LD bounded and local-card rendering progressive", () => {
  const detector = read("content/detector.js");
  const journal = read("content/journal.js");
  assert.match(detector, /JSON_LD_TOTAL_BUDGET\s*=\s*240000/);
  assert.match(detector, /remaining\s*-=\s*text\.length/);
  assert.doesNotMatch(detector, /slice\(0,\s*12\)/);

  const localPaint = journal.indexOf("// Paint useful local metadata immediately");
  const remoteFetch = journal.indexOf('action: "FETCH_METADATA"');
  assert.ok(localPaint >= 0 && localPaint < remoteFetch, "local card must render before remote enrichment");
  assert.match(journal, /pollTimer\s*=\s*setInterval\(checkRoute,\s*15000\)/);
  assert.match(journal, /observer\?\.disconnect\(\)/);
});

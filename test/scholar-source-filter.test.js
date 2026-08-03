const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "content", "scholar.js"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must be defined`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

test("Scholar source-filter state initializes new sources without overwriting persisted choices", () => {
  const definition = extractFunction("ensureSourceFilterState");
  const context = vm.createContext({
    state: { sourceFilterState: new Map([["nature", false], ["legacy-page-source", false]]) },
    venuesFound: new Map([["nature", 2], ["science", 1], ["Other", 3]])
  });
  vm.runInContext(`${definition}; ensureSourceFilterState(); ensureSourceFilterState();`, context);

  assert.deepEqual(
    Array.from(context.state.sourceFilterState.entries()),
    [["nature", false], ["legacy-page-source", false], ["science", true], ["Other", true]]
  );
});

test("every ensureSourceFilterState call has a concrete function definition", () => {
  const calls = source.match(/\bensureSourceFilterState\s*\(/g) || [];
  const definitions = source.match(/function\s+ensureSourceFilterState\s*\(/g) || [];
  assert.equal(definitions.length, 1);
  assert.ok(calls.length >= 2, "expected one definition and at least one call");
});

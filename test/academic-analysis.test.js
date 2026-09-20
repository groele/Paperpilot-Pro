const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function aiHarness(fetch) {
  const scope = {PaperPilotCore:{}, URL, AbortController, TextDecoder, setTimeout, clearTimeout, fetch};
  scope.globalThis=scope;
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../core/ai.js'),'utf8'),scope);
  return scope.PaperPilotCore.ai;
}
test('academic prompts separate abstract evidence from inferred novelty and limitations', () => {
  const ai=aiHarness();
  const messages=ai.buildMessages(ai.resolvePrompt('novelty'),'A paper','An abstract');
  assert.match(messages[0].content,/not the full paper/);
  assert.match(messages[0].content,/Absence from the abstract does not establish absence/);
  assert.match(ai.resolvePrompt('novelty'),/不得断言/);
  assert.match(ai.resolvePrompt('limitations'),/不能直接认定/);
  assert.equal(ai.resolvePrompt('custom','retain my prompt'),'retain my prompt');
});
test('stream abort releases a stalled reader without waiting for idle timeout', async () => {
  let cancel;
  let cancelled=false;
  let released=false;
  const response={ok:true,body:{getReader:()=>({
    read:()=>new Promise(resolve=>{cancel=()=>resolve({done:true});}),
    cancel:async()=>{cancelled=true;cancel?.();},
    releaseLock:()=>{released=true;}
  })}};
  const ai=aiHarness(async()=>response);
  const controller=new AbortController();
  const result=ai.callProviderStream({provider:'custom',model:'qa',baseUrl:'http://localhost',title:'T',abstract:'A'},()=>{},controller.signal);
  await new Promise(resolve=>setImmediate(resolve));
  controller.abort();
  let timer;
  try { await Promise.race([result,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Abort left reader pending')),250);})]); }
  finally {clearTimeout(timer);}
  assert.equal(cancelled,true);assert.equal(released,true);
});
test('popup clipboard uses navigator once and falls back on rejection', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../popup/popup.js'),'utf8');
  const start=source.indexOf('  const robustCopyToClipboard =');
  const end=source.indexOf('\n  const fallbackCopy =',start);
  let writes=0, fallbacks=0;
  const scope={navigator:{clipboard:{writeText:async text=>{writes++;assert.equal(text,'copy me');}}},window:{isSecureContext:true},location:{protocol:'chrome-extension:'},fallbackCopy:async()=>{fallbacks++;}};
  vm.createContext(scope);
  vm.runInContext(source.slice(start,end)+'\nglobalThis.copy = robustCopyToClipboard;',scope);
  await scope.copy('copy me');
  assert.equal(writes,1);assert.equal(fallbacks,0);
  scope.navigator.clipboard.writeText=()=>Promise.reject(new Error('Denied'));
  await scope.copy('copy me');assert.equal(fallbacks,1);
});

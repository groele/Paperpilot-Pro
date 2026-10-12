const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','core/settings.js'),'utf8'),context);
const settings=context.PaperPilotCore.settings;

test('unset or corrupt preferences resolve consistently without changing valid user choices',()=>{
  assert.equal(settings.value('enable_ai_summary_btn',undefined),false);
  assert.equal(settings.value('enable_ai_summary_btn',true),true);
  assert.equal(settings.value('enable_ai_summary_btn','true'),false);
  assert.equal(settings.value('appearance_mode','invalid'), 'light');
  assert.equal(settings.withDefaults({enable_pdf_download_btn:true}).enable_pdf_download_btn,true);
});

test('presets never overwrite history or API configuration and cannot mutate factory defaults',()=>{
  const recommended=settings.preset('recommended');
  const reset=settings.preset('reset');
  assert.equal(JSON.stringify(recommended),JSON.stringify(reset));
  assert.equal(recommended.history,undefined);
  assert.equal(recommended.ai_api_key,undefined);
  recommended.enable_ai_summary_btn=true;
  assert.equal(settings.DEFAULTS.enable_ai_summary_btn,false);
  assert.equal(settings.preset('expert').enable_ai_summary_btn,true);
  assert.equal(settings.preset('unknown'),null);
});

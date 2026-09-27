import { Window } from 'happy-dom';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const mocked=vi.hoisted(()=>({available:vi.fn()}));
vi.mock('../src/model/availability',()=>({modelAvailable:mocked.available}));
vi.mock('../src/model/loader',()=>({ModelLoader:class {dispose(){} analyze=vi.fn();}}));
let window:Window;
const el=(id:string)=>window.document.getElementById(id) as any;
const type=(id:string,value:string)=>{el(id).value=value;el(id).dispatchEvent(new window.Event('input'));};
async function check(){el('check').click();await vi.waitFor(()=>expect(el('check').disabled).toBe(false));}
async function loadCsv(text:string,name='mapping.csv'){
  const input=el('restore-file');Object.defineProperty(input,'files',{value:[{name,size:text.length,text:()=>Promise.resolve(text)}],configurable:true});
  input.dispatchEvent(new window.Event('change'));await new Promise(ok=>setTimeout(ok,0));
}
beforeEach(async()=>{
  vi.resetModules();vi.clearAllMocks();window=new Window({url:'https://example.test/app/'});
  for(const key of ['document','location','navigator'])vi.stubGlobal(key,(window as any)[key]);vi.stubGlobal('window',window);
  window.document.body.innerHTML='<div id="app"></div>';mocked.available.mockResolvedValue(false);await import('../src/main');
});
afterEach(async()=>{await window.happyDOM.abort();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('hands off the effective mapping, restores answers, and preserves both screens while switching',async()=>{
  type('source','連絡先はtest@example.comです。');await check();const masked=el('output').value;
  el('open-restore-current').click();expect(el('mask-workspace').hidden).toBe(true);expect(el('restore-screen').hidden).toBe(false);
  type('restore-input','<EMAIL_01> に返信してください。');el('restore-run').click();expect(el('restore-output').value).toBe('test@example.com に返信してください。');
  el('mode-mask').click();expect(el('output').value).toBe(masked);expect(el('source').value).toContain('test@example.com');
  el('mode-restore').click();expect(el('restore-output').value).toContain('test@example.com');
});
it('keeps a stable mapping snapshot until explicitly refreshed and excludes unchecked candidates',async()=>{
  type('source','first@example.com second@example.com');await check();
  const boxes=el('candidates').querySelectorAll('input[type=checkbox]');boxes[1].checked=false;boxes[1].dispatchEvent(new window.Event('change'));
  el('open-restore-current').click();expect(el('restore-mappings').children.length).toBe(1);
  el('mode-mask').click();type('source','new@example.com');await check();el('mode-restore').click();
  type('restore-input','<EMAIL_01>');el('restore-run').click();expect(el('restore-output').value).toBe('first@example.com');
  el('restore-use-current').click();expect(el('restore-output').value).toBe('');el('restore-run').click();expect(el('restore-output').value).toBe('new@example.com');
});
it('imports CSV locally, renders HTML as text, and keeps the previous mapping on import failure',async()=>{
  el('mode-restore').click();await loadCsv('元の文字列,置換先\n<img src=x onerror=alert(1)>,<OTHER_01>');
  expect(el('restore-mappings').querySelector('img')).toBeNull();type('restore-input','<OTHER_01>');el('restore-run').click();
  expect(el('restore-output').value).toBe('<img src=x onerror=alert(1)>');
  await loadCsv('broken');expect(el('restore-output').value).toBe('');expect(el('restore-status').textContent).toContain('変更していません');
  el('restore-run').click();expect(el('restore-output').value).toContain('<img');expect(mocked.available).not.toHaveBeenCalled();
});
it('lets the user explicitly remove protection in legacy CSV',async()=>{
  el('mode-restore').click();await loadCsv('元の文字列,置換先\n\'=1,<OTHER_01>');expect(el('restore-legacy').hidden).toBe(false);
  type('restore-input','<OTHER_01>');el('restore-run').click();expect(el('restore-output').value).toBe("'=1");
  el('restore-legacy-check').checked=true;el('restore-legacy-check').dispatchEvent(new window.Event('change'));el('restore-run').click();expect(el('restore-output').value).toBe('=1');
});
it('copies and downloads only the current restored text',async()=>{
  const copy=vi.spyOn(window.navigator.clipboard,'writeText').mockResolvedValue();const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');vi.spyOn(window.HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  el('mode-restore').click();await loadCsv('元の文字列,置換先\n山田太郎,<PERSON_01>');type('restore-input','<PERSON_01>様');el('restore-run').click();
  el('restore-copy').click();await vi.waitFor(()=>expect(el('restore-feedback').textContent).toContain('コピーしました'));expect(copy).toHaveBeenCalledWith('山田太郎様');
  el('restore-txt').click();expect(await (create.mock.calls[0][0] as Blob).text()).toBe('山田太郎様');
  type('restore-input','変更');expect(el('restore-copy').disabled).toBe(true);expect(el('restore-txt').disabled).toBe(true);
});
it('clears both workspaces through the existing masking clear button and ignores pending imports',async()=>{
  el('mode-restore').click();let finish!:(value:string)=>void;
  Object.defineProperty(el('restore-file'),'files',{value:[{name:'later.csv',size:20,text:()=>new Promise<string>(resolve=>{finish=resolve;})}],configurable:true});
  el('restore-file').dispatchEvent(new window.Event('change'));el('mode-mask').click();el('clear').click();finish('元の文字列,置換先\n秘密,<OTHER_01>');await new Promise(ok=>setTimeout(ok,0));
  el('mode-restore').click();expect(el('restore-mappings').children.length).toBe(0);expect(el('restore-run').disabled).toBe(true);expect(el('restore-input').value).toBe('');
});
it('blocks conflicting current mappings and preserves the masking screen when clearing restoration only',async()=>{
  type('source','first@example.com second@example.com');await check();
  const replacements=el('candidates').querySelectorAll('input.replacement');
  for(const input of replacements){input.value='<CUSTOM>';input.dispatchEvent(new window.Event('change'));}
  el('open-restore-current').click();type('restore-input','<EMAIL_01>');
  // Changing input must not allow an ambiguous mapping to run or hide its explanation.
  expect(el('restore-run').disabled).toBe(true);expect(el('restore-status').textContent).toContain('複数');
  el('restore-clear').click();el('mode-mask').click();expect(el('source').value).toBe('first@example.com second@example.com');expect(el('candidates').children.length).toBe(2);
});

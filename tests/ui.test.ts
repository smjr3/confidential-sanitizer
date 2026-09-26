import { t } from '../src/content/text';
import { CATEGORY_LABELS } from '../src/detection/types';
import { Window } from 'happy-dom';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const mocked=vi.hoisted(()=>({available:vi.fn(),analyze:vi.fn(),dispose:vi.fn()}));
vi.mock('../src/model/loader',()=>({ModelLoader:class {analyze=mocked.analyze;dispose=mocked.dispose;}}));
vi.mock('../src/model/availability',()=>({modelAvailable:mocked.available}));
let window:Window;
beforeEach(async()=>{
  vi.resetModules();vi.clearAllMocks();
  window=new Window({url:'https://example.test/project/'});

  for(const key of ['document','location','navigator'])vi.stubGlobal(key,(window as any)[key]);
  vi.stubGlobal('window',window);
  window.document.body.innerHTML='<div id="app"></div>';
  mocked.available.mockResolvedValue(false);mocked.analyze.mockResolvedValue([]);
  await import('../src/main');
});
afterEach(async()=>{await window.happyDOM.abort();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
const el=(id:string)=>window.document.getElementById(id) as any;
function input(text:string){el('source').value=text;el('source').dispatchEvent(new window.Event('input'));}
function click(id:string){el(id).click();}
function change(node:any){node.dispatchEvent(new window.Event('change'));}
const tick=async()=>{await new Promise(r=>setTimeout(r,0));};
it('keeps edited rows attached, preserving the following checkbox click and recheck decisions',async()=>{
  input('a@example.com b@example.com');click('check');await tick();
  const rows=el('candidates').children;
  const first=rows[0];const nextCheckbox=rows[1].querySelector('input[type=checkbox]');
  const replacement=first.querySelector('input[type=text]');replacement.value='<CUSTOM>';change(replacement);
  expect(el('candidates').children[0]).toBe(first);
  expect(el('candidates').children[1].querySelector('input[type=checkbox]')).toBe(nextCheckbox);
  nextCheckbox.click();
  expect(el('output').value).toBe('<CUSTOM> b@example.com');
  click('check');await tick();expect(el('output').value).toBe('<CUSTOM> b@example.com');expect(mocked.available).toHaveBeenCalledTimes(2);
});
it('preserves Japanese category filtering, combined counts and same-value placeholders',()=>{
  input('a@example.com a@example.com 10.20.1.10');click('check');
  expect(el('candidates').children.length).toBe(2);expect(el('replacement-total').textContent).toBe(t('candidates.count',{count:3}));
  expect(el('highlight').querySelectorAll('mark').length).toBe(3);
  const box=window.document.querySelector('input[value="EMAIL"]') as any;box.click();
  expect(el('output').value).toBe('a@example.com a@example.com <IP_01>');
  box.click();expect(el('output').value).toBe('<EMAIL_01> <EMAIL_01> <IP_01>');
});
it('manually adds all selected occurrences and treats pasted markup as text',()=>{
  input('秘密サービス 秘密サービス <img src=x onerror=alert(1)>');click('check');
  const text=el('highlight').firstChild;const range=window.document.createRange();range.setStart(text,0);range.setEnd(text,6);
  window.getSelection()!.addRange(range);el('highlight').dispatchEvent(new window.MouseEvent('mouseup'));
  click('manual');expect(el('output').value).toBe('<OTHER_01> <OTHER_01> <img src=x onerror=alert(1)>');
  expect(el('highlight').querySelector('img')).toBe(null);expect(el('replacement-total').textContent).toBe(t('candidates.count',{count:2}));
});
it('does not start inference after input is cleared during availability check',async()=>{
  let finish!:(available:boolean)=>void;mocked.available.mockReturnValue(new Promise<boolean>(r=>{finish=r;}));
  input('山田太郎');click('check');click('clear');finish(true);await tick();
  expect(mocked.analyze).not.toHaveBeenCalled();expect(el('output').value).toBe('');expect(el('status').textContent).toBe(t('status.cleared'));
});
it('ignores stale errors and progress while a newer AI request is running',async()=>{
  mocked.available.mockResolvedValue(true);let reject!:(reason:Error)=>void;let status!:(value:string)=>void;
  mocked.analyze.mockImplementationOnce((_text,callback)=>{status=callback;return new Promise((_r,j)=>{reject=j;});});
  input('山田太郎');click('check');await tick();
  input('佐藤');mocked.analyze.mockReturnValueOnce(new Promise(()=>{}));click('check');await tick();
  const current=el('check-status').textContent;status('古い進捗');reject(new Error('古いエラー'));await tick();
  expect(el('check-status').textContent).toBe(current);expect(el('check').disabled).toBe(true);
});
it('integrates AI results and preserves them during a unified recheck',async()=>{
  mocked.available.mockResolvedValue(true);
  mocked.analyze.mockResolvedValue([{entity_group:'PER',start:0,end:4,offset:0,score:.9}]);
  input('山田太郎 a@example.com');click('check');await tick();
  expect(el('output').value).toBe('<PERSON_01> <EMAIL_01>');
  click('check');await tick();expect(el('output').value).toBe('<PERSON_01> <EMAIL_01>');expect(mocked.analyze).toHaveBeenCalledTimes(2);
});
it('copies the output and the combined mapping using category codes',async()=>{
  const copy=vi.fn().mockResolvedValue(undefined);Object.defineProperty(window.navigator,'clipboard',{value:{writeText:copy}});
  input('a@example.com a@example.com');click('check');click('copy');await tick();
  expect(copy).toHaveBeenLastCalledWith('<EMAIL_01> <EMAIL_01>');expect(el('copy-feedback').textContent).toBe(t('copy.success'));
  click('copy-mapping');await tick();expect(copy.mock.calls.at(-1)![0]).toContain('EMAIL\t2');
});
it('downloads CSV and TXT from the same displayed masking results',async()=>{
  const scheduled:Array<()=>void>=[];
  vi.spyOn(window,'setTimeout').mockImplementation((callback:any)=>{scheduled.push(callback);return {} as ReturnType<typeof window.setTimeout>;});
  const blobs:Blob[]=[];
  vi.spyOn(URL,'createObjectURL').mockImplementation(blob=>{blobs.push(blob as Blob);return `blob:test-${blobs.length}`;});
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  const names:string[]=[];
  window.document.addEventListener('click',event=>{const link=event.target as any;if(link?.tagName==='A'){event.preventDefault();names.push(link.download);}},true);
  input('a@example.com a@example.com');click('check');click('download-mapping');click('download-txt');
  expect(names).toEqual([t('file.mapping'),t('file.output')]);
  expect(await blobs[0].text()).toContain('"a@example.com","<EMAIL_01>","EMAIL","2"');
  expect(await blobs[1].text()).toBe('<EMAIL_01> <EMAIL_01>');
  scheduled.forEach(callback=>callback());expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it('does not show a stale copy confirmation after the input changes',async()=>{
  let finish!:()=>void;
  const copy=vi.fn().mockReturnValue(new Promise<void>(r=>{finish=r;}));
  Object.defineProperty(window.navigator,'clipboard',{value:{writeText:copy}});
  input('a@example.com');click('check');click('copy');input('b@example.com');finish();await tick();
  expect(el('copy-feedback').textContent).toBe('');expect(el('output').value).toBe('');
});
it('switches editing and highlighted review without losing candidates or edited text',()=>{
  expect(el('edit-pane').hidden).toBe(false);expect(el('review-pane').hidden).toBe(true);
  input('a@example.com');click('check');
  expect(el('review-pane').hidden).toBe(false);expect(el('tab-review').getAttribute('aria-selected')).toBe('true');
  click('tab-edit');expect(el('source').value).toBe('a@example.com');expect(el('output').value).toBe('<EMAIL_01>');
  el('tab-edit').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  expect(el('review-pane').hidden).toBe(false);expect(window.document.activeElement).toBe(el('tab-review'));
});
it('clears the input, candidates, output, selection and export controls while keeping category settings',()=>{
  input('a@example.com');click('check');
  const category=window.document.querySelector('input[value="IP"]') as any;category.click();
  click('clear');
  expect(el('source').value).toBe('');expect(el('output').value).toBe('');expect(el('candidates').children.length).toBe(0);
  for(const id of ['copy','download-txt','copy-mapping','download-mapping','manual'])expect(el(id).disabled).toBe(true);
  expect(el('replacement-total').textContent).toBe(t('candidates.count',{count:0}));expect(el('edit-pane').hidden).toBe(false);
  expect(category.checked).toBe(false);expect(window.document.activeElement).toBe(el('source'));expect(mocked.dispose).toHaveBeenCalled();
});
it('closes the category menu outside, on Escape and when focus moves outside',()=>{
  const filter=el('category-filter');filter.open=true;
  el('select-all-categories').dispatchEvent(new window.PointerEvent('pointerdown',{bubbles:true}));
  expect(filter.open).toBe(true);
  window.document.body.dispatchEvent(new window.PointerEvent('pointerdown',{bubbles:true}));expect(filter.open).toBe(false);
  filter.open=true;window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  expect(filter.open).toBe(false);expect(window.document.activeElement).toBe(filter.querySelector('summary'));
  filter.open=true;el('source').focus();expect(filter.open).toBe(false);
});
it('opens the help as a dialog and closes with its button, Escape and backdrop',()=>{
  const help=el('help-dialog');click('help-open');expect(help.open).toBe(true);
  expect(help.textContent).toContain(t('help.paragraph01'));expect(help.textContent).toContain(t('help.paragraph06'));
  help.querySelector('.help-content').click();expect(help.open).toBe(true);
  click('help-close');expect(help.open).toBe(false);expect(window.document.activeElement).toBe(el('help-open'));
  click('help-open');window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(help.open).toBe(false);
  click('help-open');help.click();expect(help.open).toBe(false);
});
it('keeps detection method and confidence visible in the compact table',async()=>{
  mocked.available.mockResolvedValue(true);
  mocked.analyze.mockResolvedValue([{entity_group:'PER',start:0,end:4,offset:0,score:.9}]);
  input('山田太郎');click('check');await tick();
  const row=el('candidates').children[0];
  expect(row.children.length).toBe(5);expect(row.querySelector('.detection-method').textContent).toContain('90%');
  expect(row.querySelector('select').title).toBe(CATEGORY_LABELS.PERSON);
  row.querySelector('select').value='OTHER';change(row.querySelector('select'));
  expect(el('output').value).toBe('<OTHER_01>');
});
it('loads AI only when the unified check is clicked and displays progress beside it',async()=>{
  expect(mocked.available).not.toHaveBeenCalled();expect(mocked.analyze).not.toHaveBeenCalled();
  expect(window.document.getElementById('ner')).toBe(null);
  expect(window.document.querySelector('.workbar-hint')).toBe(null);
  input('山田太郎 a@example.com');expect(mocked.available).not.toHaveBeenCalled();
  mocked.available.mockResolvedValue(true);
  let finish!:(result:object[])=>void;
  mocked.analyze.mockImplementation((_text,onStatus)=>{onStatus('固有名詞を解析中 42%');return new Promise(r=>{finish=r;});});
  click('check');expect(el('output').value).toContain('<EMAIL_01>');await tick();
  expect(el('check').disabled).toBe(true);expect(el('check-status').parentElement).toBe(el('check').parentElement);
  expect(el('check-status').textContent).toContain('42%');expect(el('status').textContent).not.toContain('42%');
  finish([{entity_group:'PER',start:0,end:4,offset:0,score:.9}]);await tick();
  expect(el('output').value).toBe('<PERSON_01> <EMAIL_01>');expect(el('check').disabled).toBe(false);
  expect(el('check-status').textContent).toBe(t('check.done'));
});
it('retains rule results and identifies incomplete AI checks when the model is missing or fails',async()=>{
  input('a@example.com');click('check');await tick();
  expect(el('output').value).toBe('<EMAIL_01>');expect(el('check-status').textContent).toBe(t('check.modelMissing'));
  expect(el('check').disabled).toBe(false);
  mocked.available.mockResolvedValue(true);mocked.analyze.mockRejectedValue(new Error('解析エラー'));
  click('check');await tick();
  expect(el('output').value).toBe('<EMAIL_01>');expect(el('check-status').textContent).toBe(t('check.partialError',{reason:'解析エラー'}));
  expect(el('check').disabled).toBe(false);
});
it('does not start a check for empty input or duplicate clicks while busy',async()=>{
  expect(el('check').disabled).toBe(true);click('check');expect(mocked.available).not.toHaveBeenCalled();
  input('  ');expect(el('check').disabled).toBe(true);
  input('a@example.com');mocked.available.mockReturnValue(new Promise(()=>{}));
  click('check');click('check');expect(mocked.available).toHaveBeenCalledTimes(1);
  click('clear');expect(el('check-status').textContent).toBe('');expect(el('check').disabled).toBe(true);
});

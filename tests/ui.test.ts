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
  click('check');await tick();expect(el('output').value).toBe('<CUSTOM> b@example.com');expect(mocked.available).not.toHaveBeenCalled();
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
  input('山田太郎');click('check-ai');click('clear');finish(true);await tick();
  expect(mocked.analyze).not.toHaveBeenCalled();expect(el('output').value).toBe('');expect(el('status').textContent).toBe(t('status.cleared'));
});
it('ignores stale errors and progress while a newer AI request is running',async()=>{
  mocked.available.mockResolvedValue(true);let reject!:(reason:Error)=>void;let status!:(value:string)=>void;
  mocked.analyze.mockImplementationOnce((_text,callback)=>{status=callback;return new Promise((_r,j)=>{reject=j;});});
  input('山田太郎');click('check-ai');await tick();
  input('佐藤');mocked.analyze.mockReturnValueOnce(new Promise(()=>{}));click('check-ai');await tick();
  const current=el('check-status').textContent;status('古い進捗');reject(new Error('古いエラー'));await tick();
  expect(el('check-status').textContent).toBe(current);expect(el('check').disabled).toBe(true);
});
it('integrates AI results and preserves them during a rule-only recheck',async()=>{
  mocked.available.mockResolvedValue(true);
  mocked.analyze.mockResolvedValue([{entity_group:'PER',start:0,end:4,offset:0,score:.9}]);
  input('山田太郎 a@example.com');click('check-ai');await tick();
  expect(el('output').value).toBe('<PERSON_01> <EMAIL_01>');
  click('check');await tick();expect(el('output').value).toBe('<PERSON_01> <EMAIL_01>');expect(mocked.analyze).toHaveBeenCalledTimes(1);
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
  input('山田太郎');click('check-ai');await tick();
  const row=el('candidates').children[0];
  expect(row.children.length).toBe(5);expect(row.querySelector('.detection-method').textContent).toContain('90%');
  expect(row.querySelector('select').title).toBe(CATEGORY_LABELS.PERSON);
  row.querySelector('select').value='OTHER';change(row.querySelector('select'));
  expect(el('output').value).toBe('<OTHER_01>');
});
it('loads AI only when the dedicated AI check is clicked and displays progress beside it',async()=>{
  expect(mocked.available).not.toHaveBeenCalled();expect(mocked.analyze).not.toHaveBeenCalled();
  expect(window.document.getElementById('ner')).toBe(null);
  expect(window.document.querySelector('.workbar-hint')).toBe(null);
  input('山田太郎 a@example.com');expect(mocked.available).not.toHaveBeenCalled();
  mocked.available.mockResolvedValue(true);
  let finish!:(result:object[])=>void;
  mocked.analyze.mockImplementation((_text,onStatus)=>{onStatus('固有名詞を解析中 42%');return new Promise(r=>{finish=r;});});
  click('check-ai');expect(el('output').value).toContain('<EMAIL_01>');await tick();
  expect(el('check').disabled).toBe(true);expect(el('check-ai').disabled).toBe(true);expect(el('check-status').parentElement).toBe(el('check-ai').parentElement);
  expect(el('check-status').textContent).toContain('42%');expect(el('status').textContent).not.toContain('42%');
  finish([{entity_group:'PER',start:0,end:4,offset:0,score:.9}]);await tick();
  expect(el('output').value).toBe('<PERSON_01> <EMAIL_01>');expect(el('check').disabled).toBe(false);
  expect(el('check-status').textContent).toBe(t('check.done'));
});
it('retains rule results and identifies incomplete AI checks when the model is missing or fails',async()=>{
  input('a@example.com');click('check-ai');await tick();
  expect(el('output').value).toBe('<EMAIL_01>');expect(el('check-status').textContent).toBe(t('check.modelMissing'));
  expect(el('check').disabled).toBe(false);
  mocked.available.mockResolvedValue(true);mocked.analyze.mockRejectedValue(new Error('解析エラー'));
  click('check-ai');await tick();
  expect(el('output').value).toBe('<EMAIL_01>');expect(el('check-status').textContent).toBe(t('check.partialError',{reason:'解析エラー'}));
  expect(el('check').disabled).toBe(false);
});
it('does not start a check for empty input or duplicate clicks while busy',async()=>{
  expect(el('check').disabled).toBe(true);click('check-ai');expect(mocked.available).not.toHaveBeenCalled();
  input('  ');expect(el('check').disabled).toBe(true);
  input('a@example.com');mocked.available.mockReturnValue(new Promise(()=>{}));
  click('check-ai');click('check-ai');expect(mocked.available).toHaveBeenCalledTimes(1);
  click('clear');expect(el('check-status').textContent).toBe('');expect(el('check').disabled).toBe(true);
});

it('runs rule-only checks without contacting or loading the AI model',()=>{
  expect(el('check').disabled).toBe(true);expect(el('check-ai').disabled).toBe(true);
  input('連絡先 a@example.com 接続先 10.20.1.10');
  expect(el('check').disabled).toBe(false);expect(el('check-ai').disabled).toBe(false);
  click('check');
  expect(el('output').value).toBe('連絡先 <EMAIL_01> 接続先 <IP_01>');
  expect(el('highlight').querySelectorAll('mark').length).toBe(2);
  expect(el('check-status').textContent).toBe(t('check.rulesDone'));
  expect(mocked.available).not.toHaveBeenCalled();expect(mocked.analyze).not.toHaveBeenCalled();
  click('clear');expect(el('check').disabled).toBe(true);expect(el('check-ai').disabled).toBe(true);
});

async function importCsv(csv:string) {
  Object.defineProperty(el('import-file'),'files',{configurable:true,value:[{name:'顧客リスト.csv',size:new TextEncoder().encode(csv).length,text:async()=>csv}]});
  change(el('import-file'));await tick();
}
const customerCsv='元の文字列,置換先,種別\n株式会社サンプル,<ORG_07>,ORG\n';
it('imports before text, keeps mappings across documents and clear, and restores the output',async()=>{
  await importCsv(customerCsv);expect(el('import-open').textContent).toContain('1件');
  input('株式会社サンプルへ連絡。株式会社サンプル');click('check');
  expect(el('output').value).toBe('<ORG_07>へ連絡。<ORG_07>');
  expect(el('highlight').querySelectorAll('mark')).toHaveLength(2);
  expect(el('candidates').querySelector('.detection-method').textContent).toBe(t('method.import'));
  click('open-restore-current');el('restore-input').value='<ORG_07>へ回答';el('restore-input').dispatchEvent(new window.Event('input'));click('restore-run');
  expect(el('restore-output').value).toBe('株式会社サンプルへ回答');click('mode-mask');
  click('clear');input('次の文章：株式会社サンプル');click('check');
  expect(el('output').value).toBe('次の文章：<ORG_07>');
  expect(mocked.available).not.toHaveBeenCalled();expect(mocked.analyze).not.toHaveBeenCalled();
  click('import-clear');expect(el('output').value).toBe('次の文章：株式会社サンプル');
  expect(el('import-open').textContent).toBe(t('import.button'));
});
it('applies imports to current text and preserves exclusion, edits and category filters on recheck',async()=>{
  input('a@example.com 株式会社サンプル');click('check');
  await importCsv('元の文字列,置換先,種別\na@example.com,<EMAIL_08>,EMAIL');
  expect(el('output').value).toBe('<EMAIL_08> 株式会社サンプル');
  expect(el('candidates').children.length).toBe(1);
  const row=el('candidates').children[0];row.querySelector('input[type=checkbox]').click();
  click('check');expect(el('output').value).toBe('a@example.com 株式会社サンプル');
  row.querySelector('input[type=checkbox]').click();
  const replacement=row.querySelector('input[type=text]');replacement.value='<CONTACT>';change(replacement);
  click('check');expect(el('output').value).toBe('<CONTACT> 株式会社サンプル');
  (window.document.querySelector('input[value=EMAIL]') as any).click();expect(el('output').value).toBe('a@example.com 株式会社サンプル');
});
it('retains imported results on missing or failed AI and reserves unused imported tokens',async()=>{
  await importCsv(customerCsv+'別会社,<ORG_01>,ORG\n');
  input('株式会社サンプル 新会社');click('check-ai');await tick();
  expect(el('output').value).toBe('<ORG_07> 新会社');
  mocked.available.mockResolvedValue(true);mocked.analyze.mockResolvedValue([{entity_group:'ORG',start:9,end:12,offset:0,score:.9}]);
  click('check-ai');await tick();expect(el('output').value).toBe('<ORG_07> <ORG_02>');
  mocked.analyze.mockRejectedValue(new Error('解析エラー'));click('check-ai');await tick();
  expect(el('output').value).toBe('<ORG_07> <ORG_02>');
});
it('atomically replaces lists and leaves existing mappings untouched after invalid imports',async()=>{
  input('株式会社サンプル 顧客B');await importCsv(customerCsv);
  const before=el('output').value;
  await importCsv('original,replacement\n同じ名前,<ORG_01>\n同じ名前,<ORG_02>');
  expect(el('output').value).toBe(before);expect(el('import-status').textContent).toContain('変更していません');
  await importCsv('original,replacement\n顧客B,<ORG_03>');
  expect(el('output').value).toBe('株式会社サンプル <ORG_03>');
});
it('ignores a pending file read after the loaded list is cleared',async()=>{
  await importCsv(customerCsv);
  let finish!:(text:string)=>void;
  Object.defineProperty(el('import-file'),'files',{configurable:true,value:[{name:'pending.csv',size:100,text:()=>new Promise<string>(resolve=>{finish=resolve;})}]});
  change(el('import-file'));click('import-clear');finish(customerCsv);await tick();
  input('株式会社サンプル');click('check');expect(el('output').value).toBe('株式会社サンプル');
  expect(el('import-open').textContent).toBe(t('import.button'));
});
it('cancels pending AI on successful import and ignores stale inference',async()=>{
  mocked.available.mockResolvedValue(true);let finish!:(entities:object[])=>void;
  mocked.analyze.mockReturnValue(new Promise<object[]>(resolve=>{finish=resolve;}));
  input('株式会社サンプル');click('check-ai');await tick();await importCsv(customerCsv);
  finish([{entity_group:'ORG',start:0,end:8,offset:0,score:.9}]);await tick();
  expect(el('output').value).toBe('<ORG_07>');expect(el('check').disabled).toBe(false);
  expect(el('candidates').children.length).toBe(1);
});
it('supports legacy protection explicitly and keeps imported HTML as plain text',async()=>{
  input('=secret <img src=x>');
  await importCsv('元の文字列,置換先\n\'=secret,<OTHER_01>\n<img src=x>,<OTHER_02>');
  expect(el('output').value).toBe('=secret <OTHER_02>');
  expect(el('import-rows').querySelector('img')).toBe(null);
  el('import-legacy-check').click();expect(el('output').value).toBe('<OTHER_01> <OTHER_02>');
});
it('opens and closes the import dialog without switching input views',()=>{
  click('import-open');expect(el('import-dialog').open).toBe(true);
  el('import-dialog').dispatchEvent(new window.Event('cancel',{cancelable:true}));
  expect(el('import-dialog').open).toBe(false);expect(window.document.activeElement).toBe(el('import-open'));
  expect(el('edit-pane').hidden).toBe(false);
});

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
it('keeps edited rows attached, preserving the following checkbox click and recheck decisions',()=>{
  input('a@example.com b@example.com');click('check');
  const rows=el('candidates').children;
  const first=rows[0];const nextCheckbox=rows[1].querySelector('input[type=checkbox]');
  const replacement=first.querySelector('input[type=text]');replacement.value='<CUSTOM>';change(replacement);
  expect(el('candidates').children[0]).toBe(first);
  expect(el('candidates').children[1].querySelector('input[type=checkbox]')).toBe(nextCheckbox);
  nextCheckbox.click();
  expect(el('output').value).toBe('<CUSTOM> b@example.com');
  click('check');expect(el('output').value).toBe('<CUSTOM> b@example.com');
});
it('preserves Japanese category filtering, combined counts and same-value placeholders',()=>{
  input('a@example.com a@example.com 10.20.1.10');click('check');
  expect(el('candidates').children.length).toBe(2);expect(el('replacement-total').textContent).toBe('3箇所');
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
  expect(el('highlight').querySelector('img')).toBe(null);expect(el('replacement-total').textContent).toBe('2箇所');
});
it('does not start inference after input is cleared during availability check',async()=>{
  let finish!:(available:boolean)=>void;mocked.available.mockReturnValue(new Promise<boolean>(r=>{finish=r;}));
  input('山田太郎');click('ner');click('clear');finish(true);await tick();
  expect(mocked.analyze).not.toHaveBeenCalled();expect(el('output').value).toBe('');expect(el('status').textContent).toBe('入力を消去しました。');
});
it('ignores stale errors and progress while a newer AI request is running',async()=>{
  mocked.available.mockResolvedValue(true);let reject!:(reason:Error)=>void;let status!:(value:string)=>void;
  mocked.analyze.mockImplementationOnce((_text,callback)=>{status=callback;return new Promise((_r,j)=>{reject=j;});});
  input('山田太郎');click('ner');await tick();
  input('佐藤');mocked.analyze.mockReturnValueOnce(new Promise(()=>{}));click('ner');await tick();
  const current=el('status').textContent;status('古い進捗');reject(new Error('古いエラー'));await tick();
  expect(el('status').textContent).toBe(current);expect(el('ner').disabled).toBe(true);
});
it('integrates AI results and preserves them after a rule-only recheck',async()=>{
  mocked.available.mockResolvedValue(true);
  mocked.analyze.mockResolvedValue([{entity_group:'PER',start:0,end:4,offset:0,score:.9}]);
  input('山田太郎 a@example.com');click('ner');await tick();
  expect(el('output').value).toBe('<PERSON_01> <EMAIL_01>');
  click('check');expect(el('output').value).toBe('<PERSON_01> <EMAIL_01>');
});
it('copies the output and the combined mapping using category codes',async()=>{
  const copy=vi.fn().mockResolvedValue(undefined);Object.defineProperty(window.navigator,'clipboard',{value:{writeText:copy}});
  input('a@example.com a@example.com');click('check');click('copy');await tick();
  expect(copy).toHaveBeenLastCalledWith('<EMAIL_01> <EMAIL_01>');expect(el('copy-feedback').textContent).toContain('コピーしました');
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
  expect(names).toEqual(['置換内訳.csv','マスキング後のテキスト.txt']);
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

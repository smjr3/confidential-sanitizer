import { detectRules } from './detection/regex';
import { mapNerEntities } from './detection/ner';
import { addManual } from './detection/manual';
import { CATEGORIES, CATEGORY_LABELS, type Candidate, type Category } from './detection/types';
import { applyAssignments, assignments, withCategories } from './anonymize';
import { mappingFromAssignments, mappingCsv, mappingTsv, type MappingRow } from './anonymize/report';
import { mergeCandidates } from './detection/state';
import type { Method } from './detection/types';
import { CandidateTable } from './ui/candidates';
import { ModelLoader } from './model/loader';
import { appBase } from './model/config';
import { modelAvailable } from './model/availability';
import { MAX_LENGTH } from './security/policy';
import { t } from './content/text';
import { appTemplate } from './ui/template';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = appTemplate();
document.title=t('app.title');
const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const source = $<HTMLTextAreaElement>('source');
const output = $<HTMLTextAreaElement>('output');
const status = $<HTMLParagraphElement>('status');
const checkStatus=$<HTMLParagraphElement>('check-status');
const filter=$<HTMLDetailsElement>('category-filter');
const help=$<HTMLDialogElement>('help-dialog');
function closeFilter(restoreFocus=false):void {
  filter.open=false;
  if(restoreFocus)filter.querySelector('summary')!.focus({preventScroll:true});
}
document.addEventListener('pointerdown',event=>{if(!filter.contains(event.target as Node))closeFilter();});
document.addEventListener('focusin',event=>{if(!filter.contains(event.target as Node))closeFilter();});
$('help-open').addEventListener('click',()=>{closeFilter();if(!help.open)help.showModal();});
function closeHelp():void { help.close();$('help-open').focus({preventScroll:true}); }
$('help-close').addEventListener('click',closeHelp);
help.addEventListener('click',event=>{if(event.target===help)closeHelp();});
help.addEventListener('cancel',event=>{event.preventDefault();closeHelp();});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(help.open){event.preventDefault();closeHelp();}
  else if(filter.open){event.preventDefault();closeFilter(true);}
});
function setInputView(review:boolean,focusTab=false):void {
  $('edit-pane').hidden=review;$('review-pane').hidden=!review;
  for(const [id,active] of [['tab-edit',!review],['tab-review',review]] as const){
    const tab=$<HTMLButtonElement>(id);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    if(active&&focusTab)tab.focus({preventScroll:true});
  }
  if(!review)clearSelection();
}
for(const [id,review] of [['tab-edit',false],['tab-review',true]] as const){
  $(id).addEventListener('click',()=>setInputView(review));
  $(id).addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();setInputView(event.key==='Home'?false:event.key==='End'?true:!review,true);
    }
  });
}

let candidates: Candidate[] = [];
let revision = 0;
let busy = false;
let checked = false;
let selected: {start:number;end:number} | null = null;
const loader = new ModelLoader();
let nerRun=0;
let renderVersion=0;
let report:MappingRow[]=[];
const table=new CandidateTable($('candidates'),()=>candidates,refresh,message=>{status.textContent=message;});
function cancelNer():void {
  nerRun++;
  if(busy)loader.dispose();
  busy=false;
  $<HTMLButtonElement>('check').disabled=!source.value.trim();
  $<HTMLButtonElement>('check').textContent=t('button.check');
  checkStatus.textContent='';
}
const selectedCategories = new Set<Category>(CATEGORIES);
const categoryBoxes = new Map<Category,HTMLInputElement>();
for (const name of CATEGORIES) {
  const label = document.createElement('label');
  const box = document.createElement('input'); box.type='checkbox'; box.checked=true; box.value=name;
  box.addEventListener('change', () => {
    if (box.checked) selectedCategories.add(name); else selectedCategories.delete(name);
    refresh();
  });
  categoryBoxes.set(name,box);
  label.append(box,document.createTextNode(CATEGORY_LABELS[name]));
  $('category-options').append(label);
}
function setAllCategories(enabled:boolean): void {
  selectedCategories.clear();
  for (const name of CATEGORIES) {
    if (enabled) selectedCategories.add(name);
    categoryBoxes.get(name)!.checked=enabled;
  }
  refresh();
}
$('select-all-categories').addEventListener('click', () => setAllCategories(true));
$('clear-all-categories').addEventListener('click', () => setAllCategories(false));

function refresh(): void {
  renderVersion++;
  $<HTMLButtonElement>('check').disabled=busy || !source.value.trim();
  $('length').textContent = t('input.length',{count:source.value.length,max:MAX_LENGTH});
  $('category-filter-count').textContent = selectedCategories.size === CATEGORIES.length ? t('filter.all') : t('filter.selected',{count:selectedCategories.size});
  const effective = withCategories(candidates, selectedCategories);
  const spans=assignments(effective);
  output.value=checked ? applyAssignments(source.value,spans) : '';
  report=mappingFromAssignments(spans);
  const copy = $<HTMLButtonElement>('copy');
  copy.disabled = !checked || !source.value;
  $<HTMLButtonElement>('download-txt').disabled = copy.disabled;
  copy.textContent = t('button.copy');
  $('copy-feedback').textContent = '';
  $('mapping-feedback').textContent = '';
  const preview = $('highlight');
  const previewScroll=preview.scrollTop;
  preview.replaceChildren();
  $<HTMLElement>('output-warning').hidden = !checked || !source.value || spans.length > 0;
  let cursor = 0;
  for (const {candidate:item,replacement} of spans) {
    preview.append(document.createTextNode(source.value.slice(cursor,item.start)));
    const mark = document.createElement('mark');
    mark.textContent = item.text;
    mark.dataset.method = item.method;
    mark.title = t('candidate.previewTitle',{category:CATEGORY_LABELS[item.category],replacement});
    preview.append(mark);
    cursor = item.end;
  }
  preview.append(document.createTextNode(source.value.slice(cursor)));
  if (!source.value) preview.textContent = t('view.empty');
  preview.scrollTop=previewScroll;
  const groupCount=table.update(candidates,spans,selectedCategories);
  $('count').textContent=t('candidates.summary',{groups:groupCount,count:spans.length});
  $('replacement-total').textContent=t('candidates.count',{count:spans.length});
  $('candidates-empty').hidden=candidates.length>0;
  $<HTMLButtonElement>('copy-mapping').disabled=!report.length;
  $<HTMLButtonElement>('download-mapping').disabled=!report.length;
}
function merge(incoming:Candidate[], methods:Method[]):void {
  candidates=mergeCandidates(candidates,incoming,methods);
  refresh();
}
function clearSelection(): void {
  selected=null;
  $('selected-text').textContent=t('manual.prompt');
  $<HTMLButtonElement>('manual').disabled=true;
}
function captureSelection(): void {
  const preview = $('highlight');
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) { clearSelection(); return; }
  const range = selection.getRangeAt(0);
  if (!preview.contains(range.startContainer) || !preview.contains(range.endContainer)) { clearSelection(); return; }
  const before = document.createRange();
  before.selectNodeContents(preview);
  before.setEnd(range.startContainer,range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  if (!source.value.slice(start,end).trim()) { clearSelection(); return; }
  selected={start,end};
  $('selected-text').textContent=t('manual.selected',{text:source.value.slice(start,end)});
  $<HTMLButtonElement>('manual').disabled=false;
}
$('highlight').addEventListener('mouseup',captureSelection);
$('highlight').addEventListener('keyup',captureSelection);
source.addEventListener('input', () => { revision++; cancelNer(); candidates=[]; checked=false; clearSelection(); status.textContent=t('status.changed'); refresh(); });
$('check').addEventListener('click', async () => {
  if (busy || !source.value.trim()) return;
  busy=true;
  ($<HTMLButtonElement>('check')).disabled=true;
  $('check').textContent=t('button.checking');
  status.textContent='';
  const current = revision;
  const run=++nerRun;
  const input = source.value;
  checked=true;
  setInputView(true);
  merge(detectRules(input),['rule']);
  clearSelection();
  try {
    checkStatus.textContent=t('check.preparing');
    const available=await modelAvailable(appBase());
    if(run!==nerRun || current!==revision)return;
    if (!available) {
      if (current === revision) checkStatus.textContent=t('check.modelMissing');
      return;
    }
    const entities = await loader.analyze(input, message => { if (run===nerRun && current === revision) checkStatus.textContent=message; });
    if(run!==nerRun || current!==revision)return;
    merge([...detectRules(input),...entities.flatMap(item => mapNerEntities(input,[item],item.offset))],['rule','ner']);
    checkStatus.textContent=t('check.done');
  } catch(e) { if(run===nerRun && current===revision)checkStatus.textContent=t('check.partialError',{reason:e instanceof Error ? e.message : t('ai.failed')}); }
  finally { if(run===nerRun){busy=false; ($<HTMLButtonElement>('check')).disabled=!source.value.trim(); $('check').textContent=t('button.check');} }
});
$('manual').addEventListener('click', () => {
  if (!selected) return;
  const found = addManual(source.value,selected.start,selected.end,'OTHER');
  if (!found.length) { status.textContent=t('manual.selectFirst'); return; }
  checked=true;
  candidates=mergeCandidates(candidates,found,[]);
  status.textContent=t('manual.added',{count:found.length,note:selectedCategories.has('OTHER')?'':t('manual.filtered')}); clearSelection(); refresh();
});
$('copy').addEventListener('click', async () => {
  const version=renderVersion;
  try { await navigator.clipboard.writeText(output.value); if(version!==renderVersion)return; $<HTMLButtonElement>('copy').textContent=t('button.copied'); $('copy-feedback').textContent=t('copy.success'); }
  catch { if(version!==renderVersion)return; output.focus(); output.select(); $('copy-feedback').textContent=t('copy.failed'); }
});
function saveText(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content],{type:mime}));
  const link = document.createElement('a'); link.href=url; link.download=name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('copy-mapping').addEventListener('click', async () => {
  const rows=report; if (!rows.length) return;
  const version=renderVersion;
  try { await navigator.clipboard.writeText(mappingTsv(rows)); if(version!==renderVersion)return; $('mapping-feedback').textContent=t('mapping.copied'); }
  catch { if(version!==renderVersion)return; $('mapping-feedback').textContent=t('mapping.copyFailed'); }
});
$('download-mapping').addEventListener('click', () => {
  const rows=report; if (!rows.length) return;
  saveText(t('file.mapping'),`\uFEFF${mappingCsv(rows)}`,'text/csv;charset=utf-8');
  $('mapping-feedback').textContent=t('mapping.saved');
});
$('download-txt').addEventListener('click', () => {
  if (!checked || !source.value) return;
  saveText(t('file.output'),output.value,'text/plain;charset=utf-8');
  $('copy-feedback').textContent=t('output.saved');
});
$('clear').addEventListener('click', () => { revision++; cancelNer(); source.value=''; candidates=[]; checked=false; output.value=''; clearSelection(); status.textContent=t('status.cleared'); loader.dispose(); refresh(); setInputView(false); source.focus({preventScroll:true}); });
refresh();

import { t } from '../content/text';
import { MAX_LENGTH } from '../security/policy';
import { MAX_CSV_BYTES, parseMappingCsv, restoreText, validateRows, type RestoreRow } from '../restore';

/** Independent in-memory workspace. The masking report is copied only on explicit handoff. */
export function setupRestore(getCurrent:()=>{rows:RestoreRow[];busy:boolean},saveText:(name:string,content:string,mime:string)=>void) {
  const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
  const input=$<HTMLTextAreaElement>('restore-input'),output=$<HTMLTextAreaElement>('restore-output');
  const status=$('restore-status'),source=$('restore-map-source');
  let rows:RestoreRow[]=[],csv='',csvName='',epoch=0,version=0,active=false;
  let valid=false,mappingError='',displayedCounts=false;
  function invalidate():void {
    version++;output.value='';$('restore-feedback').textContent='';
    $<HTMLButtonElement>('restore-copy').disabled=true;$<HTMLButtonElement>('restore-txt').disabled=true;
    $('restore-copy').textContent=t('button.copy');
  }
  function controls():void {
    $<HTMLButtonElement>('restore-run').disabled=!valid || !input.value.trim();
    const current=getCurrent();
    $<HTMLButtonElement>('restore-use-current').disabled=!current.rows.length || current.busy;
    $<HTMLButtonElement>('open-restore-current').disabled=!current.rows.length || current.busy;
    $('restore-length').textContent=t('input.length',{count:input.value.length,max:MAX_LENGTH});
  }
  function renderMappings(counts=new Map<string,number>()):void {
    displayedCounts=counts.size>0;
    const fragment=document.createDocumentFragment();
    for(const row of rows) {
      const tr=document.createElement('tr');
      for(const value of [row.replacement,row.original,String(counts.get(row.replacement)??0)]) {
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      fragment.append(tr);
    }
    $('restore-mappings').replaceChildren(fragment);$('restore-empty').hidden=!!rows.length;
  }
  function accept(next:RestoreRow[],label:string):void {
    validateRows(next);
    rows=[...new Map(next.map(row=>[row.replacement,{...row}])).values()];
    valid=true;mappingError='';invalidate();renderMappings();source.textContent=label;
    status.textContent=t('restore.loaded',{count:rows.length});controls();
  }
  function useCurrent():void {
    const current=getCurrent();if(current.busy || !current.rows.length)return;
    epoch++;csv='';csvName='';$('restore-legacy').hidden=true;$<HTMLInputElement>('restore-legacy-check').checked=false;
    try { accept(current.rows,t('restore.fromCurrent',{count:current.rows.length})); }
    catch(error) { rows=current.rows.map(row=>({...row}));valid=false;invalidate();renderMappings();source.textContent=t('restore.fromCurrent',{count:rows.length});mappingError=(error as Error).message;status.textContent=mappingError;controls(); }
  }
  function open(carry=false):void {
    if(carry || (!rows.length && getCurrent().rows.length && !getCurrent().busy))useCurrent();
    active=true;switchView();controls();
  }
  function switchView():void {
    $('app').dataset.mode=active?'restore':'mask';
    $('mask-workbar').hidden=active;$('mask-workspace').hidden=active;$('mask-statusbar').hidden=active;$('restore-screen').hidden=!active;
    $('mode-mask').setAttribute('aria-pressed',String(!active));$('mode-restore').setAttribute('aria-pressed',String(active));
    $<HTMLDetailsElement>('category-filter').open=false;
  }
  function clear():void {
    epoch++;rows=[];csv='';csvName='';valid=false;mappingError='';input.value='';invalidate();renderMappings();
    $<HTMLInputElement>('restore-file').value='';$<HTMLInputElement>('restore-legacy-check').checked=false;$('restore-legacy').hidden=true;
    source.textContent=t('restore.noMapping');status.textContent=t('restore.ready');controls();
  }
  $('mode-mask').addEventListener('click',()=>{active=false;switchView();});
  $('mode-restore').addEventListener('click',()=>open());
  $('open-restore-current').addEventListener('click',()=>open(true));
  $('restore-use-current').addEventListener('click',useCurrent);
  $('restore-clear').addEventListener('click',clear);
  input.addEventListener('input',()=>{invalidate();if(displayedCounts)renderMappings();status.textContent=mappingError || t('restore.ready');controls();});
  $('restore-import').addEventListener('click',()=>$<HTMLInputElement>('restore-file').click());
  $('restore-file').addEventListener('change',async()=>{
    const file=$<HTMLInputElement>('restore-file').files?.[0];if(!file)return;
    const run=++epoch;invalidate();if(displayedCounts)renderMappings();
    try {
      if(file.size>MAX_CSV_BYTES)throw new Error(t('restore.csvLarge'));
      const text=await file.text();if(run!==epoch)return;
      const parsed=parseMappingCsv(text);
      accept(parsed.rows,t('restore.fromCsv',{name:file.name,count:parsed.rows.length}));
      csv=text;csvName=file.name;$('restore-legacy').hidden=!parsed.legacyProtected;$<HTMLInputElement>('restore-legacy-check').checked=false;
      if(parsed.legacyProtected)status.textContent=t('restore.legacyHint');
    } catch(error) { if(run===epoch)status.textContent=t('restore.importFailed',{reason:error instanceof Error ? error.message : t('restore.csvInvalid')}); }
    finally { if(run===epoch)$<HTMLInputElement>('restore-file').value=''; }
  });
  $('restore-legacy-check').addEventListener('change',()=>{
    if(!csv)return;
    try { const parsed=parseMappingCsv(csv,$<HTMLInputElement>('restore-legacy-check').checked);accept(parsed.rows,t('restore.fromCsv',{name:csvName,count:parsed.rows.length})); }
    catch(error) {valid=false;invalidate();mappingError=(error as Error).message;status.textContent=mappingError;controls();}
  });
  $('restore-run').addEventListener('click',()=>{
    if(!valid || !input.value.trim())return;invalidate();
    try {
      const result=restoreText(input.value,rows);output.value=result.text;renderMappings(result.counts);
      status.textContent=t('restore.done',{count:result.count})+(result.unresolved.length?t('restore.unresolved',{tokens:result.unresolved.join('、')}):'');
      $<HTMLButtonElement>('restore-copy').disabled=false;$<HTMLButtonElement>('restore-txt').disabled=false;
    }catch(error){status.textContent=(error as Error).message;}
  });
  $('restore-copy').addEventListener('click',async()=>{
    const current=version;
    try {await navigator.clipboard.writeText(output.value);if(current!==version)return;$('restore-copy').textContent=t('button.copied');$('restore-feedback').textContent=t('restore.copied');}
    catch{if(current!==version)return;output.focus({preventScroll:true});output.select();$('restore-feedback').textContent=t('copy.failed');}
  });
  $('restore-txt').addEventListener('click',()=>{if(!output.value)return;saveText(t('file.restored'),output.value,'text/plain;charset=utf-8');$('restore-feedback').textContent=t('restore.saved');});
  controls();
  return {clear,updateAvailability:controls};
}

import { t } from '../content/text';
import { CATEGORY_LABELS } from '../detection/types';
import { ImportedDictionary } from '../detection/imported';
import { MAX_CSV_BYTES, parseMappingCsv } from '../restore';

/** Local file reads only. Commit a replacement list only after parsing and application succeed. */
export function setupMappingImport(apply:(dictionary:ImportedDictionary|null)=>boolean) {
  const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
  const dialog=$<HTMLDialogElement>('import-dialog'),fileInput=$<HTMLInputElement>('import-file');
  const legacy=$<HTMLInputElement>('import-legacy-check');
  let csv='',name='',epoch=0;
  function close():void {dialog.close();$('import-open').focus({preventScroll:true});}
  function accept(text:string,fileName:string,removeProtection=false):boolean {
    const parsed=parseMappingCsv(text,removeProtection);
    const dictionary=new ImportedDictionary(parsed.rows);
    if(!apply(dictionary))return false;
    csv=text;name=fileName;
    $('import-open').textContent=t('import.buttonLoaded',{count:dictionary.rows.length});
    $('import-summary').textContent=t('restore.fromCsv',{name,count:dictionary.rows.length});
    $('import-status').textContent=t(parsed.legacyProtected?'restore.legacyHint':'import.loaded');
    $('import-legacy').hidden=!parsed.legacyProtected;
    legacy.checked=removeProtection;
    $<HTMLButtonElement>('import-clear').disabled=false;
    const fragment=document.createDocumentFragment();
    for(const row of dictionary.rows){
      const tr=document.createElement('tr');
      for(const value of [row.original,row.replacement,CATEGORY_LABELS[row.category]]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
      fragment.append(tr);
    }
    $('import-rows').replaceChildren(fragment);
    return true;
  }
  $('import-open').addEventListener('click',()=>{if(!dialog.open)dialog.showModal();});
  $('import-close').addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  $('import-file-open').addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files?.[0];if(!file)return;
    const run=++epoch;
    try {
      if(file.size>MAX_CSV_BYTES)throw new Error(t('restore.csvLarge'));
      const text=await file.text();if(run!==epoch)return;
      accept(text,file.name);
    }catch(error){if(run===epoch)$('import-status').textContent=t('restore.importFailed',{reason:(error as Error).message});}
    finally{if(run===epoch)fileInput.value='';}
  });
  legacy.addEventListener('change',()=>{
    epoch++;
    try{if(!accept(csv,name,legacy.checked))legacy.checked=!legacy.checked;}
    catch(error){legacy.checked=!legacy.checked;$('import-status').textContent=t('restore.importFailed',{reason:(error as Error).message});}
  });
  $('import-clear').addEventListener('click',()=>{
    epoch++;apply(null);csv='';name='';fileInput.value='';legacy.checked=false;
    $('import-legacy').hidden=true;$('import-rows').replaceChildren();
    $('import-open').textContent=t('import.button');$('import-summary').textContent=t('import.empty');
    $('import-status').textContent=t('import.cleared');$<HTMLButtonElement>('import-clear').disabled=true;
  });
}

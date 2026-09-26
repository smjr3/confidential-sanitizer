import { t } from '../content/text';
import { CATEGORIES, CATEGORY_LABELS, type Candidate, type Category } from '../detection/types';
import type { Assignment } from '../anonymize';

type Row = {node:HTMLTableRowElement; checkbox:HTMLInputElement; kind:HTMLSelectElement; replacement:HTMLInputElement; method:HTMLSpanElement; total:HTMLSpanElement; group:Candidate[]; dirty:boolean};

/** Keep existing controls attached so editing a replacement cannot swallow the next click. */
export class CandidateTable {
  private rows=new Map<string,Row>();
  constructor(private body:HTMLElement, private candidates:()=>Candidate[], private changed:()=>void, private status:(message:string)=>void) {}
  update(candidates:Candidate[], spans:Assignment[], categories:ReadonlySet<Category>):number {
    const replacements=new Map(spans.map(item=>[item.candidate.id,item.replacement]));
    const groups=new Map<string,Candidate[]>();
    for (const item of candidates) {
      const key=JSON.stringify([item.text,item.category,item.method]);
      const group=groups.get(key) ?? [];
      group.push(item); groups.set(key,group);
    }
    for (const [key,row] of this.rows) if (!groups.has(key)) { row.node.remove(); this.rows.delete(key); }
    let position=0;
    for (const [key,group] of groups) {
      const item=group[0];
      let row=this.rows.get(key);
      if (!row) { row=this.create(group); this.rows.set(key,row); }
      row.group=group;
      const active=group.filter(candidate=>replacements.has(candidate.id));
      const allowed=categories.has(item.category);
      row.node.className=allowed ? '' : 'filtered-row';
      row.checkbox.checked=allowed && group.every(candidate=>candidate.enabled);
      row.checkbox.indeterminate=allowed && !row.checkbox.checked && group.some(candidate=>candidate.enabled);
      row.checkbox.disabled=!allowed;
      row.checkbox.title=allowed ? '' : t('candidate.filteredTitle',{category:CATEGORY_LABELS[item.category]});
      row.checkbox.setAttribute('aria-label',t('candidate.checkLabel',{text:item.text,count:group.length}));
      row.kind.value=item.category;
      row.kind.title=CATEGORY_LABELS[item.category];
      row.replacement.disabled=!active.length;
      if (!row.dirty || document.activeElement!==row.replacement) {
        row.replacement.value=active.length ? replacements.get(active[0].id)! : (!allowed ? t('candidate.filtered') : group.some(candidate=>candidate.enabled) ? t('candidate.overlap') : t('candidate.excluded'));
        row.dirty=false;
      }
      const confidence=group.flatMap(candidate=>candidate.confidence===undefined ? [] : [candidate.confidence]);
      row.method.textContent=`${item.method==='rule' ? t('method.rule') : item.method==='manual' ? t('method.manual') : t('method.ner')}${confidence.length ? t('candidate.confidence',{percent:Math.round(confidence.reduce((a,b)=>a+b,0)/confidence.length*100)}) : ''}`;
      row.total.textContent=t('candidate.counts',{active:active.length,total:group.length});
      // Do not move controls which are already in the right position (preserves focus).
      if (this.body.children[position]!==row.node) this.body.insertBefore(row.node,this.body.children[position] ?? null);
      position++;
    }
    return groups.size;
  }
  private create(group:Candidate[]):Row {
    const item=group[0];
    const row:Row={node:document.createElement('tr'),checkbox:document.createElement('input'),kind:document.createElement('select'),replacement:document.createElement('input'),method:document.createElement('span'),total:document.createElement('span'),group,dirty:false};
    row.checkbox.type='checkbox';
    row.checkbox.addEventListener('change',()=>{for(const candidate of row.group)candidate.enabled=row.checkbox.checked;this.changed();});
    for(const category of CATEGORIES){
      const option=document.createElement('option');option.textContent=CATEGORY_LABELS[category];option.value=category;row.kind.add(option);
    }
    row.kind.setAttribute('aria-label',t('candidate.categoryLabel',{text:item.text}));
    row.kind.addEventListener('change',()=>{for(const candidate of row.group){candidate.category=row.kind.value as Category;candidate.replacement=undefined;}this.changed();});
    row.replacement.type='text';row.replacement.className='replacement';
    row.replacement.setAttribute('aria-label',t('candidate.replacementLabel',{text:item.text}));
    row.replacement.addEventListener('input',()=>{row.dirty=true;});
    row.replacement.addEventListener('change',()=>{
      row.dirty=false;
      const current=row.group[0];
      const next=row.replacement.value.trim();
      if(next===current.text){this.status(t('candidate.sameReplacement'));this.changed();return;}
      // All occurrences must agree, including ones found by a different detection method.
      for(const candidate of this.candidates())if(candidate.text===current.text && candidate.category===current.category)candidate.replacement=next || undefined;
      this.status(next ? t('candidate.edited') : t('candidate.reset'));this.changed();
    });
    const value=document.createElement('div');
    const original=document.createElement('span');original.textContent=item.text;
    row.method.className='detection-method';value.append(original,row.method);
    for(const [index,element] of [row.checkbox,value,row.replacement,row.kind,row.total].entries()){
      const cell=document.createElement('td');if(index===1)cell.className='original-cell';cell.append(element);row.node.append(cell);
    }
    return row;
  }
}

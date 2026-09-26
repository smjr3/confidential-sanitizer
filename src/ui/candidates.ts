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
      row.checkbox.title=allowed ? '' : `${CATEGORY_LABELS[item.category]}は入力欄の種別設定で対象外です`;
      row.checkbox.setAttribute('aria-label',`${item.text}の${group.length}箇所をマスキングする`);
      row.kind.value=item.category;
      row.kind.title=CATEGORY_LABELS[item.category];
      row.replacement.disabled=!active.length;
      if (!row.dirty || document.activeElement!==row.replacement) {
        row.replacement.value=active.length ? replacements.get(active[0].id)! : (!allowed ? '種別設定で対象外' : group.some(candidate=>candidate.enabled) ? '別の候補を優先' : '置換しない');
        row.dirty=false;
      }
      const confidence=group.flatMap(candidate=>candidate.confidence===undefined ? [] : [candidate.confidence]);
      row.method.textContent=`${item.method==='rule' ? '形式' : item.method==='manual' ? '手動' : 'ブラウザ内AI'}${confidence.length ? `（平均${Math.round(confidence.reduce((a,b)=>a+b,0)/confidence.length*100)}%）` : ''}`;
      row.total.textContent=`${active.length} / ${group.length}`;
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
    row.kind.setAttribute('aria-label',`${item.text}の種別`);
    row.kind.addEventListener('change',()=>{for(const candidate of row.group){candidate.category=row.kind.value as Category;candidate.replacement=undefined;}this.changed();});
    row.replacement.type='text';row.replacement.className='replacement';
    row.replacement.setAttribute('aria-label',`${item.text}の置換先`);
    row.replacement.addEventListener('input',()=>{row.dirty=true;});
    row.replacement.addEventListener('change',()=>{
      row.dirty=false;
      const current=row.group[0];
      const next=row.replacement.value.trim();
      if(next===current.text){this.status('元の文字列と同じ置換先は指定できません。');this.changed();return;}
      // All occurrences must agree, including ones found by a different detection method.
      for(const candidate of this.candidates())if(candidate.text===current.text && candidate.category===current.category)candidate.replacement=next || undefined;
      this.status(next ? '置換先を変更しました。' : '自動生成の置換先に戻しました。');this.changed();
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

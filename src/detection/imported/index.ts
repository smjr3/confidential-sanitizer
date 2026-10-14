import { t } from '../../content/text';
import { MAX_LENGTH } from '../../security/policy';
import { MAX_CSV_BYTES, validateRows, type RestoreRow } from '../../restore';
import { CATEGORIES, candidate, type Candidate, type Category } from '../types';

export interface ImportedRow extends RestoreRow { category: Category }
interface Trie { next: Map<string,Trie>; row?: ImportedRow }

/** Compile once per CSV; scan only on checks/import, never on each keystroke. */
export class ImportedDictionary {
  readonly rows: readonly ImportedRow[];
  readonly reserved: ReadonlySet<string>;
  private root: Trie = {next:new Map()};
  constructor(rows: readonly RestoreRow[]) {
    validateRows(rows);
    if(rows.reduce((size,row)=>size+row.original.length,0)>200_000)throw new Error(t('import.tooComplex'));
    const unique=new Map<string,ImportedRow>();
    for(const row of rows) {
      if(!row.original.trim() || row.original===row.replacement || row.replacement!==row.replacement.trim())throw new Error(t('import.invalid'));
      const inferred=/^<([A-Z_]+)_\d+>$/.exec(row.replacement)?.[1];
      const category=CATEGORIES.includes(row.category as Category) ? row.category as Category : CATEGORIES.includes(inferred as Category) ? inferred as Category : 'OTHER';
      const old=unique.get(row.original);
      if(old && (old.replacement!==row.replacement || old.category!==category))throw new Error(t('import.conflict',{original:row.original}));
      unique.set(row.original,{...row,category});
    }
    this.rows=[...unique.values()];
    this.reserved=new Set(this.rows.map(row=>row.replacement));
    for(const row of this.rows) {
      let node=this.root;
      for(let i=0;i<row.original.length;i++) {
        const char=row.original[i];
        if(!node.next.has(char))node.next.set(char,{next:new Map()});
        node=node.next.get(char)!;
      }
      node.row=row;
    }
  }
  find(text:string):Candidate[] {
    if(text.length>MAX_LENGTH)throw new Error(t('import.textLarge',{max:MAX_LENGTH}));
    const found:Candidate[]=[];
    let work=0,size=text.length;
    // Leftmost, longest literal match. Do not interpret regex or rescan replacements.
    for(let start=0;start<text.length;) {
      let node=this.root,match:ImportedRow|undefined,end=start;
      for(let i=start;i<text.length;i++) {
        if(++work>5_000_000)throw new Error(t('import.tooComplex'));
        const next=node.next.get(text[i]);if(!next)break;node=next;
        if(node.row){match=node.row;end=i+1;}
      }
      if(match) {
        size+=Math.max(0,match.replacement.length-(end-start));
        if(size>MAX_CSV_BYTES)throw new Error(t('import.outputLarge'));
        found.push({...candidate(text,start,end,match.category,'import'),replacement:match.replacement});
        start=end;
      } else start++;
    }
    return found;
  }
}

/** Avoid duplicate automatic rows and prevent unchecked imports from reappearing as rule/AI matches. */
export function preferImported(candidates:Candidate[]):Candidate[] {
  const imported=candidates.filter(item=>item.method==='import').sort((a,b)=>a.start-b.start);
  if(!imported.length)return candidates;
  return candidates.filter(item=>{
    if(item.method==='import')return true;
    let lo=0,hi=imported.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(imported[mid].start<=item.start)lo=mid+1;else hi=mid;}
    const owner=imported[lo-1];
    return !owner || owner.end<item.end;
  });
}

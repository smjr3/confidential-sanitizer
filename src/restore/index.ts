import { t } from '../content/text';
import { MAX_LENGTH } from '../security/policy';

export interface RestoreRow { original: string; replacement: string }
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;
export const CSV_FORMAT = 'literal-v1';
export const CSV_FORMAT_HEADING = '復元形式';

/** Strict RFC-style CSV parsing. Never evaluate cells or guess delimiters. */
export function parseMappingCsv(text: string, removeLegacyProtection = false): { rows: RestoreRow[]; legacyProtected: boolean } {
  if (text.length > MAX_CSV_BYTES) throw new Error(t('restore.csvLarge'));
  text = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const field = () => { row.push(cell); cell = ''; closed = false; if(row.length > 20) throw new Error(t('restore.csvInvalid')); };
  const record = () => { field(); records.push(row); row = []; if(records.length > MAX_ROWS + 1) throw new Error(t('restore.csvLarge')); };
  for (let i=0; i<text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if(text[i+1] === '"') { cell += '"'; i++; } else { quoted=false; closed=true; } }
      else cell += c;
    } else if (c === ',') field();
    else if (c === '\r' || c === '\n') { record(); if(c==='\r' && text[i+1]==='\n') i++; }
    else if (c === '"' && !cell && !closed) quoted=true;
    else { if(closed || c === '"') throw new Error(t('restore.csvInvalid')); cell += c; }
  }
  if (quoted) throw new Error(t('restore.csvInvalid'));
  if (cell || row.length || closed) record();
  const headings = records.shift();
  if (!headings) throw new Error(t('restore.csvInvalid'));
  const original = headings.findIndex(h=>['元の文字列',t('column.original'),'original'].includes(h));
  const replacement = headings.findIndex(h=>['置換先',t('column.replacement'),'replacement'].includes(h));
  const format = headings.indexOf(CSV_FORMAT_HEADING);
  if(original < 0 || replacement < 0 || original === replacement || new Set(headings).size !== headings.length) throw new Error(t('restore.csvHeader'));
  let legacyProtected=false;
  const rows:RestoreRow[]=[];
  const decode = (value:string, modern:boolean):string => {
    if(modern && (value.startsWith("''") || /^'[\s\uFEFF]*[=+\-@]/u.test(value))) return value.slice(1);
    if(!modern && /^'[\s\uFEFF]*[=+\-@]/u.test(value)) { legacyProtected=true; if(removeLegacyProtection)return value.slice(1); }
    return value;
  };
  for (const values of records) {
    if(values.length===1 && values[0]==='') continue;
    if(values.length !== headings.length || (format >= 0 && values[format] !== CSV_FORMAT)) throw new Error(t('restore.csvInvalid'));
    rows.push({ original:decode(values[original],format>=0), replacement:decode(values[replacement],format>=0) });
  }
  validateRows(rows);
  return {rows,legacyProtected};
}

export function validateRows(rows: readonly RestoreRow[]): void {
  if(!rows.length) throw new Error(t('restore.noMapping'));
  if(rows.length>MAX_ROWS || rows.reduce((size,row)=>size+row.original.length+row.replacement.length,0)>MAX_CSV_BYTES) throw new Error(t('restore.csvLarge'));
  if(rows.reduce((size,row)=>size+row.replacement.length,0)>200_000) throw new Error(t('restore.tooComplex'));
  const seen = new Map<string,string>();
  for(const row of rows) {
    if(!row.original || !row.replacement.trim() || row.original.length>MAX_LENGTH || row.replacement.length>MAX_LENGTH) throw new Error(t('restore.csvInvalid'));
    if(seen.has(row.replacement) && seen.get(row.replacement)!==row.original) throw new Error(t('restore.conflict',{replacement:row.replacement}));
    seen.set(row.replacement,row.original);
  }
}

interface Trie { next: Map<string,Trie>; row?: RestoreRow }
export function restoreText(input:string, rows:readonly RestoreRow[]): {text:string; count:number; unresolved:string[]; counts:Map<string,number>} {
  if(input.length>MAX_LENGTH) throw new Error(t('restore.textLarge',{max:MAX_LENGTH}));
  validateRows(rows);
  const root:Trie={next:new Map()};
  for(const row of rows) {
    let node=root;
    for(let i=0;i<row.replacement.length;i++) {
      const char=row.replacement[i];
      if(!node.next.has(char)) node.next.set(char,{next:new Map()});
      node=node.next.get(char)!;
    }
    node.row=row;
  }
  const parts:string[]=[];const counts=new Map<string,number>();const unresolved=new Set<string>();
  let count=0,size=0,work=0;
  for(let i=0;i<input.length;) {
    let node=root,match:RestoreRow|undefined,end=i;
    for(let j=i;j<input.length;j++) {
      if(++work>5_000_000) throw new Error(t('restore.tooComplex'));
      const next=node.next.get(input[j]);if(!next)break;node=next;
      if(node.row){match=node.row;end=j+1;}
    }
    let value:string;
    if(match) { value=match.original;i=end;count++;counts.set(match.replacement,(counts.get(match.replacement)??0)+1); }
    else {
      // Only report unknown standard placeholders from the input, never restored originals.
      if(input[i]==='<') { const token=/^<[A-Z][A-Z0-9_]*_\d+>/.exec(input.slice(i)); if(token)unresolved.add(token[0]); }
      value=input[i++];
    }
    size+=value.length;if(size>MAX_CSV_BYTES)throw new Error(t('restore.outputLarge'));
    parts.push(value);
  }
  return {text:parts.join(''),count,unresolved:[...unresolved],counts};
}

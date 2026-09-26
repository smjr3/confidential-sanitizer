import { candidate, type Candidate, type Category } from '../types';

export interface NerEntity { entity_group?: string; entity?: string; word?: string; index?: number; start?: number; end?: number; score?: number; }
const labels: Record<string, Category> = {
  PER:'PERSON', PERSON:'PERSON', ORG:'ORG', 'ORG-P':'ORG', 'ORG-O':'ORG', P:'ORG',
  LOC:'LOCATION', LOCATION:'LOCATION', INS:'FACILITY', FAC:'FACILITY', PRD:'PRODUCT', PRODUCT:'PRODUCT', EVT:'OTHER', EVENT:'OTHER', MISC:'OTHER'
};
export function mapNerEntities(text: string, raw: NerEntity[], offset = 0): Candidate[] {
  const found: Candidate[] = [];
  for (const item of raw) {
    const label = (item.entity_group ?? item.entity ?? '').replace(/^[BI]-/, '').toUpperCase();
    if (!label || label === 'O') continue;
    const category = labels[label] ?? 'OTHER';
    if (!Number.isInteger(item.start) || !Number.isInteger(item.end)) continue;
    const start = offset + item.start!;
    const end = offset + item.end!;
    if (start < 0 || end > text.length || start >= end) continue;
    const entry = candidate(text,start,end,category,'ner',item.score);
    if (entry.text.trim()) found.push(entry);
  }
  return found;
}

// Transformers.js 3.x emits per-token labels without text offsets. Include O tokens
// so repeated words can be aligned sequentially with the original string.
export function alignTokens(text: string, tokens: NerEntity[]): NerEntity[] {
  const groups: NerEntity[]=[];
  let cursor=0;
  let previousLabel='';
  let previousIndex: number | undefined;
  for (const token of tokens) {
    const word=(token.word ?? '').trim();
    const label=(token.entity ?? '').replace(/^[BI]-/,'');
    const start=word ? text.indexOf(word,cursor) : -1;
    if (start < 0) { previousLabel=''; previousIndex=undefined; continue; }
    const end=start+word.length;
    cursor=end;
    const previous=groups.at(-1);
    const consecutive=token.index === undefined || previousIndex === undefined || token.index === previousIndex+1;
    if (label && label !== 'O') {
      if (previous && previousLabel===label && consecutive && !token.entity?.startsWith('B-') && start-previous.end!<=1) {
        previous.end=end;
        previous.score=Math.min(previous.score ?? 1,token.score ?? 1);
      } else groups.push({entity_group:label,start,end,score:token.score});
    }
    previousLabel=label;
    previousIndex=token.index;
  }
  return groups;
}

import { candidate, type Candidate, type Category } from '../types';

export interface NerEntity { entity_group?: string; entity?: string; word?: string; index?: number; start?: number; end?: number; score?: number; }
const labels: Record<string, Category> = {
  PER:'PERSON', PERSON:'PERSON', ORG:'ORG', 'ORG-P':'ORG', 'ORG-O':'ORG', P:'ORG', O:'ORG',
  LOC:'LOCATION', LOCATION:'LOCATION', INS:'FACILITY', FAC:'FACILITY', PRD:'PRODUCT', PRODUCT:'PRODUCT', EVT:'OTHER', EVENT:'OTHER', MISC:'OTHER'
};
export function mapNerEntities(text: string, raw: NerEntity[], offset = 0): Candidate[] {
  const found: Candidate[] = [];
  for (const item of raw) {
    const label = (item.entity_group ?? item.entity ?? '').replace(/^[BI]-/, '').toUpperCase();
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
  const aligned: NerEntity[] = [];
  let cursor=0;
  for (const token of tokens) {
    const word=(token.word ?? '').trim();
    if (!word) continue;
    const start=text.indexOf(word,cursor);
    if (start < 0) continue;
    const end=start+word.length;
    aligned.push({...token,start,end});
    cursor=end;
  }
  const groups: NerEntity[]=[];
  for (const token of aligned) {
    const label=(token.entity ?? '').replace(/^[BI]-/,'');
    if (!label || label === 'O') continue;
    const previous=groups.at(-1);
    const last=aligned[aligned.indexOf(token)-1];
    if (previous && last && last.entity !== 'O' && (last.entity ?? '').replace(/^[BI]-/,'')===label && !token.entity?.startsWith('B-') && token.start! - previous.end! <= 1) {
      previous.end=token.end;
      previous.score=Math.min(previous.score ?? 1,token.score ?? 1);
    } else groups.push({entity_group:label,start:token.start,end:token.end,score:token.score});
  }
  return groups;
}

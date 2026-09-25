import type { Candidate } from '../detection/types';

const priority = { manual: 3, rule: 2, ner: 1 };
export function resolved(candidates: Candidate[]): Candidate[] {
  const sorted = candidates.filter(c => c.enabled).sort((a,b) => priority[b.method]-priority[a.method] || (b.end-b.start)-(a.end-a.start) || a.start-b.start);
  const accepted: Candidate[] = [];
  for (const item of sorted) if (!accepted.some(c => c.start < item.end && item.start < c.end)) accepted.push(item);
  return accepted.sort((a,b)=>a.start-b.start);
}
export interface Assignment { candidate: Candidate; replacement: string }
export function assignments(candidates: Candidate[]): Assignment[] {
  const spans = resolved(candidates);
  const values = new Map<string,string>();
  const counts = new Map<string,number>();
  return spans.map(item => {
    const key = `${item.category}\u0000${item.text}`;
    if (!values.has(key)) {
      const count = (counts.get(item.category) ?? 0) + 1;
      counts.set(item.category,count);
      values.set(key,item.replacement?.trim() || `<${item.category}_${String(count).padStart(2,'0')}>`);
    }
    return {candidate:item,replacement:values.get(key)!};
  });
}
export function anonymize(text: string, candidates: Candidate[]): string {
  let result = '';
  let cursor = 0;
  for (const {candidate:item,replacement} of assignments(candidates)) {
    result += text.slice(cursor,item.start);
    result += replacement;
    cursor = item.end;
  }
  return result + text.slice(cursor);
}

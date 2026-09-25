import type { Candidate } from '../detection/types';

const priority = { manual: 3, rule: 2, ner: 1 };
export function resolved(candidates: Candidate[]): Candidate[] {
  const sorted = candidates.filter(c => c.enabled).sort((a,b) => priority[b.method]-priority[a.method] || (b.end-b.start)-(a.end-a.start) || a.start-b.start);
  const accepted: Candidate[] = [];
  for (const item of sorted) if (!accepted.some(c => c.start < item.end && item.start < c.end)) accepted.push(item);
  return accepted.sort((a,b)=>a.start-b.start);
}
export function anonymize(text: string, candidates: Candidate[]): string {
  const spans = resolved(candidates);
  const values = new Map<string,string>();
  const counts = new Map<string,number>();
  let result = '';
  let cursor = 0;
  for (const item of spans) {
    result += text.slice(cursor,item.start);
    const key = `${item.category}\u0000${item.text}`;
    if (!values.has(key)) {
      const count = (counts.get(item.category) ?? 0) + 1;
      counts.set(item.category,count);
      values.set(key,`<${item.category}_${String(count).padStart(2,'0')}>`);
    }
    result += values.get(key);
    cursor = item.end;
  }
  return result + text.slice(cursor);
}

import { selectNonOverlapping } from '../detection/overlap';
import type { Candidate, Category } from '../detection/types';

/** Category selection affects output without discarding individual candidate choices. */
export function withCategories(candidates: Candidate[], selected: ReadonlySet<Category>): Candidate[] {
  return candidates.map(item => selected.has(item.category) ? item : {...item,enabled:false});
}

const priority = { manual: 3, rule: 2, ner: 1 };
export function resolved(candidates: Candidate[]): Candidate[] {
  const sorted = candidates.filter(c => c.enabled).sort((a,b) => priority[b.method]-priority[a.method] || (b.end-b.start)-(a.end-a.start) || a.start-b.start);
  return selectNonOverlapping(sorted).sort((a,b)=>a.start-b.start);
}
export interface Assignment { candidate: Candidate; replacement: string }
export function assignments(candidates: Candidate[]): Assignment[] {
  const spans = resolved(candidates);
  const values = new Map<string,string>();
  const counts = new Map<string,number>();
  const reserved = new Set(spans.map(item=>item.replacement?.trim()).filter((value):value is string=>!!value));
  return spans.map(item => {
    const key = `${item.category}\u0000${item.text}`;
    if (!values.has(key)) {
      let count = (counts.get(item.category) ?? 0) + 1;
      let replacement = item.replacement?.trim();
      if (!replacement) {
        while (reserved.has(`<${item.category}_${String(count).padStart(2,'0')}>`)) count++;
        replacement = `<${item.category}_${String(count).padStart(2,'0')}>`;
      }
      counts.set(item.category,count);
      values.set(key,replacement);
    }
    return {candidate:item,replacement:values.get(key)!};
  });
}
export function anonymize(text: string, candidates: Candidate[]): string {
  return applyAssignments(text, assignments(candidates));
}
export function applyAssignments(text: string, spans: Assignment[]): string {
  let result = '';
  let cursor = 0;
  for (const {candidate:item,replacement} of spans) {
    result += text.slice(cursor,item.start);
    result += replacement;
    cursor = item.end;
  }
  return result + text.slice(cursor);
}

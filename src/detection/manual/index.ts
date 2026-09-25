import { candidate, type Candidate, type Category } from '../types';

export function addManual(text: string, start: number, end: number, category: Category): Candidate[] {
  if (start < 0 || end > text.length || start >= end || !text.slice(start,end).trim()) return [];
  const term = text.slice(start,end);
  const results: Candidate[] = [];
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(term, from);
    if (index < 0) break;
    results.push(candidate(text,index,index+term.length,category,'manual'));
    from = index + term.length;
  }
  return results;
}

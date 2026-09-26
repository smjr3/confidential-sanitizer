import type { Candidate, Category } from '../detection/types';
import { assignments, type Assignment } from './index';

export interface MappingRow { original: string; replacement: string; category: Category; count: number }
export function mappingRows(candidates: Candidate[]): MappingRow[] {
  return mappingFromAssignments(assignments(candidates));
}
export function mappingFromAssignments(spans: Assignment[]): MappingRow[] {
  const rows = new Map<string, MappingRow>();
  for (const {candidate, replacement} of spans) {
    const key = `${candidate.category}\u0000${candidate.text}\u0000${replacement}`;
    const existing = rows.get(key);
    if (existing) existing.count++;
    else rows.set(key, {original:candidate.text, replacement, category:candidate.category, count:1});
  }
  return [...rows.values()];
}

const headings = ['元の文字列','置換先','種別','箇所数'];
function cells(row: MappingRow): string[] { return [row.original,row.replacement,row.category,String(row.count)]; }
// Prevent spreadsheet programs from interpreting user text as a formula.
function safeCell(value: string): string {
  return /^[\s\uFEFF]*[=+\-@]/u.test(value) ? `'${value}` : value;
}
export function mappingCsv(rows: MappingRow[]): string {
  return [headings,...rows.map(cells)].map(row => row.map(value => `"${safeCell(value).replaceAll('"','""')}"`).join(',')).join('\r\n') + '\r\n';
}
export function mappingTsv(rows: MappingRow[]): string {
  return [headings,...rows.map(cells)].map(row => row.map(value => safeCell(value).replaceAll('\t','\\t').replaceAll('\r','\\r').replaceAll('\n','\\n')).join('\t')).join('\n');
}

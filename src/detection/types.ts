import catalog from '../content/ja.json';
export const CATEGORIES = ['PERSON','ORG','LOCATION','FACILITY','PRODUCT','SYSTEM','PROJECT','EMAIL','PHONE','IP','URL','HOST','DOMAIN','POSTAL','MYNUMBER','CORPORATE_ID','CREDIT_CARD','OTHER'] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_LABELS: Record<Category,string> = catalog.categories;
export type Method = 'rule' | 'ner' | 'manual';
export interface Candidate {
  id: string;
  start: number;
  end: number;
  text: string;
  category: Category;
  method: Method;
  enabled: boolean;
  confidence?: number;
  replacement?: string;
}
export function candidate(text: string, start: number, end: number, category: Category, method: Method, confidence?: number): Candidate {
  return { id: `${method}:${category}:${start}:${end}:${text.slice(start,end)}`, start, end, text: text.slice(start,end), category, method, enabled: true, confidence };
}

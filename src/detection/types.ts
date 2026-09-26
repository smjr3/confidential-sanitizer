export const CATEGORIES = ['PERSON','ORG','LOCATION','FACILITY','PRODUCT','SYSTEM','PROJECT','EMAIL','PHONE','IP','URL','HOST','DOMAIN','POSTAL','MYNUMBER','CORPORATE_ID','CREDIT_CARD','OTHER'] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_LABELS: Record<Category,string> = {
  PERSON:'氏名', ORG:'企業・団体', LOCATION:'地名', FACILITY:'施設', PRODUCT:'製品',
  SYSTEM:'システム', PROJECT:'案件・プロジェクト', EMAIL:'メールアドレス', PHONE:'電話番号',
  IP:'IPアドレス', URL:'URL', HOST:'ホスト名', DOMAIN:'ドメイン', POSTAL:'郵便番号',
  MYNUMBER:'マイナンバー', CORPORATE_ID:'法人番号', CREDIT_CARD:'クレジットカード', OTHER:'その他'
};
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

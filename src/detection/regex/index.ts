import { candidate, type Candidate, type Category } from '../types';
import { selectNonOverlapping } from '../overlap';
import { corporateId, ipv4, luhn, myNumber } from '../validators';

interface Rule { category: Category; pattern: RegExp; valid?: (value: string, context: string) => boolean; }
const rules: Rule[] = [
  { category: 'URL', pattern: /https?:\/\/[^\s<>"'）]+/gi },
  { category: 'EMAIL', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { category: 'IP', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, valid: ipv4 },
  { category: 'MYNUMBER', pattern: /(?<!\d)(?:\d{12}|\d{4}[ -]\d{4}[ -]\d{4})(?!\d)/g, valid: myNumber },
  { category: 'CORPORATE_ID', pattern: /(?<!\d)\d{13}(?!\d)/g, valid: corporateId },
  { category: 'CREDIT_CARD', pattern: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, valid: (value) => /^(?:3[47]|4|5[1-5]|6(?:011|5))/.test(value.replace(/[ -]/g,'')) && luhn(value) },
  { category: 'PHONE', pattern: /(?<![\d.])(?:0\d{1,4}[-‐‑]?\d{1,4}[-‐‑]?\d{4})(?!\d)/g, valid: (value) => { const n=value.replace(/\D/g,''); return n.length >= 10 && n.length <= 11 && n[0] === '0'; } },
  { category: 'POSTAL', pattern: /(?:〒\s*)?(?<!\d)\d{3}-\d{4}(?!\d)/g },
  { category: 'LOCATION', pattern: /(?:北海道|東京都|京都府|大阪府|[一-龥]{2,3}県)(?:[一-龥ぁ-んァ-ヶ\d０-９-]{2,30})(?:\d+(?:丁目|番地|番|号|-\d+)+)/g },
  { category: 'HOST', pattern: /\b[a-zA-Z][a-zA-Z0-9-]{1,62}(?:\.[a-zA-Z0-9-]{1,63})+\.(?:local|internal|corp)\b/g },
  { category: 'DOMAIN', pattern: /\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g },
  { category: 'HOST', pattern: /\b(?:srv|server|host|db|app|web|node)[-_][a-zA-Z0-9][a-zA-Z0-9_-]{1,40}\b/gi },
];

// Rule additions live here; avoid collecting client-specific identifiers in source code.
export function detectRules(text: string, extraRules: Rule[] = []): Candidate[] {
  const found: Candidate[] = [];
  for (const rule of [...rules, ...extraRules]) {
    for (const match of text.matchAll(rule.pattern)) {
      const value = match[0];
      if (rule.valid && !rule.valid(value, text)) continue;
      found.push(candidate(text, match.index, match.index + value.length, rule.category, 'rule'));
    }
  }
  // A URL or email contains a domain; present only the most specific rule.
  return selectNonOverlapping(found.sort((a,b)=>(b.end-b.start)-(a.end-a.start)))
    .sort((a,b)=>a.start-b.start);
}

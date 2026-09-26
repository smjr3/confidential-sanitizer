import { describe, it, expect } from 'vitest';
import { candidate, type Candidate } from '../src/detection/types';
import { selectNonOverlapping } from '../src/detection/overlap';
import { mergeCandidates } from '../src/detection/state';
import { alignTokens, mapNerEntities } from '../src/detection/ner';
import { detectRules } from '../src/detection/regex';
import { assignments, anonymize } from '../src/anonymize';
import { corporateId } from '../src/detection/validators';

describe('review regressions', () => {
  it('uses the corporate check digit from the official NTA example', () => {
    // https://www.houjin-bangou.nta.go.jp/documents/checkdigit.pdf
    expect(corporateId('8700110005901')).toBe(true);
    expect(corporateId('1700110005901')).toBe(false);
  });
  it('preserves exclusions, edited category and replacement when refreshing rules', () => {
    const text='test@example.com 株式会社ABC';
    const old=detectRules(text);
    old[0].enabled=false; old[0].category='OTHER'; old[0].replacement='<CUSTOM>';
    const org=candidate(text,17,text.length,'ORG','ner',.9);
    const manual=candidate(text,17,text.length,'OTHER','manual');
    const next=mergeCandidates([...old,org,manual],detectRules(text),['rule']);
    expect(next).toContain(org); expect(next).toContain(manual);
    expect(next.find(c=>c.id===old[0].id)).toMatchObject({enabled:false,category:'OTHER',replacement:'<CUSTOM>'});
  });
  it('refreshes NER without discarding manual decisions and removes stale NER candidates', () => {
    const text='山田太郎';
    const old=candidate(text,0,4,'PERSON','ner',.9);
    const manual=candidate(text,0,4,'OTHER','manual');manual.enabled=false;
    expect(mergeCandidates([old,manual],[],['ner'])).toEqual([manual]);
    expect(mergeCandidates([manual],[candidate(text,0,4,'OTHER','manual')],[])[0].enabled).toBe(false);
  });
  it('reserves custom placeholders to avoid collisions with automatic placeholders', () => {
    const text='a@example.com b@example.com c@example.com';
    const found=detectRules(text);
    found[0].replacement='<EMAIL_02>';
    expect(assignments(found).map(a=>a.replacement)).toEqual(['<EMAIL_02>','<EMAIL_03>','<EMAIL_04>']);
    expect(new Set(assignments(found).map(a=>a.replacement)).size).toBe(3);
  });
  it('retains manual priority and allows touching intervals', () => {
    const text='abcdefgh';
    const found=[candidate(text,0,8,'ORG','ner'),candidate(text,0,4,'SYSTEM','manual'),candidate(text,4,8,'OTHER','manual')];
    expect(anonymize(text,found)).toBe('<SYSTEM_01><OTHER_01>');
  });
  it.each([12,64,500,10000])('matches the previous overlap algorithm for %i candidates', count => {
    let seed=713;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    const text='x'.repeat(20000);
    const items=Array.from({length:count},()=>{const start=random()%19900;return candidate(text,start,start+1+random()%100,'OTHER','rule');});
    const reference:Candidate[]=[];
    for(const item of items)if(!reference.some(c=>c.start<item.end && item.start<c.end))reference.push(item);
    expect(selectNonOverlapping(items)).toEqual(reference);
  });
  it('handles ten thousand adjacent matches without dropping any', () => {
    const text='x'.repeat(10000);
    const items=Array.from({length:10000},(_,start)=>candidate(text,start,start+1,'OTHER','manual'));
    expect(selectNonOverlapping(items)).toEqual(items);
  });
  it('does not turn outside labels or missing labels into organizations', () => {
    expect(mapNerEntities('文章',[{entity:'O',start:0,end:2},{start:0,end:2}])).toEqual([]);
  });
  it('honors BIO boundaries even for immediately adjacent names', () => {
    expect(alignTokens('山田太郎佐藤',[{word:'山田',entity:'B-PER',index:1},{word:'太郎',entity:'I-PER',index:2},{word:'佐藤',entity:'B-PER',index:3}]).map(e=>[e.start,e.end])).toEqual([[0,4],[4,6]]);
  });
  it('does not join across an unaligned token or a missing index', () => {
    expect(alignTokens('山田太郎',[{word:'山田',entity:'PER',index:1},{word:'[UNK]',entity:'PER',index:2},{word:'太郎',entity:'PER',index:3}])).toHaveLength(2);
    expect(alignTokens('山田太郎',[{word:'山田',entity:'PER',index:1},{word:'太郎',entity:'PER',index:3}])).toHaveLength(2);
  });
});

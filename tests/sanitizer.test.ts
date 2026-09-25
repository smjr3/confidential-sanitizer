import { describe,it,expect } from 'vitest';
import { detectRules } from '../src/detection/regex';
import { myNumber, corporateId, luhn } from '../src/detection/validators';
import { anonymize } from '../src/anonymize';
import { addManual } from '../src/detection/manual';
import { alignTokens, mapNerEntities } from '../src/detection/ner';

describe('rules', () => {
  it.each([
    ['EMAIL','test@example.com'],['PHONE','090-1234-5678'],['IP','10.20.1.10'],
    ['URL','https://example.com/path'],['POSTAL','100-0001']
  ] as const)('detects %s', (category,value) => {
    expect(detectRules(`連絡先: ${value}`).some(c=>c.category===category && c.text===value)).toBe(true);
  });
  it('validates My Number check digit', () => {
    expect(myNumber('123456789018')).toBe(true);
    expect(myNumber('123456789019')).toBe(false);
    expect(detectRules('123456789018').some(c=>c.category==='MYNUMBER')).toBe(true);
  });
  it('validates corporate ID check digit', () => {
    expect(corporateId('1700110005901')).toBe(true);
    expect(corporateId('2700110005901')).toBe(false);
    expect(detectRules('1700110005901').some(c=>c.category==='CORPORATE_ID')).toBe(true);
  });
  it('validates a Luhn card and rejects an invalid number', () => {
    expect(luhn('4111 1111 1111 1111')).toBe(true);
    expect(luhn('4111 1111 1111 1112')).toBe(false);
    expect(detectRules('4111 1111 1111 1111').some(c=>c.category==='CREDIT_CARD')).toBe(true);
  });
  it('aligns adjacent subword tokens and separates entities across O tokens', () => {
    const text='山田太郎が山田太郎';
    const tokens=alignTokens(text,[
      {word:'山田',entity:'PER',score:.9,index:1}, {word:'太郎',entity:'PER',score:.8,index:2},
      {word:'が',entity:'O',score:.9,index:3}, {word:'山田',entity:'PER',score:.9,index:4},
      {word:'太郎',entity:'PER',score:.8,index:5}
    ]);
    expect(tokens.map(t=>[t.start,t.end,t.entity_group])).toEqual([[0,4,'PER'],[5,9,'PER']]);
  });
});
describe('anonymization', () => {
  it('reuses placeholder for repeated text and honors exclusion', () => {
    const input='test@example.com と test@example.com';
    const found=detectRules(input);
    expect(anonymize(input,found)).toBe('<EMAIL_01> と <EMAIL_01>');
    found[0].enabled=false;
    expect(anonymize(input,found)).toContain('test@example.com');
  });
  it('adds every occurrence from selected text', () => {
    const input='販売管理システムと販売管理システム';
    const found=addManual(input,0,8,'SYSTEM');
    expect(found).toHaveLength(2);
    expect(anonymize(input,found)).toBe('<SYSTEM_01>と<SYSTEM_01>');
  });
  it.each([
    ['株式会社ABC','ORG','ORG'],
    ['一般社団法人XYZ','ORG-O','ORG'],
    ['山田太郎','PER','PERSON'],
    ['東京データセンター','INS','FACILITY'],
    ['新製品A','PRD','PRODUCT']
  ] as const)('imports NER %s', (text,label,category) => {
    const found=mapNerEntities(text,[{entity_group:label,start:0,end:text.length,score:.92}]);
    expect(found[0]).toMatchObject({text,category,method:'ner',confidence:.92});
  });
});

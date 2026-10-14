import { expect,it } from 'vitest';
import { ImportedDictionary,preferImported } from '../src/detection/imported';
import { applyAssignments,assignments } from '../src/anonymize';
import { detectRules } from '../src/detection/regex';
import { mappingCsv,mappingFromAssignments } from '../src/anonymize/report';
import { parseMappingCsv,restoreText } from '../src/restore';

it('reuses CSV categories and custom replacements, supports literal Unicode and longest matches',()=>{
  const dictionary=new ImportedDictionary([
    {original:'顧客',replacement:'<ORG_01>'},
    {original:'顧客ABC',replacement:'会社A',category:'ORG'},
    {original:'$&[x]😀',replacement:'<SYSTEM_09>'}
  ]);
  const text='顧客ABCと顧客。$&[x]😀 $&[x]😀';
  const spans=assignments(dictionary.find(text),dictionary.reserved);
  expect(applyAssignments(text,spans)).toBe('会社Aと<ORG_01>。<SYSTEM_09> <SYSTEM_09>');
  expect(spans.map(s=>s.candidate.category)).toEqual(['ORG','ORG','SYSTEM','SYSTEM']);
  const rows=parseMappingCsv(mappingCsv(mappingFromAssignments(spans))).rows;
  expect(restoreText(applyAssignments(text,spans),rows).text).toBe(text);
});
it('reserves even absent or disabled imported placeholders against new automatic assignments',()=>{
  const dictionary=new ImportedDictionary([{original:'old@example.com',replacement:'<EMAIL_01>'}]);
  const text='new@example.com';
  expect(applyAssignments(text,assignments(detectRules(text),dictionary.reserved))).toBe('<EMAIL_02>');
});
it('keeps unchecked imports from being replaced by duplicate rules',()=>{
  const text='old@example.com';
  const dictionary=new ImportedDictionary([{original:text,replacement:'<EMAIL_05>'}]);
  const imported=dictionary.find(text);imported[0].enabled=false;
  const candidates=preferImported([...detectRules(text),...imported]);
  expect(candidates).toHaveLength(1);expect(applyAssignments(text,assignments(candidates))).toBe(text);
});
it('deduplicates identical rows and rejects conflicting, ineffective and excessive mappings',()=>{
  const row={original:'顧客',replacement:'<ORG_01>'};
  expect(new ImportedDictionary([row,row]).rows).toHaveLength(1);
  for(const rows of [
    [row,{...row,replacement:'<ORG_02>'}],
    [row,{...row,original:'別顧客'}],
    [{original:'顧客',replacement:'顧客'}],
    [{original:' ',replacement:'<ORG_01>'}],
    [{original:'顧客',replacement:' padded '}],
    Array(5001).fill(row)
  ])expect(()=>new ImportedDictionary(rows)).toThrow();
});
it('falls back to OTHER for unknown codes without changing the custom replacement',()=>{
  const dictionary=new ImportedDictionary([{original:'顧客',replacement:'顧客A',category:'unknown'}]);
  expect(dictionary.rows[0].category).toBe('OTHER');expect(dictionary.find('顧客')[0].replacement).toBe('顧客A');
});
it('bounds pathological matching work and output expansion',()=>{
  expect(()=>new ImportedDictionary([{original:'a'.repeat(10000)+'b',replacement:'x'}]).find('a'.repeat(20000))).toThrow('複雑');
  expect(()=>new ImportedDictionary([{original:'a',replacement:'x'.repeat(20000)}]).find('a'.repeat(20000))).toThrow('大きすぎ');
});

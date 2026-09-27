import { describe,it,expect } from 'vitest';
import { parseMappingCsv,restoreText,validateRows } from '../src/restore';
import { mappingCsv,type MappingRow } from '../src/anonymize/report';
const rows=[{original:'山田太郎',replacement:'<PERSON_01>'},{original:'株式会社サンプル',replacement:'<ORG_01>'}];
describe('reverse masking',()=>{
  it('restores repeated placeholders without requiring the original sentence',()=>{
    const result=restoreText('<PERSON_01>様。<ORG_01>へ<PERSON_01>が連絡。',rows);
    expect(result.text).toBe('山田太郎様。株式会社サンプルへ山田太郎が連絡。');expect(result.count).toBe(3);
    expect(result.counts.get('<PERSON_01>')).toBe(2);
  });
  it('does not recursively replace restored text or interpret regex syntax',()=>{
    expect(restoreText('$&[x] + <ORG_01>',[{original:'<ORG_01>',replacement:'$&[x]'},{original:'$1',replacement:'<ORG_01>'}]).text).toBe('<ORG_01> + $1');
  });
  it('chooses the longest overlapping literal and handles Unicode',()=>{
    expect(restoreText('顧客ABと顧客A 😀', [{original:'長い名前',replacement:'顧客AB'},{original:'短い名前',replacement:'顧客A'},{original:'😊',replacement:'😀'}]).text).toBe('長い名前と短い名前 😊');
  });
  it('reports unknown standard placeholders and leaves modified placeholders untouched',()=>{
    const result=restoreText('<PERSON_02> <PERSON_02> <person_01> ＜PERSON_01＞ <PERSON_01>',rows);
    expect(result.unresolved).toEqual(['<PERSON_02>']);expect(result.count).toBe(1);expect(result.text).toContain('＜PERSON_01＞');
  });
  it('blocks ambiguous mappings while allowing duplicate identical rows',()=>{
    expect(()=>validateRows([...rows,{original:'別の人',replacement:'<PERSON_01>'}])).toThrow('複数');
    expect(restoreText('<PERSON_01>',[rows[0],rows[0]]).text).toBe('山田太郎');
  });
  it('limits input, mapping and expanded output sizes',()=>{
    expect(()=>restoreText('x'.repeat(20001),rows)).toThrow();
    expect(()=>validateRows(Array(5001).fill(rows[0]))).toThrow();
    expect(()=>restoreText('x'.repeat(20000),[{original:'大'.repeat(20000),replacement:'x'}])).toThrow('大きすぎ');
  });
});
describe('mapping CSV import',()=>{
  it('round-trips current exports including formula protection, quotes, commas, newlines and leading apostrophes',()=>{
    const values=['日本語,"引用"\r\n改行','=SUM(1,1)',"'=original","''quote",'+123',' -123','@text','<script>alert(1)</script>'];
    const rows:MappingRow[]=values.map((original,i)=>({original,replacement:i%2 ? "'="+i : `<OTHER_${i}>`,category:'OTHER',count:1}));
    const parsed=parseMappingCsv('\uFEFF'+mappingCsv(rows));
    expect(parsed.rows).toEqual(rows.map(({original,replacement})=>({original,replacement})));expect(parsed.legacyProtected).toBe(false);
  });
  it('reads older four-column exports without dropping literal apostrophes',()=>{
    const csv='"元の文字列","置換先","種別","箇所数"\r\n"\'=1","<OTHER_01>","OTHER","1"\r\n';
    expect(parseMappingCsv(csv)).toEqual({rows:[{original:"'=1",replacement:'<OTHER_01>'}],legacyProtected:true});
    expect(parseMappingCsv(csv,true).rows[0].original).toBe('=1');
  });
  it('accepts BOM, LF, empty trailing records and the essential columns',()=>{
    expect(parseMappingCsv('\uFEFF元の文字列,置換先\n山田太郎,<PERSON_01>\n\n').rows).toEqual([rows[0]]);
  });
  it.each(['foo,bar\na,b','元の文字列,置換先\n"unfinished,x','元の文字列,置換先\n"a"junk,b','元の文字列,置換先\na,b,c','元の文字列,置換先\n,token','元の文字列,置換先\na,','元の文字列,置換先,復元形式\na,b,unknown'])('rejects malformed or unsupported CSV atomically: %s',csv=>{
    expect(()=>parseMappingCsv(csv)).toThrow();
  });
});

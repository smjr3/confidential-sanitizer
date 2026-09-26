import { expect,it,vi } from 'vitest';
import catalog from '../src/content/ja.json';
import { t,htmlText } from '../src/content/text';
import { appTemplate } from '../src/ui/template';
vi.mock('../src/model/config',()=>({appBase:()=> 'https://example.test/project/'}));
it('formats changing counts and treats replacement values as literal text',()=>{
  expect(t('input.length',{count:10,max:20000})).toContain('20000');
  expect(t('input.length',{count:10,max:20000})).not.toContain('{count}');
  expect(t('manual.selected',{text:'{text} $& <script>'})).toContain('{text} $& <script>');
  expect(htmlText('manual.selected',{text:'"<&'})).toContain('&quot;&lt;&amp;');
});
it('reflects catalog edits in visible labels and escapes markup in attributes',()=>{
  const label=catalog.messages['button.check'];const placeholder=catalog.messages['input.placeholder'];
  try{
    catalog.messages['button.check']='確認 & 開始';
    catalog.messages['input.placeholder']='"><img src=x onerror=alert(1)>';
    const template=appTemplate();
    expect(template).toContain('確認 &amp; 開始');
    expect(template).toContain('placeholder="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    expect(template).not.toContain('<img src=x');
  }finally{catalog.messages['button.check']=label;catalog.messages['input.placeholder']=placeholder;}
});

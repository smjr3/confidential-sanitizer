import './ui/style.css';
import { detectRules } from './detection/regex';
import { mapNerEntities } from './detection/ner';
import { addManual } from './detection/manual';
import { CATEGORIES, type Candidate, type Category } from './detection/types';
import { anonymize, resolved } from './anonymize';
import { ModelLoader } from './model/loader';
import { MAX_LENGTH, privacyNotice } from './security/policy';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header><div class="shell"><span class="eyebrow">CONFIDENTIAL SANITIZER · PoC</span><h1>機密情報チェック・匿名化</h1><p>${privacyNotice}</p></div></header>
<main class="shell"><div class="workflow"><span>01 入力</span><span>02 候補を確認</span><span>03 匿名化してコピー</span></div>
<section class="panel"><div class="section-heading"><h2>入力文章</h2><span id="length">0 / ${MAX_LENGTH}文字</span></div><textarea id="source" maxlength="${MAX_LENGTH}" spellcheck="false" placeholder="ここに文章を貼り付けてください。入力した内容は保存されません。"></textarea><div class="toolbar"><button id="check" class="primary">高速チェック</button><button id="ner">固有名詞も検出（約279MB）</button><button id="clear" class="quiet">入力を消去</button></div><p class="hint">手動追加：入力欄で文字列を選択 → 種別を選択 →「匿名化対象に追加」。同じ文字列をまとめて追加します。</p><div class="toolbar"><select id="manual-category" aria-label="手動追加する情報の種別"></select><button id="manual">選択した文字列を匿名化対象に追加</button></div><p id="status" role="status"></p></section>
<section class="panel"><div class="section-heading"><h2>検出候補</h2><span id="count">0件</span></div><div id="highlight" class="preview" aria-label="文章中の検出箇所"></div><div id="candidates" class="candidates"></div></section>
<section class="panel"><div class="section-heading"><h2>匿名化後の文章</h2><button id="copy" class="primary">コピー</button></div><textarea id="output" readonly aria-label="匿名化後の文章"></textarea><p class="hint">コピー前に必ず全文を目視確認してください。検知漏れ・誤検知があります。</p></section></main>`;
const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const source = $<HTMLTextAreaElement>('source');
const output = $<HTMLTextAreaElement>('output');
const status = $<HTMLParagraphElement>('status');
const category = $<HTMLSelectElement>('manual-category');
for (const value of CATEGORIES) category.add(new Option(value,value));
category.value='SYSTEM';
let candidates: Candidate[] = [];
let revision = 0;
let busy = false;
let checked = false;
const loader = new ModelLoader();

function refresh(): void {
  $('length').textContent = `${source.value.length} / ${MAX_LENGTH}文字`;
  $('count').textContent = `${candidates.length}件`;
  output.value = checked ? anonymize(source.value,candidates) : '';
  ($<HTMLButtonElement>('copy')).disabled = !checked || !source.value;
  const preview = $('highlight');
  preview.replaceChildren();
  const spans = resolved(candidates);
  let cursor = 0;
  for (const item of spans) {
    preview.append(document.createTextNode(source.value.slice(cursor,item.start)));
    const mark = document.createElement('mark');
    mark.textContent = item.text;
    mark.title = `${item.category} / ${item.method}`;
    preview.append(mark);
    cursor = item.end;
  }
  preview.append(document.createTextNode(source.value.slice(cursor)));
  const list = $('candidates');
  list.replaceChildren();
  for (const item of candidates) {
    const row = document.createElement('label');
    row.className = 'candidate';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = item.enabled;
    checkbox.addEventListener('change', () => { item.enabled=checkbox.checked; refresh(); });
    const value = document.createElement('span'); value.className='candidate-value'; value.textContent=item.text;
    const tag = document.createElement('span'); tag.className='tag'; tag.textContent=item.category;
    const method = document.createElement('small'); method.textContent = `${item.method === 'rule' ? 'ルール' : item.method === 'manual' ? '手動' : 'NER'}${item.confidence === undefined ? '' : ` · 信頼度 ${Math.round(item.confidence*100)}%`}`;
    row.append(checkbox,value,tag,method); list.append(row);
  }
  if (!candidates.length) list.textContent='まだ候補がありません。文章を入力してチェックしてください。';
}
function merge(incoming: Candidate[]): void {
  const previous = new Map(candidates.map(c => [c.id,c.enabled]));
  candidates = [...candidates.filter(c => c.method === 'manual'), ...incoming.filter(c => c.method !== 'manual')]
    .filter((c,i,all)=>all.findIndex(x=>x.id===c.id)===i)
    .sort((a,b)=>a.start-b.start || b.end-a.end);
  for (const item of candidates) if (previous.has(item.id)) item.enabled=previous.get(item.id)!;
  refresh();
}
source.addEventListener('input', () => { revision++; candidates=[]; checked=false; status.textContent='文章が変更されました。もう一度チェックしてください。'; refresh(); });
$('check').addEventListener('click', () => {
  revision++;
  checked=true;
  merge(detectRules(source.value));
  status.textContent='高速チェックが完了しました。';
});
$('ner').addEventListener('click', async () => {
  if (busy || !source.value.trim()) return;
  busy=true;
  ($<HTMLButtonElement>('ner')).disabled=true;
  const current = revision;
  const input = source.value;
  checked=true;
  merge(detectRules(input));
  try {
    const entities = await loader.analyze(input, message => { if (current === revision) status.textContent=message; });
    if (current !== revision) { status.textContent='入力が変更されたため、古いNER結果を破棄しました。'; return; }
    merge([...detectRules(input),...entities.flatMap(item => mapNerEntities(input,[item],item.offset))]);
    status.textContent='固有名詞の検出が完了しました。候補を確認してください。';
  } catch(e) { status.textContent=e instanceof Error ? e.message : 'NERの解析に失敗しました。'; }
  finally { busy=false; ($<HTMLButtonElement>('ner')).disabled=false; }
});
$('manual').addEventListener('click', () => {
  const found = addManual(source.value,source.selectionStart,source.selectionEnd,category.value as Category);
  if (!found.length) { status.textContent='入力欄で追加したい文字列を選択してください。'; return; }
  const byId = new Map([...candidates,...found].map(c=>[c.id,c]));
  checked=true;
  candidates=[...byId.values()].sort((a,b)=>a.start-b.start);
  status.textContent=`手動で${found.length}箇所を追加しました。`; refresh();
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(output.value); status.textContent='匿名化後の文章をコピーしました。'; }
  catch { output.focus(); output.select(); status.textContent='コピーできませんでした。出力欄を選択して手動でコピーしてください。'; }
});
$('clear').addEventListener('click', () => { revision++; source.value=''; candidates=[]; checked=false; output.value=''; status.textContent='入力を消去しました。'; loader.dispose(); refresh(); source.focus(); });
refresh();

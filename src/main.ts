import { detectRules } from './detection/regex';
import { mapNerEntities } from './detection/ner';
import { addManual } from './detection/manual';
import { CATEGORIES, type Candidate, type Category } from './detection/types';
import { anonymize, assignments } from './anonymize';
import { ModelLoader } from './model/loader';
import { MAX_LENGTH, privacyNotice } from './security/policy';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header><div class="shell"><span class="eyebrow">CONFIDENTIAL SANITIZER · PoC</span><h1>機密情報チェック・匿名化</h1><div class="privacy-callout"><strong>入力した文章は外部へ送信されません</strong><p>${privacyNotice}</p></div></div></header>
<main class="shell"><div class="workflow"><span>01 入力</span><span>02 候補を確認</span><span>03 匿名化してコピー</span></div>
<section class="panel"><div class="section-heading"><h2>入力文章</h2><span id="length">0 / ${MAX_LENGTH}文字</span></div><textarea id="source" maxlength="${MAX_LENGTH}" spellcheck="false" placeholder="ここに文章を貼り付けてください。入力した内容は保存されません。"></textarea><div class="toolbar"><button id="check" class="primary">形式が決まった情報をチェック</button><button id="ner">名前・組織名もチェック</button><button id="clear" class="quiet">入力を消去</button></div><p class="hint">メール・電話・IPなどを先に確認できます。名前や組織名は、ブラウザ内のAIで追加確認できます。</p><p id="status" role="status"></p></section>
<section class="panel" id="results"><div class="section-heading"><h2>検出候補と見落としの確認</h2><span id="count">0件</span></div><p class="hint before-preview">検出箇所は色付きで表示します。見落とした名前や案件名は、この文章上で選択して追加できます。</p><div id="highlight" class="preview" aria-label="文章中の検出箇所"></div><div class="manual-add"><span id="selected-text" class="selected-text">追加する文字列を上の文章から選択</span><select id="manual-category" aria-label="手動追加する情報の種別"></select><button id="manual" disabled>匿名化対象に追加</button></div><p class="hint">同じ文字列が複数ある場合は、すべて候補に追加します。候補の種別や置換後の文字列も下で変更できます。</p><div id="candidates" class="candidates"></div></section>
<section class="panel"><div class="section-heading"><h2>匿名化後の文章</h2><button id="copy" class="primary">コピー</button></div><p id="copy-feedback" class="copy-feedback" role="status" aria-live="polite"></p><textarea id="output" readonly aria-label="匿名化後の文章"></textarea><p class="hint">コピー前に必ず全文を目視確認してください。検知漏れ・誤検知があります。</p></section></main>`;
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
let selected: {start:number;end:number} | null = null;
const loader = new ModelLoader();

function refresh(): void {
  $('length').textContent = `${source.value.length} / ${MAX_LENGTH}文字`;
  $('count').textContent = `${candidates.length}件`;
  output.value = checked ? anonymize(source.value,candidates) : '';
  const copy = $<HTMLButtonElement>('copy');
  copy.disabled = !checked || !source.value;
  copy.textContent = 'コピー';
  $('copy-feedback').textContent = '';
  const preview = $('highlight');
  preview.replaceChildren();
  const spans = assignments(candidates);
  let cursor = 0;
  for (const {candidate:item,replacement} of spans) {
    preview.append(document.createTextNode(source.value.slice(cursor,item.start)));
    const mark = document.createElement('mark');
    mark.textContent = item.text;
    mark.dataset.method = item.method;
    mark.title = `${item.category} → ${replacement}`;
    preview.append(mark);
    cursor = item.end;
  }
  preview.append(document.createTextNode(source.value.slice(cursor)));
  if (!source.value) preview.textContent = 'チェックした文章がここに表示されます。';
  const replacementById = new Map(spans.map(({candidate:item,replacement}) => [item.id,replacement]));
  const list = $('candidates');
  list.replaceChildren();
  for (const item of candidates) {
    const row = document.createElement('div');
    row.className = 'candidate';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = item.enabled; checkbox.setAttribute('aria-label', `${item.text}を匿名化する`);
    checkbox.addEventListener('change', () => { item.enabled=checkbox.checked; refresh(); });
    const value = document.createElement('span'); value.className='candidate-value'; value.textContent=item.text;
    const method = document.createElement('small'); method.textContent = `${item.method === 'rule' ? '形式チェック' : item.method === 'manual' ? '手動' : 'ブラウザ内AI'}${item.confidence === undefined ? '' : ` · 信頼度 ${Math.round(item.confidence*100)}%`}`;
    const heading = document.createElement('div'); heading.className = 'candidate-heading'; heading.append(value,method);
    const kind = document.createElement('select'); kind.setAttribute('aria-label', `${item.text}の種別`);
    for (const name of CATEGORIES) kind.add(new Option(name,name));
    kind.value = item.category;
    kind.addEventListener('change', () => { item.category=kind.value as Category; item.replacement=undefined; refresh(); });
    const replacement = document.createElement('input'); replacement.type='text'; replacement.className='replacement';
    replacement.setAttribute('aria-label', `${item.text}の置換先`);
    replacement.value = replacementById.get(item.id) ?? (item.enabled ? '別の候補を優先' : '置換しない');
    replacement.disabled = !replacementById.has(item.id);
    replacement.addEventListener('change', () => {
      const next = replacement.value.trim();
      if (next === item.text) { status.textContent='元の文字列と同じ置換先は指定できません。'; refresh(); return; }
      for (const candidate of candidates) if (candidate.text===item.text && candidate.category===item.category) candidate.replacement=next || undefined;
      status.textContent = next ? '置換先を変更しました。' : '自動生成の置換先に戻しました。';
      refresh();
    });
    const edit = document.createElement('div'); edit.className='candidate-edit';
    const kindLabel = document.createElement('label'); kindLabel.textContent='種別'; kindLabel.append(kind);
    const replacementLabel = document.createElement('label'); replacementLabel.textContent='置換先'; replacementLabel.append(replacement);
    edit.append(kindLabel,replacementLabel);
    row.append(checkbox,heading,edit); list.append(row);
  }
  if (!candidates.length) list.textContent='まだ候補がありません。文章を入力してチェックしてください。';
}
function merge(incoming: Candidate[]): void {
  const previous = new Map(candidates.map(c => [c.id,c]));
  candidates = [...candidates.filter(c => c.method === 'manual'), ...incoming.filter(c => c.method !== 'manual')]
    .filter((c,i,all)=>all.findIndex(x=>x.id===c.id)===i)
    .sort((a,b)=>a.start-b.start || b.end-a.end);
  for (const item of candidates) {
    const old = previous.get(item.id);
    if (old) { item.enabled=old.enabled; item.category=old.category; item.replacement=old.replacement; }
  }
  refresh();
}
function clearSelection(): void {
  selected=null;
  $('selected-text').textContent='追加する文字列を上の文章から選択';
  $<HTMLButtonElement>('manual').disabled=true;
}
function captureSelection(): void {
  const preview = $('highlight');
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!preview.contains(range.startContainer) || !preview.contains(range.endContainer)) return;
  const before = document.createRange();
  before.selectNodeContents(preview);
  before.setEnd(range.startContainer,range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  if (!source.value.slice(start,end).trim()) return;
  selected={start,end};
  $('selected-text').textContent=`選択中: ${source.value.slice(start,end)}`;
  $<HTMLButtonElement>('manual').disabled=false;
}
$('highlight').addEventListener('mouseup',captureSelection);
$('highlight').addEventListener('keyup',captureSelection);
source.addEventListener('input', () => { revision++; candidates=[]; checked=false; clearSelection(); status.textContent='文章が変更されました。もう一度チェックしてください。'; refresh(); });
$('check').addEventListener('click', () => {
  revision++;
  checked=true;
  merge(detectRules(source.value));
  clearSelection();
  status.textContent='形式が決まった情報のチェックが完了しました。色付きの箇所を確認してください。';
  $('results').scrollIntoView({behavior:'smooth',block:'start'});
});
$('ner').addEventListener('click', async () => {
  if (busy || !source.value.trim()) return;
  busy=true;
  ($<HTMLButtonElement>('ner')).disabled=true;
  const current = revision;
  const input = source.value;
  checked=true;
  merge(detectRules(input));
  clearSelection();
  $('results').scrollIntoView({behavior:'smooth',block:'start'});
  try {
    const entities = await loader.analyze(input, message => { if (current === revision) status.textContent=message; });
    if (current !== revision) { status.textContent='入力が変更されたため、古いチェック結果を破棄しました。'; return; }
    merge([...detectRules(input),...entities.flatMap(item => mapNerEntities(input,[item],item.offset))]);
    status.textContent='固有名詞の検出が完了しました。候補を確認してください。';
  } catch(e) { status.textContent=e instanceof Error ? e.message : '名前・組織名のチェックに失敗しました。'; }
  finally { busy=false; ($<HTMLButtonElement>('ner')).disabled=false; }
});
$('manual').addEventListener('click', () => {
  if (!selected) return;
  const found = addManual(source.value,selected.start,selected.end,category.value as Category);
  if (!found.length) { status.textContent='検出結果の文章で追加したい文字列を選択してください。'; return; }
  const byId = new Map([...candidates,...found].map(c=>[c.id,c]));
  checked=true;
  candidates=[...byId.values()].sort((a,b)=>a.start-b.start);
  status.textContent=`手動で${found.length}箇所を追加しました。`; clearSelection(); refresh();
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(output.value); $<HTMLButtonElement>('copy').textContent='コピー済み ✓'; $('copy-feedback').textContent='匿名化後の文章をコピーしました ✓'; }
  catch { output.focus(); output.select(); $('copy-feedback').textContent='コピーできませんでした。選択中の文章を Ctrl+C でコピーしてください。'; }
});
$('clear').addEventListener('click', () => { revision++; source.value=''; candidates=[]; checked=false; output.value=''; clearSelection(); status.textContent='入力を消去しました。'; loader.dispose(); refresh(); source.focus(); });
refresh();

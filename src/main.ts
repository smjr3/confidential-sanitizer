import { detectRules } from './detection/regex';
import { mapNerEntities } from './detection/ner';
import { addManual } from './detection/manual';
import { CATEGORIES, CATEGORY_LABELS, type Candidate, type Category } from './detection/types';
import { anonymize, assignments, withCategories } from './anonymize';
import { mappingRows, mappingCsv, mappingTsv } from './anonymize/report';
import { ModelLoader } from './model/loader';
import { appBase } from './model/config';
import { modelAvailable } from './model/availability';
import { MAX_LENGTH, privacyNotice } from './security/policy';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header><div class="shell"><span class="eyebrow">CONFIDENTIAL SANITIZER · PoC</span><h1>機密情報チェック・マスキング</h1><div class="privacy-callout"><strong>入力したテキストは外部へ送信されません</strong><p>${privacyNotice}</p></div></div></header>
<main class="shell"><div class="workflow"><span>01 入力</span><span>02 候補を確認</span><span>03 マスキングしてコピー</span></div>
<section class="panel"><div class="section-heading"><h2>入力テキスト</h2><span id="length">0 / ${MAX_LENGTH}文字</span></div><textarea id="source" maxlength="${MAX_LENGTH}" spellcheck="false" placeholder="ここにテキストを貼り付けてください。入力した内容は保存されません。"></textarea><details class="category-filter"><summary>マスキングする種別 <span id="category-filter-count">すべて</span></summary><div class="category-menu"><div class="category-tools"><button type="button" id="select-all-categories">すべて選択</button><button type="button" id="clear-all-categories">すべて解除</button></div><div id="category-options" class="category-options" role="group" aria-label="マスキングする種別"></div></div></details><div class="toolbar"><button id="check" class="primary">形式が決まった情報をチェック</button><button id="ner">名前・組織名もチェック</button><button id="clear" class="quiet">入力を消去</button></div><p class="hint">メール・電話・IPなどを先に確認できます。名前や組織名は、ブラウザ内のAIで追加確認できます。</p><p id="status" role="status"></p></section>
<section class="panel" id="results"><div class="section-heading"><h2>検出候補と見落としの確認</h2><span id="count">候補 0種類・マスキング 0箇所</span></div><p class="hint before-preview">検出箇所は色付きで表示します。見落とした名前や案件名は、このテキスト上で選択して追加できます。</p><div id="highlight" class="preview" aria-label="テキスト中の検出箇所"></div><div class="manual-add"><span id="selected-text" class="selected-text">追加する文字列を上のテキストから選択</span><button id="manual" disabled>マスキング対象に追加</button></div><p class="hint">同じ文字列が複数ある場合は、１行にまとめて表示します。手動追加は「その他」として追加され、必要なら一覧で種別や置換先を変更できます。</p><div class="toolbar candidate-actions"><button id="copy-mapping" disabled>一覧をコピー</button><button id="download-mapping" disabled>CSVで保存</button></div><p class="hint">一覧のコピーとCSVには元の文字列が含まれます。取り扱いにご注意ください。</p><p id="mapping-feedback" class="copy-feedback" role="status" aria-live="polite"></p><div class="table-scroll"><table class="data-table candidates-table"><thead><tr><th scope="col">対象</th><th scope="col">元の文字列</th><th scope="col">種別</th><th scope="col">検出方法・信頼度</th><th scope="col">置換先</th><th scope="col">箇所数 <small>マスキング/検出</small></th></tr></thead><tbody id="candidates"></tbody><tfoot><tr><th scope="row" colspan="5">合計</th><td id="replacement-total">0箇所</td></tr></tfoot></table></div><p id="candidates-empty" class="hint">まだ候補がありません。テキストを入力してチェックしてください。</p></section>
<section class="panel"><div class="section-heading"><h2>マスキング後のテキスト</h2><div class="toolbar output-actions"><button id="copy" class="primary">コピー</button><button id="download-txt">TXTで保存</button></div></div><p id="output-warning" class="output-warning" role="alert" hidden>マスキング対象が0件です。元のテキストがそのまま表示されています。</p><p id="copy-feedback" class="copy-feedback" role="status" aria-live="polite"></p><textarea id="output" readonly aria-label="マスキング後のテキスト"></textarea><p class="hint">コピー・保存前に必ず全文を目視確認してください。検知漏れ・誤検知があります。</p></section></main>`;
const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const source = $<HTMLTextAreaElement>('source');
const output = $<HTMLTextAreaElement>('output');
const status = $<HTMLParagraphElement>('status');
let candidates: Candidate[] = [];
let revision = 0;
let busy = false;
let checked = false;
let selected: {start:number;end:number} | null = null;
const loader = new ModelLoader();
const selectedCategories = new Set<Category>(CATEGORIES);
const categoryBoxes = new Map<Category,HTMLInputElement>();
for (const name of CATEGORIES) {
  const label = document.createElement('label');
  const box = document.createElement('input'); box.type='checkbox'; box.checked=true; box.value=name;
  box.addEventListener('change', () => {
    if (box.checked) selectedCategories.add(name); else selectedCategories.delete(name);
    refresh();
  });
  categoryBoxes.set(name,box);
  label.append(box,document.createTextNode(CATEGORY_LABELS[name]));
  $('category-options').append(label);
}
function setAllCategories(enabled:boolean): void {
  selectedCategories.clear();
  for (const name of CATEGORIES) {
    if (enabled) selectedCategories.add(name);
    categoryBoxes.get(name)!.checked=enabled;
  }
  refresh();
}
$('select-all-categories').addEventListener('click', () => setAllCategories(true));
$('clear-all-categories').addEventListener('click', () => setAllCategories(false));

function refresh(): void {
  $('length').textContent = `${source.value.length} / ${MAX_LENGTH}文字`;
  $('category-filter-count').textContent = selectedCategories.size === CATEGORIES.length ? 'すべて' : `${selectedCategories.size}種類`;
  const effective = withCategories(candidates, selectedCategories);
  output.value = checked ? anonymize(source.value,effective) : '';
  const copy = $<HTMLButtonElement>('copy');
  copy.disabled = !checked || !source.value;
  $<HTMLButtonElement>('download-txt').disabled = copy.disabled;
  copy.textContent = 'コピー';
  $('copy-feedback').textContent = '';
  $('mapping-feedback').textContent = '';
  const preview = $('highlight');
  preview.replaceChildren();
  const spans = assignments(effective);
  $<HTMLElement>('output-warning').hidden = !checked || !source.value || spans.length > 0;
  let cursor = 0;
  for (const {candidate:item,replacement} of spans) {
    preview.append(document.createTextNode(source.value.slice(cursor,item.start)));
    const mark = document.createElement('mark');
    mark.textContent = item.text;
    mark.dataset.method = item.method;
    mark.title = `${CATEGORY_LABELS[item.category]} → ${replacement}`;
    preview.append(mark);
    cursor = item.end;
  }
  preview.append(document.createTextNode(source.value.slice(cursor)));
  if (!source.value) preview.textContent = 'チェックしたテキストがここに表示されます。';
  const replacementById = new Map(spans.map(({candidate:item,replacement}) => [item.id,replacement]));
  const grouped = new Map<string,Candidate[]>();
  for (const item of candidates) {
    const key = `${item.text}\u0000${item.category}\u0000${item.method}`;
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key,group);
  }
  $('count').textContent = `候補 ${grouped.size}種類・マスキング ${spans.length}箇所`;
  $('replacement-total').textContent = `${spans.length}箇所`;
  const list = $('candidates');
  list.replaceChildren();
  $<HTMLElement>('candidates-empty').hidden = candidates.length > 0;
  for (const group of grouped.values()) {
    const item = group[0];
    const active = group.filter(candidate => replacementById.has(candidate.id));
    const row = document.createElement('tr');
    const categorySelected = selectedCategories.has(item.category);
    if (!categorySelected) row.className='filtered-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = categorySelected && group.every(candidate => candidate.enabled);
    checkbox.indeterminate = categorySelected && !checkbox.checked && group.some(candidate => candidate.enabled);
    checkbox.disabled = !categorySelected;
    if (!categorySelected) checkbox.title = `${CATEGORY_LABELS[item.category]}は入力欄の種別設定で対象外です`;
    checkbox.setAttribute('aria-label', `${item.text}の${group.length}箇所をマスキングする`);
    checkbox.addEventListener('change', () => { for (const candidate of group) candidate.enabled=checkbox.checked; refresh(); });
    const confidence = group.filter(candidate => candidate.confidence !== undefined).map(candidate => candidate.confidence!);
    const method = document.createElement('span'); method.textContent = `${item.method === 'rule' ? '形式' : item.method === 'manual' ? '手動' : 'ブラウザ内AI'}${confidence.length ? `（平均${Math.round(confidence.reduce((a,b)=>a+b,0)/confidence.length*100)}%）` : ''}`;
    const kind = document.createElement('select'); kind.setAttribute('aria-label', `${item.text}の種別`);
    for (const name of CATEGORIES) kind.add(new Option(CATEGORY_LABELS[name],name));
    kind.value = item.category;
    kind.addEventListener('change', () => { for (const candidate of group) { candidate.category=kind.value as Category; candidate.replacement=undefined; } refresh(); });
    const replacement = document.createElement('input'); replacement.type='text'; replacement.className='replacement';
    replacement.setAttribute('aria-label', `${item.text}の置換先`);
    replacement.value = active.length ? replacementById.get(active[0].id)! : (!categorySelected ? '種別設定で対象外' : group.some(candidate => candidate.enabled) ? '別の候補を優先' : '置換しない');
    replacement.disabled = !active.length;
    replacement.addEventListener('change', () => {
      const next = replacement.value.trim();
      if (next === item.text) { status.textContent='元の文字列と同じ置換先は指定できません。'; refresh(); return; }
      for (const candidate of group) candidate.replacement=next || undefined;
      status.textContent = next ? '置換先を変更しました。' : '自動生成の置換先に戻しました。';
      refresh();
    });
    const cell = (child: HTMLElement, className = '') => { const td=document.createElement('td'); td.className=className; td.append(child); row.append(td); };
    const value = document.createElement('span'); value.textContent=item.text;
    const total = document.createElement('span'); total.textContent = `${active.length} / ${group.length}`;
    cell(checkbox); cell(value,'original-cell'); cell(kind); cell(method); cell(replacement); cell(total);
    list.append(row);
  }
  const rows = mappingRows(effective);
  $<HTMLButtonElement>('copy-mapping').disabled = !rows.length;
  $<HTMLButtonElement>('download-mapping').disabled = !rows.length;
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
  $('selected-text').textContent='追加する文字列を上のテキストから選択';
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
source.addEventListener('input', () => { revision++; candidates=[]; checked=false; clearSelection(); status.textContent='テキストが変更されました。もう一度チェックしてください。'; refresh(); });
$('check').addEventListener('click', () => {
  revision++;
  checked=true;
  merge(detectRules(source.value));
  clearSelection();
  status.textContent='形式が決まった情報のチェックが完了しました。色付きの箇所を確認してください。';
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
  try {
    status.textContent='このサイトにAIモデルが配置されているか確認しています。';
    if (!await modelAvailable(appBase())) {
      if (current === revision) status.textContent='AIモデルがこのサイトにありません。GitHubのソースZIPには同梱されません。CI成果物の models フォルダを、このソースの public フォルダへコピーして再読み込みしてください。';
      return;
    }
    const entities = await loader.analyze(input, message => { if (current === revision) status.textContent=message; });
    if (current !== revision) { status.textContent='入力テキストが変更されたため、古いチェック結果を破棄しました。'; return; }
    merge([...detectRules(input),...entities.flatMap(item => mapNerEntities(input,[item],item.offset))]);
    status.textContent='固有名詞の検出が完了しました。候補を確認してください。';
  } catch(e) { status.textContent=e instanceof Error ? e.message : '名前・組織名のチェックに失敗しました。'; }
  finally { busy=false; ($<HTMLButtonElement>('ner')).disabled=false; }
});
$('manual').addEventListener('click', () => {
  if (!selected) return;
  const found = addManual(source.value,selected.start,selected.end,'OTHER');
  if (!found.length) { status.textContent='検出結果のテキストで追加したい文字列を選択してください。'; return; }
  const byId = new Map([...candidates,...found].map(c=>[c.id,c]));
  checked=true;
  candidates=[...byId.values()].sort((a,b)=>a.start-b.start);
  status.textContent=`手動で${found.length}箇所を追加しました。${selectedCategories.has('OTHER') ? '' : '「その他」が種別設定で対象外のため、マスキングには含まれません。'}`; clearSelection(); refresh();
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(output.value); $<HTMLButtonElement>('copy').textContent='コピー済み ✓'; $('copy-feedback').textContent='マスキング後のテキストをコピーしました ✓'; }
  catch { output.focus(); output.select(); $('copy-feedback').textContent='コピーできませんでした。選択中の文章を Ctrl+C でコピーしてください。'; }
});
function saveText(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content],{type:mime}));
  const link = document.createElement('a'); link.href=url; link.download=name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('copy-mapping').addEventListener('click', async () => {
  const rows=mappingRows(withCategories(candidates,selectedCategories)); if (!rows.length) return;
  try { await navigator.clipboard.writeText(mappingTsv(rows)); $('mapping-feedback').textContent='置換の内訳をコピーしました ✓'; }
  catch { $('mapping-feedback').textContent='コピーできませんでした。CSVで保存をご利用ください。'; }
});
$('download-mapping').addEventListener('click', () => {
  const rows=mappingRows(withCategories(candidates,selectedCategories)); if (!rows.length) return;
  saveText('置換内訳.csv',`\uFEFF${mappingCsv(rows)}`,'text/csv;charset=utf-8');
  $('mapping-feedback').textContent='置換の内訳CSVのダウンロードを開始しました。';
});
$('download-txt').addEventListener('click', () => {
  if (!checked || !source.value) return;
  saveText('マスキング後のテキスト.txt',output.value,'text/plain;charset=utf-8');
  $('copy-feedback').textContent='マスキング後のテキストTXTのダウンロードを開始しました。';
});
$('clear').addEventListener('click', () => { revision++; source.value=''; candidates=[]; checked=false; output.value=''; clearSelection(); status.textContent='入力を消去しました。'; loader.dispose(); refresh(); source.focus(); });
refresh();

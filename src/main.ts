import { detectRules } from './detection/regex';
import { mapNerEntities } from './detection/ner';
import { addManual } from './detection/manual';
import { CATEGORIES, CATEGORY_LABELS, type Candidate, type Category } from './detection/types';
import { applyAssignments, assignments, withCategories } from './anonymize';
import { mappingFromAssignments, mappingCsv, mappingTsv, type MappingRow } from './anonymize/report';
import { mergeCandidates } from './detection/state';
import type { Method } from './detection/types';
import { CandidateTable } from './ui/candidates';
import { ModelLoader } from './model/loader';
import { appBase } from './model/config';
import { modelAvailable } from './model/availability';
import { MAX_LENGTH, privacyNotice } from './security/policy';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header class="app-header">
  <div class="brand"><img class="brand-icon" src="${new URL('favicon.svg',appBase()).href}" alt="" width="34" height="34"><div><span class="eyebrow">CONFIDENTIAL SANITIZER · PoC</span><h1>機密情報チェック・マスキング</h1></div></div>
  <div class="privacy-callout"><strong>入力テキストは外部へ送信されません</strong><span>処理はブラウザ内だけ。入力内容は保存しません。</span></div>
  <button id="help-open" aria-haspopup="dialog" aria-controls="help-dialog">？ 使い方</button>
</header>
<div class="workbar"><details id="category-filter" class="category-filter"><summary>マスキングする種別 <span id="category-filter-count">すべて</span></summary><div class="category-menu"><div class="category-tools"><button type="button" id="select-all-categories">すべて選択</button><button type="button" id="clear-all-categories">すべて解除</button></div><div id="category-options" class="category-options" role="group" aria-label="マスキングする種別"></div></div></details><button id="check" class="primary">形式が決まった情報をチェック</button><button id="ner">名前・組織名もチェック</button><span class="workbar-hint">入力 → 確認 → コピー</span></div>
<main class="workspace">
<section class="panel input-panel" aria-labelledby="input-title"><div class="section-heading"><span class="step-number">01</span><h2 id="input-title">入力テキスト</h2><button id="clear" class="quiet">入力をクリア</button></div>
<div class="input-tabs" role="tablist" aria-label="入力テキストの表示"><button id="tab-edit" role="tab" aria-selected="true" aria-controls="edit-pane">入力・編集</button><button id="tab-review" role="tab" aria-selected="false" aria-controls="review-pane" tabindex="-1">ハイライトで確認</button><span id="length">0 / ${MAX_LENGTH}文字</span></div>
<div id="edit-pane" class="text-pane" role="tabpanel" aria-labelledby="tab-edit"><textarea id="source" aria-label="入力テキスト" maxlength="${MAX_LENGTH}" spellcheck="false" placeholder="ここにテキストを貼り付けてください。入力した内容は保存されません。"></textarea></div>
<div id="review-pane" class="text-pane" role="tabpanel" aria-labelledby="tab-review" hidden><div id="highlight" class="preview" tabindex="0" aria-label="テキスト中の検出箇所"></div></div>
<div class="panel-footer manual-add"><span id="selected-text" class="selected-text">確認画面で文字列を選択して追加</span><button id="manual" disabled>＋ 手動追加</button></div></section>
<section class="panel candidate-panel" id="results" aria-labelledby="candidate-title"><div class="section-heading"><span class="step-number">02</span><h2 id="candidate-title">検出候補・置換先</h2></div><p id="count" class="panel-caption">候補 0種類・マスキング 0箇所</p><div class="table-scroll"><table class="data-table candidates-table"><colgroup><col class="col-check"><col class="col-original"><col class="col-replacement"><col class="col-category"><col class="col-total"></colgroup><thead><tr><th scope="col">対象</th><th scope="col">元の文字列 <small>／ 検出方法・信頼度</small></th><th scope="col">置換先</th><th scope="col">種別</th><th scope="col" title="マスキングする箇所数 / 検出した箇所数">箇所数 <small>対象/検出</small></th></tr></thead><tbody id="candidates"></tbody><tfoot><tr><th scope="row" colspan="4">マスキング合計</th><td id="replacement-total">0箇所</td></tr></tfoot></table><p id="candidates-empty" class="empty-state">まだ候補がありません。<br>テキストを入力してチェックしてください。</p></div><p id="mapping-feedback" class="copy-feedback" role="status" aria-live="polite"></p><div class="panel-footer candidate-actions"><span class="hint">元の情報を含みます</span><button id="copy-mapping" disabled>一覧をコピー</button><button id="download-mapping" disabled>CSVで保存</button></div></section>
<section class="panel output-panel" aria-labelledby="output-title"><div class="section-heading"><span class="step-number">03</span><h2 id="output-title">マスキング結果</h2></div><div class="output-actions"><button id="copy" class="primary">コピー</button><button id="download-txt">TXTで保存</button></div><p id="output-warning" class="output-warning" role="alert" hidden>マスキング対象が0件です。元のテキストがそのまま表示されています。</p><div class="text-pane"><textarea id="output" readonly aria-label="マスキング後のテキスト" placeholder="チェックすると、ここに結果が表示されます。"></textarea></div><p id="copy-feedback" class="copy-feedback" role="status" aria-live="polite"></p><div class="panel-footer"><span class="hint">コピー・保存前に全文をご確認ください。</span></div></section>
</main><footer class="statusbar"><p id="status" role="status">テキストを入力してチェックしてください。</p><span>検知漏れ・誤検知があります。安全を保証するツールではありません。</span></footer>
<dialog id="help-dialog" aria-labelledby="help-title"><div class="help-shell"><div class="help-heading"><h2 id="help-title">使い方</h2><button id="help-close" aria-label="使い方を閉じる">閉じる ×</button></div><div class="help-content"><p class="help-privacy">${privacyNotice}</p><ol><li><strong>入力・チェック</strong><p>左の「入力・編集」にテキストを貼り付けます。「形式が決まった情報をチェック」はメール・電話・IP・URL・各種番号などを確認します。「名前・組織名もチェック」はブラウザ内AIでも確認します。AIファイルはこのサイトから読み込むため、初回は時間がかかる場合があります。</p></li><li><strong>候補と置換先を確認</strong><p>左の「ハイライトで確認」と中央の一覧を見比べます。チェックを外すとマスキング対象から除外できます。置換先と種別は一覧で変更できます。同じ文字列・種別には同じ置換先を使います。箇所数は「マスキングする数 / 検出した数」です。</p></li><li><strong>見落としを手動で追加</strong><p>ハイライト画面で任意の文字列を選択し、「＋ 手動追加」を押します。同じ文字列をまとめて追加します。種別の選択は不要です。「その他」として追加され、必要なら一覧で変更できます。</p></li><li><strong>コピー・保存</strong><p>右の結果を全文確認して「コピー」または「TXTで保存」を押します。中央の「一覧をコピー」「CSVで保存」は元の文字列を含む対応表を出力します。取り扱いにご注意ください。CSVの種別はORGなど、置換先に対応するコードです。</p></li></ol><h3>種別・表示・クリア</h3><p>「マスキングする種別」は初期状態ですべて選択されています。対象外にした種別も候補一覧に残ります。メニューの外を押すか、Escキーで閉じられます。</p><p>長文と候補一覧は、それぞれの枠内でスクロールします。入力の編集は「入力・編集」に戻って行います。「入力をクリア」で入力・候補・出力を消去し、処理中のAIも停止します。種別の設定は維持します。</p><p>テキストを変えずに再チェックすると、候補の解除や置換先の編集を保持します。入力テキストを変更した場合は、もう一度チェックしてください。</p><h3>AIファイルが見つからない場合</h3><p>GitHubのソースZIPにはAIモデルは含まれません。CIで作成した配布物を利用するか、取得済みのmodelsフォルダをソースのpublicフォルダに配置してください。CIは配布物を作る自動処理で、利用のたびに実行する必要はありません。</p><p class="hint">この画面は外側をクリックするか、Escキーでも閉じられます。</p></div></div></dialog>
`;
const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const source = $<HTMLTextAreaElement>('source');
const output = $<HTMLTextAreaElement>('output');
const status = $<HTMLParagraphElement>('status');
const filter=$<HTMLDetailsElement>('category-filter');
const help=$<HTMLDialogElement>('help-dialog');
function closeFilter(restoreFocus=false):void {
  filter.open=false;
  if(restoreFocus)filter.querySelector('summary')!.focus({preventScroll:true});
}
document.addEventListener('pointerdown',event=>{if(!filter.contains(event.target as Node))closeFilter();});
document.addEventListener('focusin',event=>{if(!filter.contains(event.target as Node))closeFilter();});
$('help-open').addEventListener('click',()=>{closeFilter();if(!help.open)help.showModal();});
function closeHelp():void { help.close();$('help-open').focus({preventScroll:true}); }
$('help-close').addEventListener('click',closeHelp);
help.addEventListener('click',event=>{if(event.target===help)closeHelp();});
help.addEventListener('cancel',event=>{event.preventDefault();closeHelp();});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(help.open){event.preventDefault();closeHelp();}
  else if(filter.open){event.preventDefault();closeFilter(true);}
});
function setInputView(review:boolean,focusTab=false):void {
  $('edit-pane').hidden=review;$('review-pane').hidden=!review;
  for(const [id,active] of [['tab-edit',!review],['tab-review',review]] as const){
    const tab=$<HTMLButtonElement>(id);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    if(active&&focusTab)tab.focus({preventScroll:true});
  }
  if(!review)clearSelection();
}
for(const [id,review] of [['tab-edit',false],['tab-review',true]] as const){
  $(id).addEventListener('click',()=>setInputView(review));
  $(id).addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();setInputView(event.key==='Home'?false:event.key==='End'?true:!review,true);
    }
  });
}

let candidates: Candidate[] = [];
let revision = 0;
let busy = false;
let checked = false;
let selected: {start:number;end:number} | null = null;
const loader = new ModelLoader();
let nerRun=0;
let renderVersion=0;
let report:MappingRow[]=[];
const table=new CandidateTable($('candidates'),()=>candidates,refresh,message=>{status.textContent=message;});
function cancelNer():void {
  nerRun++;
  if(busy)loader.dispose();
  busy=false;
  $<HTMLButtonElement>('ner').disabled=false;
}
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
  renderVersion++;
  $('length').textContent = `${source.value.length} / ${MAX_LENGTH}文字`;
  $('category-filter-count').textContent = selectedCategories.size === CATEGORIES.length ? 'すべて' : `${selectedCategories.size}種類`;
  const effective = withCategories(candidates, selectedCategories);
  const spans=assignments(effective);
  output.value=checked ? applyAssignments(source.value,spans) : '';
  report=mappingFromAssignments(spans);
  const copy = $<HTMLButtonElement>('copy');
  copy.disabled = !checked || !source.value;
  $<HTMLButtonElement>('download-txt').disabled = copy.disabled;
  copy.textContent = 'コピー';
  $('copy-feedback').textContent = '';
  $('mapping-feedback').textContent = '';
  const preview = $('highlight');
  const previewScroll=preview.scrollTop;
  preview.replaceChildren();
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
  preview.scrollTop=previewScroll;
  const groupCount=table.update(candidates,spans,selectedCategories);
  $('count').textContent=`候補 ${groupCount}種類・マスキング ${spans.length}箇所`;
  $('replacement-total').textContent=`${spans.length}箇所`;
  $('candidates-empty').hidden=candidates.length>0;
  $<HTMLButtonElement>('copy-mapping').disabled=!report.length;
  $<HTMLButtonElement>('download-mapping').disabled=!report.length;
}
function merge(incoming:Candidate[], methods:Method[]):void {
  candidates=mergeCandidates(candidates,incoming,methods);
  refresh();
}
function clearSelection(): void {
  selected=null;
  $('selected-text').textContent='確認画面で文字列を選択して追加';
  $<HTMLButtonElement>('manual').disabled=true;
}
function captureSelection(): void {
  const preview = $('highlight');
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) { clearSelection(); return; }
  const range = selection.getRangeAt(0);
  if (!preview.contains(range.startContainer) || !preview.contains(range.endContainer)) { clearSelection(); return; }
  const before = document.createRange();
  before.selectNodeContents(preview);
  before.setEnd(range.startContainer,range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  if (!source.value.slice(start,end).trim()) { clearSelection(); return; }
  selected={start,end};
  $('selected-text').textContent=`選択中: ${source.value.slice(start,end)}`;
  $<HTMLButtonElement>('manual').disabled=false;
}
$('highlight').addEventListener('mouseup',captureSelection);
$('highlight').addEventListener('keyup',captureSelection);
source.addEventListener('input', () => { revision++; cancelNer(); candidates=[]; checked=false; clearSelection(); status.textContent='テキストが変更されました。もう一度チェックしてください。'; refresh(); });
$('check').addEventListener('click', () => {
  revision++;
  cancelNer();
  checked=true;
  setInputView(true);
  merge(detectRules(source.value),['rule']);
  clearSelection();
  status.textContent='形式が決まった情報のチェックが完了しました。色付きの箇所を確認してください。';
});
$('ner').addEventListener('click', async () => {
  if (busy || !source.value.trim()) return;
  busy=true;
  ($<HTMLButtonElement>('ner')).disabled=true;
  const current = revision;
  const run=++nerRun;
  const input = source.value;
  checked=true;
  setInputView(true);
  merge(detectRules(input),['rule']);
  clearSelection();
  try {
    status.textContent='このサイトにAIモデルが配置されているか確認しています。';
    const available=await modelAvailable(appBase());
    if(run!==nerRun || current!==revision)return;
    if (!available) {
      if (current === revision) status.textContent='AIモデルがこのサイトにありません。GitHubのソースZIPには同梱されません。CI成果物の models フォルダを、このソースの public フォルダへコピーして再読み込みしてください。';
      return;
    }
    const entities = await loader.analyze(input, message => { if (run===nerRun && current === revision) status.textContent=message; });
    if(run!==nerRun || current!==revision)return;
    merge([...detectRules(input),...entities.flatMap(item => mapNerEntities(input,[item],item.offset))],['rule','ner']);
    status.textContent='固有名詞の検出が完了しました。候補を確認してください。';
  } catch(e) { if(run===nerRun && current===revision)status.textContent=e instanceof Error ? e.message : '名前・組織名のチェックに失敗しました。'; }
  finally { if(run===nerRun){busy=false; ($<HTMLButtonElement>('ner')).disabled=false;} }
});
$('manual').addEventListener('click', () => {
  if (!selected) return;
  const found = addManual(source.value,selected.start,selected.end,'OTHER');
  if (!found.length) { status.textContent='検出結果のテキストで追加したい文字列を選択してください。'; return; }
  checked=true;
  candidates=mergeCandidates(candidates,found,[]);
  status.textContent=`手動で${found.length}箇所を追加しました。${selectedCategories.has('OTHER') ? '' : '「その他」が種別設定で対象外のため、マスキングには含まれません。'}`; clearSelection(); refresh();
});
$('copy').addEventListener('click', async () => {
  const version=renderVersion;
  try { await navigator.clipboard.writeText(output.value); if(version!==renderVersion)return; $<HTMLButtonElement>('copy').textContent='コピー済み ✓'; $('copy-feedback').textContent='マスキング後のテキストをコピーしました ✓'; }
  catch { if(version!==renderVersion)return; output.focus(); output.select(); $('copy-feedback').textContent='コピーできませんでした。選択中の文章を Ctrl+C でコピーしてください。'; }
});
function saveText(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content],{type:mime}));
  const link = document.createElement('a'); link.href=url; link.download=name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('copy-mapping').addEventListener('click', async () => {
  const rows=report; if (!rows.length) return;
  const version=renderVersion;
  try { await navigator.clipboard.writeText(mappingTsv(rows)); if(version!==renderVersion)return; $('mapping-feedback').textContent='置換の内訳をコピーしました ✓'; }
  catch { if(version!==renderVersion)return; $('mapping-feedback').textContent='コピーできませんでした。CSVで保存をご利用ください。'; }
});
$('download-mapping').addEventListener('click', () => {
  const rows=report; if (!rows.length) return;
  saveText('置換内訳.csv',`\uFEFF${mappingCsv(rows)}`,'text/csv;charset=utf-8');
  $('mapping-feedback').textContent='置換の内訳CSVのダウンロードを開始しました。';
});
$('download-txt').addEventListener('click', () => {
  if (!checked || !source.value) return;
  saveText('マスキング後のテキスト.txt',output.value,'text/plain;charset=utf-8');
  $('copy-feedback').textContent='マスキング後のテキストTXTのダウンロードを開始しました。';
});
$('clear').addEventListener('click', () => { revision++; cancelNer(); source.value=''; candidates=[]; checked=false; output.value=''; clearSelection(); status.textContent='入力を消去しました。'; loader.dispose(); refresh(); setInputView(false); source.focus({preventScroll:true}); });
refresh();

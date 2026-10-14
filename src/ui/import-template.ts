import { htmlText } from '../content/text';

export function importTemplate():string {
  return `<dialog id="import-dialog" aria-labelledby="import-title"><div class="help-shell">
    <div class="help-heading"><h2 id="import-title">${htmlText('import.title')}</h2><button id="import-close">${htmlText('button.close')}</button></div>
    <div class="help-content"><p>${htmlText('import.help')}</p>
      <div class="import-actions"><button id="import-file-open">${htmlText('restore.import')}</button><button id="import-clear" disabled>${htmlText('import.clear')}</button></div>
      <input id="import-file" type="file" accept=".csv,text/csv" hidden>
      <p id="import-summary">${htmlText('import.empty')}</p><p id="import-status" role="status" aria-live="polite"></p>
      <label id="import-legacy" class="restore-legacy" hidden><input id="import-legacy-check" type="checkbox">${htmlText('restore.legacy')}</label>
      <div class="import-table-scroll"><table class="data-table"><thead><tr><th>${htmlText('column.original')}</th><th>${htmlText('column.replacement')}</th><th>${htmlText('column.category')}</th></tr></thead><tbody id="import-rows"></tbody></table></div>
      <p class="hint">${htmlText('import.memory')}</p>
    </div></div></dialog>`;
}

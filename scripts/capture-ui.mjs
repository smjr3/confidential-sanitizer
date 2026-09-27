// Run by the isolated UI capture workflow. Only fictional fixtures are used.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { startPreview } from './preview-server.mjs';

const require = createRequire(import.meta.url);
const playwrightEntry = require.resolve('playwright', { paths: [resolve('.ui-tools')] });
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const directory = resolve('ui-captures');
await mkdir(directory, { recursive: true });
const { server, address } = await startPreview({ root: resolve('dist'), port: 0 });
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 940 }, deviceScaleFactor: 1, locale: 'ja-JP' });
  const page = await context.newPage();
  const errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).origin !== new URL(address).origin) externalRequests.push(request.url()); });
  await page.goto(address, { waitUntil: 'networkidle' });
  const input = `【架空のサンプル：システム変更の相談】\n\n株式会社サンプルの山田太郎さんから、販売管理システムの接続設定について相談がありました。\n\n現在の接続先は 10.20.1.10 です。作業前に接続状況を確認し、変更後に動作確認を行います。\n\n連絡先：yamada@example.com\n確認用URL：https://example.com/support\n\n株式会社サンプルへ送る回答案と、販売管理システムの確認項目を整理してください。`;
  await page.locator('#source').fill(input);
  await page.locator('#check').click();
  await page.waitForFunction(() => !document.getElementById('check').disabled);

  // Select real text in the highlight pane, then use the existing manual-add UI.
  for (const [original, category] of [['株式会社サンプル','ORG'],['山田太郎','PERSON'],['販売管理システム','SYSTEM']]) {
    await page.locator('#highlight').evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const start = node.textContent.indexOf(text);
        if (start < 0) continue;
        const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + text.length);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }
      throw new Error('Fixture text was not found in the highlight pane.');
    }, original);
    await page.locator('#manual').click();
    await page.locator('#candidates tr').filter({ hasText: original }).locator('select').selectOption(category);
  }
  await page.locator('#tab-review').click();
  await page.locator('#tab-review').press('Tab');
  await page.evaluate(() => window.getSelection().removeAllRanges());
  const originals = ['株式会社サンプル','山田太郎','販売管理システム','10.20.1.10','yamada@example.com','https://example.com/support'];
  const mappings = new Map();
  for (const original of originals) {
    mappings.set(original, await page.locator('#candidates tr').filter({ hasText: original }).locator('input.replacement').inputValue());
  }
  const masked = await page.locator('#output').inputValue();
  for (const original of originals) assert.ok(!masked.includes(original), 'Original value leaked into masked output.');
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.screenshot({ path: resolve(directory,'01-masking.png'), fullPage: false });

  await page.locator('#open-restore-current').click();
  const token = original => mappings.get(original);
  const answer = `回答案\n\n${token('株式会社サンプル')}\n${token('山田太郎')} 様\n\n${token('販売管理システム')}の接続設定について、以下の手順で確認します。\n\n1. 現在の接続先 ${token('10.20.1.10')} への疎通を確認します。\n2. 設定変更後、ログインと主要な画面の動作を確認します。\n3. 確認結果を ${token('yamada@example.com')} へご連絡します。\n\n参考情報：${token('https://example.com/support')}\n\n${token('株式会社サンプル')}との確認後に、作業日時を確定します。`;
  await page.locator('#restore-input').fill(answer);
  await page.locator('#restore-run').click();
  const restored = await page.locator('#restore-output').inputValue();
  for (const original of originals) assert.ok(restored.includes(original), 'Restored output is missing an original value.');
  assert.ok(!/<[A-Z_]+_\d+>/.test(restored));
  assert.match(await page.locator('#restore-status').innerText(), /7箇所/);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.screenshot({ path: resolve(directory,'02-restoration.png'), fullPage: false });

  // Verify round-trip CSV import as well as the in-memory handoff.
  await page.locator('#mode-mask').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-mapping').click();
  const download = await downloadPromise;
  const csvPath = resolve(directory,'fixture-mapping.csv');
  await download.saveAs(csvPath);
  await page.locator('#mode-restore').click();
  await page.locator('#restore-clear').click();
  await page.locator('#restore-file').setInputFiles(csvPath);
  await page.waitForFunction(() => document.getElementById('restore-map-source').textContent.startsWith('CSV：'));
  await page.locator('#restore-input').fill(answer);
  await page.locator('#restore-run').click();
  assert.equal(await page.locator('#restore-output').inputValue(), restored);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  await writeFile(resolve(directory,'verification.json'), JSON.stringify({
    commit: process.env.GITHUB_SHA ?? null,
    browser: browser.version(), viewport: { width:1600,height:940 },
    fixture: 'fictional', modelLoaded: false, detection: 'real rules and manual additions',
    restoredOccurrences: 7, csvRoundTrip: true, externalRequests: 0, pageErrors: 0
  }, null, 2) + '\n');
  console.log('Captured masking and restoration. CSV round-trip verified. No external requests or page errors.');
} finally {
  if (browser) await browser.close();
  await new Promise(ok => server.close(ok));
}

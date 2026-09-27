#!/usr/bin/env node
import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPreview } from '../scripts/preview-server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command = '--help', ...args] = process.argv.slice(2);
try {
  if (command === '--help') {
    console.log(`confidential-sanitizer serve [--port 4173] [--models <modelsフォルダ>]\nconfidential-sanitizer export <空の出力フォルダ>\nconfidential-sanitizer --version\n\n学習済みモデルは別配布です。モデルのダウンロードは行いません。`);
  } else if (command === '--version') {
    console.log(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version);
  } else if (command === 'serve') {
    const options = { root: join(root, 'dist'), openBrowser: true };
    for (let i = 0; i < args.length; i += 2) {
      if (!args[i + 1]) throw new Error('オプションの値を指定してください。');
      if (args[i] === '--models') options.models = resolve(args[i + 1]);
      else if (args[i] === '--port' && /^\d+$/.test(args[i + 1]) && +args[i + 1] > 0 && +args[i + 1] <= 65535) options.port = +args[i + 1];
      else throw new Error('オプションを確認してください。');
    }
    const { address } = await startPreview(options);
    console.log(`ブラウザで ${address} を開いてください。終了は Ctrl+C です。`);
  } else if (command === 'export') {
    if (args.length !== 1) throw new Error('空の出力フォルダを1つ指定してください。');
    const destination = resolve(args[0]);
    await mkdir(destination, { recursive: true });
    if ((await readdir(destination)).length) throw new Error('出力先は空のフォルダを指定してください。');
    // Explicit allowlist prevents accidental export of model weights from a source build.
    for (const name of ['index.html', 'favicon.svg', 'assets', 'wasm', 'licenses']) {
      await cp(join(root, 'dist', name), join(destination, name), { recursive: true, force: false, errorOnExist: true });
    }
    await cp(join(root, 'preview.bat'), join(destination, 'preview.bat'));
    await cp(join(root, 'scripts/preview-server.mjs'), join(destination, 'preview-server.mjs'));
    console.log('書き出しました。AIを使う場合は出力先へ別配布のmodelsフォルダを配置してください。');
  } else throw new Error('コマンドを確認してください。--help で使い方を表示します。');
} catch (error) {
  console.error(error.code ? '実行に失敗しました。配置・アクセス権・使用中のポートを確認してください。' : error.message);
  process.exitCode = 1;
}

# npmパッケージとして配布する

npmパッケージは、アプリをひとまとめにしてインストール・配布する形式です。このリポジトリでは、完成した画面とブラウザ内の検出プログラムを `.tgz`（圧縮ファイル）にします。JavaScriptの関数を他のプログラムから呼び出すライブラリとしての公開ではありません。

## 含めるもの／別に用意するもの

- 含める：画面、ルール検出、マスキング、AI推論プログラム、WASM、favicon、ローカル確認用コマンド・bat、ライセンス表記。
- 含めない：学習済みNERモデル、tokenizer、モデルの設定ファイル、ソース、テスト、開発用依存パッケージ。
- AI機能は残しています。別配布のモデルを配置すると使えます。ブラウザやインストールコマンドがHugging Faceから取得することはありません。
- 配布パッケージには追加インストールが必要なnpm依存関係はありません。設定されたnpmレジストリ（パッケージの保管・配布サービス）との通信はパッケージ取得時に発生します。

## 作成者：パッケージを作る

Node.js 22.12以上を使い、ソース一式の `package.json` があるフォルダで実行します。

```sh
npm ci
npm run package
npm run test:package
```

`packages/confidential-sanitizer-0.1.0.tgz` ができます。`npm run package` は既存テストとビルドを実行します。モデルを取得するCIの実行は不要です。モデルを含むビルドが手元にあっても、npmの収録対象は明示したファイルだけで、`dist/models/` は入りません。

GitHubだけで作る場合は **Actions → Build npm package → Run workflow**。成功した実行の **Artifacts → confidential-sanitizer-npm** をダウンロードしてZIPを展開してください。中に上記 `.tgz` があります。これはモデル入りの `confidential-sanitizer-site` とは別の成果物です。モデル入りの配布物は「Check model build」で作成します。

## 利用者：ローカルで確認する

Node.js 22.12以上が必要です。空の作業フォルダを作り、そのフォルダで実行します。npmjs.com に公開済みのパッケージを取得します。

```sh
npm install --no-audit --no-fund confidential-sanitizer
npx --no-install confidential-sanitizer serve
```

ダウンロードした `.tgz` を使う場合は、1行目を `npm install --no-audit --no-fund ./confidential-sanitizer-0.1.0.tgz` に置き換えます。

表示された `http://127.0.0.1:4173/` を開きます。終了はCtrl+Cです。Windowsではインストール後の `node_modules/confidential-sanitizer/preview.bat` でも起動できます。追加のnpm取得やビルドは行いません。

AIも試す場合は、別途用意した `models` フォルダを作業フォルダへコピーして起動します。

```sh
npx --no-install confidential-sanitizer serve --models ./models
```

この `models` の直下には `jiting/xlm-roberta-ner-japanese_onnx/config.json` 等がある必要があります。モデルは同じローカルURLの `/models/` で配信されます。モデルがない場合、形式のチェック結果は残り、AIチェック未完了と表示されます。

## 再置換する

画面上部の「再置換」から、マスキング記号を元の文字列へ戻せます。現在の置換リストを引き継ぐか、このアプリで保存したCSVを読み込み、AIの回答を貼り付けて実行します。ブラウザ内で処理するため、モデルの配置は不要です。入力・対応表・結果はページを閉じると消えます。

## 静的サイトとして配布する

```sh
npx --no-install confidential-sanitizer export ./site
```

`site` は空、またはまだ存在しないフォルダにしてください。そこへ別配布の `models` をコピーし、**siteフォルダ内のファイル一式**を静的サイトを配信できるWebサーバーへ配置します。Node.jsは書き出し・ローカル確認時だけ必要で、配布先では静的ファイルだけで動作します。`site/preview.bat` でもローカル確認できます。ブラウザで `index.html` を直接開く方式は使いません。

配布を自動化する場合は、CI（配布物の作成などを自動実行する環境）でパッケージを取得し、`export` を実行します。その後、用意したモデルを `site/models/` へ配置し、`site` の内容を配信先へ配置します。

## npmjs.com への公開

パッケージ名 `confidential-sanitizer` で npmjs.com に公開します。`npm run package` はファイルを作成するだけで、公開はGitHub Actionsの「Publish to npm」が行います。NERモデルはパッケージとは別に配置します。

1. 新しい版を出すときは、`package.json` の `version` を上げて main に反映します。同じ版は二度公開できません。
2. **Actions → Publish to npm → Run workflow** を押します。既定は確認だけの試し実行（dry run）で、何も公開しません。公開するときは「Build and check only; do not upload」のチェックを外して実行します。
3. ワークフローは `npm run package` と `npm run test:package` で検証した `.tgz` を、そのまま `npm publish --provenance` で公開します。npmjs.com のページに、どのコミットから作ったかの証明（provenance）が表示されます。GitHub で `v<version>` のタグのリリースを公開したときも同じ処理が動きます。

認証は次のどちらかです。

- **初回**：npmjs.com で作った Granular Access Token をリポジトリの Secret `NPM_TOKEN` に登録します。権限は Packages and scopes を「Read and write (publish and stage)」、Organizations を「No access」、「Bypass two-factor authentication (2FA)」をオンにします。
- **2回目以降（推奨）**：npmjs.com のパッケージ設定 → Trusted Publisher で GitHub Actions を選び、`smjr3` / `confidential-sanitizer` / `npm-publish.yml` を登録します。Environment name は空欄、「Allow npm publish」にチェックします。登録後は `NPM_TOKEN` と npm 側のトークンを削除します。

## 保守と確認範囲

ソースから変更する場合、画面の文言は `src/content/ja.json` で編集します。変更後はパッケージを再作成してください。

`npm run test:package` はモデル混入防止、外部依存なしのインストール、コマンド起動、静的配信、静的サイト用の書き出しを検証します。実モデルの推論精度やWindowsのダブルクリック操作自体はこのテストの対象外です。

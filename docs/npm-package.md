# npmパッケージとして配布する

npmパッケージは、アプリをひとまとめにしてインストール・配布する形式です。このリポジトリでは、完成した画面とブラウザ内の検出プログラムを `.tgz`（圧縮ファイル）にします。JavaScriptの関数を他のプログラムから呼び出すライブラリとしての公開ではありません。

## 含めるもの／別に用意するもの

- 含める：画面、ルール検出、マスキング、AI推論プログラム、WASM、favicon、ローカル確認用コマンド・bat、ライセンス表記。
- 含めない：学習済みNERモデル、tokenizer、モデルの設定ファイル、ソース、テスト、開発用依存パッケージ。
- AI機能は残しています。別配布のモデルを配置すると使えます。ブラウザやインストールコマンドがHugging Faceから取得することはありません。
- 配布パッケージには追加インストールが必要なnpm依存関係はありません。npm/JFrogとの通信はパッケージ取得時に発生します。

## 作成者：パッケージを作る

Node.js 22.12以上を使い、ソース一式の `package.json` があるフォルダで実行します。

```sh
npm ci
npm run package
npm run test:package
```

`packages/confidential-sanitizer-0.1.0.tgz` ができます。`npm run package` は既存テストとビルドを実行します。モデルを取得するCIの実行は不要です。モデルを含むビルドが手元にあっても、npmの収録対象は明示したファイルだけで、`dist/models/` は入りません。

GitHubだけで作る場合は **Actions → Build npm package → Run workflow**。成功した実行の **Artifacts → confidential-sanitizer-npm** をダウンロードしてZIPを展開してください。中に上記 `.tgz` があります。これはモデル入りの `confidential-sanitizer-site` とは別の成果物です。既存の「Check model build」も引き続き利用できます。

## 利用者：ローカルで確認する

Node.js 22.12以上が必要です。ダウンロードした `.tgz` を空の作業フォルダへ置き、そのフォルダで実行します。

```sh
npm install --no-audit --no-fund ./confidential-sanitizer-0.1.0.tgz
npx --no-install confidential-sanitizer serve
```

表示された `http://127.0.0.1:4173/` を開きます。終了はCtrl+Cです。Windowsではインストール後の `node_modules/confidential-sanitizer/preview.bat` でも起動できます。追加のnpm取得やビルドは行いません。

AIも試す場合は、既存CI成果物の `models` フォルダを作業フォルダへコピーして起動します。

```sh
npx --no-install confidential-sanitizer serve --models ./models
```

この `models` の直下には `jiting/xlm-roberta-ner-japanese_onnx/config.json` 等がある必要があります。モデルは同じローカルURLの `/models/` で配信されます。モデルがない場合、形式のチェック結果は残り、AIチェック未完了と表示されます。

## GitLab Pagesへ書き出す

```sh
npx --no-install confidential-sanitizer export ./site
```

`site` は空、またはまだ存在しないフォルダにしてください。そこへ別配布の `models` をコピーし、**siteフォルダ内のファイル一式**をGitLab Pagesで配布します。Node.jsは書き出し・ローカル確認時だけ必要で、Pagesでは静的ファイルだけが動きます。`site/preview.bat` でもローカル確認できます。ブラウザで `index.html` を直接開く方式は使いません。

既存のソースからのGitLab CIビルドも維持しています。npm経由に変更する際は、CIでnpm/JFrogからアプリを取得→export→承認済みモデルを `site/models/` へ配置→siteをPagesに配置、という順に変更します。

## JFrog・npmへの登録

今回の実装はパッケージ作成までで、npmレジストリ（パッケージの保管・配布サービス）への公開は行いません。公開する場合は、公開先・パッケージ名の利用可否・アクセス範囲を確認してから登録します。社内JFrogのnpmリポジトリへ、この `.tgz` を登録する構成に対応できます。NERモデルは別の保管先からCIで配置します。

## 保守と確認範囲

テスト・`preview.bat`・モデル取得CIは保持し、過去の一時的なUI案とレビュー記録は整理しました。変更履歴はGitHubのコミットに残ります。画面文言の編集先は引き続き `src/content/ja.json` です。

`npm run test:package` はモデル混入防止、外部依存なしのインストール、コマンド起動、静的配信、Pages用書き出しを検証します。実モデルの推論精度やWindowsのダブルクリック操作自体はこのテストの対象外です。

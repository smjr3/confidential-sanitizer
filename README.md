# confidential-sanitizer

外部AIに文章を貼り付ける前に、顧客名・氏名・識別番号などを確認し、`<ORG_01>` のような文字列に置き換えるPoCです。**文章の確認と置換はブラウザ内で完結します。安全を保証する製品ではありません。**

## 使い方

1. 文章を入力し「形式が決まった情報をチェック」を押します。メール、電話、IP、URL、郵便番号、住所の一部、番号、ホスト名などをルールで探します。
2. 必要なら「名前・組織名もチェック」を押します。初回は**このサイト（GitLab Pages）から**約279MBの日本語モデルを取得します。氏名、企業・団体・組織、地名、施設、製品、イベント等の候補が増えます。
3. 検出箇所は色付きで表示されます。一覧のチェックを外すとその箇所を置換しません。候補ごとに種別と「置換先」を確認・変更できます。見落とした固有のシステム名や案件名は、**検出結果に表示された文章でその文字列を選択**し、種別を選んで「匿名化対象に追加」を押します。同じ文字列を全箇所に追加します。
4. 出力を**全文目視確認**してから「コピー」を押してください。成功すると「コピー済み ✓」と表示されます。外部AIへ自動送信する機能はありません。

同じ種別・同じ文字列は同じ番号を使います。たとえば同じ会社名が２回出ても両方 `<ORG_01>` です。重なった候補は手動→ルール→NER、同じ方法なら長い候補を優先して置換します。

## 開発

Node.js 22以上とnpmを用意し、次を実行します。`npm install` 時にブラウザ用のWASMファイルを `public/wasm/` にコピーします。モデル本体はインストール・Git保存されません。開発中もブラウザはHugging Faceへ接続しません。NERを試すには、CIで取得済みのモデル一式を `public/models/` に配置する必要があります。

```bash
npm install
npm run dev
npm test
npm run build
```

WindowsでGitHubからソース一式をZIPでダウンロードした場合は、ZIPをすべて展開して、`package.json` と `package-lock.json` があるフォルダの `start-local.bat` をダブルクリックしても起動できます。初回は依存パッケージをインストールし、ブラウザを開きます。ソースZIPにはAIモデルが入らないため、ここでは形式が決まった情報のチェックを試せます。

開発URLはターミナルに表示されます。配布するファイルは `dist/` 内です。Viteは開発・ビルド用の道具で、完成したページにはサーバー処理がありません。`.npmrc` はPCでは使わないONNX RuntimeのCUDAダウンロードを省く設定です。

## 仕組みと通信

| 用語 | 短い説明 | このツールでの役割 |
| --- | --- | --- |
| NER | 文章中の名前や組織などを見つける方法 | 形式が決まった情報のチェックでは見つけにくい固有名詞を候補にします |
| ONNX | 学習済みモデルを動かすための共通形式 | 日本語NERモデルの配布形式です |
| WASM | ブラウザで計算用プログラムを動かす形式 | モデルの計算をPCのブラウザ内で実行します |
| tokenizer | 文章をモデルが扱える小さな単位に区切る部品 | モデルと一緒に取得します |

- 形式が決まった情報のチェック：**外部通信なし**。入力文章はLocalStorage、IndexedDB、Cookie、アクセス解析、ログへ保存しません。ページ再読込時に内容は消えます。
- 拡張チェック：ブラウザは**同じサイトのGitLab Pages**からモデル、tokenizer、WASMを取得します。Hugging Faceへの取得はGitLab CIだけで行います。**入力文章はPagesにも推論APIにも送信しません**。ブラウザや社内の配信基盤による通常のアクセスログには、静的ファイルのURLやIPアドレスが残る場合があります。
- このPoCはモデルキャッシュを無効にしています。ページ再表示時に再取得する可能性があります。入力文章はブラウザ内メモリにのみ保持します。コピー後のクリップボードの扱いは利用者のPCの設定に依存します。
- CIのみモデル提供元へ通信します。利用者のPCはHugging Faceへ接続しません。業務文章はHTTPリクエストに含めません。
- 外部フォント・解析タグ・外部AI APIは使いません。CSP（読み込み先を制限するブラウザ設定）の通信先を同じサイトだけに限定しています。配布先のHTTPヘッダーでも設定することを推奨します。

## 使用モデルと限界

[jiting/xlm-roberta-ner-japanese_onnx](https://huggingface.co/jiting/xlm-roberta-ner-japanese_onnx)（元モデル：[tsmatz/xlm-roberta-ner-japanese](https://huggingface.co/tsmatz/xlm-roberta-ner-japanese)）。Hugging FaceのモデルカードはMITライセンスを表示しています。量子化した `onnx/model_quantized.onnx` は約279MBです。モデル全体の保管容量は約1.97GBですが、このアプリは量子化版を要求します。tokenizerは約17.1MBで、別途設定ファイルを取得します。速度と精度はPC性能や文章で変わります。

このモデルはWikipedia由来の学習データを使っています。顧客固有の名称、略称、案件名、システム名、未学習の人名、表記揺れは見落とす可能性があります。施設と場所、企業名と製品名なども誤って分類することがあります。NER結果の文字位置はモデルAPIに含まれないため、単語を元文章に順に照合して位置を推定します。照合できない単語は採用しません。長文は約400文字ずつ処理するため、分割位置をまたぐ名称も見落とす場合があります。**このツールだけで外部共有の安全は保証できません。**

## GitLab Pagesへの配置

`.gitlab-ci.yml` は `npm ci` → テスト → **CIでモデル取得・照合** → ビルドを実行し、既定ブランチの `dist/` をPagesに公開する例です。GitLabのPages機能・利用可能なNodeイメージ・npm/JFrogの接続許可が必要です。古いGitLabで `pages.publish` に対応しない場合は、CIで `dist/` の内容を公開用 `public/` にコピーする方式へ変更してください。相対パス配信用にViteの `base` は `./` にしています。

`scripts/fetch-model.mjs` はGitLab CIでだけ実行でき、Hugging Faceの固定コミット `8d70fc4d277a84e59ccc70520ffd9daff66e66f0` から必要なモデルファイルを `public/models/jiting/xlm-roberta-ner-japanese_onnx/` に取得します。ONNX本体とtokenizerはSHA-256で検証します。`npm run build` がそれらを `dist/models/` に同梱します。取得に失敗するとCIが停止します。モデル本体はGitにコミットしません。**利用者のブラウザでは常に** `env.allowRemoteModels = false`、`env.allowLocalModels = true`、`env.localModelPath = <PagesのベースURL>/models/` です。

将来JFrog経由にする場合は、CI変数 `MODEL_BASE_URL` に承認済みモデルの配布先ディレクトリURLを指定します。同じファイル構成とハッシュならアプリの変更は不要です。JFrogの認証が必要なら保護されたCI変数 `MODEL_AUTH_TOKEN` を設定します。Pagesの配布容量・アクセス制御・キャッシュ方針を確認してください。公開Pagesに置く場合、モデルは閲覧者にダウンロード可能です。

### GitHubで先にCIを試す

GitHubリポジトリの **Actions → Check model build → Run workflow → Run workflow** で手動実行できます。テスト、Hugging Faceからの固定版モデル取得、ハッシュ照合、静的サイトのビルドまで検証します。約300MBのモデルを取得するため、時間とActionsの実行枠を使います。このワークフローは**GitHub Pagesに公開しません**。GitHub Pagesを有効にする必要もありません。結果はActions画面の実行履歴で確認できます。

NERを含む画面を自分のPCで試すには、成功した実行の **Artifacts → confidential-sanitizer-site** をダウンロードして解凍し、`index.html` と同じ場所にある `preview.bat`（または `preview.cmd`）をダブルクリックしてください。Node.jsが必要です。ブラウザで `http://127.0.0.1:4173/` を開けます。`npm ci` とソースコードの取得は不要です。`.bat` は新しいActionsの成果物に含まれます。以前ダウンロードしたZIPには入らないので、ワークフローを再実行して取得してください。成果物は1日で期限切れになります。会社の文章ではなく架空の文章で試してください。

## 構成とライセンス

`src/detection/regex`（ルール）、`validators`（番号検証）、`ner`（NER結果の位置と分類）、`manual`（手動追加）、`src/anonymize`（重なりと置換）、`src/model`（モデルとWeb Worker）、`src/security`（入力上限）、`src/ui`（画面）、`tests`（単体テスト）。独自の社員番号・管理番号のルールは `src/detection/regex/index.ts` の `extraRules` 引数から追加できます。顧客固有の値をソースに書く場合は社内の情報管理ルールに従ってください。

| npmパッケージ | 用途 | ライセンス |
| --- | --- | --- |
| `@huggingface/transformers` | ブラウザ内のNER | Apache-2.0 |
| `typescript` | 型検査 | Apache-2.0 |
| `vite` | 開発・ビルド | MIT |
| `vitest` | テスト | MIT |

依存する `onnxruntime-web` のライセンスはMITです。間接依存のライセンスは、社内配布前にロックファイルに基づき別途棚卸ししてください。fusejiのコードは使用していません。

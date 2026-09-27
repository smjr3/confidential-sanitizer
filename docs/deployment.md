# 配布基盤ごとの設定例（ソース管理者向け）

この文書はリポジトリ内の設定例と既存成果物の移行手順です。npmパッケージには含めません。一般的な起動・配布方法は [npmパッケージの利用方法](npm-package.md) を参照してください。

## GitLab Pagesへの配置

`.gitlab-ci.yml` は `npm ci` → テスト → **CIでモデル取得・照合** → ビルドを実行し、既定ブランチの `dist/` をPagesに公開する例です。GitLabのPages機能・利用可能なNodeイメージ・npm/JFrogの接続許可が必要です。古いGitLabで `pages.publish` に対応しない場合は、CIで `dist/` の内容を公開用 `public/` にコピーする方式へ変更してください。相対パス配信用にViteの `base` は `./` にしています。favicon（ブラウザのタブに表示するアイコン）は `public/favicon.svg` から配布物へコピーされ、同じサイトの相対パスで読み込みます。

`scripts/fetch-model.mjs` はCI（GitLab CIまたはGitHub Actions）でだけ実行でき、Hugging Faceの固定コミット `8d70fc4d277a84e59ccc70520ffd9daff66e66f0` から必要なモデルファイルを `public/models/jiting/xlm-roberta-ner-japanese_onnx/` に取得します。ONNX本体とtokenizerはSHA-256で検証します。`npm run build` がそれらを `dist/models/` に同梱します。取得に失敗するとCIが停止します。モデル本体はGitにコミットしません。**利用者のブラウザでは常に** `env.allowRemoteModels = false`、`env.allowLocalModels = true`、`env.localModelPath = <PagesのベースURL>/models/` です。

将来JFrog経由にする場合は、CI変数 `MODEL_BASE_URL` に承認済みモデルの配布先ディレクトリURLを指定します。同じファイル構成とハッシュならアプリの変更は不要です。JFrogの認証が必要なら保護されたCI変数 `MODEL_AUTH_TOKEN` を設定します。Pagesの配布容量・アクセス制御・キャッシュ方針を確認してください。公開Pagesに置く場合、モデルは閲覧者にダウンロード可能です。

### GitHubで先にCIを試す

GitHubリポジトリの **Actions → Check model build → Run workflow → Run workflow** で手動実行できます。テスト、Hugging Faceからの固定版モデル取得、ハッシュ照合、静的サイトのビルドまで検証します。約300MBのモデルを取得するため、時間とActionsの実行枠を使います。このワークフローは**GitHub Pagesに公開しません**。GitHub Pagesを有効にする必要もありません。結果はActions画面の実行履歴で確認できます。

Actions成果物は実行時点のコードとモデルをまとめた配布物です。ダウンロードしてPCに保存した成果物は、ブラウザでチェックするたびにCIを実行せずに繰り返し使えます。**コードを更新して新しい画面を使う場合**や、GitHub上の成果物が保存期限を過ぎて再取得する場合は、ワークフローをもう一度実行してください。現在のCI設定はビルドごとにモデルを取得します。GitLab Pagesでも新しい配布物を作るCIの実行時に取得します。将来JFrogで保管すれば取得元を切り替えられます。

**最新版のコードから新しく Run workflow で開始した実行**の成果物を自分のPCで試すには、成功した実行の **Artifacts → confidential-sanitizer-site** をダウンロードして解凍し、`index.html` と同じ場所にある `preview.bat` をダブルクリックしてください。Node.jsが必要です。ブラウザで `http://127.0.0.1:4173/` を開けます。`npm ci` とソースコードの取得は不要です。**旧実行の Re-run jobs は旧コミットのコードを再実行するため、batのない成果物のままです。** その場合は前述の方法で旧成果物の `models` をソース側へコピーしてください。成果物は1日で期限切れになります。会社の文章ではなく架空の文章で試してください。

## 既存のモデル入り成果物を利用する

**名前・組織名のチェックをローカルで使う場合：** GitHubのソースZIPにはモデルがないため、そのままでは使えません。すでに成果物をダウンロードしている場合は、次段落の方法でモデルをコピーできます。最新版のGitHub Actions「Check model build」を新たに実行した場合は、成果物ZIP `confidential-sanitizer-site` を展開して、そのフォルダの `preview.bat` を実行します。入力テキストをモデル確認用の通信へ含めません。

**すでにダウンロードした成果物に `preview.bat` がない場合：** 古いActions実行から取得した成果物には起動ファイルがありません。その成果物にある `models` フォルダを、最新版ソースの `public` フォルダの中へコピーし、`public/models/jiting/xlm-roberta-ner-japanese_onnx/config.json` がある状態にしてください。その後、**ソース側の** `preview.bat` を起動します。モデルの取得やCIの再実行は不要です。`models` はGitにコミットされません。


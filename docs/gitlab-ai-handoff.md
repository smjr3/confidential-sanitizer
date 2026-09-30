# GitLab側のAIへの引き継ぎ：npmからPagesへ配置

この文書全体を、導入先GitLabで作業するAIへ渡してください。
導入先固有のURL・認証情報は記載していません。この文書はnpm配布対象外です。

## 作業依頼

`confidential-sanitizer` を、承認済みのnpmレジストリからCIで取得し、
GitLab Pagesで利用できるようにしてください。まずAIモデルなしで稼働させます。
実際に利用できる環境を確認し、既存ファイルや既存サイトを壊さず実装してください。

## アプリの仕様と導入方式

- ブラウザ内で機密情報候補を検出し、記号へ置き換える静的Webアプリです。
- 「形式が決まった情報をチェック」はメール・電話・IP等を検出します。AIへの確認通信・読み込み・推論は行いません。
- 任意文字列の手動追加、候補の解除、置換先編集、コピー、TXT・CSV出力に対応します。
- 「再置換」は置換リストを引き継ぐかCSVを読み込み、AIの回答等の記号を元の文字列に戻します。AIモデルは不要です。
- 「名前・組織名もチェック（ローカルAI）」は任意機能です。モデル未配置でも形式チェックの結果は残ります。
- npmにはビルド済み画面・検出処理・AI実行プログラム・WASM（ブラウザで計算する部品）・ライセンスを含みます。学習済みモデル・tokenizer・開発用ソースは含みません。
- npmを取得後、付属の `export` コマンドで静的ファイルを書き出します。Viteのビルドや開発用依存関係のインストールは不要です。
- Node.js 22.12以上はCIでの書き出しに必要です。利用者のPCへのNode.js導入、アプリ用サーバー、DB、ログイン機能は不要です。
- GitLab Runner（CIを実行する仕組み）とGitLab Pagesの利用環境は必要です。
- 本体はMITです。同梱された第三者ライブラリのライセンス・NOTICEも保持してください。

## 最初に確認する情報

環境から確認できるものを先に調べ、不足する値だけ担当者へ確認してください。

| 項目 | 確認内容 |
| --- | --- |
| 対象プロジェクト | 導入先、既定ブランチ、既存CI・Pagesの有無 |
| GitLabのバージョン | 下の例は17.9以降の `pages.publish` 形式 |
| Runner | 利用できるRunner、必要なタグ、Node.js 22.12以上の承認済み実行環境 |
| npm取得先 | JFrog等の承認済みnpmレジストリURLと認証方法 |
| パッケージ | 公開済みの正確なパッケージ名・バージョン・取得権限 |
| Pages | 有効化状況、URL、閲覧権限、配信容量、HTTPS |

作成側のパッケージ設定は `confidential-sanitizer@0.1.0` ですが、
**npm公開済み・導入先レジストリへ同期済みとは限りません。取得可能か確認してください。**
同じ0.1.0を開発中に再作成しているため、取得版に上記の2つのチェックボタンと再置換があるかも確認します。
未公開なら作成者に公開を依頼し、承認されていないGitHub直接取得等へ勝手に切り替えないでください。

## 導入手順

1. 既存のCI設定と配信先を確認し、変更用ブランチで作業します。
2. CI変数と認証設定を用意します。トークンはGit・配布物・ログへ入れません。
3. 承認済みレジストリから、固定バージョンのnpmパッケージを専用作業フォルダへ取得します。
4. パッケージ付属コマンドで、存在しないか空のフォルダへ `export` します。
5. そのフォルダの内容をPagesへ配置します。`node_modules` 全体を公開してはいけません。
6. 下記の受入確認を行い、差分・CI結果・Pages URLを報告します。

既存の `.gitlab-ci.yml` を丸ごと置き換えず、必要なジョブを統合してください。
新規専用プロジェクトなら、以下を開始点にできます。
ソースリポジトリにある `.gitlab-ci.yml` はソースからビルドしてモデルを取得する別方式なので、そのまま転用しません。

## CI設定例：モデルなし

次のCI変数を事前設定します。例中の値を推測で埋めないでください。

- `SANITIZER_NODE_IMAGE`：承認済みのNode.js 22.12以上を含むコンテナイメージ
- `NPM_REGISTRY_URL`：承認済みnpmレジストリのHTTPS URL
- `SANITIZER_PACKAGE_NAME`：取得可能なパッケージ名（現在の作成名は `confidential-sanitizer`）
- `SANITIZER_VERSION`：公開済みの固定バージョン（`latest` は使用しない）
- 認証が必要な場合は、環境の方式に合わせた `.npmrc` をGitLabのファイル型CI変数として登録し、`NPM_CONFIG_USERCONFIG` に設定します。認証不要なら不要です。資格情報はマスク・保護設定を適用し、変数や設定内容をログ表示しません。

```yaml
stages: [deploy]

sanitizer-pages:
  stage: deploy
  image: $SANITIZER_NODE_IMAGE
  # Runnerにタグが必要なら、確認済みの値でtagsを追加する。
  script:
    - |
      set -eu
      : "${NPM_REGISTRY_URL:?npmレジストリURLを設定してください}"
      : "${SANITIZER_PACKAGE_NAME:?公開済みパッケージ名を設定してください}"
      : "${SANITIZER_VERSION:?固定バージョンを設定してください}"
      npm install --prefix .sanitizer-tooling --no-save --package-lock=false --ignore-scripts --no-audit --no-fund --registry "$NPM_REGISTRY_URL" "${SANITIZER_PACKAGE_NAME}@${SANITIZER_VERSION}"
      ./.sanitizer-tooling/node_modules/.bin/confidential-sanitizer --version
      ./.sanitizer-tooling/node_modules/.bin/confidential-sanitizer export sanitizer-site
      test -s sanitizer-site/index.html
      test -s sanitizer-site/favicon.svg
      test -d sanitizer-site/assets
      test -d sanitizer-site/licenses
  pages:
    publish: sanitizer-site
  artifacts:
    paths:
      - sanitizer-site
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

`.sanitizer-tooling/` と `sanitizer-site/` は生成物としてGit管理対象外にします。
前回の生成物をキャッシュ・別ジョブの成果物から復元しないでください。
`export` は非空フォルダへの書き出しを拒否します。既存ディレクトリを無断削除せず、用途を確認してください。
取得エラー時にnpm公式レジストリ等へ自動フォールバックしないでください。
取得物を固定して再利用したい場合は、利用環境で生成したロックファイルを管理し、CIを `npm ci` 方式へ調整できます。

GitLab 17.9未満の場合は、導入先のバージョンに対応したPages構文へ変更し、
必要に応じて公開用 `public/` を使用してください。既存の `public/` を無断で上書きしません。
導入先のCI Lint（CI設定の構文チェック）で検証してください。この例は導入先での実行確認前です。

## AIモデルは後から追加できる

初回導入でモデル取得ジョブを作る必要はありません。
後から許可された取得元・認証・配布方法が決まった場合だけ、CIでモデルを用意し、
`export` 後に次の構造で配置します。

```text
sanitizer-site/
  index.html
  assets/
  wasm/
  licenses/
  models/jiting/xlm-roberta-ner-japanese_onnx/
    config.json
    tokenizer.json
    tokenizer_config.json
    special_tokens_map.json
    sentencepiece.bpe.model
    README.md
    onnx/model_quantized.onnx
```

モデルの取得・照合仕様は作成側の `scripts/fetch-model.mjs` を参照します。
このスクリプト自体もnpmには含みません。必要なら承認済み経路で内容を受け渡してください。
モデルをGitへコミットせず、npmのインストール時や利用者のブラウザからHugging Faceへ取得しません。
`env.allowRemoteModels = false` を維持し、モデル・tokenizer・WASMをPagesと同一オリジンで配信します。

## 維持する条件と受入確認

- 入力・CSV・復元結果を外部APIへ送信しない。本文をログ、Cookie、LocalStorage、IndexedDBへ保存しない。
- アクセス解析、外部フォント、AIへの直接送信機能を追加しない。CSP（通信先等の制限）を弱めない。
- モデルなしで起動し、形式チェック、ハイライト、手動追加、候補解除、置換先編集を確認する。
- 同じ文字列が同じ記号になり、コピー・TXT・CSV出力、リスト引き継ぎ・CSVからの再置換が動くことを確認する。
- 形式チェック時にモデル取得通信がないことを、架空データとブラウザの通信記録で確認する。
- AIボタンを押しても、モデルなしで形式チェックの結果が失われないことを確認する。
- サブパス配信でもCSS・JavaScript・faviconが取得できることを確認する。
- Pagesの閲覧範囲は対象プロジェクトの方針に従い、勝手に公開範囲を広げない。
- 実施できなかった検証は未確認と明記する。検出結果だけで安全を保証しない。

## GitLab側で機能を改修したくなった場合

現行npmにはTypeScriptソース、`src/content/ja.json`、Vite設定、テストは含まれません。
通常のソース改修・再ビルドには、別途ソース一式を承認された経路で持ち込む必要があります。
**ソース同梱npmへの変更はまだ実施していません。** npm版の `npm run build` で改修できると案内しないでください。
`node_modules` 内の変更は再取得で失われます。継続的な改修はソース管理とビルド手順を整えてから行います。

## 参照先

- 作成元：https://github.com/smjr3/confidential-sanitizer
- 一般的なnpm利用方法：https://github.com/smjr3/confidential-sanitizer/blob/main/docs/npm-package.md
- GitLab PagesのCI構文：https://docs.gitlab.com/ci/yaml/#pagespublish

外部サイトを閲覧できない環境でも、この文書内の手順から作業を開始できます。
作業結果は、変更ファイル・固定したパッケージ版・CI実行結果・公開URL・未完了事項を簡潔に報告してください。

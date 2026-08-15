# 統計データノート

総務省統計局などが公表する公的統計データを、意味づけと解説つきで可視化するサイト。Astro製の静的サイトで、GitHub Pagesに公開する想定。

## 開発

```sh
npm install
npm run dev      # http://localhost:4321/newthree/
npm run build    # dist/ に静的出力
npm run preview  # ビルド結果をローカル確認
```

## 構成

- `src/content/articles/*.md` — 記事のメタデータ（タイトル、カテゴリ、出典など）と解説文
- `src/pages/articles/*.astro` — 記事ごとのページ本体。データとグラフコンポーネントを組み合わせる
- `src/components/charts/` — 再利用可能なグラフコンポーネント
- `src/pages/categories/` — カテゴリ一覧・カテゴリ別記事一覧（記事が増えると自動生成）
- `scripts/fetch-*.js` — e-Stat APIからデータを取得し `src/data/*.json` に書き出すスクリプト
- `.github/workflows/deploy.yml` — mainブランチへのpushでGitHub Pagesに自動デプロイ
- `.github/workflows/update-data.yml` — 毎月1日にe-Statから最新データを再取得し、変化があればmainにコミット（→deploy.ymlが動いて自動反映）

## 記事を増やすには

1. `src/content/articles/` に新しいMarkdownファイルを追加（タイトル・カテゴリ・出典などのfrontmatter必須）
2. `src/pages/articles/` にそのデータとグラフを描画するページを追加
3. 既存のグラフコンポーネントで足りなければ `src/components/charts/` に新しいコンポーネントを追加

カテゴリページは記事のfrontmatterから自動生成されるため、新しいカテゴリ名を使うだけで一覧に反映される。

## e-Stat APIからのデータ取得

`ESTAT_APP_ID` 環境変数（[e-Statで無料発行](https://www.e-stat.go.jp/mypage/user/preregister)したアプリケーションID）を使い、`npm run fetch:population` のようなスクリプトで統計データを取得して `src/data/` にJSONとして保存する。ビルド時にAstroページから直接importして使う。

新しいデータセットを追加するには `scripts/fetch-population.js` を参考に `scripts/fetch-<データ名>.js` を作り、`package.json` にnpm scriptを追加し、`.github/workflows/update-data.yml` にステップを追記する。

CIでは `ESTAT_APP_ID` をリポジトリのSecrets（Settings → Secrets and variables → Actions）に登録して使う。

## 出典について

各記事は政府標準利用規約2.0（CC BY 4.0相当）に基づき、公的統計データを加工・可視化したもの。出典は各記事ページ下部に明記。

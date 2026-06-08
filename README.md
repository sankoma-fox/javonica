# Javonica（共演作品アーカイブ）

女優ごとに「特定の俳優との共演作品」を1ページにまとめて紹介するアフィリエイトサイト。
プロジェクト名: `javonica` / 想定ドメイン: `javonica.com`
データは **FANZA(DMM)公式API経由のみ** で取得し、スクレイピングは行わない。

## スタック

- **ホスティング / API / DB / 認証**: すべて Cloudflare（無料枠・商用可）
  - Cloudflare Pages（静的フロント配信）
  - Pages Functions（`/api/*` のサーバー処理。API ID秘匿・CORS回避）
  - D1（SQLite。作品データと付加情報を保存）
  - Cloudflare Access（`/admin` と `/api/admin/*` の保護）
- **フロント**: Vite + React（公開用 `index.html` / 管理用 `admin.html` の2エントリ）

## ディレクトリ構成

```
db/schema.sql                  D1スキーマ(全6テーブル)
functions/
  _lib/fanza.js                FANZA API呼び出し・パース・タイトル短縮
  _lib/store.js                D1書き込み(upsert・付加情報の温存)
  api/search.js                POST /api/search   タイトル一括検索+候補保存
  api/fetch.js                 POST /api/fetch    選択cidの本取得→D1保存
  api/pages.js                 GET  /api/pages    公開ページ一覧(トップ用)
  api/page/[slug].js           GET  /api/page/:slug 公開ページ詳細
  api/admin/pages.js           GET/POST 管理用ページ一覧・作成
  api/admin/page/[id].js       GET/PATCH 管理用ページ詳細・status変更
  api/admin/work.js            PATCH 作品のリライト文・承認・順位・公開
  api/admin/candidate/reject.js POST 候補の却下
src/public/                    公開フロント(年齢確認・トップ・詳細)
src/admin/                     管理フロント(ページ管理・検索・レビュー)
```

## セットアップ

```bash
npm install

# FANZAアフィリエイト登録で API ID / アフィリエイトID を取得し、
cp .dev.vars.example .dev.vars   # 値を記入(ローカル開発用)

# D1データベースを作成し、出力されたIDを wrangler.toml に記入
npx wrangler d1 create javonica-db
# スキーマ適用(ローカル)
npx wrangler d1 execute javonica-db --local --file=db/schema.sql
# スキーマ適用(本番)
npx wrangler d1 execute javonica-db --remote --file=db/schema.sql
```

## ローカル開発

```bash
# フロント(Vite)
npm run dev
# Functions + D1(別ターミナル)。/api を 8788 で配信、Viteがプロキシ
npx wrangler pages dev -- npm run dev
```

## デプロイ(Cloudflare Pages)

1. このリポジトリを GitHub に push
2. Cloudflare Pages で GitHub 連携、ビルドコマンド `npm run build` / 出力 `dist`
3. D1 バインディング(`DB`)を Pages プロジェクトに紐付け
4. シークレットを設定:
   ```bash
   npx wrangler pages secret put DMM_API_ID
   npx wrangler pages secret put DMM_AFFILIATE_ID
   ```
5. **Cloudflare Access** で `/admin*` と `/api/admin/*` を保護(自分のGoogleアカウント等)
6. 独自ドメインは、本格運用(ASP登録)の直前に Cloudflare で取得して接続

## 運用フロー

### アフィリエイト登録前（手動でサイトを用意して審査申請）

FANZAアフィリエイトの審査にはコンテンツのある実サイトURLが必要。承認前は手動でデータを入れる。

1. 管理画面でページを作成
2. 「手動で作品を登録」フォームに、FANZA作品ページURLの cid（例 `.../cid=abc00123/` の `abc00123`）とタイトル・配信日などを手入力
   - 画像とアフィリエイトリンクはこの時点では入らない（著作権・規約上、承認前にFANZA画像は使えない）
   - 紹介文は自分でリライトして入力
3. 数本のページを公開し、その `javonica.com` のURLで FANZA アフィリエイトに申請

### アフィリエイト承認後（APIで正規データに置き換え）

4. API ID / アフィリエイトID をシークレットに登録（下記デプロイ手順 4）
5. 手動登録済みの作品は cid が既にあるので、取得を実行すると画像・公式リンク・正式情報が自動で埋まる
   - **手で書いた紹介文・承認状態・順位・公開フラグは温存される**（API取得で上書きされない）
6. 以降は「タイトル一括検索 → 候補選択 → 取得」のAPIフローで運用

### 通常運用（API承認後）

1. ページ作成
2. 出演を確認した作品の **タイトルをカンマ区切りで入力** して一括検索
   - 全文一意→自動選択 / 複数→選ぶ / 0件→要再検索（全文0件時は自動短縮で再検索）
3. 正しい作品を選んで取得 → D1保存（非公開・未チェック）
4. 紹介文をリライトし、確認して承認
5. 順位・公開フラグを調整し、ページを公開

## 設計上の遵守事項(重要)

- データ取得は FANZA 公式API経由のみ。スクレイピングはしない
- 作品の特定(どれに誰が出ているか)は人間が行う。APIで取得するのは正規データのみ
- API原文(`raw_description`)は内部参照用。**公開ページにはリライト文のみ** を出す
- 公開されるのは `status=published` かつ作品が `is_published=1` かつ `review_status=approved` のものだけ(二段の公開判定)。未チェックの紹介文は表に出ない
- 再取得しても、人間が編集した付加情報(リライト文・承認状態・順位・公開フラグ)は温存される
- 年齢確認(18歳未満は閲覧不可)と PR表記(アフィリエイト明示)を設置済み
- ※法的判断は最終的に専門家・ASP最新規約で確認すること

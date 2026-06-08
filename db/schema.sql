-- =============================================================
--  共演まとめサイト D1 スキーマ (SQLite / Cloudflare D1)
--  方針:
--    - FANZA公式APIの正規データ(ITEM)と、付加情報(リライト文/順位/公開フラグ)を分離
--    - 特定は人間、データは公式API。スクレイピングなし
--    - draft -> reviewing -> published のワークフロー
--    - 未チェックの紹介文は表に出さない二段の公開判定
-- =============================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------
-- PAGE: 記事ページ1本 =「○○が△△と共演した作品」
--   actress_* = 主役の女優 / costar_* = 共演相手(吉村卓など、汎用化)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actress_id    TEXT    NOT NULL,             -- FANZAの女優ID
  actress_name  TEXT    NOT NULL,
  costar_id     TEXT,                          -- 男優は構造化されないのでNULL許容
  costar_name   TEXT    NOT NULL,              -- 例: 吉村卓
  slug          TEXT    NOT NULL UNIQUE,       -- URL用 (例: yoshimura-x-actressname)
  title         TEXT    NOT NULL,              -- 自動生成タイトル
  status        TEXT    NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','reviewing','published')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_actress   ON page(actress_id);
CREATE INDEX IF NOT EXISTS idx_page_status    ON page(status);

-- -------------------------------------------------------------
-- ITEM: 作品マスタ = FANZA APIの正規データ置き場
--   raw_description (API原文) と rewritten_description (リライト) を分離
--   review_status で人間チェック状態を管理
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item (
  content_id            TEXT PRIMARY KEY,       -- FANZAのcid
  title                 TEXT NOT NULL,
  affiliate_url         TEXT NOT NULL,          -- アフィリエイトリンク(API正規)
  image_large           TEXT,                   -- 大画像URL
  image_small           TEXT,                   -- サムネURL
  label                 TEXT,                   -- レーベル
  maker                 TEXT,                   -- メーカー
  series                TEXT,                   -- シリーズ名
  series_id             TEXT,                   -- 芋づる展開用
  maker_id              TEXT,                   -- 芋づる展開用
  release_date          TEXT,                   -- 配信開始日
  review_score          REAL,                   -- レビュー平均点
  review_count          INTEGER,                -- レビュー件数
  raw_description       TEXT,                   -- API原文(丸写し禁止・内部参照用)
  rewritten_description TEXT,                   -- リライト紹介文(公開はこちら)
  review_status         TEXT NOT NULL DEFAULT 'pending'
                          CHECK (review_status IN ('pending','approved','rejected')),
  fetched_at            TEXT NOT NULL DEFAULT (datetime('now')),  -- 最終取得日時
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_item_review    ON item(review_status);
CREATE INDEX IF NOT EXISTS idx_item_series    ON item(series_id);
CREATE INDEX IF NOT EXISTS idx_item_maker     ON item(maker_id);

-- -------------------------------------------------------------
-- PAGE_ITEM: PAGE <-> ITEM の多対多 + ページ固有の付加情報
--   1作品が複数ページに登場しうる
--   manual_rank: そのページでの手動順位 (NULLならAPI順)
--   is_published: 作品単位の公開フラグ
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_item (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id       INTEGER NOT NULL,
  content_id    TEXT    NOT NULL,
  manual_rank   INTEGER,                        -- 手動順位。NULL = 未設定
  is_published  INTEGER NOT NULL DEFAULT 1,     -- 0/1
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page_id, content_id),
  FOREIGN KEY (page_id)    REFERENCES page(id)        ON DELETE CASCADE,
  FOREIGN KEY (content_id) REFERENCES item(content_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pageitem_page  ON page_item(page_id);
CREATE INDEX IF NOT EXISTS idx_pageitem_item  ON page_item(content_id);

-- -------------------------------------------------------------
-- ITEM_SAMPLE_IMAGE: サンプル画像グリッド用 (1作品に複数枚)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_sample_image (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id    TEXT    NOT NULL,
  image_url     TEXT    NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (content_id) REFERENCES item(content_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sample_item    ON item_sample_image(content_id);

-- -------------------------------------------------------------
-- ITEM_ACTRESS: 各作品の出演女優(APIから取得・自動で埋まる)
--   男優は構造化されないのでここには基本入らない
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_actress (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id    TEXT    NOT NULL,
  actress_id    TEXT,
  actress_name  TEXT    NOT NULL,
  FOREIGN KEY (content_id) REFERENCES item(content_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_itemactress_item    ON item_actress(content_id);
CREATE INDEX IF NOT EXISTS idx_itemactress_actress ON item_actress(actress_id);

-- -------------------------------------------------------------
-- CANDIDATE: 確認待ちの候補(タイトル検索の結果)
--   軽いメタ情報だけ保持。approvedになって初めて本取得
--   source: title_search / series / maker / actress (発見元)
--   match_stage: full / trimmed (短縮ヒットは取り違え注意)
--   search_keyword: 実際に投げたkeyword (人間が手直しして再検索できる)
--   source_title: 入力された元タイトル(どの入力から来た候補か追跡)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id         INTEGER NOT NULL,
  content_id      TEXT    NOT NULL,
  title           TEXT,
  image_small     TEXT,
  release_date    TEXT,
  maker           TEXT,
  source          TEXT    NOT NULL DEFAULT 'title_search'
                    CHECK (source IN ('title_search','series','maker','actress')),
  source_title    TEXT,                          -- 入力された元タイトル
  search_keyword  TEXT,                          -- 実際にAPIへ投げた文字列
  match_stage     TEXT    DEFAULT 'full'
                    CHECK (match_stage IN ('full','trimmed')),
  score           INTEGER NOT NULL DEFAULT 0,     -- 確度スコア(並び順)
  decision        TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (decision IN ('pending','approved','rejected')),
  decided_at      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page_id, content_id),
  FOREIGN KEY (page_id) REFERENCES page(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_candidate_page     ON candidate(page_id);
CREATE INDEX IF NOT EXISTS idx_candidate_decision ON candidate(decision);
CREATE INDEX IF NOT EXISTS idx_candidate_content  ON candidate(content_id);

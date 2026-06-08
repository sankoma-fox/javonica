// =============================================================
//  D1 書き込み処理
//  1作品の取得データを item / sample_image / actress に整合的に保存
//  - D1 の batch() で複数文をまとめて実行（トランザクション的に）
//  - 再取得時に付加情報(rewritten_description/review_status)を壊さない upsert
// =============================================================

// -------------------------------------------------------------
// 1作品分の保存ステートメント配列を組み立てて返す
//   db: env.DB (D1Database)
//   item: normalizeItem() の返り値
//   既存の rewritten_description / review_status は温存する（再取得対策）
// -------------------------------------------------------------
export function buildItemUpsertStatements(db, item) {
  const stmts = [];

  // --- item 本体: INSERT、衝突時は API由来フィールドのみ更新 ---
  // rewritten_description と review_status は UPDATE 句に含めない＝温存
  stmts.push(
    db
      .prepare(
        `INSERT INTO item
          (content_id, title, affiliate_url, image_large, image_small,
           label, maker, series, series_id, maker_id,
           release_date, review_score, review_count, raw_description,
           source, fetched_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'api', datetime('now'), datetime('now'))
         ON CONFLICT(content_id) DO UPDATE SET
           title=excluded.title,
           affiliate_url=excluded.affiliate_url,
           image_large=excluded.image_large,
           image_small=excluded.image_small,
           label=excluded.label,
           maker=excluded.maker,
           series=excluded.series,
           series_id=excluded.series_id,
           maker_id=excluded.maker_id,
           release_date=excluded.release_date,
           review_score=excluded.review_score,
           review_count=excluded.review_count,
           raw_description=excluded.raw_description,
           source='api',
           fetched_at=datetime('now'),
           updated_at=datetime('now')`
      )
      .bind(
        item.content_id,
        item.title,
        item.affiliate_url,
        item.image_large,
        item.image_small,
        item.label,
        item.maker,
        item.series,
        item.series_id,
        item.maker_id,
        item.release_date,
        item.review_score,
        item.review_count,
        item.raw_description
      )
  );

  // --- sample_image: 一旦全削除して入れ直し（最新の並びに揃える） ---
  stmts.push(
    db.prepare(`DELETE FROM item_sample_image WHERE content_id = ?`).bind(item.content_id)
  );
  (item.sample_images ?? []).forEach((url, i) => {
    stmts.push(
      db
        .prepare(
          `INSERT INTO item_sample_image (content_id, image_url, sort_order) VALUES (?,?,?)`
        )
        .bind(item.content_id, url, i)
    );
  });

  // --- actress: 同じく入れ直し ---
  stmts.push(
    db.prepare(`DELETE FROM item_actress WHERE content_id = ?`).bind(item.content_id)
  );
  (item.actresses ?? []).forEach((a) => {
    stmts.push(
      db
        .prepare(
          `INSERT INTO item_actress (content_id, actress_id, actress_name) VALUES (?,?,?)`
        )
        .bind(item.content_id, a.id, a.name)
    );
  });

  return stmts;
}

// -------------------------------------------------------------
// page_item に紐付け（既にあれば何もしない＝順位/公開フラグを温存）
// -------------------------------------------------------------
export function buildPageItemLinkStatement(db, pageId, contentId) {
  return db
    .prepare(
      `INSERT INTO page_item (page_id, content_id) VALUES (?,?)
       ON CONFLICT(page_id, content_id) DO NOTHING`
    )
    .bind(pageId, contentId);
}

// -------------------------------------------------------------
// candidate を approved に更新（取得済みの印）
// -------------------------------------------------------------
export function buildCandidateApproveStatement(db, pageId, contentId) {
  return db
    .prepare(
      `UPDATE candidate SET decision='approved', decided_at=datetime('now')
       WHERE page_id = ? AND content_id = ?`
    )
    .bind(pageId, contentId);
}

// -------------------------------------------------------------
// candidate を1件 upsert（検索結果の保存）
//   既に判断済み(approved/rejected)のものは decision を壊さない
//   軽いメタ情報のみ。score/match_stage/source等を保持
// -------------------------------------------------------------
export function buildCandidateUpsertStatement(db, pageId, c) {
  return db
    .prepare(
      `INSERT INTO candidate
        (page_id, content_id, title, image_small, release_date, maker,
         source, source_title, search_keyword, match_stage, score)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(page_id, content_id) DO UPDATE SET
         title=excluded.title,
         image_small=excluded.image_small,
         release_date=excluded.release_date,
         maker=excluded.maker,
         source=excluded.source,
         source_title=excluded.source_title,
         search_keyword=excluded.search_keyword,
         match_stage=excluded.match_stage,
         score=excluded.score`
    )
    .bind(
      pageId,
      c.content_id,
      c.title ?? null,
      c.image_small ?? null,
      c.release_date ?? null,
      c.maker ?? null,
      c.source ?? "title_search",
      c.source_title ?? null,
      c.search_keyword ?? null,
      c.match_stage ?? "full",
      c.score ?? 0
    );
}

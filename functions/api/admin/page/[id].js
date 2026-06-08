// =============================================================
//  GET   /api/admin/page/:id     管理用ページ詳細
//        - ページ情報 + pending候補 + 登録済み作品（レビュー状態込み）
//  PATCH /api/admin/page/:id     ページのstatus等を更新
//        body: { status?: 'draft'|'reviewing'|'published', title? }
// =============================================================

export async function onRequestGet({ params, env }) {
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);
  const id = Number(params?.id);
  if (!id) return json({ error: "invalid id" }, 400);

  const page = await env.DB.prepare(
    `SELECT id, actress_id, actress_name, costar_id, costar_name, slug, title, status, updated_at
     FROM page WHERE id = ?`
  )
    .bind(id)
    .first();
  if (!page) return json({ error: "page not found" }, 404);

  // pending候補（score降順、短縮ヒットが分かるように match_stage 付き）
  const candidates = await env.DB.prepare(
    `SELECT content_id, title, image_small, release_date, maker,
            source_title, search_keyword, match_stage, score
     FROM candidate
     WHERE page_id = ? AND decision = 'pending'
     ORDER BY score DESC, created_at ASC`
  )
    .bind(id)
    .all();

  // 登録済み作品（レビュー状態・順位・公開フラグ込み）
  const works = await env.DB.prepare(
    `SELECT i.content_id, i.title, i.image_small, i.release_date,
            i.review_status, i.rewritten_description,
            i.source, i.fetched_at, i.affiliate_url,
            pi.manual_rank, pi.is_published
     FROM page_item pi
     JOIN item i ON i.content_id = pi.content_id
     WHERE pi.page_id = ?
     ORDER BY COALESCE(pi.manual_rank, 9999), i.review_score DESC`
  )
    .bind(id)
    .all();

  return json({
    page,
    candidates: candidates?.results ?? [],
    works: works?.results ?? [],
  });
}

export async function onRequestPatch({ params, request, env }) {
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);
  const id = Number(params?.id);
  if (!id) return json({ error: "invalid id" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const fields = [];
  const args = [];
  if (body?.status !== undefined) {
    if (!["draft", "reviewing", "published"].includes(body.status)) {
      return json({ error: "invalid status" }, 400);
    }
    fields.push("status = ?");
    args.push(body.status);
  }
  if (body?.title !== undefined) {
    fields.push("title = ?");
    args.push(String(body.title));
  }
  if (fields.length === 0) return json({ error: "nothing to update" }, 400);

  fields.push("updated_at = datetime('now')");
  args.push(id);

  await env.DB.prepare(`UPDATE page SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...args)
    .run();

  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

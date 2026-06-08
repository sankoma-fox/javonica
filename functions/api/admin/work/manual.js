// =============================================================
//  POST /api/admin/work/manual
//  API承認前に、人間が手で作品データを登録する
//    body: {
//      page_id (必須),
//      content_id (必須・FANZAのcid。承認後のAPI取得キーになる),
//      title (必須),
//      release_date?, label?, maker?, rewritten_description?
//    }
//  画像・アフィリエイトURLは入れない(承認後にAPI取得で埋まる)
//  既にAPI取得済み(source='api')の作品は手動で上書きしない
// =============================================================

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const pageId = body?.page_id;
  const contentId = (body?.content_id ?? "").toString().trim();
  const title = (body?.title ?? "").toString().trim();

  if (!pageId) return json({ error: "page_id required" }, 400);
  if (!contentId) return json({ error: "content_id (cid) required" }, 400);
  if (!title) return json({ error: "title required" }, 400);

  // cidの簡易バリデーション(英数字とアンダースコアのみ)
  if (!/^[a-zA-Z0-9_]+$/.test(contentId)) {
    return json({ error: "content_id は半角英数字で入力してください（例: abc00123）" }, 400);
  }

  // ページ存在確認
  const page = await env.DB.prepare(`SELECT id FROM page WHERE id = ?`).bind(pageId).first();
  if (!page) return json({ error: "page not found" }, 404);

  // 既存itemの取得元を確認。API取得済みなら手動上書きしない
  const existing = await env.DB.prepare(
    `SELECT source FROM item WHERE content_id = ?`
  ).bind(contentId).first();

  if (existing && existing.source === "api") {
    // 既にAPIデータがある → page_item紐付けだけ行い、itemは触らない
    await env.DB.prepare(
      `INSERT INTO page_item (page_id, content_id) VALUES (?,?)
       ON CONFLICT(page_id, content_id) DO NOTHING`
    ).bind(pageId, contentId).run();
    return json({ ok: true, note: "既にAPI取得済みの作品です。ページに紐付けました。", linked: true });
  }

  const release_date = body?.release_date ? String(body.release_date).trim() : null;
  const label = body?.label ? String(body.label).trim() : null;
  const maker = body?.maker ? String(body.maker).trim() : null;
  const rewritten = body?.rewritten_description ? String(body.rewritten_description) : null;

  const stmts = [
    // item を手動データで upsert (source='manual', affiliate_url/画像はNULL)
    env.DB.prepare(
      `INSERT INTO item
        (content_id, title, release_date, label, maker, rewritten_description, source, updated_at)
       VALUES (?,?,?,?,?,?, 'manual', datetime('now'))
       ON CONFLICT(content_id) DO UPDATE SET
         title=excluded.title,
         release_date=excluded.release_date,
         label=excluded.label,
         maker=excluded.maker,
         rewritten_description=COALESCE(excluded.rewritten_description, item.rewritten_description),
         updated_at=datetime('now')`
    ).bind(contentId, title, release_date, label, maker, rewritten),
    // ページに紐付け
    env.DB.prepare(
      `INSERT INTO page_item (page_id, content_id) VALUES (?,?)
       ON CONFLICT(page_id, content_id) DO NOTHING`
    ).bind(pageId, contentId),
  ];
  await env.DB.batch(stmts);

  return json({ ok: true, content_id: contentId, source: "manual" }, 201);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

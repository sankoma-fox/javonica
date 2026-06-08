// =============================================================
//  POST /api/admin/candidate/reject
//    body: { page_id, content_ids: [...] }
//  候補を rejected にする（再表示されなくなる）
//  ※ approve は本取得(/api/fetch)が兼ねるのでここには無い
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
  const ids = Array.isArray(body?.content_ids) ? body.content_ids : [];
  if (!pageId) return json({ error: "page_id required" }, 400);
  if (ids.length === 0) return json({ error: "content_ids is empty" }, 400);

  const stmts = ids.map((cid) =>
    env.DB.prepare(
      `UPDATE candidate SET decision='rejected', decided_at=datetime('now')
       WHERE page_id = ? AND content_id = ?`
    ).bind(pageId, String(cid))
  );
  await env.DB.batch(stmts);

  return json({ ok: true, rejected: ids.length });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

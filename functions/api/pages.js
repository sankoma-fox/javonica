// =============================================================
//  GET /api/pages
//  公開中のページ一覧を返す（トップページのリンク集用）
//  出せる作品が1件以上ある published ページのみ
// =============================================================

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);

  // published かつ、公開可能な作品を1件以上持つページだけ
  const res = await env.DB.prepare(
    `SELECT p.slug, p.title, p.actress_name, p.costar_name, p.updated_at,
            COUNT(*) AS work_count
     FROM page p
     JOIN page_item pi ON pi.page_id = p.id
     JOIN item i ON i.content_id = pi.content_id
     WHERE p.status = 'published'
       AND pi.is_published = 1
       AND i.review_status = 'approved'
     GROUP BY p.id
     HAVING work_count > 0
     ORDER BY p.updated_at DESC`
  ).all();

  const pages = (res?.results ?? []).map((r) => ({
    slug: r.slug,
    title: r.title,
    actress_name: r.actress_name,
    costar_name: r.costar_name,
    work_count: r.work_count,
    updated_at: r.updated_at,
  }));

  return json({ pages }, 200, { "cache-control": "public, max-age=300" });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

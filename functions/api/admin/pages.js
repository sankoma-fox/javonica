// =============================================================
//  GET  /api/admin/pages         管理用ページ一覧（全status）
//  POST /api/admin/pages         ページ新規作成
//    body: { actress_id, actress_name, costar_name, costar_id?, slug?, title? }
//  ※ Cloudflare Access で /api/admin/* を保護する前提
// =============================================================

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);

  const res = await env.DB.prepare(
    `SELECT p.id, p.actress_name, p.costar_name, p.slug, p.title, p.status,
            p.updated_at,
            (SELECT COUNT(*) FROM page_item pi WHERE pi.page_id = p.id) AS item_count,
            (SELECT COUNT(*) FROM candidate c
               WHERE c.page_id = p.id AND c.decision='pending') AS pending_candidates
     FROM page p
     ORDER BY p.updated_at DESC`
  ).all();

  return json({ pages: res?.results ?? [] });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const actress_id = (body?.actress_id ?? "").toString().trim();
  const actress_name = (body?.actress_name ?? "").toString().trim();
  const costar_name = (body?.costar_name ?? "").toString().trim();
  const costar_id = body?.costar_id ? String(body.costar_id).trim() : null;

  if (!actress_id || !actress_name || !costar_name) {
    return json({ error: "actress_id, actress_name, costar_name are required" }, 400);
  }

  // title / slug は未指定なら自動生成
  const title = (body?.title ?? "").toString().trim() ||
    `${actress_name}が${costar_name}と共演した作品`;
  let slug = (body?.slug ?? "").toString().trim();
  if (!slug) {
    // 簡易slug: costar-actressid（一意性を担保しやすい形）
    slug = `${romanizeFallback(costar_name)}-${actress_id}`;
  }

  try {
    const r = await env.DB.prepare(
      `INSERT INTO page (actress_id, actress_name, costar_id, costar_name, slug, title, status)
       VALUES (?,?,?,?,?,?, 'draft')`
    )
      .bind(actress_id, actress_name, costar_id, costar_name, slug, title)
      .run();
    const id = r?.meta?.last_row_id ?? null;
    return json({ ok: true, id, slug, title }, 201);
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (msg.includes("UNIQUE")) {
      return json({ error: "slug already exists", slug }, 409);
    }
    return json({ error: msg }, 500);
  }
}

// slug用の最小限フォールバック（日本語名はそのまま使えないので簡易処理）
// 実運用では管理画面から英字slugを指定する想定。未指定時の保険。
function romanizeFallback(s) {
  // 英数字以外を除いて小文字化。空なら 'page'
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return cleaned || "page";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

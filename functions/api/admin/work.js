// =============================================================
//  PATCH /api/admin/work
//    作品まわりの管理操作。item と page_item の両方を扱う
//    body: {
//      content_id (必須),
//      page_id (manual_rank/is_published を変える場合に必須),
//      rewritten_description?,        // リライト文の編集
//      review_status?,                // 'pending'|'approved'|'rejected'
//      manual_rank?,                  // 手動順位 (null可)
//      is_published?                  // 0|1
//    }
//  item側(リライト文/review_status)と page_item側(順位/公開)を一度に更新可
// =============================================================

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const contentId = (body?.content_id ?? "").toString().trim();
  if (!contentId) return json({ error: "content_id required" }, 400);

  const stmts = [];

  // --- item 側の更新（リライト文 / review_status） ---
  const itemFields = [];
  const itemArgs = [];
  if (body?.rewritten_description !== undefined) {
    itemFields.push("rewritten_description = ?");
    itemArgs.push(body.rewritten_description === null ? null : String(body.rewritten_description));
  }
  if (body?.review_status !== undefined) {
    if (!["pending", "approved", "rejected"].includes(body.review_status)) {
      return json({ error: "invalid review_status" }, 400);
    }
    itemFields.push("review_status = ?");
    itemArgs.push(body.review_status);
  }
  if (itemFields.length > 0) {
    itemFields.push("updated_at = datetime('now')");
    itemArgs.push(contentId);
    stmts.push(
      env.DB.prepare(`UPDATE item SET ${itemFields.join(", ")} WHERE content_id = ?`).bind(...itemArgs)
    );
  }

  // --- page_item 側の更新（順位 / 公開フラグ） ---
  const pageItemFields = [];
  const pageItemArgs = [];
  if (body?.manual_rank !== undefined) {
    pageItemFields.push("manual_rank = ?");
    pageItemArgs.push(body.manual_rank === null ? null : Number(body.manual_rank));
  }
  if (body?.is_published !== undefined) {
    pageItemFields.push("is_published = ?");
    pageItemArgs.push(body.is_published ? 1 : 0);
  }
  if (pageItemFields.length > 0) {
    const pageId = body?.page_id;
    if (!pageId) return json({ error: "page_id required for rank/publish change" }, 400);
    pageItemArgs.push(pageId, contentId);
    stmts.push(
      env.DB.prepare(
        `UPDATE page_item SET ${pageItemFields.join(", ")} WHERE page_id = ? AND content_id = ?`
      ).bind(...pageItemArgs)
    );
  }

  if (stmts.length === 0) return json({ error: "nothing to update" }, 400);

  await env.DB.batch(stmts);
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

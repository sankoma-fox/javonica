// =============================================================
//  POST /api/fetch
//  入力: { page_id: number, content_ids: ["cid1","cid2",...] }
//  処理: 各 cid を ItemList?cid= で取得 → D1 に保存 → page_item 紐付け
//        → candidate を approved に更新
//  出力: cidごとの成功/失敗
//  注意: 検索とは分離。approvedになった作品だけ重い本取得を走らせる
// =============================================================

import { callItemList, normalizeItem } from "../_lib/fanza.js";
import {
  buildItemUpsertStatements,
  buildPageItemLinkStatement,
  buildCandidateApproveStatement,
} from "../_lib/store.js";

const WAIT_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const pageId = body?.page_id;
  const contentIds = Array.isArray(body?.content_ids) ? body.content_ids : [];

  if (!pageId) return json({ error: "page_id required" }, 400);
  if (contentIds.length === 0) return json({ error: "content_ids is empty" }, 400);
  if (!env.DMM_API_ID || !env.DMM_AFFILIATE_ID)
    return json({ error: "API credentials not configured" }, 500);
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);

  // page が存在するか確認
  const page = await env.DB.prepare(`SELECT id FROM page WHERE id = ?`)
    .bind(pageId)
    .first();
  if (!page) return json({ error: "page not found" }, 404);

  const results = [];
  for (let i = 0; i < contentIds.length; i++) {
    const cid = String(contentIds[i]).trim();
    try {
      // cid 指定で1件取得（確実に動く取得方法）
      const resp = await callItemList(env, { cid, hits: 1 });
      const raw = resp?.result?.items?.[0];
      if (!raw) {
        results.push({ content_id: cid, ok: false, reason: "not_found" });
      } else {
        const item = normalizeItem(raw);
        // 複数テーブルをまとめて整合的に書き込み
        const stmts = [
          ...buildItemUpsertStatements(env.DB, item),
          buildPageItemLinkStatement(env.DB, pageId, item.content_id),
          buildCandidateApproveStatement(env.DB, pageId, item.content_id),
        ];
        await env.DB.batch(stmts);
        results.push({
          content_id: item.content_id,
          ok: true,
          title: item.title,
          sample_images: item.sample_images.length,
          actresses: item.actresses.length,
        });
      }
    } catch (e) {
      results.push({ content_id: cid, ok: false, reason: String(e?.message ?? e) });
    }
    if (i < contentIds.length - 1) await sleep(WAIT_MS);
  }

  const summary = {
    total: results.length,
    saved: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
  return json({ summary, results });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

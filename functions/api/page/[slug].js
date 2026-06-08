// =============================================================
//  GET /api/page/:slug
//  公開ページ1本のデータを返す（閲覧者向け）
//  公開判定: page.status='published'
//            AND page_item.is_published=1
//            AND item.review_status='approved'
//  並び順: COALESCE(manual_rank, 9999), review_score DESC
//  注意: 公開はリライト文(rewritten_description)のみ。API原文は返さない
// =============================================================

export async function onRequestGet({ params, env }) {
  const slug = params?.slug;
  if (!slug) return json({ error: "slug required" }, 400);
  if (!env.DB) return json({ error: "D1 binding (DB) not configured" }, 500);

  // --- ページ本体（公開済みのみ） ---
  const page = await env.DB.prepare(
    `SELECT id, actress_name, costar_name, slug, title, updated_at
     FROM page
     WHERE slug = ? AND status = 'published'`
  )
    .bind(slug)
    .first();

  if (!page) return json({ error: "page not found" }, 404);

  // --- 公開対象の作品リスト（順位順） ---
  const itemsRes = await env.DB.prepare(
    `SELECT
        i.content_id, i.title, i.affiliate_url, i.image_large, i.image_small,
        i.label, i.maker, i.series, i.release_date,
        i.review_score, i.review_count,
        i.rewritten_description,
        pi.manual_rank
     FROM page_item pi
     JOIN item i ON i.content_id = pi.content_id
     WHERE pi.page_id = ?
       AND pi.is_published = 1
       AND i.review_status = 'approved'
     ORDER BY COALESCE(pi.manual_rank, 9999), i.review_score DESC`
  )
    .bind(page.id)
    .all();

  const items = itemsRes?.results ?? [];
  if (items.length === 0) {
    // ページは公開でも、出せる作品が0件なら実質非公開扱い
    return json({ error: "page not found" }, 404);
  }

  // --- サンプル画像をまとめて取得して各作品に紐付け ---
  const ids = items.map((r) => r.content_id);
  const placeholders = ids.map(() => "?").join(",");
  const samplesRes = await env.DB.prepare(
    `SELECT content_id, image_url
     FROM item_sample_image
     WHERE content_id IN (${placeholders})
     ORDER BY content_id, sort_order`
  )
    .bind(...ids)
    .all();

  const sampleMap = {};
  for (const s of samplesRes?.results ?? []) {
    (sampleMap[s.content_id] ??= []).push(s.image_url);
  }

  // --- 整形（公開用の形に。rank は順位を振り直して 1..N） ---
  const works = items.map((r, idx) => ({
    rank: idx + 1,
    content_id: r.content_id,
    title: r.title,
    affiliate_url: r.affiliate_url,
    image_large: r.image_large,
    image_small: r.image_small,
    label: r.label,
    maker: r.maker,
    series: r.series,
    release_date: r.release_date,
    review_score: r.review_score,
    review_count: r.review_count,
    description: r.rewritten_description, // 公開はリライト文のみ
    sample_images: sampleMap[r.content_id] ?? [],
  }));

  return json(
    {
      page: {
        slug: page.slug,
        title: page.title,
        actress_name: page.actress_name,
        costar_name: page.costar_name,
        updated_at: page.updated_at,
      },
      works,
    },
    200,
    // 公開データはキャッシュ可（D1読み取り課金を抑える）
    { "cache-control": "public, max-age=300" }
  );
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

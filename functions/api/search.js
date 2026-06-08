// =============================================================
//  POST /api/search
//  入力: { titles: "タイトル1,タイトル2,..." , page_id?: number }
//        ※ カンマ区切り。タイトル内の読点はそのまま（split しない）
//  処理: 各タイトルを全文 keyword 検索 → 0件なら段階短縮で再検索
//  出力: タイトルごとに状態別の候補リスト
//        status: full_unique | full_multi | trimmed | none
// =============================================================

import { callItemList, normalizeItem, buildTrimmedKeywords } from "../_lib/fanza.js";
import { buildCandidateUpsertStatement } from "../_lib/store.js";

// 状態ごとの確度スコア（candidate の並び順に使う）
const SCORE = { full_unique: 100, full_multi: 60, trimmed: 30 };

const HITS = 10;       // 1タイトルあたりの取得候補数
const WAIT_MS = 250;   // API連打を避けるための間隔

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1タイトルを検索（全文→短縮フォールバック）
async function searchOneTitle(env, title) {
  const keyword = title.trim();
  if (!keyword) {
    return { input_title: title, status: "none", search_keyword: "", candidates: [] };
  }

  // --- stage1: 全文 ---
  let json = await callItemList(env, { keyword, hits: HITS, sort: "rank" });
  let items = json?.result?.items ?? [];

  if (items.length > 0) {
    const candidates = items.map(normalizeItem).map((it) => ({
      ...it,
      match_stage: "full",
    }));
    return {
      input_title: title,
      search_keyword: keyword,
      status: candidates.length === 1 ? "full_unique" : "full_multi",
      candidates,
    };
  }

  // --- stage2/3: 短縮フォールバック ---
  const trimmedKeywords = buildTrimmedKeywords(keyword);
  for (const tk of trimmedKeywords) {
    await sleep(WAIT_MS);
    json = await callItemList(env, { keyword: tk, hits: HITS, sort: "rank" });
    items = json?.result?.items ?? [];
    if (items.length > 0) {
      const candidates = items.map(normalizeItem).map((it) => ({
        ...it,
        match_stage: "trimmed",
      }));
      // 短縮ヒットは取り違え注意。一意でも自動選択させない（statusは常にtrimmed）
      return {
        input_title: title,
        search_keyword: tk,
        status: "trimmed",
        candidates,
      };
    }
  }

  // --- どの段階でも0件 ---
  return { input_title: title, status: "none", search_keyword: keyword, candidates: [] };
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const raw = (body?.titles ?? "").toString();
  // カンマ区切りで分割（ダブルクオート処理なし・指定どおり）
  const titles = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (titles.length === 0) {
    return json({ error: "titles is empty" }, 400);
  }

  if (!env.DMM_API_ID || !env.DMM_AFFILIATE_ID) {
    return json({ error: "API credentials not configured" }, 500);
  }

  const results = [];
  for (let i = 0; i < titles.length; i++) {
    try {
      const r = await searchOneTitle(env, titles[i]);
      results.push(r);
    } catch (e) {
      results.push({
        input_title: titles[i],
        status: "error",
        search_keyword: titles[i],
        candidates: [],
        error: String(e?.message ?? e),
      });
    }
    if (i < titles.length - 1) await sleep(WAIT_MS);
  }

  // サマリ（管理画面で「何件確認が必要か」を即わかるように）
  const summary = {
    total: results.length,
    full_unique: results.filter((r) => r.status === "full_unique").length,
    needs_review: results.filter((r) =>
      ["full_multi", "trimmed"].includes(r.status)
    ).length,
    none: results.filter((r) => r.status === "none").length,
    error: results.filter((r) => r.status === "error").length,
  };

  // page_id が指定されていれば候補を candidate に保存
  const pageId = body?.page_id;
  let saved_candidates = 0;
  if (pageId && env.DB) {
    const stmts = [];
    for (const r of results) {
      const score = SCORE[r.status] ?? 0;
      for (const c of r.candidates) {
        stmts.push(
          buildCandidateUpsertStatement(env.DB, pageId, {
            content_id: c.content_id,
            title: c.title,
            image_small: c.image_small,
            release_date: c.release_date,
            maker: c.maker,
            source: "title_search",
            source_title: r.input_title,
            search_keyword: r.search_keyword,
            match_stage: c.match_stage,
            score,
          })
        );
        saved_candidates++;
      }
    }
    if (stmts.length > 0) await env.DB.batch(stmts);
  }

  return json({ summary: { ...summary, saved_candidates }, results });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// =============================================================
//  FANZA (DMM) API 共通処理
//  - API ID / アフィリエイトID は Cloudflare の環境変数から渡す
//  - レスポンスのパース、タイトル短縮ロジックをここに集約
// =============================================================

const API_ENDPOINT = "https://api.dmm.com/affiliate/v3/ItemList";

// 共通の固定パラメータ（アダルト動画）
const BASE_PARAMS = {
  site: "FANZA",
  service: "digital",
  floor: "videoa",
  output: "json",
};

// -------------------------------------------------------------
// ItemList を叩く低レベル関数
//   env: { DMM_API_ID, DMM_AFFILIATE_ID }
//   params: 追加パラメータ (keyword / cid / hits など)
// -------------------------------------------------------------
export async function callItemList(env, params) {
  const qs = new URLSearchParams({
    api_id: env.DMM_API_ID,
    affiliate_id: env.DMM_AFFILIATE_ID,
    ...BASE_PARAMS,
    ...params,
  });
  const url = `${API_ENDPOINT}?${qs.toString()}`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`FANZA API HTTP ${res.status}`);
  }
  const json = await res.json();

  // APIレベルのエラー（result.status が 200 以外）
  const status = json?.result?.status;
  if (status && String(status) !== "200") {
    throw new Error(`FANZA API status ${status}`);
  }
  return json;
}

// -------------------------------------------------------------
// レスポンスの 1 item を、こちらの正規化された形に変換
//   iteminfo 内の各要素は item の配列構造（teratail の指摘どおり）
// -------------------------------------------------------------
export function normalizeItem(raw) {
  const info = raw?.iteminfo ?? {};

  const pickNames = (arr) =>
    Array.isArray(arr) ? arr.map((x) => x?.name).filter(Boolean) : [];
  const pickFirst = (arr) =>
    Array.isArray(arr) && arr.length > 0 ? arr[0] : null;

  const actressList = Array.isArray(info.actress)
    ? info.actress.map((a) => ({ id: a?.id != null ? String(a.id) : null, name: a?.name }))
        .filter((a) => a.name)
    : [];

  const maker = pickFirst(info.maker);
  const series = pickFirst(info.series);
  const label = pickFirst(info.label);

  // サンプル画像（存在すれば配列）
  const sampleImages =
    raw?.sampleImageURL?.sample_l?.image ??
    raw?.sampleImageURL?.sample_s?.image ??
    [];

  return {
    content_id: raw?.content_id ?? null,
    title: raw?.title ?? "",
    affiliate_url: raw?.affiliateURL ?? raw?.URL ?? "",
    image_large: raw?.imageURL?.large ?? null,
    image_small: raw?.imageURL?.list ?? raw?.imageURL?.small ?? null,
    label: label?.name ?? null,
    maker: maker?.name ?? null,
    maker_id: maker?.id != null ? String(maker.id) : null,
    series: series?.name ?? null,
    series_id: series?.id != null ? String(series.id) : null,
    release_date: raw?.date ?? null,
    review_score: raw?.review?.average != null ? Number(raw.review.average) : null,
    review_count: raw?.review?.count != null ? Number(raw.review.count) : null,
    raw_description: raw?.iteminfo?.comment ?? raw?.comment ?? null,
    actresses: actressList,
    sample_images: Array.isArray(sampleImages) ? sampleImages : [],
    genres: pickNames(info.genre),
  };
}

// -------------------------------------------------------------
// タイトル短縮: 全文で 0 件のときに段階的に削る
//   stage1: 全文（呼び出し側で先に試す）
//   stage2: 末尾の括弧・版表記・出演者表記などを除去
//   stage3: 先頭から特徴的な部分だけ（最初の ~18 文字 or 数語）
//   返り値: 試すべき keyword の配列（stage2, stage3）
// -------------------------------------------------------------
export function buildTrimmedKeywords(title) {
  const trims = [];

  // stage2: 末尾のノイズを除去
  let t2 = title
    // 全角/半角の括弧とその中身（末尾側）を除去
    .replace(/[（(【\[][^）)】\]]*[）)】\]]\s*$/g, "")
    // よくある版・総集編表記を除去
    .replace(/(完全版|総集編|ベスト|BEST|DX|スペシャル|SPECIAL)\s*$/gi, "")
    // 末尾の記号・空白
    .replace(/[\s　・,，、!！?？]+$/g, "")
    .trim();
  if (t2 && t2 !== title) trims.push(t2);

  // stage3: 先頭の特徴的な部分だけ
  const base = (t2 || title).trim();
  // 区切り（空白・記号）で割って先頭から積む。最大 ~18 文字
  const parts = base.split(/[\s　・！？!?,，、]+/).filter(Boolean);
  let acc = "";
  for (const p of parts) {
    if ((acc + p).length > 18 && acc.length > 0) break;
    acc += p;
    if (acc.length >= 8) break; // 8文字超えたら十分特徴的
  }
  acc = acc.trim();
  if (acc && acc !== t2 && acc !== title) trims.push(acc);

  // 重複除去
  return [...new Set(trims)];
}

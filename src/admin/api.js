// 管理API呼び出しの薄いラッパ
async function req(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers["content-type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(url, opt);
  let data = null;
  try {
    data = await r.json();
  } catch {
    // no body
  }
  if (!r.ok) {
    const msg = data?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  listPages: () => req("GET", "/api/admin/pages"),
  createPage: (b) => req("POST", "/api/admin/pages", b),
  getPage: (id) => req("GET", `/api/admin/page/${id}`),
  patchPage: (id, b) => req("PATCH", `/api/admin/page/${id}`, b),
  search: (titles, page_id) => req("POST", "/api/search", { titles, page_id }),
  fetchWorks: (page_id, content_ids) =>
    req("POST", "/api/fetch", { page_id, content_ids }),
  rejectCandidates: (page_id, content_ids) =>
    req("POST", "/api/admin/candidate/reject", { page_id, content_ids }),
  patchWork: (b) => req("PATCH", "/api/admin/work", b),
  addManualWork: (b) => req("POST", "/api/admin/work/manual", b),
};

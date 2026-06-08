import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export default function PageList({ notify }) {
  const [pages, setPages] = useState(null);
  const [form, setForm] = useState({ actress_id: "", actress_name: "", costar_name: "吉村卓", costar_id: "", slug: "" });
  const [creating, setCreating] = useState(false);

  const load = () => api.listPages().then((d) => setPages(d.pages)).catch((e) => notify(e.message, true));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.actress_id || !form.actress_name || !form.costar_name) {
      notify("女優ID・女優名・共演者名は必須です", true);
      return;
    }
    setCreating(true);
    try {
      await api.createPage(form);
      notify("ページを作成しました");
      setForm({ actress_id: "", actress_name: "", costar_name: form.costar_name, costar_id: "", slug: "" });
      load();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="wrap">
      <h1>ページ管理</h1>
      <p className="muted">女優ごとの共演作品ページを作成・管理します。</p>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2>新規ページ作成</h2>
        <div className="row">
          <div className="field">
            <label>女優ID（FANZA）</label>
            <input value={form.actress_id} onChange={(e) => setForm({ ...form, actress_id: e.target.value })} placeholder="例: 1044864" />
          </div>
          <div className="field">
            <label>女優名</label>
            <input value={form.actress_name} onChange={(e) => setForm({ ...form, actress_name: e.target.value })} placeholder="例: 星野そら" />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>共演者名</label>
            <input value={form.costar_name} onChange={(e) => setForm({ ...form, costar_name: e.target.value })} />
          </div>
          <div className="field">
            <label>slug（任意・URL用の英字。空なら自動）</label>
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="例: yoshimura-hoshino" />
          </div>
        </div>
        <button className="btn primary" onClick={create} disabled={creating}>
          {creating ? "作成中…" : "ページを作成"}
        </button>
      </div>

      <div className="panel">
        <h2>ページ一覧</h2>
        {!pages && <div className="empty">読み込み中…</div>}
        {pages && pages.length === 0 && <div className="empty">まだページがありません。</div>}
        {pages && pages.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>タイトル</th>
                <th>状態</th>
                <th>登録作品</th>
                <th>未確認候補</th>
                <th>更新</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/page/${p.id}`}>{p.title}</Link></td>
                  <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                  <td>{p.item_count}</td>
                  <td>{p.pending_candidates > 0 ? <b style={{ color: "var(--amber)" }}>{p.pending_candidates}</b> : 0}</td>
                  <td className="muted">{(p.updated_at || "").slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

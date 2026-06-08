import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function PageDetail({ notify }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [titles, setTitles] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null); // 検索結果（input_titleごと）
  const [selected, setSelected] = useState({}); // content_id -> bool
  const [fetching, setFetching] = useState(false);
  const [manual, setManual] = useState({ content_id: "", title: "", release_date: "", label: "", maker: "" });
  const [addingManual, setAddingManual] = useState(false);

  const load = useCallback(() => {
    api.getPage(id).then(setData).catch((e) => notify(e.message, true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // --- タイトル一括検索 ---
  const doSearch = async () => {
    if (!titles.trim()) return;
    setSearching(true);
    setResults(null);
    try {
      const d = await api.search(titles, Number(id));
      setResults(d);
      // 全文一意は初期選択ON、短縮/複数はOFF
      const sel = {};
      for (const r of d.results) {
        if (r.status === "full_unique" && r.candidates[0]) {
          sel[r.candidates[0].content_id] = true;
        }
      }
      setSelected(sel);
      notify(`検索完了: ${d.summary.saved_candidates} 件の候補を保存`);
      load();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setSearching(false);
    }
  };

  const toggle = (cid) => setSelected((s) => ({ ...s, [cid]: !s[cid] }));

  // --- 手動登録（API承認前用） ---
  const addManual = async () => {
    if (!manual.content_id.trim() || !manual.title.trim()) {
      notify("cid とタイトルは必須です", true);
      return;
    }
    setAddingManual(true);
    try {
      const d = await api.addManualWork({ page_id: Number(id), ...manual });
      notify(d.note || "手動で登録しました");
      setManual({ content_id: "", title: "", release_date: "", label: "", maker: "" });
      load();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setAddingManual(false);
    }
  };

  // --- 選択した候補を取得 ---
  const doFetch = async () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (ids.length === 0) { notify("取得する作品を選択してください", true); return; }
    setFetching(true);
    try {
      const d = await api.fetchWorks(Number(id), ids);
      notify(`${d.summary.saved} 件を取得・保存しました`);
      setResults(null);
      setSelected({});
      setTitles("");
      load();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setFetching(false);
    }
  };

  if (!data) return <div className="wrap"><div className="empty">読み込み中…</div></div>;
  const { page, candidates, works } = data;

  const selCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="wrap">
      <div className="crumb"><Link to="/">← ページ一覧</Link></div>
      <h1>{page.title}</h1>
      <p className="muted">
        {page.actress_name} × {page.costar_name}　/　状態:{" "}
        <span className={`badge ${page.status}`}>{page.status}</span>
      </p>

      {/* ステータス操作 */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>公開設定</h2>
        <div className="row">
          <StatusButton current={page.status} target="draft" label="下書きに戻す" id={id} notify={notify} reload={load} />
          <StatusButton current={page.status} target="reviewing" label="確認中にする" id={id} notify={notify} reload={load} />
          <StatusButton current={page.status} target="published" label="公開する" id={id} notify={notify} reload={load} primary />
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          公開しても、承認済み（approved）かつ公開ONの作品だけが実際に表示されます。
        </p>
      </div>

      {/* タイトル一括検索 */}
      <div className="panel">
        <h2>タイトルから作品を検索</h2>
        <div className="field">
          <label>作品タイトル（カンマ区切りで複数可）</label>
          <textarea
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            placeholder="作品タイトル1, 作品タイトル2, 作品タイトル3 ..."
          />
        </div>
        <button className="btn primary" onClick={doSearch} disabled={searching}>
          {searching ? "検索中…" : "一括検索"}
        </button>

        {results && (
          <>
            <div className="summary-line">
              <span>全文一意: <b>{results.summary.full_unique}</b></span>
              <span>要確認: <b>{results.summary.needs_review}</b></span>
              <span>0件: <b>{results.summary.none}</b></span>
            </div>

            {results.results.map((r, i) => (
              <div className="cand-group" key={i}>
                <div className="gh">
                  「{r.input_title}」
                  {r.status === "full_unique" && <span className="badge full">一意</span>}
                  {r.status === "full_multi" && <span className="badge pending">複数</span>}
                  {r.status === "trimmed" && <span className="badge trimmed">短縮ヒット要確認</span>}
                  {r.status === "none" && <span className="badge rejected">0件</span>}
                </div>
                <div className="cand-list">
                  {r.candidates.map((c) => (
                    <div className={`cand ${selected[c.content_id] ? "sel" : ""}`} key={c.content_id}>
                      {c.image_small ? <img className="thumb" src={c.image_small} alt="" /> : <div className="thumb" />}
                      <div className="info">
                        <div className="t">{c.title}</div>
                        <div className="m">
                          <span>{c.content_id}</span>
                          {c.maker && <span>{c.maker}</span>}
                          {c.release_date && <span>{c.release_date.slice(0, 10)}</span>}
                          {c.match_stage === "trimmed" && <span className="badge trimmed">短縮</span>}
                        </div>
                      </div>
                      <div className="acts">
                        <button className={`btn sm ${selected[c.content_id] ? "primary" : ""}`} onClick={() => toggle(c.content_id)}>
                          {selected[c.content_id] ? "選択中" : "選択"}
                        </button>
                        <a className="btn sm" href={`https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${c.content_id}/`} target="_blank" rel="noreferrer">確認</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <button className="btn green" onClick={doFetch} disabled={fetching || selCount === 0}>
              {fetching ? "取得中…" : `選択した ${selCount} 件を取得`}
            </button>
          </>
        )}
      </div>

      {/* 手動登録（API承認前） */}
      <div className="panel">
        <h2>手動で作品を登録（API承認前用）</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          FANZAの作品ページURL「…/cid=<b>abc00123</b>/」の cid を入力します。画像・公式リンクはAPI承認後に自動で入ります。
        </p>
        <div className="row">
          <div className="field">
            <label>content_id（cid）必須</label>
            <input value={manual.content_id} onChange={(e) => setManual({ ...manual, content_id: e.target.value })} placeholder="例: abc00123" />
          </div>
          <div className="field">
            <label>タイトル 必須</label>
            <input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="作品タイトル" />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>配信日</label>
            <input value={manual.release_date} onChange={(e) => setManual({ ...manual, release_date: e.target.value })} placeholder="2023-05-01" />
          </div>
          <div className="field">
            <label>レーベル</label>
            <input value={manual.label} onChange={(e) => setManual({ ...manual, label: e.target.value })} />
          </div>
          <div className="field">
            <label>メーカー</label>
            <input value={manual.maker} onChange={(e) => setManual({ ...manual, maker: e.target.value })} />
          </div>
        </div>
        <button className="btn primary" onClick={addManual} disabled={addingManual}>
          {addingManual ? "登録中…" : "手動登録"}
        </button>
      </div>

      {/* 未確認候補（過去の検索で保存されたもの） */}
      {candidates.length > 0 && (
        <div className="panel">
          <h2>未確認の候補（{candidates.length}）</h2>
          <p className="muted" style={{ marginBottom: 12 }}>過去の検索で保存された未処理の候補です。</p>
          <div className="cand-list">
            {candidates.map((c) => (
              <PendingCandidate key={c.content_id} c={c} pageId={id} notify={notify} reload={load} />
            ))}
          </div>
        </div>
      )}

      {/* 登録済み作品のレビュー */}
      <div className="panel">
        <h2>登録済み作品（{works.length}）</h2>
        {works.length === 0 && <div className="empty">まだ作品がありません。上の検索から取得してください。</div>}
        {works.map((w) => (
          <WorkEditor key={w.content_id} w={w} pageId={id} notify={notify} reload={load} />
        ))}
      </div>
    </div>
  );
}

function StatusButton({ current, target, label, id, notify, reload, primary }) {
  const active = current === target;
  return (
    <button
      className={`btn ${primary ? "primary" : ""}`}
      disabled={active}
      onClick={async () => {
        try { await api.patchPage(id, { status: target }); notify(`状態を ${target} に変更`); reload(); }
        catch (e) { notify(e.message, true); }
      }}
    >
      {active ? `${label}（現在）` : label}
    </button>
  );
}

function PendingCandidate({ c, pageId, notify, reload }) {
  const act = async (approve) => {
    try {
      if (approve) {
        await api.fetchWorks(Number(pageId), [c.content_id]);
        notify("取得しました");
      } else {
        await api.rejectCandidates(Number(pageId), [c.content_id]);
        notify("却下しました");
      }
      reload();
    } catch (e) { notify(e.message, true); }
  };
  return (
    <div className="cand">
      {c.image_small ? <img className="thumb" src={c.image_small} alt="" /> : <div className="thumb" />}
      <div className="info">
        <div className="t">{c.title}</div>
        <div className="m">
          <span>{c.content_id}</span>
          {c.match_stage === "trimmed" && <span className="badge trimmed">短縮</span>}
          {c.source_title && <span>from「{c.source_title}」</span>}
        </div>
      </div>
      <div className="acts">
        <button className="btn sm green" onClick={() => act(true)}>取得</button>
        <button className="btn sm danger" onClick={() => act(false)}>却下</button>
      </div>
    </div>
  );
}

function WorkEditor({ w, pageId, notify, reload }) {
  const [desc, setDesc] = useState(w.rewritten_description || "");
  const [rank, setRank] = useState(w.manual_rank ?? "");
  const [pub, setPub] = useState(!!w.is_published);
  const [saving, setSaving] = useState(false);

  const save = async (extra) => {
    setSaving(true);
    try {
      await api.patchWork({
        content_id: w.content_id,
        page_id: Number(pageId),
        rewritten_description: desc,
        manual_rank: rank === "" ? null : Number(rank),
        is_published: pub,
        ...extra,
      });
      notify("保存しました");
      reload();
    } catch (e) { notify(e.message, true); }
    finally { setSaving(false); }
  };

  return (
    <div className="work-edit">
      <div className="wh">
        {w.image_small ? <img className="thumb" src={w.image_small} alt="" /> : <div className="thumb" />}
        <div className="wt">
          <div className="title">{w.title}</div>
          <div className="meta">
            {w.content_id}　{w.release_date?.slice(0, 10)}　
            <span className={`badge ${w.review_status}`}>{w.review_status}</span>
            {w.source === "manual" && !w.fetched_at && (
              <span className="badge trimmed" style={{ marginLeft: 6 }}>手動・API未取得</span>
            )}
            {w.source === "api" && (
              <span className="badge full" style={{ marginLeft: 6 }}>API取得済み</span>
            )}
          </div>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 8 }}>
        <label>紹介文（リライト・公式文の丸写しは不可、事実を変えない）</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>

      <div className="work-controls">
        <label>順位 <input className="rank-in" type="number" min="1" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="自動" /></label>
        <label><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> 公開する</label>
        <button className="btn sm" onClick={() => save()} disabled={saving}>保存</button>
        <button className="btn sm green" onClick={() => save({ review_status: "approved" })} disabled={saving}>保存して承認</button>
        <button className="btn sm danger" onClick={() => save({ review_status: "rejected" })} disabled={saving}>却下</button>
      </div>
    </div>
  );
}

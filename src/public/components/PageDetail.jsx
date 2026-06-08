import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";

export default function PageDetail() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | notfound | error

  useEffect(() => {
    setStatus("loading");
    fetch(`/api/page/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (r.status === 404) {
          setStatus("notfound");
          return null;
        }
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((d) => {
        if (d) {
          setData(d);
          setStatus("ok");
        }
      })
      .catch(() => setStatus("error"));
  }, [slug]);

  if (status === "loading") return <div className="state">読み込み中…</div>;
  if (status === "notfound")
    return (
      <div className="container">
        <div className="state">
          ページが見つかりませんでした。
          <br />
          <Link to="/" className="back-link" style={{ marginTop: 20 }}>
            ← トップへ戻る
          </Link>
        </div>
      </div>
    );
  if (status === "error") return <div className="state">読み込みに失敗しました。</div>;

  const { page, works } = data;

  return (
    <div className="container">
      <div className="page-head">
        <Link to="/" className="back-link">
          ← 一覧へ戻る
        </Link>
        <h1>{page.title}</h1>
        <p className="sub">{works.length} 作品を紹介順に掲載しています。</p>
      </div>

      <div className="layout">
        <div>
          {works.map((w) => (
            <article className="work" key={w.content_id} id={`w-${w.rank}`}>
              <div>
                <div className="work-rank">No. {w.rank}</div>
                {w.image_large ? (
                  <img className="work-img" src={w.image_large} alt={w.title} loading="lazy" />
                ) : (
                  <div className="work-img" />
                )}
                {w.sample_images && w.sample_images.length > 0 && (
                  <div className="samples">
                    {w.sample_images.slice(0, 8).map((s, i) => (
                      <img key={i} src={s} alt="" loading="lazy" />
                    ))}
                  </div>
                )}
              </div>

              <div className="work-body">
                <h3>{w.title}</h3>
                <div className="work-meta">
                  {w.label && <span>{w.label}</span>}
                  {w.release_date && <span>{w.release_date.slice(0, 10)}</span>}
                  {w.review_score != null && <span>★ {w.review_score}</span>}
                </div>
                {w.description && <p className="work-desc">{w.description}</p>}
                {w.affiliate_url && (
                  <a
                    className="btn-official"
                    href={w.affiliate_url}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                  >
                    公式ページで見る
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        <aside className="side">
          <h4>RANKING</h4>
          {works.map((w) => (
            <a className="side-item" href={`#w-${w.rank}`} key={w.content_id}>
              <span className="n">{w.rank}</span>
              <span className="t">{w.title}</span>
            </a>
          ))}
        </aside>
      </div>
    </div>
  );
}

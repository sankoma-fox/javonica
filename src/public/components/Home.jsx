import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function Home() {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/pages")
      .then((r) => r.json())
      .then((d) => setPages(d.pages ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">CO-STARRING ARCHIVE</span>
        <h1>女優ごとの共演作品アーカイブ</h1>
        <p className="sub">
          特定の俳優との共演作品を、女優ごとに1ページにまとめて紹介しています。
        </p>
      </div>

      {error && <div className="state">読み込みに失敗しました。</div>}
      {!pages && !error && <div className="state">読み込み中…</div>}
      {pages && pages.length === 0 && (
        <div className="state">公開中のページはまだありません。</div>
      )}

      {pages && pages.length > 0 && (
        <div className="grid">
          {pages.map((p) => (
            <Link key={p.slug} to={`/p/${p.slug}`} className="page-card">
              <div className="pc-title">{p.title}</div>
              <div className="pc-meta">
                <span>{p.actress_name}</span>
                <span>共演 {p.work_count} 作品</span>
              </div>
              <div className="pc-arrow">作品を見る →</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

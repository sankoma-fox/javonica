import { Link } from "react-router-dom";

export default function Layout({ children }) {
  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <Link to="/" className="site-title">
            共演<span>アーカイブ</span>
          </Link>
          <nav className="site-nav">女優別 共演作品まとめ</nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="container">
          <p className="pr">
            <strong>PR</strong>{" "}
            当サイトはアフィリエイトプログラムにより収益を得ています。掲載作品の情報・画像・リンクはFANZA公式APIを通じて提供されるデータに基づいています。
          </p>
          <p>
            作品の閲覧・購入は各作品の公式ページで行われます。価格・配信状況は公式ページの表示が最新です。
            <br />
            18歳未満の方の閲覧は固くお断りします。
          </p>
        </div>
      </footer>
    </>
  );
}

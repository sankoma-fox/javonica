import { useState, useCallback } from "react";
import { HashRouter, Routes, Route, Link } from "react-router-dom";
import PageList from "./components/PageList.jsx";
import PageDetail from "./components/PageDetail.jsx";

export default function App() {
  const [toast, setToast] = useState(null);
  const notify = useCallback((msg, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <HashRouter>
      <header className="admin-header">
        <Link to="/" className="brand">共演アーカイブ <b>管理</b></Link>
        <span className="who">admin</span>
      </header>
      <Routes>
        <Route path="/" element={<PageList notify={notify} />} />
        <Route path="/page/:id" element={<PageDetail notify={notify} />} />
      </Routes>
      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </HashRouter>
  );
}

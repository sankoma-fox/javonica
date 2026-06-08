import { BrowserRouter, Routes, Route } from "react-router-dom";
import AgeGate from "./components/AgeGate.jsx";
import Layout from "./components/Layout.jsx";
import Home from "./components/Home.jsx";
import PageDetail from "./components/PageDetail.jsx";

export default function App() {
  return (
    <AgeGate>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/p/:slug" element={<PageDetail />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AgeGate>
  );
}

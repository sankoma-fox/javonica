import { useState, useEffect } from "react";

const KEY = "age_verified_v1";

export default function AgeGate({ children }) {
  const [state, setState] = useState("checking"); // checking | gate | ok | denied

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") {
        setState("ok");
        return;
      }
    } catch {
      // localStorage不可環境
    }
    setState("gate");
  }, []);

  const confirm = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // 失敗してもセッション内は通す
    }
    setState("ok");
  };

  if (state === "checking") return null;

  if (state === "denied") {
    return (
      <div className="age-deny">
        <p>
          18歳未満の方はご利用いただけません。
          <br />
          ご退出ください。
        </p>
      </div>
    );
  }

  if (state === "gate") {
    return (
      <div className="age-gate">
        <div className="age-box">
          <div className="mark">AGE VERIFICATION</div>
          <h2>このサイトはアダルトコンテンツを含みます</h2>
          <p>
            本サイトには成人向けの表現が含まれます。
            <br />
            あなたは18歳以上ですか？
          </p>
          <div className="age-actions">
            <button className="age-btn yes" onClick={confirm}>
              18歳以上です
            </button>
            <button className="age-btn no" onClick={() => setState("denied")}>
              18歳未満です
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

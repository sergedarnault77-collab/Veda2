import { useState } from "react";
import HomePage from "./home/HomePage";
import MedicationsPage from "./meds/MedicationsPage";
import SupplementsPage from "./supps/SupplementsPage";

type Tab = "home" | "meds" | "supps";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div style={{ minHeight: "100vh" }}>
      {tab === "home" && <HomePage />}
      {tab === "meds" && <MedicationsPage />}
      {tab === "supps" && <SupplementsPage />}

      <nav
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          padding: 10,
          borderRadius: 16,
          background: "rgba(10,10,14,0.75)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button onClick={() => setTab("home")} style={tabBtn(tab === "home")}>Scan</button>
        <button onClick={() => setTab("supps")} style={tabBtn(tab === "supps")}>Supplements</button>
        <button onClick={() => setTab("meds")} style={tabBtn(tab === "meds")}>Meds</button>
      </nav>
    </div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "12px 10px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(108,92,231,0.30)" : "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 600,
    cursor: "pointer",
  };
}

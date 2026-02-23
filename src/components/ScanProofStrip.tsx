import React from "react";
import { ScanTrace, formatTrace, VEDA_BUILD_ID, isWebKit } from "@/lib/scan-proof";

export default function ScanProofStrip({ trace }: { trace: ScanTrace | null }) {
  const line = trace
    ? formatTrace(trace)
    : `build=${VEDA_BUILD_ID} | webkit=${isWebKit() ? "1" : "0"} | no-requests-yet`;

  return (
    <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff" }}>
      <div style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
        {line}
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(line)}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb" }}
        >
          Copy trace
        </button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          If scan fails, paste this trace.
        </span>
      </div>
    </div>
  );
}

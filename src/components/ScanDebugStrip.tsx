import React from "react";
import { VEDA_BUILD_ID, isWebKit } from "@/lib/debugBuild";

export type ScanTrace = {
  ts: number;
  endpoint: string;
  url: string;
  requestId: string;
  status: number;
  contentType?: string | null;
  vercelId?: string;
  handlerEntered?: string;
  message?: string;
};

export function traceLine(t: ScanTrace): string {
  return [
    `build=${VEDA_BUILD_ID}`,
    `webkit=${isWebKit() ? "1" : "0"}`,
    `endpoint=${t.endpoint}`,
    `status=${t.status}`,
    `rid=${t.requestId}`,
    `handler=${t.handlerEntered || "?"}`,
    `ct=${t.contentType || "?"}`,
    `vercel=${t.vercelId || "?"}`,
    `url=${t.url}`,
    t.message ? `msg=${t.message}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export default function ScanDebugStrip({ trace }: { trace: ScanTrace | null }) {
  const line = trace ? traceLine(trace) : `build=${VEDA_BUILD_ID} | webkit=${isWebKit() ? "1" : "0"} | no-requests-yet`;
  return (
    <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff" }}>
      <div style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", color: "#111827" }}>
        {line}
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(line)}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb" }}
        >
          Copy trace
        </button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          If scan fails, paste this trace to diagnose instantly.
        </span>
      </div>
    </div>
  );
}

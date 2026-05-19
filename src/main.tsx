import React, { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initSentry, Sentry } from "./lib/sentry";
import { initAnalytics } from "./lib/analytics";
import "./index.css";

initSentry();
initAnalytics();

// Safari/WebKit throws "The string did not match the expected pattern" from
// internal Supabase URL parsing. Suppress it globally so it never crashes the
// app or surfaces as a user-visible error.
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e?.reason?.message || e?.reason || "");
  if (msg.includes("did not match the expected pattern")) {
    e.preventDefault();
    console.warn("[Vedais] Suppressed Safari auth pattern error");
  }
});

class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error) {
    const msg = String(error?.message || error);
    if (msg.includes("did not match the expected pattern")) {
      console.warn("[Vedais] Suppressed Safari auth pattern error in boundary");
      return { hasError: false, error: "" };
    }
    return { hasError: true, error: msg };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Vedais] Uncaught render error:", error, info?.componentStack);
    Sentry.captureException(error, { contexts: { react: { componentStack: info?.componentStack ?? "" } } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: "system-ui", color: "#4A4035", background: "#F3E4CC", minHeight: "100vh" }}>
          <h1 style={{ fontSize: 20, marginBottom: 12, color: "#4A4035" }}>Something went wrong</h1>
          <p style={{ opacity: 0.75, fontSize: 14, marginBottom: 16, color: "#7C6B5A" }}>{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: "" }); window.location.reload(); }}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#D98235", color: "#fff", cursor: "pointer", fontSize: 14 }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

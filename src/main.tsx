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
    console.warn("[Veda] Suppressed Safari auth pattern error");
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
      console.warn("[Veda] Suppressed Safari auth pattern error in boundary");
      return { hasError: false, error: "" };
    }
    return { hasError: true, error: msg };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Veda] Uncaught render error:", error, info?.componentStack);
    Sentry.captureException(error, { contexts: { react: { componentStack: info?.componentStack ?? "" } } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: "system-ui", color: "#fff", background: "#0a0a1a", minHeight: "100vh" }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 16 }}>{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: "" }); window.location.reload(); }}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#6c5ce7", color: "#fff", cursor: "pointer", fontSize: 14 }}
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

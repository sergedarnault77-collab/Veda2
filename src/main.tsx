import React, { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: String(error?.message || error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Veda] Uncaught render error:", error, info?.componentStack);
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

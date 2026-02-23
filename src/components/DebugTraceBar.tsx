import React from "react";

function isWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isAppleWebKit = /AppleWebKit/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isCriOS = /CriOS/i.test(ua);
  const isFxiOS = /FxiOS/i.test(ua);
  return isAppleWebKit && (isIOS || (!isCriOS && !isFxiOS));
}

function isDebugEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

function shortUA(ua: string): string {
  return ua.replace(/\s+/g, " ").slice(0, 180);
}

export type VedaScanTrace = {
  app: "veda";
  ts: string;
  build: "dev" | "prod" | "unknown";
  url: string;
  webkit: 0 | 1;
  uaShort: string;
  scan: {
    attempts: number;
    lastStartedAt?: string;
    lastFinishedAt?: string;
    lastHttpStatus?: number;
    lastError?: string;
    lastErrorWhere?: "token" | "fetch" | "parse" | "server" | "unknown";
    lastEndpoint?: string;
    lastRequestId?: string;
    lastVercelId?: string;
    lastVercelError?: string;
  };
};

export function DebugTraceBar({ trace }: { trace: VedaScanTrace }) {
  if (!isDebugEnabled()) return null;

  const copy = async () => {
    const payload = JSON.stringify(trace, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      alert("Trace copied. Paste it into Cursor.");
    } catch {
      window.prompt("Copy this trace:", payload);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">
          build={trace.build} | webkit={trace.webkit} | attempts=
          {trace.scan.attempts}
          {trace.scan.lastHttpStatus
            ? ` | last=${trace.scan.lastHttpStatus}`
            : " | last=none"}
        </span>
        <button
          onClick={copy}
          className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
        >
          Copy trace
        </button>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        Shows only with <span className="font-mono">?debug=1</span>. Safe: no
        tokens/PII.
      </div>
      {trace.scan.lastError && (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <div className="font-semibold">Last error</div>
          <div className="font-mono break-words">{trace.scan.lastError}</div>
        </div>
      )}
    </div>
  );
}

export function useVedaScanTrace() {
  const [trace, setTrace] = React.useState<VedaScanTrace>(() => {
    const build =
      (import.meta as any)?.env?.DEV === true
        ? "dev"
        : (import.meta as any)?.env?.PROD === true
          ? "prod"
          : "unknown";

    return {
      app: "veda",
      ts: new Date().toISOString(),
      build,
      url: typeof window !== "undefined" ? window.location.href : "unknown",
      webkit: isWebKit() ? 1 : 0,
      uaShort: shortUA(
        typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      ),
      scan: { attempts: 0 },
    };
  });

  const bump = React.useCallback(
    (patch: Partial<VedaScanTrace["scan"]>) => {
      setTrace((t) => ({
        ...t,
        ts: new Date().toISOString(),
        url: typeof window !== "undefined" ? window.location.href : t.url,
        scan: { ...t.scan, ...patch },
      }));
    },
    [],
  );

  const markStart = React.useCallback(
    (endpoint: string) => {
      setTrace((prev) => {
        const next = {
          ...prev,
          ts: new Date().toISOString(),
          url: typeof window !== "undefined" ? window.location.href : prev.url,
          scan: {
            ...prev.scan,
            attempts: (prev.scan.attempts ?? 0) + 1,
            lastStartedAt: new Date().toISOString(),
            lastEndpoint: endpoint,
            lastError: undefined,
            lastErrorWhere: undefined,
            lastHttpStatus: undefined,
            lastRequestId: undefined,
            lastVercelId: undefined,
            lastVercelError: undefined,
          },
        };
        return next;
      });
    },
    [],
  );

  const markFinish = React.useCallback(
    (opts: {
      httpStatus: number;
      requestId?: string;
      vercelId?: string;
      vercelError?: string;
    }) => {
      bump({
        lastFinishedAt: new Date().toISOString(),
        lastHttpStatus: opts.httpStatus,
        lastRequestId: opts.requestId,
        lastVercelId: opts.vercelId,
        lastVercelError: opts.vercelError,
      });
    },
    [bump],
  );

  const markError = React.useCallback(
    (
      err: unknown,
      where: VedaScanTrace["scan"]["lastErrorWhere"],
    ) => {
      const msg =
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : typeof err === "string"
            ? err
            : JSON.stringify(err);

      bump({
        lastFinishedAt: new Date().toISOString(),
        lastError: msg,
        lastErrorWhere: where ?? "unknown",
      });
    },
    [bump],
  );

  return { trace, markStart, markFinish, markError };
}

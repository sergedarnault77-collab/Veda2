export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setTraceHeaders } from "./lib/traceHeaders";

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8)
  || process.env.VITE_BUILD_ID
  || "local";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setTraceHeaders(req, res);
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({
    ok: true,
    buildId: BUILD_ID,
    runtime: "nodejs",
    ts: new Date().toISOString(),
  });
}

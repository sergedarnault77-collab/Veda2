export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8)
  || process.env.VITE_BUILD_ID
  || "local";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { ping } = await import("./shared-helpers");
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({
    ok: true,
    buildId: BUILD_ID,
    runtime: "nodejs",
    ping: ping(),
    ts: new Date().toISOString(),
  });
}

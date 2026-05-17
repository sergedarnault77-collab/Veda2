export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
function setTraceHeaders(req: any, res: any) {
  const rid = (req.headers?.["x-veda-request-id"] as string) || "";
  if (rid) res.setHeader("x-veda-request-id", rid);
  res.setHeader("x-veda-handler-entered", "1");
  res.setHeader("content-type", "application/json; charset=utf-8");
}

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8)
  || process.env.VITE_BUILD_ID
  || "local";

function serviceFlags() {
  return {
    database: Boolean((process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim()),
    openai: Boolean((process.env.OPENAI_API_KEY || "").trim()),
    supabase: Boolean(
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim(),
    ),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setTraceHeaders(req, res);
  res.setHeader("cache-control", "no-store");
  const services = serviceFlags();
  const allConfigured = Object.values(services).every(Boolean);
  return res.status(200).json({
    ok: true,
    buildId: BUILD_ID,
    runtime: "nodejs",
    ts: new Date().toISOString(),
    services,
    servicesOk: allConfigured,
  });
}

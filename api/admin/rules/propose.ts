export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  let authUser: any = null;
  try {
    const { requireAuth } = await import("../../_lib/auth");
    authUser = await requireAuth(req);
  } catch { /* best-effort */ }
  if (!authUser) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });

  const body = req.body || {};
  if (!body?.rulePayload) {
    return res.status(400).json({ ok: false, error: "rulePayload required" });
  }

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(connStr);
    const rows = await sql`
      INSERT INTO rule_change_requests (status, proposed_by, rule_payload)
      VALUES ('proposed', ${authUser.id}, ${JSON.stringify(body.rulePayload)})
      RETURNING id
    `;
    return res.status(200).json({ ok: true, id: rows[0]?.id });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  let authUser: any = null;
  try {
    const { requireAuth } = await import("../../../../_lib/auth");
    authUser = await requireAuth(req);
  } catch { /* best-effort */ }
  if (!authUser) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }
  if (!ADMIN_EMAILS.includes(authUser.email.toLowerCase())) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ ok: false, error: "Missing request id" });

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });

  const body = req.body || {};
  const action = body?.action === "reject" ? "rejected" : "verified";

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(connStr);
    await sql`
      UPDATE rule_change_requests
      SET status = ${action},
          verified_by = ${authUser.id},
          verified_at = NOW(),
          reviewer_notes = COALESCE(${body?.reviewer_notes || null}, reviewer_notes),
          updated_at = NOW()
      WHERE id = ${id} AND status IN ('proposed', 'triaged')
    `;
    return res.status(200).json({ ok: true, status: action });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

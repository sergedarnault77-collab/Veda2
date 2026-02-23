export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

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

  if (!ADMIN_EMAILS.includes(authUser.email.toLowerCase())) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(connStr);
    const status = (req.query.status as string) || "";

    let rows: any[];
    if (status) {
      rows = await sql`
        SELECT * FROM rule_change_requests
        WHERE status = ${status}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    } else {
      rows = await sql`
        SELECT * FROM rule_change_requests
        ORDER BY created_at DESC
        LIMIT 100
      `;
    }

    return res.status(200).json({ ok: true, requests: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

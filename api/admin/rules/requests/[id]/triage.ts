export const config = { runtime: "edge" };

import { neon } from "@neondatabase/serverless";
import { requireAuth, unauthorized } from "../../../../lib/auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export default async function handler(req: Request): Promise<Response> {
  const authUser = await requireAuth(req);
  if (!authUser) return unauthorized();
  if (!ADMIN_EMAILS.includes(authUser.email.toLowerCase())) {
    return json(403, { ok: false, error: "Admin access required" });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  const id = extractId(req.url);
  if (!id) return json(400, { ok: false, error: "Missing request id" });

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return json(500, { ok: false, error: "DATABASE_URL not set" });

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  try {
    const sql = neon(connStr);
    await sql`
      UPDATE rule_change_requests
      SET status = 'triaged',
          reviewer_notes = ${body?.reviewer_notes || null},
          updated_at = NOW()
      WHERE id = ${id} AND status = 'proposed'
    `;
    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}

function extractId(url: string): string | null {
  const m = url.match(/\/requests\/([^/]+)\/triage/);
  return m?.[1] || null;
}

function json(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

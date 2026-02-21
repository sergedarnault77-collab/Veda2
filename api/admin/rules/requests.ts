export const config = { runtime: "edge" };

import { neon } from "@neondatabase/serverless";
import { requireAuth, unauthorized } from "../../lib/auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export default async function handler(req: Request): Promise<Response> {
  const authUser = await requireAuth(req);
  if (!authUser) return unauthorized();

  if (!ADMIN_EMAILS.includes(authUser.email.toLowerCase())) {
    return json(403, { ok: false, error: "Admin access required" });
  }

  if (req.method !== "GET") {
    return json(405, { ok: false, error: "GET only" });
  }

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return json(500, { ok: false, error: "DATABASE_URL not set" });

  try {
    const sql = neon(connStr);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

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

    return json(200, { ok: true, requests: rows });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}

function json(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

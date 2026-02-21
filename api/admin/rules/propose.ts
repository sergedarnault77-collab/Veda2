export const config = { runtime: "edge" };

import { neon } from "@neondatabase/serverless";
import { requireAuth, unauthorized } from "../../lib/auth";

export default async function handler(req: Request): Promise<Response> {
  const authUser = await requireAuth(req);
  if (!authUser) return unauthorized();

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "POST only" });
  }

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return json(500, { ok: false, error: "DATABASE_URL not set" });

  let body: any;
  try { body = await req.json(); } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  if (!body?.rulePayload) {
    return json(400, { ok: false, error: "rulePayload required" });
  }

  try {
    const sql = neon(connStr);
    const rows = await sql`
      INSERT INTO rule_change_requests (status, proposed_by, rule_payload)
      VALUES ('proposed', ${authUser.id}, ${JSON.stringify(body.rulePayload)})
      RETURNING id
    `;
    return json(200, { ok: true, id: rows[0]?.id });
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

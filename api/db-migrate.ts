export const config = { runtime: "edge" };

import { neon } from "@neondatabase/serverless";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const secret = req.headers.get("x-migrate-secret") || "";
  const envSecret = ((globalThis as any)?.process?.env?.MIGRATE_SECRET || "").trim();
  if (!envSecret || secret !== envSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const env = (globalThis as any)?.process?.env ?? {};
  const connStr = (env.DATABASE_URL || env.STORAGE_URL || "").trim();
  if (!connStr) {
    return new Response(JSON.stringify({ ok: false, error: "DATABASE_URL or STORAGE_URL not set" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const sql = neon(connStr);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_data (
        email       TEXT NOT NULL,
        collection  TEXT NOT NULL,
        data        JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (email, collection)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_data_email ON user_data (email)
    `;

    return new Response(JSON.stringify({ ok: true, message: "Migration complete" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

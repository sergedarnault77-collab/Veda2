export const config = { runtime: "edge" };

import { neon } from "@neondatabase/serverless";

const VALID_COLLECTIONS = ["user", "supps", "meds", "exposure", "scans", "taken"] as const;
type Collection = (typeof VALID_COLLECTIONS)[number];

function getConnStr(): string {
  const env = (globalThis as any)?.process?.env ?? {};
  return (env.DATABASE_URL || env.STORAGE_URL || "").trim();
}

function getDb() {
  const connStr = getConnStr();
  if (!connStr) return null;
  return neon(connStr);
}

function stripImages(data: any): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(stripImages);
  }
  if (typeof data === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" && v.startsWith("data:image/")) {
        out[k] = null;
      } else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string" && v[0].startsWith("data:image/")) {
        out[k] = [];
      } else {
        out[k] = stripImages(v);
      }
    }
    return out;
  }
  return data;
}

export default async function handler(req: Request): Promise<Response> {
  const headers = { "content-type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST only" }), { status: 405, headers });
  }

  const sql = getDb();
  if (!sql) {
    return new Response(JSON.stringify({ ok: false, error: "Database not configured" }), { status: 503, headers });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers });
  }

  const email = (typeof body?.email === "string" ? body.email : "").trim().toLowerCase();
  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "email required" }), { status: 400, headers });
  }

  const action = body?.action;

  // ── LOAD: fetch all collections for a user ──
  if (action === "load") {
    try {
      const rows = await sql`
        SELECT collection, data, updated_at
        FROM user_data
        WHERE email = ${email}
      `;

      const result: Record<string, { data: any; updatedAt: string }> = {};
      for (const row of rows) {
        result[row.collection as string] = {
          data: row.data,
          updatedAt: row.updated_at as string,
        };
      }

      return new Response(JSON.stringify({ ok: true, collections: result }), { status: 200, headers });
    } catch (e: any) {
      return new Response(
        JSON.stringify({ ok: false, error: String(e?.message || e) }),
        { status: 500, headers },
      );
    }
  }

  // ── SAVE: upsert one collection ──
  if (action === "save") {
    const collection = body?.collection;
    if (!VALID_COLLECTIONS.includes(collection)) {
      return new Response(
        JSON.stringify({ ok: false, error: `Invalid collection. Must be one of: ${VALID_COLLECTIONS.join(", ")}` }),
        { status: 400, headers },
      );
    }

    const data = stripImages(body?.data);
    if (data === undefined) {
      return new Response(JSON.stringify({ ok: false, error: "data required" }), { status: 400, headers });
    }

    try {
      await sql`
        INSERT INTO user_data (email, collection, data, updated_at)
        VALUES (${email}, ${collection}, ${JSON.stringify(data)}::jsonb, NOW())
        ON CONFLICT (email, collection)
        DO UPDATE SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
      `;

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch (e: any) {
      return new Response(
        JSON.stringify({ ok: false, error: String(e?.message || e) }),
        { status: 500, headers },
      );
    }
  }

  // ── SAVE_BATCH: upsert multiple collections at once ──
  if (action === "save_batch") {
    const items = body?.items;
    if (!Array.isArray(items)) {
      return new Response(JSON.stringify({ ok: false, error: "items[] required" }), { status: 400, headers });
    }

    try {
      for (const item of items) {
        const col = item?.collection;
        if (!VALID_COLLECTIONS.includes(col)) continue;
        const data = stripImages(item?.data);
        if (data === undefined) continue;

        await sql`
          INSERT INTO user_data (email, collection, data, updated_at)
          VALUES (${email}, ${col}, ${JSON.stringify(data)}::jsonb, NOW())
          ON CONFLICT (email, collection)
          DO UPDATE SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
        `;
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch (e: any) {
      return new Response(
        JSON.stringify({ ok: false, error: String(e?.message || e) }),
        { status: 500, headers },
      );
    }
  }

  // ── DELETE: remove all data for a user ──
  if (action === "delete_account") {
    try {
      await sql`DELETE FROM user_data WHERE email = ${email}`;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch (e: any) {
      return new Response(
        JSON.stringify({ ok: false, error: String(e?.message || e) }),
        { status: 500, headers },
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: false, error: "action must be 'load', 'save', 'save_batch', or 'delete_account'" }),
    { status: 400, headers },
  );
}

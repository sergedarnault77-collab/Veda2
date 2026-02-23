export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setTraceHeaders } from "./lib/traceHeaders";

const VALID_COLLECTIONS = ["user", "supps", "meds", "exposure", "scans", "taken"] as const;
type Collection = (typeof VALID_COLLECTIONS)[number];

function getConnStr(): string {
  return (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
}

async function getDb() {
  const connStr = getConnStr();
  if (!connStr) return null;
  const { neon } = await import("@neondatabase/serverless");
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setTraceHeaders(req, res);
  console.log("[sync] handler entered", { method: req.method, url: req.url, rid: req.headers["x-veda-request-id"] });

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  let authUser: any = null;
  try {
    const { requireAuth } = await import("./lib/auth");
    authUser = await requireAuth(req);
  } catch { /* best-effort */ }
  if (!authUser) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  const sql = await getDb();
  if (!sql) {
    return res.status(503).json({ ok: false, error: "Database not configured" });
  }

  const body = req.body || {};
  const email = authUser.email;
  const action = body?.action;

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

      return res.status(200).json({ ok: true, collections: result });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (action === "save") {
    const collection = body?.collection;
    if (!VALID_COLLECTIONS.includes(collection)) {
      return res.status(400).json({ ok: false, error: `Invalid collection. Must be one of: ${VALID_COLLECTIONS.join(", ")}` });
    }

    const data = stripImages(body?.data);
    if (data === undefined) {
      return res.status(400).json({ ok: false, error: "data required" });
    }

    try {
      await sql`
        INSERT INTO user_data (email, collection, data, updated_at)
        VALUES (${email}, ${collection}, ${JSON.stringify(data)}::jsonb, NOW())
        ON CONFLICT (email, collection)
        DO UPDATE SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
      `;

      return res.status(200).json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (action === "save_batch") {
    const items = body?.items;
    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "items[] required" });
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

      return res.status(200).json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (action === "delete_account") {
    try {
      await sql`DELETE FROM user_data WHERE email = ${email}`;
      return res.status(200).json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }

  return res.status(400).json({ ok: false, error: "action must be 'load', 'save', 'save_batch', or 'delete_account'" });
}

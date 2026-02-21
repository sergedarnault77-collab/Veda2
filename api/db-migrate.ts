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
  const envSecret = (process.env.MIGRATE_SECRET || "").trim();
  if (!envSecret || secret !== envSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
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

    /* ── Product master dataset tables ── */

    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id              SERIAL PRIMARY KEY,
        source          TEXT NOT NULL,
        source_id       TEXT NOT NULL,
        barcode         TEXT,
        product_name    TEXT,
        brand_name      TEXT,
        country         TEXT,
        form            TEXT,
        serving_size    TEXT,
        raw_json        JSONB,
        last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(source, source_id)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_products_barcode
      ON products (barcode) WHERE barcode IS NOT NULL
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_products_name_trgm
      ON products USING gin (
        (lower(coalesce(product_name,'') || ' ' || coalesce(brand_name,''))) gin_trgm_ops
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS product_nutrients (
        id              SERIAL PRIMARY KEY,
        product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        ingredient_name TEXT NOT NULL,
        amount          NUMERIC,
        unit            TEXT,
        per             TEXT,
        pct_dv          NUMERIC
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_pn_product_id
      ON product_nutrients (product_id)
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

export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  const secret = (req.headers["x-migrate-secret"] as string) || "";
  const envSecret = (process.env.MIGRATE_SECRET || "").trim();
  if (!envSecret || secret !== envSecret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) {
    return res.status(500).json({ ok: false, error: "DATABASE_URL or STORAGE_URL not set" });
  }

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(connStr);

    await sql`
      CREATE TABLE IF NOT EXISTS user_data (
        email       TEXT NOT NULL,
        collection  TEXT NOT NULL,
        data        JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (email, collection)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_data_email ON user_data (email)`;

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
    await sql`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode) WHERE barcode IS NOT NULL`;
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
    await sql`CREATE INDEX IF NOT EXISTS idx_pn_product_id ON product_nutrients (product_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS item_profiles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        canonical_name  TEXT NOT NULL UNIQUE,
        display_name    TEXT NOT NULL,
        kind            TEXT NOT NULL CHECK (kind IN ('med','supplement','food')),
        tags            TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        timing          JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS interaction_rules (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_key            TEXT NOT NULL UNIQUE,
        applies_to          TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        applies_if_tags     TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        conflicts_with_names TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        conflicts_with_tags  TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        constraint_data     JSONB NOT NULL,
        severity            TEXT NOT NULL CHECK (severity IN ('hard','soft')),
        confidence          INT NOT NULL DEFAULT 80 CHECK (confidence >= 0 AND confidence <= 100),
        rationale           TEXT NOT NULL,
        refs                TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        version             INT NOT NULL DEFAULT 1,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS interaction_rules_active_idx ON interaction_rules(is_active)`;
    await sql`CREATE INDEX IF NOT EXISTS interaction_rules_applies_to_idx ON interaction_rules USING GIN(applies_to)`;
    await sql`CREATE INDEX IF NOT EXISTS interaction_rules_tags_idx ON interaction_rules USING GIN(applies_if_tags)`;

    await sql`
      CREATE TABLE IF NOT EXISTS user_intake_items (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         TEXT NOT NULL,
        canonical_name  TEXT NOT NULL,
        display_name    TEXT NOT NULL,
        dose            TEXT,
        frequency       TEXT NOT NULL DEFAULT 'daily',
        preferred_window JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS user_intake_items_user_idx ON user_intake_items(user_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS schedule_runs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     TEXT NOT NULL,
        run_date    DATE NOT NULL,
        input       JSONB NOT NULL,
        output      JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS schedule_runs_user_date_idx ON schedule_runs(user_id, run_date)`;

    await sql`
      CREATE TABLE IF NOT EXISTS rule_change_requests (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status            TEXT NOT NULL CHECK (status IN ('proposed','triaged','verified','rejected','published')),
        proposed_by       TEXT NOT NULL,
        rule_payload      JSONB NOT NULL,
        reviewer_notes    TEXT,
        verified_by       TEXT,
        verified_at       TIMESTAMPTZ,
        published_rule_id UUID REFERENCES interaction_rules(id),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    return res.status(200).json({ ok: true, message: "Migration complete" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

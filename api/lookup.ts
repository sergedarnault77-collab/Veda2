export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setTraceHeaders } from "./lib/traceHeaders";

async function getDb() {
  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return null;
  const { neon } = await import("@neondatabase/serverless");
  return neon(connStr);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setTraceHeaders(req, res);
  res.setHeader("cache-control", "public, max-age=3600, s-maxage=86400");
  console.log("[lookup] handler entered", { method: req.method, url: req.url, rid: req.headers["x-veda-request-id"] });

  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  try { const { requireAuth } = await import("./lib/auth"); await requireAuth(req); } catch { /* best-effort */ }

  const sql = await getDb();
  if (!sql) return res.status(503).json({ ok: false, error: "Database not configured" });

  const barcode = (req.query.barcode as string || "").trim();
  const query = (req.query.q as string || "").trim();

  if (!barcode && !query) return res.status(400).json({ ok: false, error: "Provide ?barcode=... or ?q=..." });

  try {
    if (barcode) {
      const rows = await sql`
        SELECT p.id, p.source, p.source_id, p.barcode, p.product_name, p.brand_name,
               p.country, p.form, p.serving_size
        FROM products p
        WHERE p.barcode = ${barcode}
        LIMIT 1
      `;

      if (rows.length === 0) return res.status(200).json({ ok: true, match: null });

      const product = rows[0];
      const nutrients = await sql`
        SELECT ingredient_name, amount, unit, per, pct_dv
        FROM product_nutrients
        WHERE product_id = ${product.id}
        ORDER BY ingredient_name
      `;

      return res.status(200).json({
        ok: true,
        match: {
          source: product.source,
          sourceId: product.source_id,
          barcode: product.barcode,
          productName: product.product_name,
          brandName: product.brand_name,
          country: product.country,
          form: product.form,
          servingSize: product.serving_size,
          nutrients: nutrients.map((n: any) => ({
            name: n.ingredient_name,
            amount: n.amount != null ? Number(n.amount) : null,
            unit: n.unit,
            per: n.per,
            pctDv: n.pct_dv != null ? Number(n.pct_dv) : null,
          })),
        },
      });
    }

    const searchTerm = query.toLowerCase().slice(0, 200);

    const rows = await sql`
      SELECT p.id, p.source, p.source_id, p.barcode, p.product_name, p.brand_name,
             p.country, p.form, p.serving_size,
             similarity(
               lower(coalesce(p.product_name,'') || ' ' || coalesce(p.brand_name,'')),
               ${searchTerm}
             ) AS sim
      FROM products p
      WHERE
        lower(coalesce(p.product_name,'') || ' ' || coalesce(p.brand_name,''))
        % ${searchTerm}
      ORDER BY sim DESC
      LIMIT 5
    `;

    if (rows.length === 0) return res.status(200).json({ ok: true, matches: [] });

    const results = await Promise.all(
      rows.map(async (product: any) => {
        const nutrients = await sql`
          SELECT ingredient_name, amount, unit, per, pct_dv
          FROM product_nutrients
          WHERE product_id = ${product.id}
          ORDER BY ingredient_name
        `;

        return {
          source: product.source,
          sourceId: product.source_id,
          barcode: product.barcode,
          productName: product.product_name,
          brandName: product.brand_name,
          country: product.country,
          form: product.form,
          servingSize: product.serving_size,
          similarity: Number(product.sim).toFixed(3),
          nutrients: nutrients.map((n: any) => ({
            name: n.ingredient_name,
            amount: n.amount != null ? Number(n.amount) : null,
            unit: n.unit,
            per: n.per,
            pctDv: n.pct_dv != null ? Number(n.pct_dv) : null,
          })),
        };
      }),
    );

    return res.status(200).json({ ok: true, matches: results });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 200) });
  }
}

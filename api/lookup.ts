export const config = { runtime: "edge" };

import { neon } from "@neondatabase/serverless";
import { requireAuth, unauthorized } from "./lib/auth";

function getDb() {
  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return null;
  return neon(connStr);
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return json({ ok: false, error: "GET only" }, 405);
  }

  const authUser = await requireAuth(req);
  if (!authUser) return unauthorized();

  const sql = getDb();
  if (!sql) {
    return json({ ok: false, error: "Database not configured" }, 503);
  }

  const url = new URL(req.url);
  const barcode = url.searchParams.get("barcode")?.trim() || "";
  const query = url.searchParams.get("q")?.trim() || "";

  if (!barcode && !query) {
    return json({ ok: false, error: "Provide ?barcode=... or ?q=..." }, 400);
  }

  try {
    /* ── Barcode lookup (exact match, fastest) ── */
    if (barcode) {
      const rows = await sql`
        SELECT p.id, p.source, p.source_id, p.barcode, p.product_name, p.brand_name,
               p.country, p.form, p.serving_size
        FROM products p
        WHERE p.barcode = ${barcode}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return json({ ok: true, match: null });
      }

      const product = rows[0];
      const nutrients = await sql`
        SELECT ingredient_name, amount, unit, per, pct_dv
        FROM product_nutrients
        WHERE product_id = ${product.id}
        ORDER BY ingredient_name
      `;

      return json({
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

    /* ── Text search (trigram similarity on name + brand) ── */
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

    if (rows.length === 0) {
      return json({ ok: true, matches: [] });
    }

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

    return json({ ok: true, matches: results });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e).slice(0, 200) }, 500);
  }
}

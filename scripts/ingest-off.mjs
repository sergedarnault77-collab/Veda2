#!/usr/bin/env node
/**
 * Ingest Open Food Facts supplement/drink products into the Veda products database.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/ingest-off.mjs [--limit=N] [--category=CATEGORY]
 *
 * Default categories searched:
 *   dietary-supplements, vitamins, minerals, energy-drinks, coffees, teas
 *
 * The script uses the OFF search API (rate limited to 10 req/min for search,
 * 100 req/min for product reads), with built-in pauses.
 */

import { neon } from "@neondatabase/serverless";

const OFF_BASE = "https://world.openfoodfacts.org";
const SEARCH_PAUSE_MS = 7000; // stay under 10 req/min
const PAGE_SIZE = 100;

const connStr = process.env.DATABASE_URL || process.env.STORAGE_URL || "";
if (!connStr) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(connStr);

const args = process.argv.slice(2);
const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "0", 10);
const categoryArg = args.find(a => a.startsWith("--category="))?.split("=")[1] || "";

const DEFAULT_CATEGORIES = [
  "en:dietary-supplements",
  "en:food-supplements",
  "en:vitamins",
  "en:minerals",
  "en:energy-drinks",
  "en:coffees",
  "en:teas",
  "en:protein-supplements",
];

const categories = categoryArg ? [categoryArg] : DEFAULT_CATEGORIES;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "VedaApp/1.0 (health-tracker; contact@veda-app.com)",
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(3000 * (i + 1));
    }
  }
}

const NUTRIMENT_KEYS = [
  "vitamin-a", "vitamin-b1", "vitamin-b2", "vitamin-b6", "vitamin-b9",
  "vitamin-b12", "vitamin-c", "vitamin-d", "vitamin-e", "vitamin-k",
  "vitamin-pp", "biotin", "pantothenic-acid",
  "calcium", "iron", "magnesium", "zinc", "potassium", "sodium",
  "phosphorus", "iodine", "selenium", "copper", "manganese", "chromium",
  "molybdenum", "fluoride",
  "caffeine", "taurine",
  "proteins", "carbohydrates", "sugars", "fat", "saturated-fat", "fiber",
  "energy-kcal",
];

function extractNutrients(product) {
  const nm = product.nutriments || {};
  const rows = [];

  for (const key of NUTRIMENT_KEYS) {
    const val = nm[key + "_100g"] ?? nm[key + "_serving"] ?? nm[key];
    if (val == null || val === "" || val === 0) continue;

    const unit = nm[key + "_unit"] || "g";
    const per = nm[key + "_serving"] != null ? "per serving" : "per 100g";

    rows.push({
      name: key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      amount: Number(val),
      unit,
      per,
      pctDv: null,
    });
  }

  return rows;
}

async function processProduct(product) {
  const barcode = product.code || null;
  const name = product.product_name || product.product_name_en || null;
  const brand = product.brands || null;
  const country = product.countries_tags?.[0]?.replace("en:", "") || null;

  if (!name && !barcode) return false;

  const sourceId = barcode || product._id || String(Date.now());

  try {
    const result = await sql`
      INSERT INTO products (source, source_id, barcode, product_name, brand_name, country, form, serving_size, raw_json, last_fetched_at)
      VALUES ('off', ${sourceId}, ${barcode}, ${name}, ${brand}, ${country}, ${null}, ${product.serving_size || null}, ${JSON.stringify(product)}::jsonb, NOW())
      ON CONFLICT (source, source_id)
      DO UPDATE SET
        barcode = EXCLUDED.barcode,
        product_name = EXCLUDED.product_name,
        brand_name = EXCLUDED.brand_name,
        country = EXCLUDED.country,
        serving_size = EXCLUDED.serving_size,
        raw_json = EXCLUDED.raw_json,
        last_fetched_at = NOW()
      RETURNING id
    `;

    const productId = result[0]?.id;
    if (!productId) return false;

    await sql`DELETE FROM product_nutrients WHERE product_id = ${productId}`;

    const nutrients = extractNutrients(product);
    for (const n of nutrients) {
      await sql`
        INSERT INTO product_nutrients (product_id, ingredient_name, amount, unit, per, pct_dv)
        VALUES (${productId}, ${n.name}, ${n.amount}, ${n.unit}, ${n.per}, ${n.pctDv})
      `;
    }

    return true;
  } catch (e) {
    console.warn(`  ⚠ DB error for ${sourceId}: ${e.message}`);
    return false;
  }
}

async function ingestCategory(category) {
  console.log(`\n── Category: ${category} ──`);
  let page = 1;
  let totalIngested = 0;
  let totalFailed = 0;

  while (true) {
    const fields = "code,product_name,product_name_en,brands,countries_tags,nutriments,serving_size";
    const url = `${OFF_BASE}/cgi/search.pl?action=process&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(category)}&page_size=${PAGE_SIZE}&page=${page}&json=true&fields=${fields}`;

    let data;
    try {
      data = await fetchJson(url);
    } catch (e) {
      console.warn(`  ⚠ Search failed for page ${page}: ${e.message}`);
      break;
    }

    const products = data.products || [];
    if (products.length === 0) break;

    const total = data.count || "?";
    console.log(`  Page ${page} (${products.length} products, ~${total} total in category)`);

    for (const p of products) {
      const ok = await processProduct(p);
      if (ok) totalIngested++; else totalFailed++;
    }

    if (limit && totalIngested >= limit) break;

    page++;
    await sleep(SEARCH_PAUSE_MS);
  }

  console.log(`  Category done: ${totalIngested} ingested, ${totalFailed} failed`);
  return totalIngested;
}

/* ── Main ── */
async function main() {
  console.log("=== Open Food Facts Ingestion ===");
  if (limit) console.log(`Limit per category: ${limit}`);
  console.log(`Categories: ${categories.join(", ")}`);

  let grandTotal = 0;

  for (const cat of categories) {
    const n = await ingestCategory(cat);
    grandTotal += n;

    if (limit && grandTotal >= limit) break;
  }

  console.log(`\nDone. Total products ingested: ${grandTotal}`);
}

main().catch(e => { console.error(e); process.exit(1); });

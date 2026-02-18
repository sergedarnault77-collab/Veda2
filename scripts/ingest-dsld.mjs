#!/usr/bin/env node
/**
 * Ingest NIH DSLD supplement labels into the Veda products database.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/ingest-dsld.mjs [--resume-from=ID] [--limit=N]
 *
 * The script:
 *   1. Pages through DSLD search-filter to collect all label IDs
 *   2. Fetches each label's full detail (with rate-limit pauses)
 *   3. Upserts product + nutrients into Postgres
 */

import { neon } from "@neondatabase/serverless";

const DSLD_BASE = "https://dsld.od.nih.gov/dsld/v8";
const PAGE_SIZE = 200;
const DETAIL_CONCURRENCY = 5;
const DETAIL_PAUSE_MS = 200;

const connStr = process.env.DATABASE_URL || process.env.STORAGE_URL || "";
if (!connStr) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(connStr);

const args = process.argv.slice(2);
const resumeFrom = parseInt(args.find(a => a.startsWith("--resume-from="))?.split("=")[1] || "0", 10);
const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "0", 10);

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Step 1: collect all label IDs via search-filter ── */
async function collectLabelIds() {
  console.log("Collecting label IDs from DSLD search-filter...");
  const ids = [];
  let from = 0;
  let total = null;

  while (true) {
    const url = `${DSLD_BASE}/search-filter?from=${from}&size=${PAGE_SIZE}&sort_by=newest&status=2`;
    const data = await fetchJson(url);

    if (total === null) {
      total = typeof data.stats?.total === "number" ? data.stats.total
            : typeof data.total?.value === "number" ? data.total.value
            : data.hits?.length ?? 0;
      console.log(`  Total labels in DSLD: ~${total}`);
    }

    const hits = data.hits || [];
    if (hits.length === 0) break;

    for (const hit of hits) {
      const id = hit._id || hit._source?.dsldId;
      if (id) ids.push(Number(id));
    }

    from += hits.length;
    console.log(`  Collected ${ids.length} IDs (from=${from})...`);

    if (limit && ids.length >= limit) {
      ids.length = limit;
      break;
    }

    await sleep(300);
  }

  return ids;
}

/* ── Step 2: fetch label detail and upsert ── */
function extractFormFromLangual(label) {
  const codes = label.langualCodes;
  if (!Array.isArray(codes)) return null;
  for (const c of codes) {
    const forms = c.supplementForm;
    if (Array.isArray(forms) && forms.length > 0) return forms[0];
  }
  return label.langualSupplementForm || null;
}

function extractBarcode(label) {
  return label.sku || null;
}

function extractServingSize(label) {
  const facts = label.dietarySupplementsFacts;
  if (!Array.isArray(facts) || facts.length === 0) return null;
  const f = facts[0];
  const qty = f.servingSizeQuantity;
  const unit = f.servingSizeUnitName;
  if (qty && unit) return `${qty} ${unit}`;
  return null;
}

function extractNutrients(label) {
  const facts = label.dietarySupplementsFacts;
  if (!Array.isArray(facts)) return [];

  const rows = [];
  for (const fact of facts) {
    const per = extractServingSize(label) || "per serving";
    const ingredients = fact.ingredients || [];

    for (const ing of ingredients) {
      const name = ing.name || ing.altName;
      if (!name) continue;

      const dataEntries = ing.data || [];
      let amount = null;
      let unit = null;

      for (const d of dataEntries) {
        if (d.sfbQuantityQuantity != null && d.sfbQuantityQuantity !== 0) {
          amount = d.sfbQuantityQuantity;
          unit = d.unitName || null;
          break;
        }
      }

      const pctDv = ing.dvPercent != null ? ing.dvPercent : null;

      rows.push({ name, amount, unit, per, pctDv });
    }
  }

  return rows;
}

async function processLabel(dsldId) {
  const url = `${DSLD_BASE}/label/${dsldId}`;
  let label;
  try {
    label = await fetchJson(url);
  } catch (e) {
    console.warn(`  ⚠ Failed to fetch label ${dsldId}: ${e.message}`);
    return false;
  }

  if (!label || !label.productName) return false;

  const barcode = extractBarcode(label);
  const form = extractFormFromLangual(label);
  const servingSize = extractServingSize(label);
  const country = "US";

  try {
    const result = await sql`
      INSERT INTO products (source, source_id, barcode, product_name, brand_name, country, form, serving_size, raw_json, last_fetched_at)
      VALUES ('dsld', ${String(dsldId)}, ${barcode}, ${label.productName}, ${label.brand || null}, ${country}, ${form}, ${servingSize}, ${JSON.stringify(label)}::jsonb, NOW())
      ON CONFLICT (source, source_id)
      DO UPDATE SET
        barcode = EXCLUDED.barcode,
        product_name = EXCLUDED.product_name,
        brand_name = EXCLUDED.brand_name,
        form = EXCLUDED.form,
        serving_size = EXCLUDED.serving_size,
        raw_json = EXCLUDED.raw_json,
        last_fetched_at = NOW()
      RETURNING id
    `;

    const productId = result[0]?.id;
    if (!productId) return false;

    await sql`DELETE FROM product_nutrients WHERE product_id = ${productId}`;

    const nutrients = extractNutrients(label);
    for (const n of nutrients) {
      await sql`
        INSERT INTO product_nutrients (product_id, ingredient_name, amount, unit, per, pct_dv)
        VALUES (${productId}, ${n.name}, ${n.amount}, ${n.unit}, ${n.per}, ${n.pctDv})
      `;
    }

    return true;
  } catch (e) {
    console.warn(`  ⚠ DB error for ${dsldId}: ${e.message}`);
    return false;
  }
}

/* ── Main ── */
async function main() {
  console.log("=== DSLD Ingestion ===");
  console.log(`Resume from: ${resumeFrom || "beginning"}`);
  if (limit) console.log(`Limit: ${limit} labels`);

  const allIds = await collectLabelIds();
  const ids = resumeFrom ? allIds.filter(id => id >= resumeFrom) : allIds;
  console.log(`\nProcessing ${ids.length} labels...`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < ids.length; i += DETAIL_CONCURRENCY) {
    const batch = ids.slice(i, i + DETAIL_CONCURRENCY);
    const results = await Promise.all(batch.map(processLabel));

    for (const r of results) {
      if (r) ok++; else fail++;
    }

    if ((ok + fail) % 50 === 0 || i + DETAIL_CONCURRENCY >= ids.length) {
      console.log(`  Progress: ${ok + fail}/${ids.length} (${ok} ok, ${fail} fail)`);
    }

    await sleep(DETAIL_PAUSE_MS);
  }

  console.log(`\nDone. Ingested ${ok} labels, ${fail} failures.`);
}

main().catch(e => { console.error(e); process.exit(1); });

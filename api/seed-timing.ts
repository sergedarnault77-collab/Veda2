export const config = { runtime: "edge" };

import { neon } from "@neondatabase/serverless";
import { FIRST_30_ITEM_PROFILES } from "../src/lib/timing/seed/seedItems";
import { GENERIC_RULES } from "../src/lib/timing/genericRules";
import { SPECIFIC_RULES } from "../src/lib/timing/seed/seedRules";
import type { InteractionRule } from "../src/lib/timing/types";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "POST only" });
  }

  const secret = req.headers.get("x-migrate-secret") || "";
  const envSecret = (process.env.MIGRATE_SECRET || "").trim();
  if (!envSecret || secret !== envSecret) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) {
    return json(500, { ok: false, error: "DATABASE_URL not set" });
  }

  const sql = neon(connStr);
  const counts = { profilesUpserted: 0, rulesUpserted: 0 };

  try {
    for (const p of FIRST_30_ITEM_PROFILES) {
      await sql`
        INSERT INTO item_profiles (canonical_name, display_name, kind, tags, timing, updated_at)
        VALUES (${p.canonicalName}, ${p.displayName}, ${p.kind}, ${p.tags}, ${JSON.stringify(p.timing)}, NOW())
        ON CONFLICT (canonical_name) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          kind         = EXCLUDED.kind,
          tags         = EXCLUDED.tags,
          timing       = EXCLUDED.timing,
          updated_at   = NOW()
      `;
      counts.profilesUpserted++;
    }

    const allRules: InteractionRule[] = [...GENERIC_RULES, ...SPECIFIC_RULES];

    for (const r of allRules) {
      await sql`
        INSERT INTO interaction_rules
          (rule_key, applies_to, applies_if_tags, conflicts_with_names,
           conflicts_with_tags, constraint_data, severity, confidence,
           rationale, refs, is_active, version, updated_at)
        VALUES (
          ${r.ruleKey}, ${r.appliesTo}, ${r.appliesIfTags},
          ${r.conflictsWithNames}, ${r.conflictsWithTags},
          ${JSON.stringify(r.constraint)}, ${r.severity}, ${r.confidence},
          ${r.rationale}, ${r.references}, ${r.isActive}, ${r.version}, NOW()
        )
        ON CONFLICT (rule_key) DO UPDATE SET
          applies_to          = EXCLUDED.applies_to,
          applies_if_tags     = EXCLUDED.applies_if_tags,
          conflicts_with_names = EXCLUDED.conflicts_with_names,
          conflicts_with_tags  = EXCLUDED.conflicts_with_tags,
          constraint_data     = EXCLUDED.constraint_data,
          severity            = EXCLUDED.severity,
          confidence          = EXCLUDED.confidence,
          rationale           = EXCLUDED.rationale,
          refs                = EXCLUDED.refs,
          is_active           = EXCLUDED.is_active,
          version             = EXCLUDED.version,
          updated_at          = NOW()
      `;
      counts.rulesUpserted++;
    }

    return json(200, { ok: true, ...counts });
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

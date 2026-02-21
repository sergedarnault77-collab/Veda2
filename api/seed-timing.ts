import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireMigrateSecret } from "./_lib/migrateAuth";
import { withDb } from "./_lib/db";
import { FIRST_30_ITEM_PROFILES } from "./_lib/seed/itemProfiles";
import { GENERIC_RULES, SPECIFIC_RULES } from "./_lib/seed/interactionRules";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    requireMigrateSecret(req);

    const rules = [...GENERIC_RULES, ...SPECIFIC_RULES];

    const out = await withDb(async (client) => {
      await client.query("begin");
      try {
        let itemsUpserted = 0;
        for (const item of FIRST_30_ITEM_PROFILES) {
          await client.query(
            `
            insert into public.item_profiles (canonical_name, display_name, kind, tags, timing)
            values ($1, $2, $3, $4, $5)
            on conflict (canonical_name) do update
              set display_name = excluded.display_name,
                  kind = excluded.kind,
                  tags = excluded.tags,
                  timing = excluded.timing,
                  updated_at = now()
            `,
            [item.canonical_name, item.display_name, item.kind, item.tags, item.timing]
          );
          itemsUpserted++;
        }

        let rulesUpserted = 0;
        for (const r of rules) {
          await client.query(
            `
            insert into public.interaction_rules
              (rule_key, applies_to, applies_if_tags, conflicts_with_names, conflicts_with_tags, constraint, severity, confidence, rationale, references, is_active, version)
            values
              ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            on conflict (rule_key) do update
              set applies_to = excluded.applies_to,
                  applies_if_tags = excluded.applies_if_tags,
                  conflicts_with_names = excluded.conflicts_with_names,
                  conflicts_with_tags = excluded.conflicts_with_tags,
                  constraint = excluded.constraint,
                  severity = excluded.severity,
                  confidence = excluded.confidence,
                  rationale = excluded.rationale,
                  references = excluded.references,
                  is_active = excluded.is_active,
                  version = excluded.version,
                  updated_at = now()
            `,
            [
              r.rule_key,
              r.applies_to ?? [],
              r.applies_if_tags ?? [],
              r.conflicts_with_names ?? [],
              r.conflicts_with_tags ?? [],
              r.constraint,
              r.severity,
              r.confidence,
              r.rationale,
              r.references ?? [],
              r.is_active ?? true,
              r.version ?? 1,
            ]
          );
          rulesUpserted++;
        }

        await client.query("commit");
        return { ok: true, itemsUpserted, rulesUpserted };
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    });

    return res.status(200).json(out);
  } catch (err: any) {
    const status = err?.statusCode ?? 500;
    return res.status(status).json({ error: err?.message ?? "Internal error" });
  }
}

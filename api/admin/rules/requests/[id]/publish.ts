export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  let authUser: any = null;
  try {
    const { requireAuth } = await import("../../../../lib/auth");
    authUser = await requireAuth(req);
  } catch { /* best-effort */ }
  if (!authUser) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }
  if (!ADMIN_EMAILS.includes(authUser.email.toLowerCase())) {
    return res.status(403).json({ ok: false, error: "Admin access required" });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ ok: false, error: "Missing request id" });

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return res.status(500).json({ ok: false, error: "DATABASE_URL not set" });

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(connStr);

    const reqRows = await sql`
      SELECT * FROM rule_change_requests WHERE id = ${id} AND status = 'verified'
    `;
    if (reqRows.length === 0) {
      return res.status(400).json({ ok: false, error: "Request not in 'verified' status" });
    }

    const payload = reqRows[0].rule_payload as any;
    const ruleKey = payload.ruleKey || payload.rule_key;
    if (!ruleKey) return res.status(400).json({ ok: false, error: "rulePayload missing ruleKey" });

    const ruleRows = await sql`
      INSERT INTO interaction_rules
        (rule_key, applies_to, applies_if_tags, conflicts_with_names,
         conflicts_with_tags, constraint_data, severity, confidence,
         rationale, refs, is_active, version, updated_at)
      VALUES (
        ${ruleKey},
        ${payload.appliesTo || payload.applies_to || []},
        ${payload.appliesIfTags || payload.applies_if_tags || []},
        ${payload.conflictsWithNames || payload.conflicts_with_names || []},
        ${payload.conflictsWithTags || payload.conflicts_with_tags || []},
        ${JSON.stringify(payload.constraint || payload.constraint_data || {})},
        ${payload.severity || "soft"},
        ${payload.confidence ?? 70},
        ${payload.rationale || ""},
        ${payload.references || payload.refs || []},
        ${payload.isActive !== false},
        ${payload.version || 1},
        NOW()
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
        version             = EXCLUDED.version + 1,
        updated_at          = NOW()
      RETURNING id
    `;

    const publishedRuleId = ruleRows[0]?.id;

    await sql`
      UPDATE rule_change_requests
      SET status = 'published',
          published_rule_id = ${publishedRuleId},
          updated_at = NOW()
      WHERE id = ${id}
    `;

    return res.status(200).json({ ok: true, ruleId: publishedRuleId });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

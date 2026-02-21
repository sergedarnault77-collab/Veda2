export const config = { runtime: "edge" };

import { neon } from "@neondatabase/serverless";
import { requireAuth, unauthorized } from "../../../../lib/auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export default async function handler(req: Request): Promise<Response> {
  const authUser = await requireAuth(req);
  if (!authUser) return unauthorized();
  if (!ADMIN_EMAILS.includes(authUser.email.toLowerCase())) {
    return json(403, { ok: false, error: "Admin access required" });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  const id = extractId(req.url);
  if (!id) return json(400, { ok: false, error: "Missing request id" });

  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return json(500, { ok: false, error: "DATABASE_URL not set" });

  try {
    const sql = neon(connStr);

    const reqRows = await sql`
      SELECT * FROM rule_change_requests WHERE id = ${id} AND status = 'verified'
    `;
    if (reqRows.length === 0) {
      return json(400, { ok: false, error: "Request not in 'verified' status" });
    }

    const payload = reqRows[0].rule_payload as any;

    const ruleKey = payload.ruleKey || payload.rule_key;
    if (!ruleKey) return json(400, { ok: false, error: "rulePayload missing ruleKey" });

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

    return json(200, { ok: true, ruleId: publishedRuleId });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}

function extractId(url: string): string | null {
  const m = url.match(/\/requests\/([^/]+)\/publish/);
  return m?.[1] || null;
}

function json(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

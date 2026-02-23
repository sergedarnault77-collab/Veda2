export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { InteractionRule, ItemProfile, ScheduleInputItem } from "../../src/lib/timing/types";
import { generateSchedule } from "../../src/lib/timing/scheduler";
import { setTraceHeaders } from "../lib/traceHeaders";
import { getNeonDb } from "../lib/neonDb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setTraceHeaders(req, res);

  let authUser: any = null;
  try {
    const { requireAuth } = await import("../lib/auth");
    authUser = await requireAuth(req);
  } catch { /* best-effort */ }
  if (!authUser) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  const body = req.body || {};
  const date = body?.date || new Date().toISOString().slice(0, 10);
  const wakeTime = body?.wakeTime;
  const meals = body?.meals;

  let inputItems: ScheduleInputItem[] = [];

  if (Array.isArray(body?.items) && body.items.length > 0) {
    inputItems = body.items.map((i: any) => ({
      canonicalName: i.canonicalName || i.canonical_name || "",
      displayName: i.displayName || i.display_name || "",
      dose: i.dose,
      frequency: i.frequency || "daily",
    }));
  } else {
    const sql = await getNeonDb();
    if (sql) {
      try {
        const rows = await sql`
          SELECT canonical_name, display_name, dose, frequency
          FROM user_intake_items
          WHERE user_id = ${authUser.id}
        `;
        inputItems = rows.map((r: any) => ({
          canonicalName: r.canonical_name,
          displayName: r.display_name,
          dose: r.dose,
          frequency: r.frequency,
        }));
      } catch (e: any) {
        console.warn("[schedule/generate] DB load failed:", e?.message);
      }
    }
  }

  if (inputItems.length === 0) {
    return res.status(200).json({
      ok: true,
      schedule: {
        date,
        items: [],
        warnings: [],
        overallConfidence: 100,
        disclaimer: "No items to schedule. Add supplements or medications first.",
      },
    });
  }

  let profiles: ItemProfile[] = [];
  let additionalRules: InteractionRule[] = [];

  const sql = await getNeonDb();
  if (sql) {
    try {
      const canonicals = inputItems.map((i) => i.canonicalName);
      const profileRows = await sql`
        SELECT canonical_name, display_name, kind, tags, timing
        FROM item_profiles
        WHERE canonical_name = ANY(${canonicals})
      `;
      profiles = profileRows.map((r: any) => ({
        canonicalName: r.canonical_name,
        displayName: r.display_name,
        kind: r.kind,
        tags: r.tags || [],
        timing: r.timing || {},
      }));

      const ruleRows = await sql`
        SELECT rule_key, applies_to, applies_if_tags,
               conflicts_with_names, conflicts_with_tags,
               constraint_data, severity, confidence,
               rationale, refs, is_active, version
        FROM interaction_rules
        WHERE is_active = true
      `;
      additionalRules = ruleRows.map((r: any) => ({
        ruleKey: r.rule_key,
        appliesTo: r.applies_to || [],
        appliesIfTags: r.applies_if_tags || [],
        conflictsWithNames: r.conflicts_with_names || [],
        conflictsWithTags: r.conflicts_with_tags || [],
        constraint: r.constraint_data,
        severity: r.severity,
        confidence: r.confidence,
        rationale: r.rationale,
        references: r.refs || [],
        isActive: r.is_active,
        version: r.version,
      }));
    } catch (e: any) {
      console.warn("[schedule/generate] DB profiles/rules load failed:", e?.message);
    }
  }

  const schedule = generateSchedule({
    date,
    items: inputItems,
    profiles,
    additionalRules,
    meals,
    wakeTime,
  });

  const sql2 = await getNeonDb();
  if (sql2) {
    try {
      await sql2`
        INSERT INTO schedule_runs (user_id, run_date, input, output)
        VALUES (${authUser.id}, ${date}, ${JSON.stringify({ items: inputItems, meals, wakeTime })}, ${JSON.stringify(schedule)})
      `;
    } catch (e: any) {
      console.warn("[schedule/generate] Failed to persist run:", e?.message);
    }
  }

  return res.status(200).json({ ok: true, schedule });
}

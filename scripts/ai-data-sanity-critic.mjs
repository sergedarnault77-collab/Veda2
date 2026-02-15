import path from "node:path";
import {
  ensureDirs, readJsonFiles, writeJson, writeText, CRIT_DIR, JSON_DIR, openaiResponsesJson, getOpenAIKey, mdEscape
} from "./_critic_shared.mjs";

ensureDirs();

const outJson = path.join(CRIT_DIR, "data.json");
const outMd = path.join(CRIT_DIR, "data.md");

if (!getOpenAIKey()) {
  const skipped = { ok: false, skipped: true, reason: "OPENAI_API_KEY missing", hardFailures: [], warnings: [], suggestedFixes: [] };
  writeJson(outJson, skipped);
  writeText(outMd, `## AI Data sanity critic\n\nSKIPPED: OPENAI_API_KEY missing.\n`);
  process.exit(0);
}

const blobs = readJsonFiles(JSON_DIR).slice(0, 8);
if (blobs.length === 0) {
  const skipped = { ok: false, skipped: true, reason: "No analyze JSON found in artifacts/analyze-json", hardFailures: [], warnings: [], suggestedFixes: [] };
  writeJson(outJson, skipped);
  writeText(outMd, `## AI Data sanity critic\n\nSKIPPED: no analyze JSON found.\n`);
  process.exit(0);
}

const schema = {
  name: "veda_data_sanity",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["hardFailures", "warnings", "suggestedFixes", "missingExpectedEntities"],
    properties: {
      hardFailures: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "evidence", "whyBad", "fix"],
          properties: {
            title: { type: "string" },
            evidence: { type: "string" },
            whyBad: { type: "string" },
            fix: { type: "string" }
          }
        }
      },
      warnings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "evidence", "fix"],
          properties: {
            title: { type: "string" },
            evidence: { type: "string" },
            fix: { type: "string" }
          }
        }
      },
      missingExpectedEntities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["expected", "whyExpected", "hint"],
          properties: {
            expected: { type: "string" },
            whyExpected: { type: "string" },
            hint: { type: "string" }
          }
        }
      },
      suggestedFixes: { type: "array", items: { type: "string" } }
    }
  }
};

const input = [
  {
    role: "system",
    content: [
      { type: "input_text", text:
`You are a strict data sanity critic for a label-reading app.
You will be given JSON outputs from /api/analyze.
Return STRICT JSON only.
Check: unit errors (mg vs µg vs IU), absurd DV%/dailyReference, phantom nutrients not in transcription, missing obvious entities (e.g. koffein -> caffeine), category/entity mismatches, low confidence but strong claims.
Hard failures are issues that must be fixed before shipping. Warnings are tolerable but should be improved.
Propose precise fixes (prompt change, normalization rule, synonym map, numeric parsing).`
      }
    ]
  },
  {
    role: "user",
    content: [
      { type: "input_text", text: "Sanity-check these /api/analyze outputs. Focus on units, DV%, missing expected entities, and hallucinations." },
      { type: "input_text", text: JSON.stringify(blobs.map(b => ({ file: b.file, data: b.data }))) }
    ]
  }
];

const result = await openaiResponsesJson({
  model: "gpt-4o-mini",
  input,
  schema
}).catch(err => ({ hardFailures: [], warnings: [], missingExpectedEntities: [], suggestedFixes: [], error: String(err?.message || err) }));

writeJson(outJson, { ok: true, files: blobs.map(b => b.file), ...result });

let md = `## AI Data sanity critic\n\n`;
if (result?.error) {
  md += `Error: ${mdEscape(result.error)}\n`;
} else {
  md += `Files: ${blobs.map(b => "`" + b.file + "`").join(", ")}\n\n`;
  md += `### Hard failures\n`;
  for (const it of (result.hardFailures || [])) md += `- **${mdEscape(it.title)}**\n  - Evidence: ${mdEscape(it.evidence)}\n  - Why: ${mdEscape(it.whyBad)}\n  - Fix: ${mdEscape(it.fix)}\n`;
  md += `\n### Warnings\n`;
  for (const it of (result.warnings || [])) md += `- ${mdEscape(it.title)}\n  - Evidence: ${mdEscape(it.evidence)}\n  - Fix: ${mdEscape(it.fix)}\n`;
  md += `\n### Missing expected entities\n`;
  for (const it of (result.missingExpectedEntities || [])) md += `- Expected: ${mdEscape(it.expected)} — ${mdEscape(it.whyExpected)}\n  - Hint: ${mdEscape(it.hint)}\n`;
  md += `\n### Suggested fixes\n`;
  for (const it of (result.suggestedFixes || [])) md += `- ${mdEscape(it)}\n`;
}

writeText(outMd, md);

import path from "node:path";
import fs from "node:fs";
import {
  ensureDirs, readPngFiles, writeJson, writeText, CRIT_DIR, SHOT_DIR, openaiResponsesJson, getOpenAIKey, mdEscape
} from "./_critic_shared.mjs";

ensureDirs();

const outJson = path.join(CRIT_DIR, "vision.json");
const outMd = path.join(CRIT_DIR, "vision.md");

if (!getOpenAIKey()) {
  const skipped = { ok: false, skipped: true, reason: "OPENAI_API_KEY missing", issues: [], viralHooks: [], friction: [] };
  writeJson(outJson, skipped);
  writeText(outMd, `## AI Vision critic\n\nSKIPPED: OPENAI_API_KEY missing.\n`);
  process.exit(0);
}

const shots = readPngFiles(SHOT_DIR)
  .sort((a, b) => a.file.localeCompare(b.file))
  .slice(0, 10);

if (shots.length === 0) {
  const skipped = { ok: false, skipped: true, reason: "No screenshots found in artifacts/screenshots", issues: [], viralHooks: [], friction: [] };
  writeJson(outJson, skipped);
  writeText(outMd, `## AI Vision critic\n\nSKIPPED: no screenshots found.\n`);
  process.exit(0);
}

// Convert images to data URLs
function toDataUrl(p) {
  const buf = fs.readFileSync(p);
  const b64 = buf.toString("base64");
  return `data:image/png;base64,${b64}`;
}

const schema = {
  name: "veda_ui_critic",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["issues", "friction", "viralHooks", "quickWins"],
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["severity", "title", "what", "fix"],
          properties: {
            severity: { type: "string", enum: ["P0", "P1", "P2"] },
            title: { type: "string" },
            what: { type: "string" },
            fix: { type: "string" }
          }
        }
      },
      friction: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["moment", "why", "fix"],
          properties: {
            moment: { type: "string" },
            why: { type: "string" },
            fix: { type: "string" }
          }
        }
      },
      viralHooks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["hook", "where", "copy", "whyItWorks"],
          properties: {
            hook: { type: "string" },
            where: { type: "string" },
            copy: { type: "string" },
            whyItWorks: { type: "string" }
          }
        }
      },
      quickWins: {
        type: "array",
        items: { type: "string" }
      }
    }
  }
};

const input = [
  {
    role: "system",
    content: [
      { type: "input_text", text:
`You are an elite product/UI critic for a mobile-first viral consumer app.
You will be given screenshots of the current UI.
Return STRICT JSON only that matches the schema.
Focus on: clarity, readability, perceived speed, friction removal, viral/share mechanics, punchy copy.
Do NOT suggest heavy dependencies. Prefer small UI/copy changes.
Be concrete: propose exact copy, button labels, layout changes, and missing states.`
      }
    ]
  },
  {
    role: "user",
    content: [
      { type: "input_text", text: "Critique these screenshots. Call out the top issues, friction points, and viral hooks to add." },
      ...shots.map(s => ({ type: "input_image", image_url: toDataUrl(s.fullPath), detail: "high" }))
    ]
  }
];

const result = await openaiResponsesJson({
  model: "gpt-4o-mini",
  input,
  schema
}).catch(err => ({ ok: false, error: String(err?.message || err), issues: [], friction: [], viralHooks: [], quickWins: [] }));

writeJson(outJson, { ok: true, screenshots: shots.map(s => s.file), ...result });

let md = `## AI Vision critic\n\n`;
if (result?.error) {
  md += `Error: ${mdEscape(result.error)}\n`;
} else {
  md += `Screenshots: ${shots.map(s => "`" + s.file + "`").join(", ")}\n\n`;
  md += `### Top issues\n`;
  for (const it of (result.issues || [])) md += `- **${it.severity}** ${mdEscape(it.title)} — ${mdEscape(it.what)}\n  - Fix: ${mdEscape(it.fix)}\n`;
  md += `\n### Friction\n`;
  for (const it of (result.friction || [])) md += `- ${mdEscape(it.moment)} — ${mdEscape(it.why)}\n  - Fix: ${mdEscape(it.fix)}\n`;
  md += `\n### Viral hooks\n`;
  for (const it of (result.viralHooks || [])) md += `- ${mdEscape(it.hook)} (Where: ${mdEscape(it.where)})\n  - Copy: ${mdEscape(it.copy)}\n  - Why: ${mdEscape(it.whyItWorks)}\n`;
  md += `\n### Quick wins\n`;
  for (const it of (result.quickWins || [])) md += `- ${mdEscape(it)}\n`;
}

writeText(outMd, md);

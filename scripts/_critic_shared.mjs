import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const ART_DIR = path.join(ROOT, "artifacts");
export const SHOT_DIR = path.join(ART_DIR, "screenshots");
export const JSON_DIR = path.join(ART_DIR, "analyze-json");
export const CRIT_DIR = path.join(ART_DIR, "critics");

export function ensureDirs() {
  fs.mkdirSync(ART_DIR, { recursive: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(JSON_DIR, { recursive: true });
  fs.mkdirSync(CRIT_DIR, { recursive: true });
}

export function readJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, fullPath: path.join(dir, f) }))
    .map((x) => {
      try {
        const raw = fs.readFileSync(x.fullPath, "utf8");
        return { file: x.file, data: JSON.parse(raw) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function readPngFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .map((f) => ({ file: f, fullPath: path.join(dir, f) }));
}

export function writeJson(outPath, obj) {
  ensureDirs();
  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2), "utf8");
}

export function writeText(outPath, text) {
  ensureDirs();
  fs.writeFileSync(outPath, text, "utf8");
}

export function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || "";
}

export async function openaiResponsesJson({ model, input, schema }) {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const body = {
    model,
    input,
    text: {
      format: {
        type: "json_schema",
        name: schema.name,
        strict: true,
        schema: schema.schema,
      },
    },
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`OpenAI error ${r.status}: ${t.slice(0, 220)}`);
  }

  const resp = await r.json();
  const out = resp.output_text;
  if (!out) throw new Error("No output_text returned");
  return JSON.parse(out);
}

export function mdEscape(s) {
  return String(s || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

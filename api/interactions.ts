export const config = { runtime: "edge" };

type Interaction = {
  severity: "info" | "caution" | "warning";
  headline: string;
  detail: string;
  items: string[];
};

type InteractionsResponse = {
  ok: true;
  interactions: Interaction[];
};

function envOpenAIKey(): string | null {
  const p = (globalThis as any)?.process;
  return (p?.env?.OPENAI_API_KEY as string | undefined) ?? null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubResponse(): InteractionsResponse {
  return { ok: true, interactions: [] };
}

function buildSchema() {
  return {
    name: "veda_interactions",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["interactions"],
      properties: {
        interactions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "headline", "detail", "items"],
            properties: {
              severity: { type: "string", enum: ["info", "caution", "warning"] },
              headline: { type: "string" },
              detail: { type: "string" },
              items: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  };
}

function describeItem(it: any): string {
  const parts: string[] = [];
  const name = it.displayName || it.productName || "Unknown";
  const type = it.type || "item";
  parts.push(`${name} [${type}]`);

  if (Array.isArray(it.nutrients) && it.nutrients.length > 0) {
    const nList = it.nutrients
      .slice(0, 20)
      .map((n: any) => `${n.name || n.nutrientId} ${n.amountToday ?? ""}${n.unit || ""}`.trim())
      .join(", ");
    parts.push(`  Active/nutrients: ${nList}`);
  }
  if (Array.isArray(it.ingredientsList) && it.ingredientsList.length > 0) {
    parts.push(`  Ingredients: ${it.ingredientsList.slice(0, 20).join(", ")}`);
  }
  return parts.join("\n");
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    const apiKey = envOpenAIKey();
    if (!apiKey) return json(stubResponse());

    const body = await req.json().catch(() => null);
    const newItem = body?.newItem;
    const existingItems = body?.existingItems;

    if (!newItem || !Array.isArray(existingItems) || existingItems.length === 0) {
      return json(stubResponse());
    }

    const newDesc = describeItem(newItem);
    const existingDesc = existingItems
      .slice(0, 15)
      .map((it: any, i: number) => `${i + 1}. ${describeItem(it)}`)
      .join("\n\n");

    const system = [
      "You are Veda's interaction checker. A user is adding or scanning a NEW item. Check it against their EXISTING medications and supplements for known interactions.",
      "",
      "Focus on:",
      "- Drug-drug interactions (e.g. two blood pressure medications)",
      "- Drug-supplement interactions (e.g. Tadalafil + nitrate-containing supplements, St. John's Wort + antidepressants)",
      "- Drug-food/drink interactions (e.g. grapefruit + statins, caffeine + stimulant medications)",
      "- Nutrient absorption interference (e.g. calcium + thyroid medication, iron + certain antibiotics)",
      "- Additive/amplification effects (e.g. multiple blood thinners, stacking stimulants)",
      "",
      "Rules:",
      "- ONLY flag interactions that are DOCUMENTED and CLINICALLY RECOGNIZED.",
      "- Do NOT invent or speculate. If unsure, do not include it.",
      "- severity: 'warning' = potentially dangerous, well-documented. 'caution' = worth noting, moderate evidence. 'info' = mild or theoretical.",
      "- headline: max 60 chars, clear and specific.",
      "- detail: max 200 chars. Explain the mechanism briefly. Use neutral language: 'may', 'is commonly associated with', 'has been observed to'.",
      "- items: list the names of the interacting items (the new item + the existing one(s)).",
      "- NEVER say 'stop taking', 'do not use', 'dangerous'. Use 'discuss with your healthcare provider' if severity is warning.",
      "- If NO interactions are found, return an empty array.",
      "- Return JSON matching the schema.",
    ].join("\n");

    const userMsg = [
      "NEW ITEM being added:",
      newDesc,
      "",
      "EXISTING items in user's routine:",
      existingDesc,
      "",
      "Check the NEW item against each existing item for known interactions.",
    ].join("\n");

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: userMsg }] },
        ],
        text: { format: { type: "json_schema" as const, ...buildSchema() } },
      }),
    });

    if (!r.ok) return json(stubResponse());

    const resp = await r.json().catch(() => null);
    let outText: string | null = null;
    if (resp && typeof resp.output_text === "string") {
      outText = resp.output_text;
    } else if (Array.isArray(resp?.output)) {
      const chunks: string[] = [];
      for (const item of resp.output) {
        if (!Array.isArray(item?.content)) continue;
        for (const c of item.content) {
          if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string")
            chunks.push(c.text);
        }
      }
      outText = chunks.join("\n").trim() || null;
    }

    if (!outText) return json(stubResponse());

    let parsed: any;
    try { parsed = JSON.parse(outText); } catch { return json(stubResponse()); }

    const interactions: Interaction[] = Array.isArray(parsed.interactions)
      ? parsed.interactions.slice(0, 10).map((ix: any) => ({
          severity: ["warning", "caution", "info"].includes(ix.severity) ? ix.severity : "info",
          headline: typeof ix.headline === "string" ? ix.headline.slice(0, 80) : "",
          detail: typeof ix.detail === "string" ? ix.detail.slice(0, 250) : "",
          items: Array.isArray(ix.items) ? ix.items.filter((s: any) => typeof s === "string").slice(0, 5) : [],
        }))
      : [];

    return json({ ok: true, interactions });
  } catch {
    return json(stubResponse());
  }
}

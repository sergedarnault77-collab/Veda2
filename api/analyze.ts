export const config = { runtime: "nodejs" };

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("x-veda-handler-entered", "1");
  return res.status(200).json({ ok: true, message: "analyze alive" });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireMigrateSecret } from "./_lib/migrateAuth";
import { withDb } from "./_lib/db";
import { MIGRATION_009_TIMING_ENGINE } from "./_lib/migrations/009_timing_engine";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    requireMigrateSecret(req);

    const result = await withDb(async (client) => {
      await client.query("begin");
      try {
        await client.query(MIGRATION_009_TIMING_ENGINE);
        await client.query("commit");
        return { ok: true };
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const status = err?.statusCode ?? 500;
    return res.status(status).json({ error: err?.message ?? "Internal error" });
  }
}

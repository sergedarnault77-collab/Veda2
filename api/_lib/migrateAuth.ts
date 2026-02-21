import type { VercelRequest } from "@vercel/node";

export function requireMigrateSecret(req: VercelRequest) {
  const expected = process.env.MIGRATE_SECRET;
  const got = req.headers["x-migrate-secret"];

  if (!expected) throw new Error("Missing MIGRATE_SECRET env var");
  if (!got || got !== expected) {
    const e = new Error("UNAUTHORIZED");
    (e as any).statusCode = 401;
    throw e;
  }
}

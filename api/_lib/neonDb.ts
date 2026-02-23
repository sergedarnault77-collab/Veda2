let _sql: any = null;
let _cachedConnStr: string | null = null;

export async function getNeonDb(): Promise<NeonQueryFunction<false, false> | null> {
  const connStr = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!connStr) return null;

  if (_sql && _cachedConnStr === connStr) return _sql;

  const { neon } = await import("@neondatabase/serverless");
  _sql = neon(connStr);
  _cachedConnStr = connStr;
  return _sql;
}

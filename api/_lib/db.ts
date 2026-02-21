import { Client } from "pg";

export async function withDb<T>(fn: (client: Client) => Promise<T>) {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Missing SUPABASE_DB_URL env var");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

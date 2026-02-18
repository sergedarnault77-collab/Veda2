/**
 * Cloud sync — bridges localStorage with the /api/sync Postgres backend.
 *
 * Strategy:
 *  - On login/app load: pull all collections from server → merge into localStorage
 *  - On each local write: debounced push to server (fire-and-forget)
 *  - Images are stripped server-side to keep payloads small
 */

const COLLECTIONS = ["user", "supps", "meds", "exposure", "scans", "taken"] as const;
type Collection = (typeof COLLECTIONS)[number];

const LS_KEY_MAP: Record<Collection, string> = {
  user: "veda.user.v1",
  supps: "veda.supps.v1",
  meds: "veda.meds.v1",
  exposure: "veda.exposure.today.v1",
  scans: "veda.scans.today.v1",
  taken: "veda.supps.taken.v1",
};

let currentEmail: string | null = null;

export function setSyncEmail(email: string | null) {
  currentEmail = email ? email.trim().toLowerCase() : null;
}

function getEmail(): string | null {
  return currentEmail;
}

/* ── Push (save to server) ── */

const pendingSaves = new Map<Collection, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 1500;

export function pushCollection(collection: Collection, data: any) {
  const email = getEmail();
  if (!email) return;

  const existing = pendingSaves.get(collection);
  if (existing) clearTimeout(existing);

  pendingSaves.set(
    collection,
    setTimeout(() => {
      pendingSaves.delete(collection);
      fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, action: "save", collection, data }),
      }).catch(() => {});
    }, DEBOUNCE_MS),
  );
}

export function pushAll() {
  const email = getEmail();
  if (!email) return;

  if (typeof window === "undefined") return;

  const items: { collection: Collection; data: any }[] = [];
  for (const col of COLLECTIONS) {
    const key = LS_KEY_MAP[col];
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        items.push({ collection: col, data: JSON.parse(raw) });
      }
    } catch {}
  }

  if (items.length === 0) return;

  fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, action: "save_batch", items }),
  }).catch(() => {});
}

/* ── Pull (load from server) ── */

export async function pullAll(): Promise<boolean> {
  const email = getEmail();
  if (!email) return false;
  if (typeof window === "undefined") return false;

  try {
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, action: "load" }),
    });

    if (!r.ok) return false;
    const json = await r.json();
    if (!json?.ok || !json?.collections) return false;

    const collections = json.collections as Record<string, { data: any; updatedAt: string }>;

    for (const col of COLLECTIONS) {
      const server = collections[col];
      if (!server?.data) continue;

      const lsKey = LS_KEY_MAP[col];
      const localRaw = localStorage.getItem(lsKey);

      if (!localRaw) {
        localStorage.setItem(lsKey, JSON.stringify(server.data));
      } else {
        // Merge strategy: server data fills in gaps, local data takes precedence
        // For arrays (supps, meds): merge by id, prefer local version of each item
        const localData = JSON.parse(localRaw);

        if (Array.isArray(server.data) && Array.isArray(localData)) {
          const merged = mergeArraysById(localData, server.data);
          localStorage.setItem(lsKey, JSON.stringify(merged));
        } else if (
          typeof server.data === "object" &&
          server.data !== null &&
          typeof localData === "object" &&
          localData !== null &&
          !Array.isArray(localData)
        ) {
          const merged = { ...server.data, ...localData };

          // For nested arrays (e.g. scans.scans), merge rather than overwrite
          for (const key of Object.keys(server.data)) {
            if (Array.isArray(server.data[key]) && Array.isArray(localData[key])) {
              const localArr = localData[key] as any[];
              const serverArr = server.data[key] as any[];
              const localTs = new Set(localArr.map((x: any) => x?.ts || JSON.stringify(x)));
              const extras = serverArr.filter((x: any) => !localTs.has(x?.ts || JSON.stringify(x)));
              if (extras.length > 0) {
                merged[key] = [...localArr, ...extras];
              }
            }
          }

          localStorage.setItem(lsKey, JSON.stringify(merged));
        }
        // For primitives/other: local wins (already set)
      }
    }

    return true;
  } catch {
    return false;
  }
}

function mergeArraysById(local: any[], server: any[]): any[] {
  const localById = new Map<string, any>();
  for (const item of local) {
    const id = item?.id;
    if (id) localById.set(id, item);
  }

  for (const item of server) {
    const id = item?.id;
    if (id && !localById.has(id)) {
      localById.set(id, item);
    }
  }

  return Array.from(localById.values());
}

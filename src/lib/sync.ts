/**
 * Cloud sync — server-first data layer.
 *
 * Architecture:
 *   - Server (Neon Postgres via /api/sync) is the source of truth
 *   - localStorage is an offline cache for instant UI
 *   - On pull: server data wins, local-only items are preserved + pushed
 *   - On push failure (offline): writes are queued and retried on reconnect
 */

import { apiFetch } from "./api";

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

const ARRAY_COLLECTIONS: Collection[] = ["supps", "meds"];
const QUEUE_KEY = "veda.offline-queue.v1";

let currentEmail: string | null = null;

export function setSyncEmail(email: string | null) {
  currentEmail = email ? email.trim().toLowerCase() : null;
}

function getEmail(): string | null {
  return currentEmail;
}

/* ─────────────────────── Offline write queue ─────────────────────── */

type QueuedWrite = {
  collection: Collection;
  data: any;
  ts: number;
};

function loadQueue(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedWrite[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* best effort */ }
}

function enqueue(collection: Collection, data: any) {
  const q = loadQueue();
  const idx = q.findIndex((w) => w.collection === collection);
  if (idx >= 0) q[idx] = { collection, data, ts: Date.now() };
  else q.push({ collection, data, ts: Date.now() });
  saveQueue(q);
}

async function flushQueue(): Promise<void> {
  const email = getEmail();
  if (!email) return;

  const q = loadQueue();
  if (q.length === 0) return;

  const items = q.map(({ collection, data }) => ({ collection, data }));

  try {
    const r = await apiFetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, action: "save_batch", items }),
    });
    if (r.ok) {
      saveQueue([]);
    }
  } catch { /* still offline — keep queue */ }
}

/* ─────────────────────── Online/offline tracking ─────────────────────── */

let _online = typeof navigator !== "undefined" ? navigator.onLine : true;

export function isOnline(): boolean {
  return _online;
}

function setupConnectivityListeners() {
  if (typeof window === "undefined") return;

  window.addEventListener("online", () => {
    _online = true;
    flushQueue().then(() => pullAll());
  });

  window.addEventListener("offline", () => {
    _online = false;
  });
}

setupConnectivityListeners();

/* ─────────────────────── Push (save to server) ─────────────────────── */

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

      if (!isOnline()) {
        enqueue(collection, data);
        return;
      }

      apiFetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, action: "save", collection, data }),
      }).catch(() => {
        enqueue(collection, data);
      });
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

  if (!isOnline()) {
    for (const item of items) enqueue(item.collection as Collection, item.data);
    return;
  }

  apiFetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, action: "save_batch", items }),
  }).catch(() => {
    for (const item of items) enqueue(item.collection as Collection, item.data);
  });
}

/* ─────────────────────── Pull (server-first) ─────────────────────── */

export async function pullAll(): Promise<boolean> {
  const email = getEmail();
  if (!email) return false;
  if (typeof window === "undefined") return false;
  if (!isOnline()) return false;

  // Flush any queued offline writes before pulling
  await flushQueue();

  try {
    const r = await apiFetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, action: "load" }),
    });

    if (!r.ok) return false;
    const json = await r.json();
    if (!json?.ok || !json?.collections) return false;

    const collections = json.collections as Record<string, { data: any; updatedAt: string }>;

    const localOnlyItems: { collection: Collection; data: any }[] = [];

    for (const col of COLLECTIONS) {
      const server = collections[col];
      const lsKey = LS_KEY_MAP[col];
      const localRaw = localStorage.getItem(lsKey);

      if (!server?.data) {
        // Server has no data for this collection — push local if it exists
        if (localRaw) {
          try {
            localOnlyItems.push({ collection: col, data: JSON.parse(localRaw) });
          } catch {}
        }
        continue;
      }

      if (!localRaw) {
        // No local data — server wins entirely
        localStorage.setItem(lsKey, JSON.stringify(server.data));
        continue;
      }

      const localData = safeJsonParse(localRaw);

      if (ARRAY_COLLECTIONS.includes(col)) {
        // Arrays (supps, meds): server is base, add local-only items
        const merged = mergeServerFirst(
          Array.isArray(server.data) ? server.data : [],
          Array.isArray(localData) ? localData : [],
        );
        localStorage.setItem(lsKey, JSON.stringify(merged));

        // Push local-only items to server
        const localOnly = findLocalOnlyItems(
          Array.isArray(server.data) ? server.data : [],
          Array.isArray(localData) ? localData : [],
        );
        if (localOnly.length > 0) {
          localOnlyItems.push({ collection: col, data: merged });
        }
      } else if (
        typeof server.data === "object" &&
        server.data !== null &&
        typeof localData === "object" &&
        localData !== null &&
        !Array.isArray(localData)
      ) {
        // Date-based objects (exposure, scans, taken): most recent wins
        const today = new Date().toISOString().slice(0, 10);
        const serverDate = server.data.date;
        const localDate = localData.date;

        if (localDate === today && serverDate !== today) {
          // Local has today's data, server is stale — keep local, push it
          localOnlyItems.push({ collection: col, data: localData });
        } else {
          // Server wins (or both are today — server is truth)
          localStorage.setItem(lsKey, JSON.stringify(server.data));
        }
      } else {
        // Scalar/other: server wins
        localStorage.setItem(lsKey, JSON.stringify(server.data));
      }
    }

    // Push any local-only data back to server
    if (localOnlyItems.length > 0) {
      apiFetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, action: "save_batch", items: localOnlyItems }),
      }).catch(() => {});
    }

    window.dispatchEvent(new Event("veda:synced"));
    return true;
  } catch {
    return false;
  }
}

/* ─────────────────────── Merge helpers ─────────────────────── */

function safeJsonParse(raw: string): any {
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Server-first merge for array collections.
 * Server items are the base. Local-only items (not on server) are appended.
 * For items in both (same ID): server version wins.
 */
function mergeServerFirst(server: any[], local: any[]): any[] {
  const serverById = new Map<string, any>();
  for (const item of server) {
    const id = item?.id;
    if (id) serverById.set(id, item);
  }

  // Start with all server items
  const merged = [...server];

  // Add local-only items (exist in local but not on server)
  for (const item of local) {
    const id = item?.id;
    if (id && !serverById.has(id)) {
      merged.push(item);
    }
  }

  return merged;
}

function findLocalOnlyItems(server: any[], local: any[]): any[] {
  const serverIds = new Set(server.map((s) => s?.id).filter(Boolean));
  return local.filter((l) => l?.id && !serverIds.has(l.id));
}

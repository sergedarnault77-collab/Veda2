/**
 * Fuzzy match: returns true if two product names likely refer to the same item.
 * Handles variations like "Dagravit Totaal 30" vs "Dagravit Weerstand & Energie Totaal 30".
 */
export function isSameProduct(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/).filter(w => w.length > 1);
  const wb = nb.split(/\s+/).filter(w => w.length > 1);
  if (wa.length === 0 || wb.length === 0) return false;
  if (wa[0] !== wb[0]) return false;
  const shorter = wa.length < wb.length ? wa : wb;
  const longer = new Set(wa.length < wb.length ? wb : wa);
  const overlap = shorter.filter(w => longer.has(w)).length;
  return overlap >= Math.ceil(shorter.length * 0.5);
}

/**
 * Find the index of an existing item with a matching product name.
 * Returns -1 if no match found.
 */
export function findExistingIdx(items: { displayName?: string }[], newName: string): number {
  if (!newName.trim()) return -1;
  return items.findIndex((s) => {
    const sName = (s.displayName || "").trim();
    const lower = sName.toLowerCase();
    if (lower === "new supplement" || lower === "new medication") return true;
    return isSameProduct(sName, newName);
  });
}

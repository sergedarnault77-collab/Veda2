/**
 * Ensure a promise takes at least `minMs` milliseconds before resolving.
 * Prevents loading states from flickering away too fast.
 */
export async function withMinDelay<T>(p: Promise<T>, minMs = 700): Promise<T> {
  const start = Date.now();
  const result = await p;
  const elapsed = Date.now() - start;
  const remaining = minMs - elapsed;
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining));
  }
  return result;
}

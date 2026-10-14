// Small localStorage cache so we don't re-download data that changes slowly.
// Every read/write is wrapped because storage can be full or blocked.

export async function cached(key, maxAgeMs, load) {
  let hit = null;
  try { hit = JSON.parse(localStorage.getItem(key)); } catch { /* ignore */ }
  if (hit && Date.now() - hit.t < maxAgeMs) return hit.v;

  try {
    const v = await load();
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* ignore */ }
    return v;
  } catch (err) {
    if (hit) return hit.v; // stale is better than nothing
    throw err;
  }
}

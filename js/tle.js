// Fetches orbital elements (TLEs) from CelesTrak. CelesTrak only updates
// every ~2 hours and asks clients not to re-download more often than that.

import { cached } from './cache.js';

export function fetchTLE(norad) {
  return cached(`tle2:${norad}`, 2 * 3600e3, async () => {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=tle`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lines = (await res.text()).trim().split(/\r?\n/).map(l => l.trim());
    const l1 = lines.find(l => l.startsWith('1 '));
    const l2 = lines.find(l => l.startsWith('2 '));
    if (!l1 || !l2) throw new Error('No TLE returned');
    return [l1, l2];
  });
}

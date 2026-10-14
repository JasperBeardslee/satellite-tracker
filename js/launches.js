// Upcoming launches from The Space Devs' Launch Library 2
// (https://thespacedevs.com/llapi). The free tier allows 15 requests per
// hour, so results are cached for 30 minutes.

import { cached } from './cache.js';

const URL = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=6&hide_recent_previous=true';

export function fetchLaunches() {
  return cached('launches:v3', 30 * 60e3, async () => {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { results } = await res.json();
    return results.map(l => ({
      id: l.id,
      name: l.mission?.name || l.name,
      rocket: l.rocket?.configuration?.full_name || l.name.split('|')[0].trim(),
      provider: l.launch_service_provider?.name || '',
      providerType: l.launch_service_provider?.type?.name || '',
      location: l.pad?.location?.name || '',
      locationDescription: l.pad?.location?.description || '',
      locationImage: l.pad?.location?.image?.image_url || null,
      country: l.pad?.country?.name || l.pad?.location?.country?.name || '',
      pad: l.pad?.name || '',
      padWiki: l.pad?.wiki_url || null,
      lat: Number(l.pad?.latitude),
      lng: Number(l.pad?.longitude),
      net: l.net,
      windowStart: l.window_start,
      windowEnd: l.window_end,
      precision: l.net_precision?.abbrev || 'MIN',
      status: l.status?.abbrev || '',
      statusName: l.status?.name || '',
      statusDescription: l.status?.description || '',
      image: l.image?.image_url || l.pad?.image?.image_url || null,
      imageCredit: l.image?.credit || l.pad?.image?.credit || '',
      missionType: l.mission?.type || '',
      orbit: l.mission?.orbit?.name || '',
      description: l.mission?.description || '',
      probability: l.probability ?? null,
    }));
  });
}

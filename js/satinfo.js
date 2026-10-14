// Background details for the info panel:
//  - launch date, launch site, owner country: CelesTrak SATCAT
//  - photo: Wikipedia page summary

import { cached } from './cache.js';

const WEEK = 7 * 864e5;

export function fetchSatcat(norad) {
  return cached(`satcat:${norad}`, WEEK, async () => {
    const res = await fetch(`https://celestrak.org/satcat/records.php?CATNR=${norad}&FORMAT=json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const [rec] = await res.json();
    if (!rec) throw new Error('Not in SATCAT');
    return rec;
  });
}

export function fetchWikiSummary(title) {
  return cached(`wiki2:${title}`, WEEK, async () => {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return {
      image: d.thumbnail?.source || null,
      extract: d.extract || '',
      url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title}`,
    };
  });
}

// CelesTrak SATCAT owner codes → readable names (common ones)
export const COUNTRIES = {
  US: 'United States', ISS: 'Multinational (ISS partners)', PRC: 'China', CIS: 'Russia / USSR',
  ESA: 'Europe (ESA)', EUME: 'Europe (EUMETSAT)', EUTE: 'Europe (Eutelsat)', FR: 'France',
  GER: 'Germany', UK: 'United Kingdom', IT: 'Italy', JPN: 'Japan', IND: 'India', CA: 'Canada',
  SKOR: 'South Korea', BRAZ: 'Brazil', ISRA: 'Israel', AB: 'Arab Satellite Comms Org',
  NOR: 'Norway', SPN: 'Spain', AUS: 'Australia', ARGN: 'Argentina', UAE: 'United Arab Emirates',
};

// CelesTrak SATCAT launch site codes → readable names (common ones)
export const LAUNCH_SITES = {
  AFETR: 'Cape Canaveral, Florida, USA',
  AFWTR: 'Vandenberg, California, USA',
  WRAS: 'Wallops Island, Virginia, USA',
  KODAK: 'Kodiak, Alaska, USA',
  TYMSC: 'Baikonur Cosmodrome, Kazakhstan',
  PLMSC: 'Plesetsk Cosmodrome, Russia',
  VOSTO: 'Vostochny Cosmodrome, Russia',
  DLS: 'Dombarovsky, Russia',
  FRGUI: 'Guiana Space Centre, Kourou, French Guiana',
  WSC: 'Wenchang, Hainan, China',
  JSC: 'Jiuquan, China',
  TSC: 'Taiyuan, China',
  XICLF: 'Xichang, China',
  TNSTA: 'Tanegashima, Japan',
  KSCUT: 'Uchinoura, Japan',
  SRILR: 'Satish Dhawan, Sriharikota, India',
  RLLB: 'Rocket Lab LC-1, Mahia, New Zealand',
  SEAL: 'Sea Launch platform, Pacific Ocean',
};

export const OPS_STATUS = {
  '+': 'Operational', '-': 'Non-operational', P: 'Partially operational', B: 'Backup / standby',
  S: 'Spare', X: 'Extended mission', D: 'Decayed', '?': 'Unknown',
};

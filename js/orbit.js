// Orbit and sun math. Satellite positions come from SGP4 propagation
// (satellite.js) of CelesTrak TLEs; the sun uses a low-precision solar
// ephemeris that's accurate to ~0.01°, plenty for a day/night terminator.

import * as sat from 'satellite.js';

export const EARTH_RADIUS_KM = 6371;

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const wrapLng = l => ((l + 540) % 360) - 180;

export function makeSatrec(line1, line2) {
  return sat.twoline2satrec(line1, line2);
}

/** Position of a satellite at `date`, or null if propagation fails (e.g. decayed). */
export function positionAt(satrec, date) {
  const pv = sat.propagate(satrec, date);
  if (!pv || !pv.position || typeof pv.position !== 'object') return null;

  const gd = sat.eciToGeodetic(pv.position, sat.gstime(date));
  const v = pv.velocity;
  return {
    lat: sat.degreesLat(gd.latitude),
    lng: sat.degreesLong(gd.longitude),
    altKm: gd.height,
    speedKms: v ? Math.hypot(v.x, v.y, v.z) : NaN,
    eci: pv.position,
  };
}

/** Orbital period in minutes (satrec.no is mean motion in rad/min). */
export function periodMinutes(satrec) {
  return (2 * Math.PI) / satrec.no;
}

export function inclinationDeg(satrec) {
  return deg(satrec.inclo);
}

export function tleEpoch(satrec) {
  return new Date((satrec.jdsatepoch + (satrec.jdsatepochF || 0) - 2440587.5) * 864e5);
}

/**
 * Sample positions across a time window, returned as [lat, lng, altKm] triples.
 * Used for orbit lines and ground tracks.
 */
export function sampleTrack(satrec, centerDate, fromMin, toMin, steps = 180) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = new Date(+centerDate + (fromMin + (toMin - fromMin) * (i / steps)) * 60000);
    const p = positionAt(satrec, t);
    if (p) pts.push([p.lat, p.lng, p.altKm]);
  }
  return pts;
}

/** Point reached by travelling `distDeg` along a great circle from (lat, lng) on `bearingDeg`. */
export function destination(lat, lng, distDeg, bearingDeg) {
  const φ1 = rad(lat), λ1 = rad(lng), δ = rad(distDeg), θ = rad(bearingDeg);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
                             Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [deg(φ2), wrapLng(deg(λ2))];
}

/** Initial great-circle bearing (degrees clockwise from north) from point 1 to point 2. */
export function bearing(lat1, lng1, lat2, lng2) {
  const φ1 = rad(lat1), φ2 = rad(lat2), Δλ = rad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return deg(Math.atan2(y, x));
}

/** Angular radius (degrees) of the area that can see a satellite above the horizon. */
export function footprintRadiusDeg(altKm) {
  return deg(Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm)));
}

/** Ring of [lat, lng] points outlining the visibility footprint. */
export function footprint(lat, lng, altKm, steps = 90) {
  const r = footprintRadiusDeg(altKm);
  const points = [];
  for (let i = 0; i <= steps; i++) points.push(destination(lat, lng, r, (360 * i) / steps));
  return { points, radiusDeg: r, radiusKm: rad(r) * EARTH_RADIUS_KM };
}

/**
 * Classify the orbit from its elements: LEO / MEO / GEO / HEO, plus whether
 * it's sun-synchronous (the orbit plane precesses ~0.9856°/day, once a year,
 * so the satellite passes over any spot at the same local solar time).
 */
export function orbitType(satrec) {
  const Re = 6378.137;
  const a = satrec.a * Re;
  const e = satrec.ecco;
  const perigeeKm = a * (1 - e) - Re;
  const apogeeKm = a * (1 + e) - Re;
  const period = periodMinutes(satrec);

  let type;
  if (Math.abs(period - 1436.1) < 30 && e < 0.05) type = satrec.inclo < rad(3) ? 'Geostationary (GEO)' : 'Geosynchronous (GSO)';
  else if (e > 0.25) type = 'Highly elliptical (HEO)';
  else if (apogeeKm < 2000) type = 'Low Earth orbit (LEO)';
  else type = 'Medium Earth orbit (MEO)';

  const J2 = 1.08263e-3;
  const nPerDay = satrec.no * 1440; // rad/day
  const p = a * (1 - e * e);
  const nodalDegPerDay = deg(-1.5 * nPerDay * J2 * (Re / p) ** 2 * Math.cos(satrec.inclo));
  const sunSync = Math.abs(nodalDegPerDay - 0.9856) < 0.1;

  return { type, sunSync, perigeeKm, apogeeKm };
}

/**
 * Sun position: the subsolar point (lat/lng where the sun is directly
 * overhead) and a unit vector toward the sun in ECI coordinates.
 */
export function sunPosition(date) {
  const n = date / 864e5 + 2440587.5 - 2451545.0; // days since J2000
  const L = rad((280.460 + 0.9856474 * n) % 360);
  const g = rad((357.528 + 0.9856003 * n) % 360);
  const λ = L + rad(1.915) * Math.sin(g) + rad(0.020) * Math.sin(2 * g);
  const ε = rad(23.439 - 0.0000004 * n);

  const eci = { x: Math.cos(λ), y: Math.cos(ε) * Math.sin(λ), z: Math.sin(ε) * Math.sin(λ) };
  const ra = Math.atan2(eci.y, eci.x);
  const dec = Math.asin(eci.z);

  return { lat: deg(dec), lng: wrapLng(deg(ra - sat.gstime(date))), eci };
}

/** True if a satellite at ECI position `r` (km) is in sunlight (cylindrical shadow model). */
export function isSunlit(r, sunEci) {
  const s = r.x * sunEci.x + r.y * sunEci.y + r.z * sunEci.z;
  if (s > 0) return true;
  const perp = Math.hypot(r.x - s * sunEci.x, r.y - s * sunEci.y, r.z - s * sunEci.z);
  return perp > EARTH_RADIUS_KM;
}

/** Sun's elevation (degrees) as seen from the ground directly beneath ECI position `r`. */
export function sunElevationBelow(r, sunEci) {
  const len = Math.hypot(r.x, r.y, r.z);
  return deg(Math.asin((r.x * sunEci.x + r.y * sunEci.y + r.z * sunEci.z) / len));
}

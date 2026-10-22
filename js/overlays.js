// Everything drawn on the globe besides the satellites themselves: orbit
// lines, ground tracks, direction arrows, the visibility footprint (with its
// curved label), and city dots/leader lines.
//
// Each overlay is a "datum" for globe.gl's custom layer:
//   obj      the three.js object to add to the scene
//   tick()   optional; called every frame to move/reshape the object
//   label()  optional; tooltip HTML shown on hover
//   dispose()
//
// Orbit lines are redrawn every frame from a cached, densely sampled track,
// so they glide along with the satellite instead of jumping periodically.

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import * as orbit from './orbit.js';

const UNITS_PER_DEG = (2 * Math.PI * 100) / 360; // globe.gl's globe radius is 100 units
const SAMPLES_PER_ORBIT = 240;
export const ARROWS_PER_ORBIT = 12;

let world;
const pointer = { x: -1e9, y: -1e9 };
export function initOverlays(globe) {
  world = globe;
  window.addEventListener('resize', () => lineMaterials.forEach(m => m.resolution.set(innerWidth, innerHeight)));
  window.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; });
}

// Fat-line materials need to know the canvas size to get pixel widths right
const lineMaterials = new Set();
function lineMaterial(opts) {
  const m = new LineMaterial({ worldUnits: false, transparent: true, depthWrite: false, ...opts });
  m.resolution.set(innerWidth, innerHeight);
  lineMaterials.add(m);
  return m;
}
// Fat lines are drawn as one quad per segment, and neighbouring quads overlap
// at every joint. With transparency that overlap is drawn twice, showing up
// as bright dots along the line. The stencil buffer fixes it: each line gets
// its own reference value and only draws pixels it hasn't already drawn.
let nextStencilRef = 1;
function drawOncePerPixel(m) {
  m.stencilWrite = true;
  m.stencilRef = nextStencilRef;
  nextStencilRef = (nextStencilRef % 255) + 1;
  m.stencilFunc = THREE.NotEqualStencilFunc;
  m.stencilZPass = THREE.ReplaceStencilOp;
  return m;
}

function disposeAll(...things) {
  for (const t of things) {
    t.dispose?.();
    lineMaterials.delete(t);
  }
}

const tip = (title, body) => `<div class="tip"><b>${title}</b>${body ? `<br>${body}` : ''}</div>`;

/** "+12.3 min · will be here" / "−4.0 min · was here" for a time offset in ms. */
export function fmtOffset(ms, verbFuture = 'will be here', verbPast = 'was here') {
  const min = ms / 60000;
  return min >= 0 ? `+${min.toFixed(1)} min · ${verbFuture}` : `−${Math.abs(min).toFixed(1)} min · ${verbPast}`;
}

// Which sample of a track is closest to the mouse on screen, as a time
const screenPt = new THREE.Vector3();
function timeNearPointer(tr, arr, fs, fe) {
  const cam = world.camera();
  const rect = world.renderer().domElement.getBoundingClientRect();
  let best = null, bestD = Infinity;
  for (let i = Math.ceil(fs); i <= Math.floor(fe); i++) {
    screenPt.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).project(cam);
    const x = rect.left + (screenPt.x + 1) / 2 * rect.width;
    const y = rect.top + (1 - screenPt.y) / 2 * rect.height;
    const d = (x - pointer.x) ** 2 + (y - pointer.y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best == null ? null : (tr.k0 + best) * tr.step;
}

// Position an object on (or above) the globe, facing outwards, with local +Y
// pointing north and then rotated `rotDeg` clockwise.
export function placeOnGlobe(obj, lat, lng, alt, rotDeg = 0) {
  const c = world.getCoords(lat, lng, alt);
  obj.position.set(c.x, c.y, c.z);
  obj.lookAt(0, 0, 0);
  obj.rotateY(Math.PI);
  obj.rotateZ(-rotDeg * Math.PI / 180);
}

// ---------------------------------------------------------------------------
// Track cache
// ---------------------------------------------------------------------------

// Samples sit on a fixed time grid (multiples of `step`), so the dashes of
// the ground track stay put on the map as the visible window slides.
function ensureTrack(s, now) {
  const P = s.periodMs;
  if (s.track && Math.abs(now - s.track.center) < P / 4) return s.track;

  const step = Math.max(1000, Math.round(P / SAMPLES_PER_ORBIT));
  const k0 = Math.floor((now - 0.75 * P) / step);
  const n = Math.ceil((now + 0.75 * P) / step) - k0 + 1;
  const orbitXYZ = new Float32Array(n * 3);
  const groundXYZ = new Float32Array(n * 3);
  let last = null;
  for (let i = 0; i < n; i++) {
    const p = orbit.positionAt(s.satrec, new Date((k0 + i) * step)) || last;
    if (!p) continue;
    last = p;
    const c = world.getCoords(p.lat, p.lng, p.altKm / orbit.EARTH_RADIUS_KM);
    const g = world.getCoords(p.lat, p.lng, 0.002);
    orbitXYZ.set([c.x, c.y, c.z], i * 3);
    groundXYZ.set([g.x, g.y, g.z], i * 3);
  }
  s.track = { center: now, step, k0, n, orbitXYZ, groundXYZ };
  return s.track;
}

const indexAt = (tr, t) => t / tr.step - tr.k0;

function interp(arr, tr, f, out) {
  f = Math.min(Math.max(f, 0), tr.n - 1.000001);
  const i = Math.floor(f), u = f - i, a = i * 3;
  out.x = arr[a] + (arr[a + 3] - arr[a]) * u;
  out.y = arr[a + 1] + (arr[a + 4] - arr[a + 1]) * u;
  out.z = arr[a + 2] + (arr[a + 5] - arr[a + 2]) * u;
  return out;
}

const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Orbit line: half an orbit behind (fading out) to half an orbit ahead
// ---------------------------------------------------------------------------

export function orbitLineDatum(s, selected) {
  const geometry = new LineGeometry();
  // Additive blending: fading the colour to black fades the line out
  const material = drawOncePerPixel(lineMaterial({ vertexColors: true, linewidth: selected ? 2.2 : 1.3, blending: THREE.AdditiveBlending }));
  const hitMaterial = lineMaterial({ linewidth: 14, opacity: 0 }); // wide invisible line for easier hovering
  const obj = new THREE.Group();
  obj.add(new Line2(geometry, material), new Line2(geometry, hitMaterial));

  const color = new THREE.Color(s.color);
  const peak = selected ? 1 : 0.7;
  let last = null;

  return {
    norad: s.norad,
    obj,
    // Hovering anywhere on the line says when the satellite is/was there
    label() {
      if (!last) return tip(s.name, 'Orbit path');
      const t = timeNearPointer(last.tr, last.tr.orbitXYZ, last.fs, last.fe);
      return tip(s.name, t == null ? 'Orbit path' : fmtOffset(t - last.now));
    },
    tick(now) {
      const tr = ensureTrack(s, now);
      const fs = indexAt(tr, now - s.periodMs / 2);
      const fe = indexAt(tr, now + s.periodMs / 2);
      last = { tr, fs, fe, now };
      const pos = [], col = [];
      const add = f => {
        interp(tr.orbitXYZ, tr, f, tmpP);
        pos.push(tmpP.x, tmpP.y, tmpP.z);
        const k = peak * (f - fs) / (fe - fs);
        col.push(color.r * k, color.g * k, color.b * k);
      };
      add(fs);
      for (let i = Math.floor(fs) + 1; i < fe; i++) add(i);
      add(fe);
      geometry.setPositions(pos);
      geometry.setColors(col);
    },
    dispose: () => disposeAll(geometry, material, hitMaterial),
  };
}

// ---------------------------------------------------------------------------
// Ground track: dashed line on the surface directly beneath the orbit line
// ---------------------------------------------------------------------------

export function groundTrackDatum(s, selected) {
  const geometry = new LineSegmentsGeometry();
  const material = lineMaterial({ color: s.color, linewidth: selected ? 1.3 : 1, opacity: selected ? 0.75 : 0.45 });
  const hitMaterial = lineMaterial({ linewidth: 12, opacity: 0 });
  const obj = new THREE.Group();
  obj.add(new LineSegments2(geometry, material), new LineSegments2(geometry, hitMaterial));

  let last = null;

  return {
    norad: s.norad,
    obj,
    label() {
      if (!last) return tip(s.name, 'Ground track');
      const t = timeNearPointer(last.tr, last.tr.groundXYZ, last.fs, last.fe);
      return tip(`${s.name} ground track`, t == null ? '' : fmtOffset(t - last.now, 'will pass over', 'passed over'));
    },
    tick(now) {
      const tr = ensureTrack(s, now);
      const fs = indexAt(tr, now - s.periodMs / 2);
      const fe = indexAt(tr, now + s.periodMs / 2);
      last = { tr, fs, fe, now };
      const pos = [];
      for (let k = Math.floor(fs); k < fe; k++) {
        if (((tr.k0 + k) % 2 + 2) % 2) continue; // every other sample interval is a gap
        const a = Math.max(k, fs), b = Math.min(k + 1, fe);
        if (b <= a) continue;
        interp(tr.groundXYZ, tr, a, tmpP);
        interp(tr.groundXYZ, tr, b, tmpQ);
        pos.push(tmpP.x, tmpP.y, tmpP.z, tmpQ.x, tmpQ.y, tmpQ.z);
      }
      if (!pos.length) pos.push(0, 0, 0, 0, 0, 0);
      geometry.setPositions(pos);
    },
    dispose: () => disposeAll(geometry, material, hitMaterial),
  };
}

// ---------------------------------------------------------------------------
// Direction arrows: flat chevrons sitting on the orbit line
// ---------------------------------------------------------------------------

const chevronGeometry = new LineSegmentsGeometry().setPositions([
  -1, -1.3, 0, 0, 0, 0,
  0, 0, 0, 1, -1.3, 0,
]);
const arrowHitGeometry = new THREE.CircleGeometry(2.6, 12);
const arrowHitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
const basis = new THREE.Matrix4();
const fwd = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3();

/** `frac` is the arrow's time offset from now, as a fraction of the orbital period (−0.5 … 0.5). */
export function arrowDatum(s, frac, selected, getScale) {
  const peak = selected ? 1 : 0.7;
  const material = drawOncePerPixel(lineMaterial({
    color: s.color, linewidth: selected ? 2.4 : 1.6, opacity: Math.max(0.15, peak * (frac + 0.5)),
  }));
  const obj = new THREE.Group();
  obj.add(new LineSegments2(chevronGeometry, material), new THREE.Mesh(arrowHitGeometry, arrowHitMaterial));
  const size = selected ? 1.4 : 1;

  return {
    norad: s.norad,
    obj,
    label: () => tip(s.name, fmtOffset(frac * s.periodMs)),
    tick(now) {
      const tr = ensureTrack(s, now);
      const f = indexAt(tr, now + frac * s.periodMs);
      interp(tr.orbitXYZ, tr, f, tmpP);
      interp(tr.orbitXYZ, tr, f + 0.5, tmpQ);
      up.copy(tmpP).normalize();
      fwd.subVectors(tmpQ, tmpP).normalize();
      right.crossVectors(fwd, up).normalize();
      fwd.crossVectors(up, right);
      obj.position.copy(tmpP);
      obj.quaternion.setFromRotationMatrix(basis.makeBasis(right, fwd, up));
      obj.scale.setScalar(size * Math.min(getScale(), 4));
    },
    dispose: () => disposeAll(material),
  };
}

// ---------------------------------------------------------------------------
// Visibility footprint ring + "visibility footprint" text curved outside it
// ---------------------------------------------------------------------------

const FOOTPRINT_TEXT = 'VISIBILITY FOOTPRINT';
const ITALIC = new THREE.Matrix4().set(1, 0.24, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const glyphCache = new Map();

function italicGlyph(font, ch) {
  if (!glyphCache.has(ch)) {
    const g = new TextGeometry(ch, { font, size: 1, depth: 0, curveSegments: 3, bevelEnabled: false });
    const advance = (font.data.glyphs[ch]?.ha ?? 500) / font.data.resolution;
    g.applyMatrix4(ITALIC);
    g.translate(-advance / 2, -0.36, 0); // centre each letter on its anchor point
    glyphCache.set(ch, { geometry: g, advance });
  }
  return glyphCache.get(ch);
}

export function footprintDatum(s, font) {
  const geometry = new LineGeometry();
  const material = drawOncePerPixel(lineMaterial({ color: s.color, linewidth: 1.4, opacity: 0.8 }));
  const obj = new THREE.Group();
  obj.add(new Line2(geometry, material));

  const textMaterial = new THREE.MeshBasicMaterial({
    color: s.color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
  });
  const chars = font ? [...FOOTPRINT_TEXT].map(ch => {
    const { geometry: g, advance } = italicGlyph(font, ch);
    const mesh = new THREE.Mesh(g, textMaterial);
    obj.add(mesh);
    return { mesh, advance };
  }) : [];

  return {
    norad: s.norad,
    obj,
    tick() {
      const fp = orbit.footprint(s.lat, s.lng, s.altKm, 120);
      const pos = [];
      for (const [lat, lng] of fp.points) {
        const c = world.getCoords(lat, lng, 0.003);
        pos.push(c.x, c.y, c.z);
      }
      geometry.setPositions(pos);
      layoutText(chars, s.lat, s.lng, fp.radiusDeg);
    },
    dispose: () => disposeAll(geometry, material, textMaterial),
  };
}

// Letters run along the north side of the ring, just outside it, reading
// west → east, each rotated to follow the local direction of the ring (which
// stays correct even when the ring wraps over a pole).
function layoutText(chars, lat, lng, radiusDeg) {
  if (!chars.length) return;
  const size = Math.min(1.6, Math.max(0.5, radiusDeg * 0.045)); // letter height in degrees
  const r = radiusDeg + size * 0.75;
  const sinR = Math.sin(r * Math.PI / 180);
  const spacing = 1.06;
  const total = chars.reduce((sum, c) => sum + c.advance, 0) * size * spacing;
  let along = -total / 2;
  for (const c of chars) {
    const w = c.advance * size * spacing;
    const b = (along + w / 2) / sinR; // arc length (deg) → bearing change (deg) on a small circle
    const [cLat, cLng] = orbit.destination(lat, lng, r, b);
    const [nLat, nLng] = orbit.destination(lat, lng, r, b + 0.5);
    placeOnGlobe(c.mesh, cLat, cLng, 0.004, orbit.bearing(cLat, cLng, nLat, nLng) - 90);
    c.mesh.scale.setScalar(size * UNITS_PER_DEG);
    along += w;
  }
}

// ---------------------------------------------------------------------------
// City labels: placed so they don't overlap, with leader lines when a label
// has to sit away from its dot
// ---------------------------------------------------------------------------

/**
 * Greedy label placement in degree space. Labels are drawn on the globe
 * surface at a fixed angular size, so a layout that doesn't overlap at one
 * zoom level doesn't overlap at any.
 */
export function layoutCityLabels(cities, font, size, dotRadius) {
  const textWidth = name => [...name].reduce((w, ch) => w + (font.data.glyphs[ch]?.ha ?? 500), 0) / font.data.resolution * size;
  const h = size * 0.8;
  const pad = size * 0.15;
  const placed = [];
  const dots = cities.map(c => ({ c, r: dotRadius * 1.5 }));

  // Rectangles live in (x = lng·cos(lat), y = lat) so widths are true distances
  const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const hitsDot = (rect, self) => dots.some(({ c, r }) => {
    if (c === self) return false;
    const x = c.lng * Math.cos(c.lat * Math.PI / 180), y = c.lat;
    return x + r > rect.x0 && x - r < rect.x1 && y + r > rect.y0 && y - r < rect.y1;
  });

  const labels = [], leaders = [];
  for (const c of cities) {
    const cos = Math.cos(c.lat * Math.PI / 180);
    const cx = c.lng * cos, cy = c.lat;
    const w = textWidth(c.name);
    let best = null;

    for (const ring of [0, 1, 2, 3, 4]) {
      const gap = dotRadius * 2 + ring * size * 1.1;
      const dx = w / 2 + gap, dy = h / 2 + gap;
      const options = [[dx, 0], [-dx, 0], [0, dy], [0, -dy], [dx, dy], [dx, -dy], [-dx, dy], [-dx, -dy]];
      for (const [ox, oy] of options) {
        const rect = { x0: cx + ox - w / 2 - pad, x1: cx + ox + w / 2 + pad, y0: cy + oy - h / 2 - pad, y1: cy + oy + h / 2 + pad };
        if (placed.some(p => overlaps(p, rect)) || hitsDot(rect, c)) continue;
        best = { rect, ox, oy, ring };
        break;
      }
      if (best) break;
    }
    best ||= { rect: { x0: cx, x1: cx, y0: cy, y1: cy }, ox: w / 2 + dotRadius * 2, oy: 0, ring: 0 };
    placed.push(best.rect);

    const lat = cy + best.oy;
    labels.push({ name: c.name, lat, lng: (cx + best.ox) / Math.cos(lat * Math.PI / 180), w, h, cityLat: c.lat, cityLng: c.lng });

    // Leader line from the dot to the nearest edge of the label
    if (best.ring > 0) {
      const ex = Math.min(Math.max(cx, best.rect.x0 + pad), best.rect.x1 - pad);
      const ey = Math.min(Math.max(cy, best.rect.y0 + pad), best.rect.y1 - pad);
      leaders.push([c.lat, c.lng, ey, ex / Math.cos(ey * Math.PI / 180)]);
    }
  }
  return { labels, leaders };
}

export function cityDatum(cities, labels, leaders, dotRadius, color) {
  const obj = new THREE.Group();

  // Dots: a bright centre with a dark ring so they show on any background
  const ringGeometry = new THREE.CircleGeometry(dotRadius * 1.7 * UNITS_PER_DEG, 16);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x060a12, transparent: true, opacity: 0.6, depthWrite: false });
  const dotGeometry = new THREE.CircleGeometry(dotRadius * UNITS_PER_DEG, 16);
  const dotMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
  const dots = [];
  for (const c of cities) {
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    placeOnGlobe(ring, c.lat, c.lng, 0.0018);
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    placeOnGlobe(dot, c.lat, c.lng, 0.0021);
    obj.add(ring, dot);
    dots.push(ring, dot);
  }

  // Leader lines run from a dot to its label; keep the full-size end points
  // so they can be pulled in toward the dot as labels shrink
  const ends = leaders.map(([lat1, lng1, lat2, lng2]) => [
    new THREE.Vector3().copy(world.getCoords(lat1, lng1, 0.002)),
    new THREE.Vector3().copy(world.getCoords(lat2, lng2, 0.002)),
  ]);
  const pts = ends.flatMap(([a, b]) => [a.x, a.y, a.z, b.x, b.y, b.z]);
  const leaderGeometry = new THREE.BufferGeometry();
  leaderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const leaderMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false });
  obj.add(new THREE.LineSegments(leaderGeometry, leaderMaterial));

  return {
    obj,
    // Shrink the dots along with the names as the camera zooms in
    setScale(k) {
      dots.forEach(d => d.scale.setScalar(Math.max(k, 0.5)));
      const attr = leaderGeometry.getAttribute('position');
      ends.forEach(([a, b], i) => {
        attr.setXYZ(i * 2 + 1, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      });
      attr.needsUpdate = true;
      leaderGeometry.computeBoundingSphere();
    },
    dispose: () => disposeAll(ringGeometry, ringMaterial, dotGeometry, dotMaterial, leaderGeometry, leaderMaterial),
  };
}

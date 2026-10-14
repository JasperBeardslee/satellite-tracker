import * as THREE from 'three';
import Globe from 'globe.gl';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { SATELLITES, GROUPS } from './satellites.js';
import { CITIES } from './cities.js';
import { fetchTLE } from './tle.js';
import { fetchSatcat, fetchWikiSummary, COUNTRIES, LAUNCH_SITES, OPS_STATUS } from './satinfo.js';
import { fetchLaunches } from './launches.js';
import { LAUNCH_SITES as SITE_LIST } from './launchsites.js';
import { IMAGERY, TILE_SOURCES, gibsUrl, defaultImageryDate } from './imagery.js';
import { hasModel, loadModel } from './models.js';
import * as orbit from './orbit.js';
import {
  initOverlays, orbitLineDatum, groundTrackDatum, arrowDatum, footprintDatum,
  layoutCityLabels, cityDatum, ARROWS_PER_ORBIT,
} from './overlays.js';

const TEXTURES = 'https://unpkg.com/three-globe@2.45.0/example/img/';
// Droid Sans has accented letters (São Paulo, Bogotá); three.js's default font
// doesn't. The bold weight stays legible over imagery without a backing.
const FONT_URL = 'https://unpkg.com/three@0.180.0/examples/fonts/droid/droid_sans_bold.typeface.json';
const PREFS_KEY = 'sat-tracker-prefs';

const CITY_LABEL_SIZE = 0.75; // degrees
const CITY_DOT_RADIUS = 0.14; // degrees
const CITY_COLOR = '#e1e8f5';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const prefs = loadPrefs();
const known = new Set(SATELLITES.map(s => s.norad));

const sats = SATELLITES.map(s => ({
  ...s,
  enabled: prefs.enabled?.some(n => known.has(n)) ? prefs.enabled.includes(s.norad) : !!s.enabled,
  status: 'idle', // idle | loading | ready | error
  satrec: null,
  orbitInfo: null,
  periodMs: 0,
  track: null,
  lat: 0, lng: 0, alt: 0, altKm: 0, speedKms: 0, eci: null,
}));

const layers = { orbits: true, groundTrack: true, footprint: true, labels: true, sites: true };
for (const k of Object.keys(layers)) if (typeof prefs.layers?.[k] === 'boolean') layers[k] = prefs.layers[k];

let speedUnit = prefs.speedUnit === 'kmh' ? 'kmh' : 'kms';
const collapsed = { ...prefs.collapsed }; // which side panels are folded away
let imageryId = IMAGERY.some(i => i.id === prefs.imagery) ? prefs.imagery : 'static';
let selectedId = null;
let follow = false;
// What the right-hand info panel is showing: the selected satellite, a launch, or a launch site
let infoMode = 'sat';
let startupDone = false; // the initial auto-selection shouldn't reopen a panel the user folded away

// Simulation clock: runs at `speed`× real time from an anchor point
const clock = { speed: 1, anchorReal: performance.now(), anchorSim: Date.now() };
const simNow = () => new Date(clock.anchorSim + (performance.now() - clock.anchorReal) * clock.speed);
const isLive = () => clock.speed === 1 && Math.abs(+simNow() - Date.now()) < 2000;

function setClock(speed, simTime = simNow()) {
  clock.speed = speed;
  clock.anchorReal = performance.now();
  clock.anchorSim = +simTime;
  renderSpeedButtons();
}

// ---------------------------------------------------------------------------
// Globe
// ---------------------------------------------------------------------------

// A stencil buffer lets orbit lines draw each pixel once (see overlays.js)
const world = new Globe(document.getElementById('globe'), {
  animateIn: true,
  rendererConfig: { antialias: true, alpha: true, stencil: true },
})
  .backgroundImageUrl(TEXTURES + 'night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('#5ab0ff')
  .atmosphereAltitude(0.16)

  // Satellites as 3D objects (so the globe correctly hides them when they're behind it)
  .objectLat('lat')
  .objectLng('lng')
  .objectAltitude('alt')
  .objectFacesSurface(false)
  .objectThreeObject(makeSatObject)
  .objectLabel(d => `<div class="tip"><b>${d.name}</b><br>${Math.round(d.altKm).toLocaleString()} km · ${fmtSpeed(d.speedKms)}</div>`)
  .onObjectClick(d => select(d.norad, true))

  // Satellite name tags and launch site markers
  .htmlLat('lat')
  .htmlLng('lng')
  .htmlAltitude(d => (d.kind === 'site' ? 0.002 : d.alt))
  .htmlTransitionDuration(0)
  .htmlElement(d => (d.kind === 'site' ? makeSiteMarker(d) : makeLabel(d)))
  .htmlElementVisibilityModifier((el, visible) => { el.style.visibility = visible ? 'visible' : 'hidden'; })

  // City names: small, dim, and drawn on the surface so they shrink when
  // zoomed out instead of crowding the view. Dots and leader lines are drawn
  // separately (see overlays.js) so labels can sit away from their dots.
  .labelLat('lat')
  .labelLng('lng')
  .labelText('name')
  .labelSize(CITY_LABEL_SIZE)
  .labelIncludeDot(false)
  .labelColor(() => '#f2f6fc')
  .labelAltitude(0.0022)
  .labelResolution(2)
  .labelsTransitionDuration(0)

  // Orbit lines, arrows, footprint, city dots (see overlays.js)
  .customThreeObject(d => d.obj)
  .customThreeObjectUpdate(() => {})
  .onCustomLayerHover(d => { hoveredOverlay = d?.label ? d : null; updateOverlayTip(); })
  .onCustomLayerClick(d => d.norad && select(d.norad, true));

// Tooltip for orbit lines / arrows / ground track. globe.gl's own tooltip only
// refreshes when you move onto a different object; this one updates as the
// mouse slides along a line, so the "+/− minutes" readout follows the cursor.
let hoveredOverlay = null;
const overlayTip = document.createElement('div');
overlayTip.className = 'overlay-tip hidden';
document.body.append(overlayTip);
let tipX = 0, tipY = 0;
function updateOverlayTip() {
  if (!hoveredOverlay) { overlayTip.classList.add('hidden'); return; }
  overlayTip.innerHTML = hoveredOverlay.label();
  overlayTip.style.left = `${tipX + 14}px`;
  overlayTip.style.top = `${tipY + 14}px`;
  overlayTip.classList.remove('hidden');
}
window.addEventListener('pointermove', e => {
  tipX = e.clientX;
  tipY = e.clientY;
  if (hoveredOverlay) updateOverlayTip();
});

initOverlays(world);
world.controls().enableDamping = true;
world.controls().dampingFactor = 0.1;
world.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));

window.addEventListener('resize', () => world.width(innerWidth).height(innerHeight));

// Lighting only affects the 3D satellite models (the globe uses its own
// shader). The directional light follows the real sun each frame.
const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
world.lights([new THREE.AmbientLight(0xbfd4ff, 0.45), sunLight]);

// Day/night shading, shared by the whole-globe material and the high-res
// imagery tiles: daytime imagery on the sunlit side, NASA's Black Marble city
// lights on the night side, a soft blend and warm glow along the terminator.
const SHADE_GLSL = /* glsl */ `
  vec3 shadeDayNight(vec3 day, vec3 night, vec3 normal, vec3 sunDir) {
    float cosAngle = dot(normalize(normal), normalize(sunDir));
    day *= 0.6 + 0.4 * smoothstep(-0.1, 0.5, cosAngle); // soft shading toward the terminator
    night *= 1.15;
    vec3 color = mix(night, day, smoothstep(-0.12, 0.08, cosAngle)); // civil-twilight-ish blend
    float dusk = 1.0 - smoothstep(0.0, 0.14, abs(cosAngle + 0.02));
    return color + vec3(0.30, 0.12, 0.03) * dusk * 0.35;
  }
`;

// Shared so one update moves the terminator on every material that uses them
const sharedUniforms = {
  nightTexture: { value: null },
  sunDirection: { value: new THREE.Vector3(1, 0, 0) },
};

const dayNight = new THREE.ShaderMaterial({
  uniforms: {
    ...sharedUniforms,
    dayTexture: { value: null },
    liveTexture: { value: null },
    useLive: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(mat3(modelMatrix) * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D dayTexture;
    uniform sampler2D liveTexture;
    uniform float useLive;
    uniform sampler2D nightTexture;
    uniform vec3 sunDirection;
    varying vec3 vNormal;
    varying vec2 vUv;
    ${SHADE_GLSL}
    void main() {
      vec3 day = texture2D(dayTexture, vUv).rgb;

      // Daily NASA imagery, with the base imagery filling the black no-data
      // gaps between satellite passes and over the polar night
      if (useLive > 0.5) {
        vec3 live = texture2D(liveTexture, vUv).rgb;
        float hasData = smoothstep(0.015, 0.06, max(live.r, max(live.g, live.b)));
        day = mix(day, live, hasData);
      }

      vec3 night = texture2D(nightTexture, vUv).rgb;
      gl_FragColor = vec4(shadeDayNight(day, night, vNormal, sunDirection), 1.0);
    }
  `,
});

// High-res imagery tiles arrive from globe.gl's tile engine with a plain
// lit material; swap in this shader so they get the same day/night look.
// Night lights are looked up by latitude/longitude from the tile's position.
function makeTileMaterial(map, centerLng) {
  map.colorSpace = THREE.NoColorSpace; // match the globe shader's colour handling
  return new THREE.ShaderMaterial({
    uniforms: { ...sharedUniforms, map: { value: map }, centerLng: { value: centerLng } },
    vertexShader: /* glsl */ `
      #define PI 3.141592653589793
      uniform float centerLng;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec2 vGeoUv;
      void main() {
        vUv = uv;
        vec3 n = normalize((modelMatrix * vec4(position, 1.0)).xyz);
        vNormal = n;
        float lat = asin(clamp(n.y, -1.0, 1.0));
        float lng = PI * 0.5 - atan(n.z, n.x);
        // Keep longitudes continuous across the tile (no wrap mid-tile)
        float c = radians(centerLng);
        lng = c + mod(lng - c + PI, 2.0 * PI) - PI;
        vGeoUv = vec2((lng + PI) / (2.0 * PI), (lat + PI * 0.5) / PI);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform sampler2D nightTexture;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec2 vGeoUv;
      ${SHADE_GLSL}
      void main() {
        vec3 day = texture2D(map, vUv).rgb;
        vec3 night = texture2D(nightTexture, vGeoUv).rgb;
        gl_FragColor = vec4(shadeDayNight(day, night, vNormal, sunDirection), 1.0);
      }
    `,
  });
}

const loader = new THREE.TextureLoader();
Promise.all([
  loader.loadAsync(TEXTURES + 'earth-blue-marble.jpg'),
  loader.loadAsync(TEXTURES + 'earth-night.jpg'),
]).then(([day, night]) => {
  const maxAniso = world.renderer().capabilities.getMaxAnisotropy();
  [day, night].forEach(t => { t.anisotropy = maxAniso; });
  night.wrapS = THREE.RepeatWrapping; // tiles near the date line sample just past the edge
  dayNight.uniforms.dayTexture.value = day;
  dayNight.uniforms.liveTexture.value = day;
  sharedUniforms.nightTexture.value = night;
  world.globeMaterial(dayNight);
  applyImagery();
}).catch(err => {
  console.error('Earth imagery setup failed', err);
  toast('Could not load Earth imagery. Check your connection.');
});

// ---------------------------------------------------------------------------
// Satellite visuals
// ---------------------------------------------------------------------------

const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const satGeometry = new THREE.SphereGeometry(1.0, 16, 12);

function makeSatObject(d) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(satGeometry, new THREE.MeshBasicMaterial({ color: d.color }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: d.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(7.9);
  const modelHolder = new THREE.Group(); // filled with a NASA 3D model when the camera gets close
  group.add(core, glow, modelHolder);
  d.object = group;
  d.dotParts = [core, glow];
  d.modelHolder = modelHolder;
  applySelectionStyle(d);
  return group;
}

// Markers grow as the camera pulls back so they stay visible when zoomed out
let markerScale = 1;
const getMarkerScale = () => markerScale;

function applySelectionStyle(d) {
  if (d.object) d.object.scale.setScalar(markerScale * (d.norad === selectedId ? 1.8 : 1));
}

function makeLabel(d) {
  const anchor = document.createElement('div');
  anchor.className = 'sat-anchor';
  const el = document.createElement('div');
  el.className = 'sat-label';
  el.style.setProperty('--c', d.color);
  el.textContent = d.name;
  el.addEventListener('click', () => select(d.norad, true));
  anchor.append(el);
  return anchor;
}

// ---------------------------------------------------------------------------
// Fonts and city labels
// ---------------------------------------------------------------------------

let font = null;
let cityOverlay = null;
let cityLabels = [];
let citiesShown = true;

// City names are drawn at a fixed size on the ground, so very close up they'd
// cover the whole view; hide them below this camera altitude (Earth radii)
const CITY_HIDE_BELOW = 0.15;
function updateCityVisibility() {
  const show = world.pointOfView().altitude >= CITY_HIDE_BELOW;
  if (show === citiesShown) return;
  citiesShown = show;
  world.labelsData(show ? cityLabels : []);
  labelsNeedUnlit = true;
  if (cityOverlay) cityOverlay.obj.visible = show;
}

// globe.gl draws label text with a lit material, so names on the night side
// (lit only by the dim ambient light that's there for the 3D models) came out
// grey. Swap each one for an unlit material so they read the same everywhere.
let labelsNeedUnlit = false;
const unlitLabelMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f6fc, transparent: true, opacity: 0.95 });
function makeLabelsUnlit() {
  let found = 0;
  world.scene().traverse(o => {
    if (o.isMesh && o.geometry?.type === 'TextGeometry' && o.material?.isMeshLambertMaterial) {
      o.material.dispose();
      o.material = unlitLabelMaterial;
      found++;
    }
  });
  if (found) labelsNeedUnlit = false;
}

fetch(FONT_URL).then(r => r.json()).then(json => {
  font = new FontLoader().parse(json);
  const { labels, leaders } = layoutCityLabels(CITIES, font, CITY_LABEL_SIZE, CITY_DOT_RADIUS);
  cityLabels = labels;
  world.labelTypeFace(json).labelsData(citiesShown ? labels : []);
  labelsNeedUnlit = true;
  cityOverlay = cityDatum(CITIES, labels, leaders, CITY_DOT_RADIUS, CITY_COLOR);
  overlaysDirty = true;
}).catch(err => console.warn('Font failed to load; city names and footprint text are hidden', err));

// ---------------------------------------------------------------------------
// Overlays (orbit lines, arrows, footprint) and per-frame update
// ---------------------------------------------------------------------------

const readySats = () => sats.filter(s => s.enabled && s.status === 'ready');
const selectedSat = () => sats.find(s => s.norad === selectedId && s.enabled && s.status === 'ready');

function updatePositions(now) {
  for (const s of readySats()) {
    const p = orbit.positionAt(s.satrec, now);
    if (!p) continue;
    s.lat = p.lat;
    s.lng = p.lng;
    s.altKm = p.altKm;
    s.alt = p.altKm / orbit.EARTH_RADIUS_KM;
    s.speedKms = p.speedKms;
    s.eci = p.eci;
  }
}

// The set of overlay objects only changes when satellites, the selection or
// layers change; in between, each one is just moved every frame.
let overlays = [];
let overlaysDirty = true;

function rebuildOverlays() {
  overlaysDirty = false;
  const next = cityOverlay ? [cityOverlay] : [];
  for (const s of readySats()) {
    const selected = s.norad === selectedId;
    if (layers.orbits) {
      next.push(orbitLineDatum(s, selected));
      // Evenly spaced, offset by half a step so none sits on the satellite itself
      for (let j = 0; j < ARROWS_PER_ORBIT; j++) {
        next.push(arrowDatum(s, (j + 0.5) / ARROWS_PER_ORBIT - 0.5, selected, getMarkerScale));
      }
    }
    if (selected && layers.groundTrack) next.push(groundTrackDatum(s));
    if (selected && layers.footprint) next.push(footprintDatum(s, font));
  }
  for (const d of overlays) if (d !== cityOverlay) d.dispose?.();
  overlays = next;
  world.customLayerData(overlays);
}

function updateSun(now) {
  const sun = orbit.sunPosition(now);
  const c = world.getCoords(sun.lat, sun.lng, 0);
  dayNight.uniforms.sunDirection.value.set(c.x, c.y, c.z).normalize();
  return sun;
}

function followSelected() {
  const s = selectedSat();
  if (!follow || !s) return;
  // Keep whatever zoom level the user has chosen with the scroll wheel; it
  // can go right down to just above the satellite to see its 3D model
  const pov = world.pointOfView();
  world.pointOfView({ lat: s.lat, lng: s.lng, altitude: Math.max(pov.altitude, s.alt + 0.012) }, 0);
}

// --- 3D models ---------------------------------------------------------------

const MODEL_NEAR = 80; // show the model when the camera is closer than this (globe units; 100 = Earth radius)
const tmpVec = new THREE.Vector3();
const modelBasis = new THREE.Matrix4();
const mUp = new THREE.Vector3(), mFwd = new THREE.Vector3(), mSide = new THREE.Vector3();

function updateModels(now, ready) {
  const cam = world.camera().position;
  for (const s of ready) {
    if (!s.object) continue;
    const pos = s.object.getWorldPosition(tmpVec);
    const dist = pos.distanceTo(cam);

    // Shrink the glowing dot when the camera is very close so it doesn't fill the screen
    const dotScale = Math.min(1, Math.max(0.03, dist / 30));
    s.dotParts[0].scale.setScalar(dotScale);
    s.dotParts[1].scale.setScalar(7.9 * dotScale);

    if (!hasModel(s.norad)) continue;
    const near = dist < MODEL_NEAR;

    if (near && !s.modelState) {
      s.modelState = 'loading';
      loadModel(s.norad)
        .then(m => { s.modelHolder.add(m); s.modelState = 'ready'; })
        .catch(err => { console.warn(`No 3D model for ${s.name}`, err); s.modelState = 'failed'; });
    }

    const show = near && s.modelState === 'ready';
    s.modelHolder.visible = show;
    s.dotParts.forEach(p => { p.visible = !show; });
    if (!show) continue;

    // Size: grows as you approach, but never fills the whole screen
    const radius = 0.25 + dist * 0.06;
    s.modelHolder.scale.setScalar(radius / s.object.scale.x);

    // Orientation: nose along the direction of travel, "top" away from Earth
    const ahead = orbit.positionAt(s.satrec, new Date(+now + 10_000));
    if (ahead) {
      const c = world.getCoords(ahead.lat, ahead.lng, ahead.altKm / orbit.EARTH_RADIUS_KM);
      mUp.copy(pos).normalize();
      mFwd.set(c.x - pos.x, c.y - pos.y, c.z - pos.z).normalize();
      mSide.crossVectors(mFwd, mUp).normalize();
      mFwd.crossVectors(mUp, mSide);
      s.modelHolder.quaternion.setFromRotationMatrix(modelBasis.makeBasis(mFwd, mUp, mSide));
    }
  }
}

let lastUi = 0;
function frame() {
  const now = simNow();
  updatePositions(now);
  const ready = readySats();

  const cam = world.camera();
  const near = Math.min(5, Math.max(0.05, (cam.position.length() - 100) * 0.02));
  if (Math.abs(near - cam.near) / cam.near > 0.1) {
    cam.near = near;
    cam.updateProjectionMatrix();
  }

  const scale = Math.max(1, cam.position.length() / 400);
  if (Math.abs(scale - markerScale) > 0.01) {
    markerScale = scale;
    ready.forEach(applySelectionStyle);
  }

  world.objectsData(ready);
  world.htmlElementsData([...(layers.labels ? ready : []), ...(layers.sites ? sites : [])]);
  if (overlaysDirty) rebuildOverlays();
  for (const d of overlays) d.tick?.(+now);
  const sun = updateSun(now);
  sunLight.position.copy(dayNight.uniforms.sunDirection.value).multiplyScalar(1000);
  followSelected();
  updateModels(now, ready);
  updateCityVisibility();
  if (labelsNeedUnlit) makeLabelsUnlit();
  if (!tileEngine || !baseGlobe) findTileEngine();
  if (tilesOn && baseGlobe) baseGlobe.visible = true;

  // UI text doesn't need 60fps
  if (performance.now() - lastUi > 200) {
    lastUi = performance.now();
    renderClock(now, sun);
    renderTelemetry(now, sun);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Loading and selecting satellites
// ---------------------------------------------------------------------------

async function loadSat(s) {
  if (s.status === 'ready' || s.status === 'loading') return;
  s.status = 'loading';
  renderList();
  try {
    const [l1, l2] = await fetchTLE(s.norad);
    s.satrec = orbit.makeSatrec(l1, l2);
    if (!orbit.positionAt(s.satrec, simNow())) throw new Error('Propagation failed');
    s.orbitInfo = orbit.orbitType(s.satrec);
    s.periodMs = orbit.periodMinutes(s.satrec) * 60000;
    s.status = 'ready';
  } catch (err) {
    console.warn(`Failed to load ${s.name} (${s.norad})`, err);
    s.status = 'error';
    toast(`Couldn't load ${s.name}. Try again later.`);
  }
  overlaysDirty = true;
  renderList();
}

function setEnabled(s, on) {
  s.enabled = on;
  if (on) loadSat(s);
  else if (selectedId === s.norad) select(null);
  overlaysDirty = true;
  savePrefs();
  renderList();
}

// Turn a whole group on, or off if it's already all on
function toggleGroup(members) {
  const turnOn = !members.every(s => s.enabled);
  for (const s of members) if (s.enabled !== turnOn) setEnabled(s, turnOn);
}

function selectAllButton(members) {
  const b = document.createElement('button');
  b.className = 'select-all';
  const allOn = members.every(s => s.enabled);
  b.textContent = allOn ? 'Clear all' : 'Select all';
  b.addEventListener('click', e => { e.stopPropagation(); toggleGroup(members); });
  return b;
}

function setFollow(on) {
  follow = on;
  $('follow').checked = on;
}

// While following, zooming keeps the lock, but dragging the globe with the
// mouse breaks away from the satellite (after a few pixels, so a click on
// something doesn't count as a drag)
{
  const canvas = world.renderer().domElement;
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { down = null; });
  canvas.addEventListener('pointermove', e => {
    if (!down || !follow) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) setFollow(false);
  });
}

function select(norad, fly = false) {
  const prev = sats.find(s => s.norad === selectedId);
  selectedId = norad;
  if (prev) applySelectionStyle(prev);
  const s = sats.find(x => x.norad === norad);
  if (s) applySelectionStyle(s);
  overlaysDirty = true;

  if (!s && follow) setFollow(false);

  if (s) {
    infoMode = 'sat';
    activeLaunchId = null;
    activeSite = null;
    showInfoCard('sat');
    renderLaunches();
  }

  if (s && fly && s.status === 'ready') {
    updatePositions(simNow());
    world.pointOfView({ lat: s.lat, lng: s.lng, altitude: Math.max(1.6, s.alt + 1.4) }, 1200);
  }
  renderList();
  renderMission(s);
  renderTelemetry(simNow(), orbit.sunPosition(simNow()));
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const $ = id => document.getElementById(id);
const fmtLat = v => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? 'N' : 'S'}`;
const fmtLng = v => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? 'E' : 'W'}`;
const fmtKm = v => `${Math.round(v).toLocaleString()} km`;
const fmtSpeed = kms => speedUnit === 'kmh'
  ? `${Math.round(kms * 3600).toLocaleString()} km/h`
  : `${kms.toFixed(2)} km/s`;

function renderClock(now, sun) {
  $('clock-utc').textContent = now.toISOString().slice(11, 19);
  $('clock-date').textContent = `${now.toISOString().slice(0, 10)} UTC · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} local`;
  const live = isLive();
  const badge = $('live-badge');
  badge.textContent = live ? 'LIVE' : `SIM ${clock.speed}×`;
  badge.className = `badge ${live ? 'live' : 'sim'}`;
  $('sun-pos').textContent = `Subsolar point: ${fmtLat(sun.lat)}, ${fmtLng(sun.lng)}`;
  renderSpeedButtons();
}

// "Now" lights up green while running live; otherwise the active speed is highlighted
function renderSpeedButtons() {
  const live = isLive();
  $('now-btn').classList.toggle('active', live);
  document.querySelectorAll('.speed [data-speed]').forEach(b => {
    b.classList.toggle('active', !live && Number(b.dataset.speed) === clock.speed);
  });
}

function renderTelemetry(now, sun) {
  const s = selectedSat();
  const card = $('telemetry');
  card.classList.toggle('hidden', !s || infoMode !== 'sat');
  if (!s) return;

  $('t-lat').textContent = fmtLat(s.lat);
  $('t-lng').textContent = fmtLng(s.lng);
  $('t-alt').textContent = fmtKm(s.altKm);
  $('t-spd').textContent = fmtSpeed(s.speedKms);
  $('t-fp').textContent = fmtKm(orbit.footprint(s.lat, s.lng, s.altKm, 1).radiusKm);

  // Whether the satellite itself is in sunlight. From orbit it stays lit for
  // a while after the ground beneath it has gone dark, so show both.
  const lit = s.eci && orbit.isSunlit(s.eci, sun.eci);
  const sunEl = $('t-sun');
  sunEl.textContent = lit ? '☀ Sunlit' : "☾ In Earth's shadow";
  sunEl.className = lit ? 'sunlit' : 'eclipse';
  const elev = orbit.sunElevationBelow(s.eci, sun.eci);
  $('t-ground').textContent = `Ground below: ${elev > 0 ? 'daytime' : elev > -6 ? 'twilight' : 'night'}`;

  const ageH = (+now - +orbit.tleEpoch(s.satrec)) / 36e5;
  $('t-epoch').textContent = `Orbital data age: ${Math.abs(ageH) < 48 ? `${ageH.toFixed(1)} h` : `${(ageH / 24).toFixed(1)} days`}`;
}

// Parts of the info panel that don't change from second to second
function renderMission(s) {
  if (!s || s.status !== 'ready') return;

  $('tele-dot').style.setProperty('--c', s.color);
  $('tele-name').textContent = s.name;
  $('tele-info').textContent = `${s.info} · NORAD ${s.norad}`;

  const period = orbit.periodMinutes(s.satrec);
  const oi = s.orbitInfo;
  $('t-type').textContent = oi.type + (oi.sunSync ? ' · Sun-synchronous' : '');
  $('t-per').textContent = period > 600 ? `${(period / 60).toFixed(2)} h` : `${period.toFixed(1)} min`;
  $('t-inc').textContent = `${orbit.inclinationDeg(s.satrec).toFixed(2)}°`;
  $('t-peri').textContent = fmtKm(oi.perigeeKm);
  $('t-apo').textContent = fmtKm(oi.apogeeKm);
  $('t-owner').textContent = s.operator || '–';
  $('model-hint').classList.toggle('hidden', !hasModel(s.norad));

  // Filled in from CelesTrak's catalog once it arrives
  for (const id of ['t-country', 't-ldate', 't-lsite', 't-status']) $(id).textContent = '…';
  fetchSatcat(s.norad).then(rec => {
    if (selectedId !== s.norad) return;
    $('t-country').textContent = s.country || COUNTRIES[rec.OWNER] || rec.OWNER || '–';
    const d = rec.LAUNCH_DATE ? new Date(rec.LAUNCH_DATE + 'T00:00:00Z') : null;
    $('t-ldate').textContent = d ? d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '–';
    $('t-lsite').textContent = LAUNCH_SITES[rec.LAUNCH_SITE] || rec.LAUNCH_SITE || '–';
    $('t-status').textContent = OPS_STATUS[rec.OPS_STATUS_CODE] || '–';
  }).catch(() => {
    if (selectedId !== s.norad) return;
    $('t-country').textContent = s.country || '–';
    for (const id of ['t-ldate', 't-lsite', 't-status']) $(id).textContent = '–';
  });

  // Photo from Wikipedia
  const photo = $('sat-photo');
  photo.classList.add('hidden');
  if (!s.wiki) return;
  fetchWikiSummary(s.wiki).then(w => {
    if (selectedId !== s.norad || !w.image) return;
    const img = $('sat-img');
    img.onload = () => photo.classList.remove('hidden');
    img.src = w.image;
    img.alt = `${s.name}`;
    $('sat-img-link').href = w.url;
  }).catch(() => { /* no photo is fine */ });
}

function renderList() {
  const list = $('sat-list');
  list.innerHTML = '';
  $('select-all').replaceWith(Object.assign(selectAllButton(sats), { id: 'select-all' }));
  for (const g of GROUPS) {
    const members = sats.filter(s => s.group === g.id);
    const wrap = document.createElement('div');
    wrap.className = 'group';
    const on = members.filter(s => s.enabled).length;
    const label = document.createElement('div');
    label.className = 'group-label';
    label.innerHTML = `<span>${g.label}</span><span class="count">${on}/${members.length}</span>`;
    label.append(selectAllButton(members));
    wrap.append(label);

    for (const s of members) {
      const row = document.createElement('div');
      row.className = `sat-row${s.enabled ? ' on' : ''}${s.norad === selectedId ? ' selected' : ''}`;
      row.title = `${s.info}: click to ${s.enabled ? 'remove from' : 'add to'} the globe`;
      // Clicking anywhere on the row toggles the satellite, same as the checkbox
      row.addEventListener('click', e => {
        if (e.target.closest('input, button')) return;
        setEnabled(s, !s.enabled);
      });

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = s.enabled;
      cb.setAttribute('aria-label', `Show ${s.name}`);
      cb.addEventListener('change', () => setEnabled(s, cb.checked));

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.setProperty('--c', s.color);

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = s.name;

      row.append(cb, dot, name);

      if (s.enabled && s.status === 'ready') {
        const go = document.createElement('button');
        go.className = 'goto';
        go.textContent = 'Go to';
        go.addEventListener('click', () => select(s.norad, true));
        row.append(go);
      } else if (s.enabled) {
        const state = document.createElement('span');
        state.className = `state${s.status === 'error' ? ' err' : ''}`;
        state.textContent = s.status === 'error' ? 'failed' : 'loading…';
        row.append(state);
      }
      wrap.append(row);
    }
    list.append(wrap);
  }
}

// --- Upcoming launches and launch sites ---------------------------------------

let launches = [];
let activeLaunchId = null;

const baseSites = SITE_LIST.map(x => ({ ...x, kind: 'site', launches: [] }));
let sites = [...baseSites];

function distanceKm(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 2 * orbit.EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Attach each upcoming launch to its launch site (or give its pad a marker)
function matchLaunchesToSites() {
  baseSites.forEach(site => { site.launches = []; });
  const extra = [];
  for (const l of launches) {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) continue;
    let best = baseSites.find(site => site.match?.test(l.location)) || null;
    let bestKm = best ? 0 : Infinity;
    if (!best) {
      for (const site of [...baseSites, ...extra]) {
        const km = distanceKm(site, l);
        if (km < bestKm) { best = site; bestKm = km; }
      }
    }
    if (!best || bestKm > 60) {
      best = {
        kind: 'site', name: l.location.split(',')[0] || l.pad, country: l.country,
        lat: l.lat, lng: l.lng, wiki: null,
        description: l.locationDescription, image: l.locationImage, launches: [],
      };
      extra.push(best);
    }
    best.launches.push(l);
    l.site = best;
  }
  sites = [...baseSites, ...extra];
  sites.forEach(updateSiteMarker);
}

function makeSiteMarker(site) {
  const el = document.createElement('div');
  el.className = 'site-marker';
  el.innerHTML = '<span class="site-icon"></span><span class="site-name"></span>';
  el.querySelector('.site-name').textContent = site.name;
  el.addEventListener('click', e => { e.stopPropagation(); showSite(site, true); });
  site.el = el;
  updateSiteMarker(site);
  return el;
}

function updateSiteMarker(site) {
  if (!site.el) return;
  const upcoming = site.launches.some(l => Date.parse(l.net) > Date.now() - 3600e3);
  site.el.classList.toggle('upcoming', upcoming);
  site.el.classList.toggle('active', infoMode === 'site' && activeSite === site);
  site.el.querySelector('.site-name').textContent = upcoming
    ? `${site.name} · ${site.launches.length} upcoming`
    : site.name;
}

async function loadLaunches() {
  try {
    launches = await fetchLaunches();
    matchLaunchesToSites();
    renderLaunches();
  } catch (err) {
    console.warn('Launch data unavailable', err);
    $('launch-list').innerHTML = '<li class="muted small">Launch data unavailable right now.</li>';
  }
}

function renderLaunches() {
  const list = $('launch-list');
  list.innerHTML = '';
  // Drop launches that went up more than an hour ago (until the next refresh)
  const upcoming = launches.filter(l => Date.parse(l.net) > Date.now() - 3600e3).slice(0, 3);
  if (!upcoming.length) {
    list.innerHTML = '<li class="muted small">No upcoming launches listed.</li>';
    return;
  }
  for (const l of upcoming) {
    const li = document.createElement('li');
    li.className = `clickable${infoMode === 'launch' && activeLaunchId === l.id ? ' active' : ''}`;
    li.tabIndex = 0;
    li.title = infoMode === 'launch' && activeLaunchId === l.id ? 'Click again to close' : 'Show this launch and its launch site';
    const go = l.status === 'Go';
    li.innerHTML = `
      <span class="launch-name"></span>
      <span class="launch-meta"></span>
      <span class="launch-count"><span class="countdown" data-net="${l.net}" data-precision="${l.precision}"></span><span class="launch-status ${go ? 'go' : ''}"></span></span>`;
    li.querySelector('.launch-name').textContent = l.name;
    li.querySelector('.launch-meta').textContent = [l.rocket, l.provider, l.site?.name || l.location].filter(Boolean).join(' · ');
    li.querySelector('.launch-status').textContent = l.status.toUpperCase();
    li.addEventListener('click', () => showLaunch(l));
    li.addEventListener('keydown', e => { if (e.key === 'Enter') showLaunch(l); });
    list.append(li);
  }
  tickCountdowns();
}

// --- Right-hand panel: satellite / launch / launch site ------------------------

let activeSite = null;

function expandPanel(key) {
  const btn = document.querySelector(`[data-collapse="${key}"]`);
  const panel = btn?.closest('.panel');
  if (!panel?.classList.contains('collapsed')) return;
  panel.classList.remove('collapsed');
  collapsed[key] = false;
  savePrefs();
}

function showInfoCard(mode) {
  // Showing a satellite, launch or site opens the panel if it was folded away
  if (startupDone && (mode !== 'sat' || selectedSat())) expandPanel('info');
  $('telemetry').classList.toggle('hidden', mode !== 'sat' || !selectedSat());
  $('launch-card').classList.toggle('hidden', mode !== 'launch');
  $('site-card').classList.toggle('hidden', mode !== 'site');
  const backName = selectedSat()?.name;
  document.querySelectorAll('[data-back]').forEach(b => {
    b.classList.toggle('hidden', !backName);
    b.textContent = `← Back to ${backName || 'satellite'}`;
  });
  document.querySelector('.info-panel').scrollTop = 0;
  sites.forEach(updateSiteMarker);
}

function flyTo(lat, lng) {
  setFollow(false);
  world.pointOfView({ lat, lng, altitude: 0.9 }, 1500);
}

function setPhoto(figId, imgId, url, alt) {
  const fig = $(figId);
  fig.classList.add('hidden');
  if (!url) return;
  const img = $(imgId);
  img.onload = () => fig.classList.remove('hidden');
  img.src = url;
  img.alt = alt;
}

function gridRow(grid, label, value, wide = true) {
  if (value == null || value === '') return;
  const div = document.createElement('div');
  if (wide) div.className = 'wide';
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  if (value instanceof Node) dd.append(value); else dd.textContent = value;
  div.append(dt, dd);
  grid.append(div);
}

function linkButton(text, onClick) {
  const b = document.createElement('button');
  b.className = 'link-btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

const fmtLocal = (iso, withTime = true) => new Date(iso).toLocaleString([], withTime
  ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
  : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

function closeDetail() {
  infoMode = 'sat';
  activeLaunchId = null;
  activeSite = null;
  showInfoCard('sat');
  renderLaunches();
}

function showLaunch(l) {
  if (infoMode === 'launch' && activeLaunchId === l.id) {
    closeDetail();
    return;
  }
  infoMode = 'launch';
  activeLaunchId = l.id;
  activeSite = l.site || null;
  if (Number.isFinite(l.lat)) flyTo(l.lat, l.lng);

  setPhoto('launch-photo', 'launch-img', l.image, l.name);
  $('launch-credit').textContent = l.imageCredit ? `Image: ${l.imageCredit}` : '';
  $('launch-name').textContent = l.name;
  $('launch-rocket').textContent = [l.rocket, l.provider].filter(Boolean).join(' · ');

  const cd = $('launch-countdown');
  cd.dataset.net = l.net;
  cd.dataset.precision = l.precision;
  const st = $('launch-status');
  st.textContent = l.statusName || l.status;
  st.className = `launch-status${l.status === 'Go' ? ' go' : ''}`;
  $('launch-status-desc').textContent = l.statusDescription;

  const grid = $('launch-grid');
  grid.innerHTML = '';
  const precise = ['SEC', 'MIN', 'HR'].includes(l.precision);
  gridRow(grid, precise ? 'Launch time (your time)' : 'Launch date (not yet fixed)', fmtLocal(l.net, precise));
  if (precise) gridRow(grid, 'Launch time (UTC)', `${l.net.slice(0, 10)} ${l.net.slice(11, 16)} UTC`);
  if (l.windowStart && l.windowEnd && l.windowStart !== l.windowEnd) {
    gridRow(grid, 'Launch window', `${fmtLocal(l.windowStart)} – ${new Date(l.windowEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  }
  gridRow(grid, 'Launch provider', l.providerType ? `${l.provider} (${l.providerType})` : l.provider);
  gridRow(grid, 'Launch pad', l.site
    ? linkButton(`${l.pad}, ${l.site.name}`, () => showSite(l.site, true))
    : `${l.pad}, ${l.location}`);
  gridRow(grid, 'Destination orbit', l.orbit, false);
  gridRow(grid, 'Mission type', l.missionType, false);
  if (l.probability != null) gridRow(grid, 'Weather', `${l.probability}% chance of acceptable weather`);
  $('launch-desc').textContent = l.description;

  showInfoCard('launch');
  renderLaunches();
  tickCountdowns();
}

function showSite(site, fly = false) {
  infoMode = 'site';
  activeSite = site;
  activeLaunchId = null;
  if (fly) flyTo(site.lat, site.lng);

  $('site-name').textContent = site.name;
  $('site-meta').textContent = [site.subtitle, site.country, `${fmtLat(site.lat)}, ${fmtLng(site.lng)}`].filter(Boolean).join(' · ');
  $('site-desc').textContent = site.description || '';
  setPhoto('site-photo', 'site-img', site.image, site.name);
  $('site-img-link').textContent = site.imageCredit || (site.wiki ? 'Wikipedia' : 'The Space Devs');
  $('site-img-link').removeAttribute('href');

  if (site.wiki) {
    fetchWikiSummary(site.wiki).then(w => {
      if (activeSite !== site) return;
      $('site-desc').textContent = w.extract;
      $('site-img-link').href = w.url;
      if (!site.image) setPhoto('site-photo', 'site-img', w.image, site.name);
    }).catch(() => { /* text and photo are optional */ });
  }

  const list = $('site-launches');
  list.innerHTML = '';
  const upcoming = site.launches.filter(l => Date.parse(l.net) > Date.now() - 3600e3);
  if (!upcoming.length) {
    list.innerHTML = '<li class="muted">None among the next few launches worldwide.</li>';
  }
  for (const l of upcoming) {
    const li = document.createElement('li');
    li.append(linkButton(l.name, () => showLaunch(l)));
    const when = document.createElement('span');
    when.className = 'muted small block';
    when.textContent = `${l.rocket} · ${fmtLocal(l.net, ['SEC', 'MIN', 'HR'].includes(l.precision))}`;
    li.append(when);
    list.append(li);
  }

  showInfoCard('site');
  renderLaunches();
}

document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => {
  const s = selectedSat();
  if (!s) return;
  closeDetail();
  select(s.norad, true);
}));

function tickCountdowns() {
  let stale = false;
  document.querySelectorAll('.countdown').forEach(el => {
    const ms = Date.parse(el.dataset.net) - Date.now();
    if (ms <= 0) {
      el.textContent = 'Launching / launched';
      if (ms < -3600e3) stale = true;
      return;
    }
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    // Launch times only known to the day/month are shown as approximate
    const approx = !['SEC', 'MIN', 'HR'].includes(el.dataset.precision) ? '≈ ' : '';
    el.textContent = `${approx}T− ${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  });
  if (stale) {
    renderLaunches();
    sites.forEach(updateSiteMarker);
  }
}
setInterval(tickCountdowns, 1000);
setInterval(loadLaunches, 30 * 60e3);

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      enabled: sats.filter(s => s.enabled).map(s => s.norad),
      layers,
      speedUnit,
      imagery: imageryId,
      collapsed,
    }));
  } catch { /* ignore */ }
}

// Time controls
document.querySelectorAll('.speed [data-speed]').forEach(btn => {
  btn.addEventListener('click', () => setClock(Number(btn.dataset.speed)));
});
$('now-btn').addEventListener('click', () => setClock(1, new Date()));

// Speed units
function renderUnits() {
  document.querySelectorAll('.units [data-unit]').forEach(b => b.classList.toggle('active', b.dataset.unit === speedUnit));
}
document.querySelectorAll('.units [data-unit]').forEach(btn => {
  btn.addEventListener('click', () => {
    speedUnit = btn.dataset.unit;
    renderUnits();
    savePrefs();
    lastUi = 0;
  });
});
renderUnits();

// Layer toggles
document.querySelectorAll('[data-layer]').forEach(cb => {
  cb.checked = layers[cb.dataset.layer];
  cb.addEventListener('change', () => {
    layers[cb.dataset.layer] = cb.checked;
    overlaysDirty = true;
    savePrefs();
  });
});

$('follow').addEventListener('change', e => setFollow(e.target.checked));

// "i" popovers: open on hover/focus via CSS, and toggle on click/tap
document.querySelectorAll('.info-btn').forEach(btn => {
  const wrap = btn.parentElement;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    btn.setAttribute('aria-expanded', wrap.classList.toggle('open'));
  });
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) {
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
});

// --- Earth imagery -------------------------------------------------------------

let imageryDate = defaultImageryDate();
let imageryRequest = 0;

const imagerySelect = $('imagery-select');
for (const opt of IMAGERY) {
  const o = document.createElement('option');
  o.value = opt.id;
  o.textContent = opt.label;
  imagerySelect.append(o);
}
imagerySelect.value = imageryId;
$('imagery-date').value = imageryDate;
$('imagery-date').max = new Date().toISOString().slice(0, 10);
$('imagery-date').min = '2012-01-20'; // around when the earliest VIIRS imagery begins

imagerySelect.addEventListener('change', () => {
  imageryId = imagerySelect.value;
  savePrefs();
  applyImagery();
});
$('imagery-date').addEventListener('change', e => {
  if (!e.target.value) return;
  imageryDate = e.target.value;
  applyImagery();
});

function applyImagery() {
  const opt = IMAGERY.find(i => i.id === imageryId);
  const live = !!opt.layer;
  $('imagery-date-row').classList.toggle('hidden', !live);
  const note = $('imagery-note');
  note.textContent = '';
  note.classList.remove('hidden');
  const request = ++imageryRequest;

  setTileSource(opt.tiles || null);

  if (!live) {
    dayNight.uniforms.useLive.value = 0;
    const src = TILE_SOURCES[opt.tiles];
    note.append(`${src.note} `);
    const a = document.createElement('a');
    a.href = src.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = src.credit;
    note.append(a);
    return;
  }
  if (!dayNight.uniforms.dayTexture.value) return; // called again once the base imagery has loaded

  // Note naming the satellite that took the picture, with a shortcut to track it
  const sat = sats.find(x => x.norad === opt.norad);
  note.append(`Daily mosaic for ${imageryDate}. Black gaps between orbits are filled with Blue Marble. `);
  if (sat) {
    note.append(linkButton(`Track ${sat.name}, the satellite that took it`, () => {
      if (!sat.enabled) setEnabled(sat, true);
      const go = () => (sat.status === 'ready' ? select(sat.norad, true) : setTimeout(go, 200));
      go();
    }));
  }

  $('imagery-status').textContent = 'Loading…';
  loader.loadAsync(gibsUrl(opt.layer, imageryDate)).then(tex => {
    if (request !== imageryRequest) { tex.dispose(); return; }
    tex.anisotropy = world.renderer().capabilities.getMaxAnisotropy();
    const old = dayNight.uniforms.liveTexture.value;
    if (old && old !== dayNight.uniforms.dayTexture.value) old.dispose();
    dayNight.uniforms.liveTexture.value = tex;
    dayNight.uniforms.useLive.value = 1;
    $('imagery-status').textContent = '';
  }).catch(err => {
    if (request !== imageryRequest) return;
    console.warn('GIBS imagery failed', err);
    $('imagery-status').textContent = 'Unavailable';
    toast(`NASA imagery for ${imageryDate} isn't available. Try an earlier date.`);
  });
}

// --- High-res static imagery (map tiles) ---------------------------------------

let tilesOn = false;
let tileSource = null;
let tileEngine = null;
let baseGlobe = null;

function setTileSource(id) {
  if (id === tileSource) return;
  if (tileSource) world.globeTileEngineClearCache(); // drop the previous source's tiles
  tileSource = id;
  tilesOn = !!id;
  const src = TILE_SOURCES[id];
  if (src) world.globeTileEngineMaxLevel(src.maxLevel).globeTileEngineUrl(src.url);
  else world.globeTileEngineUrl(null);
  findTileEngine();
}

// globe.gl adds the globe to the scene only once it's ready, so this is
// retried from the frame loop until both pieces are found
function findTileEngine() {
  world.scene().traverse(o => {
    if (!tileEngine && 'tileUrl' in o && 'maxLevel' in o) {
      tileEngine = o;
      tileEngine.addEventListener('childadded', e => useDayNightOnTile(e.child));
    }
    if (!baseGlobe && o.material === dayNight) baseGlobe = o;
  });
  tileEngine?.children.forEach(useDayNightOnTile);
  // Slightly shrink the base globe so it sits just under the tiles
  if (baseGlobe) baseGlobe.scale.setScalar(tilesOn ? 0.998 : 1);
}

function useDayNightOnTile(tile) {
  const m = tile.material;
  if (!m?.isMeshLambertMaterial || !m.map) return;
  tile.geometry.computeBoundingSphere();
  const centerLng = world.toGeoCoords(tile.geometry.boundingSphere.center).lng;
  const material = makeTileMaterial(m.map, centerLng);
  // Tiles from several zoom levels sit at the same radius while finer ones
  // load. Pull finer levels slightly toward the camera so they always win
  // the depth test instead of flickering against coarser tiles beneath them.
  const level = Math.round(Math.log2((2 * Math.PI) / tile.geometry.parameters.phiLength));
  // (just enough to break the tie, so labels just above the surface stay on top)
  material.polygonOffset = true;
  material.polygonOffsetFactor = 0;
  material.polygonOffsetUnits = -2 * level;
  material.depthWrite = m.depthWrite;
  tile.material = material;
  m.map = null;
  m.dispose();
}

$('collapse').addEventListener('click', () => $('panel').classList.toggle('collapsed'));
if (matchMedia('(max-width: 640px)').matches) $('panel').classList.add('collapsed');

// Collapsible panels (layers, time & details, upcoming launches); remembered between visits
document.querySelectorAll('[data-collapse]').forEach(btn => {
  const key = btn.dataset.collapse;
  const panel = btn.closest('.panel');
  panel.classList.toggle('collapsed', !!collapsed[key]);
  btn.addEventListener('click', () => {
    collapsed[key] = panel.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', !collapsed[key]);
    savePrefs();
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

renderList();
renderSpeedButtons();
loadLaunches();
world.pointOfView({ lat: 20, lng: -40, altitude: 2.6 });
requestAnimationFrame(frame);

await Promise.all(sats.filter(s => s.enabled).map(loadSat));

// Start out focused on the ISS if it's on, otherwise the first loaded satellite
const first = sats.find(s => s.norad === 25544 && s.status === 'ready') || readySats()[0];
if (first) select(first.norad, true);
startupDone = true;

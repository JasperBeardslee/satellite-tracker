// 3D models from NASA 3D Resources (https://github.com/nasa/NASA-3D-Resources),
// loaded on demand when the camera gets close to a satellite. Satellites
// without a model keep their glowing dot.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const BASE = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/';

const PATHS = {
  25544: 'International Space Station (ISS) (B)/International Space Station (ISS) (B).glb',
  20580: 'Hubble Space Telescope (A)/Hubble Space Telescope (A).glb',
  25994: 'Terra/Terra.glb',
  27424: 'Aqua (A)/Aqua (A).glb',
  28376: 'Aura (A)/Aura (A).glb',
  29108: 'Cloud-Aerosol Lidar and Infrared Pathfinder Satellite (CALIPSO)/Cloud-Aerosol Lidar and Infrared Pathfinder Satellite (CALIPSO).glb',
  39084: 'Landsat 8/Landsat 8.glb',
  49260: 'Landsat 8/Landsat 8.glb', // Landsat 9 is a near-copy of Landsat 8
  43613: 'Ice, Clouds, and Land Elevation Satellite-2 (ICESat-2) (A)/Ice, Clouds, and Land Elevation Satellite-2 (ICESat-2) (A).glb',
  40059: 'Orbiting Carbon Observatory (OCO) 2/Orbiting Carbon Observatory (OCO) 2.glb',
  37849: 'Suomi National Polar-orbiting Partnership (Suomi NPP)/Suomi National Polar-orbiting Partnership (Suomi NPP).glb',
  43013: 'Suomi National Polar-orbiting Partnership (Suomi NPP)/Suomi National Polar-orbiting Partnership (Suomi NPP).glb', // NOAA-20 uses the same spacecraft design
  46984: 'Jason Continuity of Service (Sentinel-6)/Jason Continuity of Service (Sentinel-6).glb',
  66514: 'Jason Continuity of Service (Sentinel-6)/Jason Continuity of Service (Sentinel-6).glb',
};

export const hasModel = norad => norad in PATHS;

// Many of NASA's models are Draco-compressed, which needs a separate decoder
const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const cache = new Map(); // url → Promise<Object3D>

/** Resolves to a fresh copy of the model, centred and scaled to radius 1. */
export function loadModel(norad) {
  const url = BASE + encodeURI(PATHS[norad]);
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then(gltf => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      model.position.sub(sphere.center);
      const wrapper = new THREE.Group();
      wrapper.add(model);
      wrapper.scale.setScalar(1 / (sphere.radius || 1));
      return wrapper;
    }));
  }
  return cache.get(url).then(m => m.clone());
}

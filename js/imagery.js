// Earth imagery options.
//
// The two static options are streamed as map tiles: the closer you zoom, the
// more detailed the tiles that load.
//  - A cloud-free Sentinel-2 mosaic (EOX "Sentinel-2 cloudless", ~10 m per
//    pixel). Licence: CC BY-NC-SA 4.0, free for non-commercial use with
//    attribution (https://s2maps.eu).
//  - NASA's Blue Marble: Next Generation (~500 m per pixel), public domain.
//
// "Daily" layers come from NASA GIBS (Global Imagery
// Browse Services), requested as one whole-world equirectangular image so
// the day/night shader can blend it like the static Blue Marble.
// Gaps between satellite passes (and the dark polar winter) come back black;
// the shader fills those from Blue Marble.

export const IMAGERY = [
  { id: 'static', label: 'High-res cloud-free (static)', tiles: 'sentinel' },
  { id: 'bluemarble', label: 'NASA Blue Marble (static)', tiles: 'bluemarble' },
  { id: 'viirs-noaa20', label: 'VIIRS NOAA-20 true colour', layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', norad: 43013 },
  { id: 'viirs-snpp', label: 'VIIRS Suomi NPP true colour', layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', norad: 37849 },
  { id: 'modis-terra', label: 'MODIS Terra true colour', layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', norad: 25994 },
  { id: 'modis-aqua', label: 'MODIS Aqua true colour', layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor', norad: 27424 },
];

export const TILE_SOURCES = {
  sentinel: {
    name: 'Sentinel-2 cloud-free imagery',
    url: (x, y, level) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/${level}/${y}/${x}.jpg`,
    maxLevel: 15,
    note: 'Zoom in for more detail (down to ~10 m).',
    credit: 'Sentinel-2 cloudless 2023 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2023)',
    link: 'https://s2maps.eu',
  },
  // NASA's Blue Marble: Next Generation (2004 monthly composites, ~500 m), via GIBS
  bluemarble: {
    name: 'NASA Blue Marble',
    url: (x, y, level) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${level}/${y}/${x}.jpeg`,
    maxLevel: 8,
    note: 'Zoom in for more detail (down to ~500 m).',
    credit: 'NASA Blue Marble: Next Generation, via NASA GIBS',
    link: 'https://visibleearth.nasa.gov/collection/1484/blue-marble',
  },
};

export function gibsUrl(layer, date, width = 4096) {
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0',
    LAYERS: layer, CRS: 'EPSG:4326', BBOX: '-90,-180,90,180',
    WIDTH: String(width), HEIGHT: String(width / 2),
    FORMAT: 'image/jpeg', TIME: date,
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`;
}

/** Yesterday (UTC): today's imagery is still being filled in through the day. */
export function defaultImageryDate() {
  return new Date(Date.now() - 864e5).toISOString().slice(0, 10);
}

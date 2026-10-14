// Satellite catalog. Add a satellite by giving it a NORAD catalog number
// (look one up at https://celestrak.org/satcat/search.php).
//   enabled:  shown when the page first loads
//   operator: who owns / runs it (shown in the info panel)
//   wiki:     English Wikipedia page title, used for the photo
//   country:  optional override for the country of origin (otherwise taken from CelesTrak)

export const GROUPS = [
  { id: 'crewed', label: 'Crewed stations' },
  { id: 'nasa', label: 'NASA / NOAA' },
  { id: 'copernicus', label: 'Copernicus (ESA / EU)' },
];

export const SATELLITES = [
  // Crewed
  { norad: 25544, name: 'ISS', group: 'crewed', color: '#ffd166', enabled: true,
    info: 'International Space Station', operator: 'NASA, Roscosmos, ESA, JAXA, CSA',
    wiki: 'International_Space_Station' },
  { norad: 48274, name: 'Tiangong', group: 'crewed', color: '#ff8fa3',
    info: 'Chinese Space Station (Tianhe core module)', operator: 'China Manned Space Agency',
    wiki: 'Tiangong_space_station' },

  // NASA / NOAA
  { norad: 20580, name: 'Hubble', group: 'nasa', color: '#90e0ef',
    info: 'Hubble Space Telescope', operator: 'NASA / ESA', wiki: 'Hubble_Space_Telescope' },
  { norad: 25994, name: 'Terra', group: 'nasa', color: '#80ed99',
    info: 'EOS flagship, Earth observation', operator: 'NASA', wiki: 'Terra_(satellite)' },
  { norad: 27424, name: 'Aqua', group: 'nasa', color: '#4cc9f0',
    info: 'EOS water-cycle mission', operator: 'NASA', wiki: 'Aqua_(satellite)' },
  { norad: 28376, name: 'Aura', group: 'nasa', color: '#b8f2e6',
    info: 'EOS atmospheric chemistry', operator: 'NASA', wiki: 'Aura_(satellite)' },
  { norad: 29108, name: 'CALIPSO', group: 'nasa', color: '#ffc8dd',
    info: 'Cloud-aerosol lidar (science mission ended 2023)', operator: 'NASA / CNES',
    country: 'United States / France', wiki: 'CALIPSO' },
  { norad: 39084, name: 'Landsat 8', group: 'nasa', color: '#f4a261',
    info: 'Land imaging', operator: 'NASA / USGS', wiki: 'Landsat_8' },
  { norad: 49260, name: 'Landsat 9', group: 'nasa', color: '#e9c46a',
    info: 'Land imaging', operator: 'NASA / USGS', wiki: 'Landsat_9' },
  { norad: 43613, name: 'ICESat-2', group: 'nasa', color: '#caf0f8',
    info: 'Ice, cloud and land elevation lidar', operator: 'NASA', wiki: 'ICESat-2' },
  { norad: 54754, name: 'SWOT', group: 'nasa', color: '#48cae4',
    info: 'Surface Water and Ocean Topography', operator: 'NASA / CNES',
    country: 'United States / France', wiki: 'Surface_Water_and_Ocean_Topography' },
  { norad: 40376, name: 'SMAP', group: 'nasa', color: '#a7c957',
    info: 'Soil Moisture Active Passive', operator: 'NASA', wiki: 'Soil_Moisture_Active_Passive' },
  { norad: 40059, name: 'OCO-2', group: 'nasa', color: '#adb5bd',
    info: 'Orbiting Carbon Observatory 2', operator: 'NASA', wiki: 'Orbiting_Carbon_Observatory_2' },
  { norad: 37849, name: 'Suomi NPP', group: 'nasa', color: '#ffb4a2',
    info: 'Weather & climate', operator: 'NOAA / NASA', wiki: 'Suomi_NPP' },
  { norad: 43013, name: 'NOAA-20', group: 'nasa', color: '#e5989b',
    info: 'JPSS-1 polar weather satellite', operator: 'NOAA / NASA', wiki: 'NOAA-20' },

  // Copernicus
  { norad: 39634, name: 'Sentinel-1A', group: 'copernicus', color: '#7bdff2',
    info: 'C-band radar imaging', operator: 'ESA for the European Commission', wiki: 'Sentinel-1A' },
  { norad: 40697, name: 'Sentinel-2A', group: 'copernicus', color: '#b2f7ef',
    info: 'Multispectral land imaging', operator: 'ESA for the European Commission', wiki: 'Sentinel-2' },
  { norad: 42063, name: 'Sentinel-2B', group: 'copernicus', color: '#b2f7ef',
    info: 'Multispectral land imaging', operator: 'ESA for the European Commission', wiki: 'Sentinel-2' },
  { norad: 60989, name: 'Sentinel-2C', group: 'copernicus', color: '#b2f7ef',
    info: 'Multispectral land imaging', operator: 'ESA for the European Commission', wiki: 'Sentinel-2' },
  { norad: 41335, name: 'Sentinel-3A', group: 'copernicus', color: '#f7d6e0',
    info: 'Ocean & land colour, altimetry', operator: 'ESA / EUMETSAT', wiki: 'Sentinel-3' },
  { norad: 43437, name: 'Sentinel-3B', group: 'copernicus', color: '#f7d6e0',
    info: 'Ocean & land colour, altimetry', operator: 'ESA / EUMETSAT', wiki: 'Sentinel-3' },
  { norad: 42969, name: 'Sentinel-5P', group: 'copernicus', color: '#f2b5d4',
    info: 'TROPOMI atmospheric monitoring', operator: 'ESA', wiki: 'Sentinel-5_Precursor' },
  { norad: 46984, name: 'Sentinel-6A', group: 'copernicus', color: '#eff7f6',
    info: 'Michael Freilich: sea-level altimetry', operator: 'EUMETSAT / ESA / NASA / NOAA',
    wiki: 'Sentinel-6_Michael_Freilich' },
  { norad: 66514, name: 'Sentinel-6B', group: 'copernicus', color: '#eff7f6',
    info: 'Sea-level altimetry', operator: 'EUMETSAT / ESA / NASA / NOAA',
    wiki: 'Sentinel-6_Michael_Freilich' },
];

# Satellite Tracker

Interactive 3D globe with a real-time day/night cycle and live satellite positions.

## Run it

The page uses ES modules, so it has to be served over HTTP. Opening `index.html` directly won't work.

```bash
cd "Projects/Satellite Tracker"
python3 -m http.server 8000
```

Then open http://localhost:8000

After editing files, use a hard refresh (Cmd+Shift+R) so the browser doesn't keep using cached copies of the scripts.

## How it works

| File | What it does |
|---|---|
| `index.html` | Page layout and the import map that loads three.js, globe.gl and satellite.js from a CDN |
| `css/styles.css` | Styling for the panel, labels, and mobile layout |
| `js/app.js` | Builds the globe, day/night shader, animation loop and UI |
| `js/overlays.js` | Orbit lines, ground track, direction arrows, footprint ring + curved text, city dots and label layout |
| `js/orbit.js` | SGP4 propagation, sun position, footprint, orbit-type and shadow math |
| `js/tle.js` | Orbital elements (TLEs) from CelesTrak, cached 2 hours |
| `js/satinfo.js` | Launch date/site and country from CelesTrak SATCAT, photos from Wikipedia (cached 1 week) |
| `js/launches.js` | Next launches from The Space Devs Launch Library 2 (cached 30 min; free tier is 15 requests/hour) |
| `js/launchsites.js` | Major launch sites shown on the globe (photos/descriptions from Wikipedia) |
| `js/imagery.js` | Earth imagery choices: high-res Sentinel-2 cloudless tiles (EOX, CC BY-NC-SA 4.0, non-commercial use) and daily NASA GIBS true-colour mosaics |
| `js/models.js` | NASA 3D models shown when you zoom in close to a satellite |
| `js/cities.js` | The 50 largest cities shown as labels on the globe |
| `js/cache.js` | Small localStorage cache shared by the data loaders |
| `js/satellites.js` | **The satellite catalog: edit this to add or remove satellites** |

## Adding a satellite

Find its NORAD catalog number at https://celestrak.org/satcat/search.php and add a line to `js/satellites.js`:

```js
{ norad: 12345, name: 'My Sat', group: 'nasa', color: '#ff9f1c', info: 'What it does',
  operator: 'NASA', wiki: 'Wikipedia_Page_Title' },
```

Add `enabled: true` to show it when the page first loads. To make a new section in the list, add an entry to `GROUPS`.

// Major orbital launch sites. Photos and descriptions come from the
// Wikipedia page named in `wiki` (fetched when a site is opened); `image`
// overrides the photo where Wikipedia's isn't a good one.
// Upcoming launches are matched by `match` (against Launch Library's location
// name) where given, otherwise to the nearest site within ~60 km. Any launch
// from a pad not listed here gets its own marker automatically.

export const LAUNCH_SITES = [
  // Kennedy Space Center (NASA) and Cape Canaveral Space Force Station sit side
  // by side on the same cape and share the launch range, so they're one marker
  { name: 'Cape Canaveral', subtitle: 'Cape Canaveral SFS & Kennedy Space Center', country: 'United States',
    lat: 28.562, lng: -80.577, wiki: 'Cape_Canaveral_Space_Force_Station', match: /Cape Canaveral|Kennedy/i },
  { name: 'Vandenberg SFB', country: 'United States', lat: 34.632, lng: -120.611, wiki: 'Vandenberg_Space_Force_Base' },
  { name: 'Wallops (MARS)', country: 'United States', lat: 37.843, lng: -75.478, wiki: 'Mid-Atlantic_Regional_Spaceport' },
  { name: 'Starbase', country: 'United States', lat: 25.997, lng: -97.157, wiki: 'Starbase,_Texas' },
  { name: 'Pacific Spaceport Complex', country: 'United States', lat: 57.435, lng: -152.340, wiki: 'Pacific_Spaceport_Complex_–_Alaska' },
  { name: 'Baikonur Cosmodrome', country: 'Kazakhstan (Russia)', lat: 45.965, lng: 63.305, wiki: 'Baikonur_Cosmodrome' },
  { name: 'Plesetsk Cosmodrome', country: 'Russia', lat: 62.926, lng: 40.578, wiki: 'Plesetsk_Cosmodrome' },
  { name: 'Vostochny Cosmodrome', country: 'Russia', lat: 51.885, lng: 128.335, wiki: 'Vostochny_Cosmodrome' },
  { name: 'Guiana Space Centre', country: 'French Guiana (ESA / France)', lat: 5.239, lng: -52.768, wiki: 'Guiana_Space_Centre',
    // Wikipedia's lead image is a site map, so use a photo of the ELA-3 pad instead
    image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Ariane_5_with_James_Webb_Space_Telescope_Prelaunch._%28NHQ202112230013%29.jpg/960px-Ariane_5_with_James_Webb_Space_Telescope_Prelaunch._%28NHQ202112230013%29.jpg',
    imageCredit: 'Ariane 5 with JWST on pad ELA-3 · NASA/Bill Ingalls' },
  { name: 'Jiuquan', country: 'China', lat: 40.958, lng: 100.291, wiki: 'Jiuquan_Satellite_Launch_Center' },
  { name: 'Taiyuan', country: 'China', lat: 38.849, lng: 111.608, wiki: 'Taiyuan_Satellite_Launch_Center' },
  { name: 'Xichang', country: 'China', lat: 28.246, lng: 102.027, wiki: 'Xichang_Satellite_Launch_Center' },
  { name: 'Wenchang', country: 'China', lat: 19.614, lng: 110.951, wiki: 'Wenchang_Space_Launch_Site' },
  { name: 'Tanegashima Space Center', country: 'Japan', lat: 30.400, lng: 130.970, wiki: 'Tanegashima_Space_Center' },
  { name: 'Uchinoura Space Center', country: 'Japan', lat: 31.252, lng: 131.082, wiki: 'Uchinoura_Space_Center' },
  { name: 'Satish Dhawan Space Centre', country: 'India', lat: 13.720, lng: 80.230, wiki: 'Satish_Dhawan_Space_Centre' },
  { name: 'Rocket Lab LC-1', country: 'New Zealand', lat: -39.261, lng: 177.866, wiki: 'Rocket_Lab_Launch_Complex_1' },
  { name: 'Naro Space Center', country: 'South Korea', lat: 34.432, lng: 127.535, wiki: 'Naro_Space_Center' },
  { name: 'Palmachim', country: 'Israel', lat: 31.898, lng: 34.691, wiki: 'Palmachim_Airbase' },
  { name: 'Imam Khomeini Spaceport', country: 'Iran', lat: 35.238, lng: 53.951, wiki: 'Imam_Khomeini_Spaceport' },
  { name: 'Andøya Space', country: 'Norway', lat: 69.294, lng: 16.021, wiki: 'Andøya_Space' },
];

// Major orbital launch sites. Photos and descriptions come from the
// Wikipedia page named in `wiki` (fetched when a site is opened); `image`
// overrides the photo where Wikipedia's isn't a good one. `about` is a short
// write-up shown instead of Wikipedia's intro, which is full of details like
// nearby roads and population counts.
// Upcoming launches are matched by `match` (against Launch Library's location
// name) where given, otherwise to the nearest site within ~60 km. Any launch
// from a pad not listed here gets its own marker automatically.

export const LAUNCH_SITES = [
  // Kennedy Space Center (NASA) and Cape Canaveral Space Force Station sit side
  // by side on the same cape and share the launch range, so they're one marker
  { name: 'Cape Canaveral', about: "America's busiest spaceport. Apollo 11 and the Space Shuttle launched from this stretch of Florida coast, and Falcon 9 and Falcon Heavy do today, heading east over the Atlantic to pick up a boost from Earth's spin.", subtitle: 'Cape Canaveral SFS & Kennedy Space Center', country: 'United States',
    lat: 28.562, lng: -80.577, wiki: 'Cape_Canaveral_Space_Force_Station', match: /Cape Canaveral|Kennedy/i },
  { name: 'Vandenberg SFB', about: "The West Coast's main launch site. Rockets fly south over the open Pacific, making it the go-to pad for polar and sun-synchronous orbits. Landsat 8 and 9, ICESat-2 and Sentinel-6 all launched from here.", country: 'United States', lat: 34.632, lng: -120.611, wiki: 'Vandenberg_Space_Force_Base' },
  { name: 'Wallops (MARS)', about: "NASA's launch site on Virginia's Eastern Shore. It has sent Antares cargo flights to the ISS and is home to Rocket Lab's US launch pad for its Electron rocket.", country: 'United States', lat: 37.843, lng: -75.478, wiki: 'Mid-Atlantic_Regional_Spaceport' },
  { name: 'Starbase', about: "SpaceX's launch and factory site at Boca Chica, Texas, where Starship, the largest and most powerful rocket ever flown, is built and launched.", country: 'United States', lat: 25.997, lng: -97.157, wiki: 'Starbase,_Texas' },
  { name: 'Pacific Spaceport Complex', about: "A launch site on Alaska's Kodiak Island. Its far-north spot suits launches into polar orbit, flying south over the Pacific.", country: 'United States', lat: 57.435, lng: -152.340, wiki: 'Pacific_Spaceport_Complex_–_Alaska' },
  { name: 'Baikonur Cosmodrome', about: "The world's first spaceport. Sputnik (1957) and Yuri Gagarin, the first human in space (1961), launched from here, and Soyuz crews still leave for the ISS from Baikonur today. Russia leases it from Kazakhstan.", country: 'Kazakhstan (Russia)', lat: 45.965, lng: 63.305, wiki: 'Baikonur_Cosmodrome' },
  { name: 'Plesetsk Cosmodrome', about: "Russia's northernmost cosmodrome, run by the military. During the Cold War it launched more rockets than anywhere else on Earth; today it handles military satellites and the Angara rocket.", country: 'Russia', lat: 62.926, lng: 40.578, wiki: 'Plesetsk_Cosmodrome' },
  { name: 'Vostochny Cosmodrome', about: "Russia's newest spaceport, in the Far East, built so Russia can launch from its own soil rather than relying on Baikonur. Its first launch was in 2016.", country: 'Russia', lat: 51.885, lng: 128.335, wiki: 'Vostochny_Cosmodrome' },
  { name: 'Guiana Space Centre', about: "Europe's spaceport. Just 5° from the equator, rockets get extra speed from Earth's rotation. An Ariane 5 launched the James Webb Space Telescope from here in 2021, as did the Vega rockets that carried the Sentinel-2 satellites.", country: 'French Guiana (ESA / France)', lat: 5.239, lng: -52.768, wiki: 'Guiana_Space_Centre',
    // Wikipedia's lead image is a site map, so use a photo of the ELA-3 pad instead
    image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Ariane_5_with_James_Webb_Space_Telescope_Prelaunch._%28NHQ202112230013%29.jpg/960px-Ariane_5_with_James_Webb_Space_Telescope_Prelaunch._%28NHQ202112230013%29.jpg',
    imageCredit: 'Ariane 5 with JWST on pad ELA-3 · NASA/Bill Ingalls' },
  { name: 'Jiuquan', about: "China's first launch site, in the Gobi Desert. Every Shenzhou crewed mission has launched here, starting with China's first astronaut, Yang Liwei, in 2003.", country: 'China', lat: 40.958, lng: 100.291, wiki: 'Jiuquan_Satellite_Launch_Center' },
  { name: 'Taiyuan', about: "A launch site in the mountains of Shanxi province, China's main base for weather and Earth-observation satellites heading into polar orbits.", country: 'China', lat: 38.849, lng: 111.608, wiki: 'Taiyuan_Satellite_Launch_Center' },
  { name: 'Xichang', about: "A launch site in Sichuan's mountains, China's main base for geostationary satellites, including the BeiDou navigation network, and the launch site of its first Moon missions.", country: 'China', lat: 28.246, lng: 102.027, wiki: 'Xichang_Satellite_Launch_Center' },
  { name: 'Wenchang', about: "China's newest and southernmost spaceport, on Hainan island. Its coastal spot lets the giant Long March 5 arrive by ship; it launched the Tiangong space station's core module and the Tianwen-1 Mars mission.", country: 'China', lat: 19.614, lng: 110.951, wiki: 'Wenchang_Space_Launch_Site' },
  { name: 'Tanegashima Space Center', about: "Japan's main launch site, on a small island south of Kyushu, often called the world's most beautiful spaceport. JAXA's H-IIA and H3 rockets launch from its seaside pads.", country: 'Japan', lat: 30.400, lng: 130.970, wiki: 'Tanegashima_Space_Center' },
  { name: 'Uchinoura Space Center', about: "JAXA's smaller launch site on the Kyushu coast, used for science missions. Japan's first satellite, Ohsumi, launched here in 1970, as did the Hayabusa asteroid probe.", country: 'Japan', lat: 31.252, lng: 131.082, wiki: 'Uchinoura_Space_Center' },
  { name: 'Satish Dhawan Space Centre', about: "India's spaceport on Sriharikota island. Chandrayaan-3, which made India the first country to land near the Moon's south pole in 2023, launched from here.", country: 'India', lat: 13.720, lng: 80.230, wiki: 'Satish_Dhawan_Space_Centre' },
  { name: 'Rocket Lab LC-1', about: "The world's first privately owned orbital launch site, on New Zealand's Mahia Peninsula, where Rocket Lab launches its small Electron rocket.", country: 'New Zealand', lat: -39.261, lng: 177.866, wiki: 'Rocket_Lab_Launch_Complex_1' },
  { name: 'Naro Space Center', about: "South Korea's spaceport on its southern coast. In 2022 the homegrown Nuri rocket reached orbit from here, giving South Korea its own way to space.", country: 'South Korea', lat: 34.432, lng: 127.535, wiki: 'Naro_Space_Center' },
  { name: 'Palmachim', about: "An Israeli air base on the Mediterranean coast. Israel launches west over the sea, against Earth's spin, to avoid flying over neighbouring countries, which makes its launches unusually hard.", country: 'Israel', lat: 31.898, lng: 34.691, wiki: 'Palmachim_Airbase' },
  { name: 'Imam Khomeini Spaceport', about: "Iran's main spaceport, in the desert of Semnan province, used for its Simorgh satellite launches.", country: 'Iran', lat: 35.238, lng: 53.951, wiki: 'Imam_Khomeini_Spaceport' },
  { name: 'Andøya Space', about: 'A rocket range on an Arctic island in northern Norway, launching science rockets since 1962. In 2025 it hosted the first orbital launch attempt from continental Europe outside Russia.', country: 'Norway', lat: 69.294, lng: 16.021, wiki: 'Andøya_Space' },
];

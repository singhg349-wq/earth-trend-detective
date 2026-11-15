/**
 * Named places for the globe labels: oceans, seas and countries.
 *
 * Coordinates are representative interior points in degrees (lon, lat), not
 * exact centroids. They are chosen to sit over land (for countries) or open
 * water (for oceans/seas) so a label reads clearly when drawn on the globe.
 *
 * `tier` controls label density:
 *   1 = shown when zoomed out (the default globe view),
 *   2 = revealed as the user zooms in,
 *   3 = revealed only when zoomed in close.
 * Oceans are tier 1; seas are tier 3.
 */

export type PlaceKind = 'country' | 'ocean' | 'sea';

export interface NamedPlace {
  name: string;
  lon: number;
  lat: number;
  kind: PlaceKind;
  tier: 1 | 2 | 3;
}

/** Build a country entry compactly. */
function country(name: string, lon: number, lat: number, tier: 1 | 2 | 3): NamedPlace {
  return { name, lon, lat, kind: 'country', tier };
}

function water(name: string, lon: number, lat: number, kind: 'ocean' | 'sea'): NamedPlace {
  return { name, lon, lat, kind, tier: kind === 'ocean' ? 1 : 3 };
}

/** The five oceans (Pacific and Atlantic split north/south) plus major seas. */
export const OCEANS: NamedPlace[] = [
  water('North Pacific Ocean', -165, 32, 'ocean'),
  water('South Pacific Ocean', -145, -32, 'ocean'),
  water('North Atlantic Ocean', -42, 32, 'ocean'),
  water('South Atlantic Ocean', -28, -32, 'ocean'),
  water('Indian Ocean', 78, -22, 'ocean'),
  water('Southern Ocean', 30, -64, 'ocean'),
  water('Arctic Ocean', -40, 84, 'ocean'),
  // Major seas — revealed only when zoomed in.
  water('Mediterranean Sea', 17, 34.5, 'sea'),
  water('Caribbean Sea', -76, 15, 'sea'),
  water('South China Sea', 114, 12, 'sea'),
  water('Bay of Bengal', 88, 13, 'sea'),
  water('Arabian Sea', 64, 15, 'sea'),
  water('Gulf of Mexico', -90, 24, 'sea'),
  water('Coral Sea', 154, -17, 'sea'),
  water('Tasman Sea', 160, -37, 'sea'),
  water('Coral Triangle', 126, 1, 'sea'),
];

export const COUNTRIES: NamedPlace[] = [
  // ── North America ──────────────────────────────────────────────────────
  country('United States', -98, 39, 1),
  country('Canada', -100, 60, 1),
  country('Mexico', -102, 23, 1),
  country('Greenland', -42, 72, 3),
  // Central America
  country('Guatemala', -90.3, 15.5, 2),
  country('Belize', -88.5, 17.2, 3),
  country('Honduras', -86.5, 15, 2),
  country('El Salvador', -88.9, 13.8, 3),
  country('Nicaragua', -85, 12.9, 2),
  country('Costa Rica', -84, 9.7, 3),
  country('Panama', -80, 8.7, 2),
  // Caribbean
  country('Cuba', -79.5, 21.5, 2),
  country('Dominican Republic', -70.5, 19, 2),
  country('Haiti', -72.3, 19, 3),
  country('Jamaica', -77.3, 18.2, 3),
  country('Bahamas', -77.3, 24.2, 3),
  country('Trinidad and Tobago', -61.3, 10.5, 3),
  country('Barbados', -59.5, 13.2, 3),

  // ── South America (all 12 sovereign states) ────────────────────────────
  country('Argentina', -64, -34, 1),
  country('Bolivia', -64, -17, 2),
  country('Brazil', -52, -10, 1),
  country('Chile', -71, -35, 1),
  country('Colombia', -73, 4, 1),
  country('Ecuador', -78, -1.5, 2),
  country('Guyana', -59, 5, 3),
  country('Paraguay', -58, -23, 2),
  country('Peru', -75, -10, 1),
  country('Suriname', -56, 4, 3),
  country('Uruguay', -56, -33, 2),
  country('Venezuela', -66, 7, 2),

  // ── Europe ──────────────────────────────────────────────────────────────
  country('Russia', 95, 60, 1),
  country('Germany', 10, 51, 1),
  country('France', 2.5, 46.5, 1),
  country('United Kingdom', -2, 54, 1),
  country('Italy', 12.5, 42.5, 1),
  country('Spain', -3.7, 40.3, 1),
  country('Ukraine', 31, 49, 1),
  country('Poland', 19, 52, 1),
  country('Sweden', 15, 62, 2),
  country('Norway', 8.5, 61, 2),
  country('Finland', 26, 64, 2),
  country('Denmark', 9.5, 56, 2),
  country('Netherlands', 5.5, 52.1, 2),
  country('Belgium', 4.6, 50.6, 2),
  country('Switzerland', 8.2, 46.8, 2),
  country('Austria', 14.5, 47.5, 2),
  country('Czechia', 15.5, 49.8, 2),
  country('Portugal', -8, 39.5, 2),
  country('Greece', 22, 39, 2),
  country('Ireland', -8, 53.2, 2),
  country('Romania', 25, 45.9, 2),
  country('Hungary', 19.5, 47, 2),
  country('Serbia', 21, 44, 3),
  country('Bulgaria', 25.5, 42.7, 3),
  country('Croatia', 16, 45.2, 3),
  country('Belarus', 28, 53.7, 3),
  country('Slovakia', 19.5, 48.7, 3),
  country('Slovenia', 14.9, 46.1, 3),
  country('Bosnia and Herzegovina', 17.8, 44, 3),
  country('North Macedonia', 21.7, 41.6, 3),
  country('Albania', 20, 41, 3),
  country('Montenegro', 19.2, 42.7, 3),
  country('Kosovo', 21, 42.6, 3),
  country('Lithuania', 23.9, 55.2, 3),
  country('Latvia', 24.7, 56.9, 3),
  country('Estonia', 25.5, 58.6, 3),
  country('Moldova', 28.5, 47.2, 3),
  country('Iceland', -18.5, 64.9, 3),
  country('Luxembourg', 6.1, 49.7, 3),
  country('Malta', 14.4, 35.9, 3),
  country('Cyprus', 33.3, 35, 3),

  // ── Africa (all 54 sovereign states) ────────────────────────────────────
  country('Algeria', 3, 28, 2),
  country('Angola', 18, -12, 2),
  country('Benin', 2.3, 9.3, 3),
  country('Botswana', 24, -22, 2),
  country('Burkina Faso', -1.5, 12.3, 3),
  country('Burundi', 29.8, -3.4, 3),
  country('Cabo Verde', -24, 16, 3),
  country('Cameroon', 12, 6, 2),
  country('Central African Republic', 21, 6.6, 3),
  country('Chad', 18.7, 15.5, 2),
  country('Comoros', 43.3, -11.7, 3),
  country('Republic of the Congo', 15.5, -1, 3),
  country('DR Congo', 23.5, -2.5, 1),
  country('Djibouti', 42.5, 11.5, 3),
  country('Egypt', 30, 26.5, 1),
  country('Equatorial Guinea', 10.3, 1.7, 3),
  country('Eritrea', 38, 15.5, 3),
  country('Eswatini', 31.5, -26.5, 3),
  country('Ethiopia', 40, 9, 1),
  country('Gabon', 11.7, -0.8, 3),
  country('Gambia', -15.3, 13.4, 3),
  country('Ghana', -1.2, 8, 2),
  country('Guinea', -10, 10.5, 3),
  country('Guinea-Bissau', -15, 12, 3),
  country('Côte d’Ivoire', -5.5, 7.5, 2),
  country('Kenya', 37.8, 0.2, 2),
  country('Lesotho', 28.2, -29.6, 3),
  country('Liberia', -9.4, 6.4, 3),
  country('Libya', 17, 27, 2),
  country('Madagascar', 46.7, -19, 2),
  country('Malawi', 34, -13.5, 3),
  country('Mali', -4, 17.5, 2),
  country('Mauritania', -11, -20, 3),
  country('Mauritius', 57.5, -20.3, 3),
  country('Morocco', -6.5, 31.8, 2),
  country('Mozambique', 35, -18, 2),
  country('Namibia', 17, -22, 2),
  country('Niger', 9, 17, 2),
  country('Nigeria', 8, 9.5, 1),
  country('Rwanda', 30, -2, 3),
  country('São Tomé and Príncipe', 6.6, 0.2, 3),
  country('Senegal', -14.5, 14.5, 2),
  country('Seychelles', 55.5, -4.6, 3),
  country('Sierra Leone', -11.8, 8.5, 3),
  country('Somalia', 46, 6, 3),
  country('South Africa', 24, -29, 1),
  country('South Sudan', 31, 7.5, 3),
  country('Sudan', 30, 15.5, 2),
  country('Tanzania', 34.8, -6.4, 2),
  country('Togo', 1, 8.5, 3),
  country('Tunisia', 9.5, 34, 2),
  country('Uganda', 32.3, 1.3, 2),
  country('Zambia', 28, -14, 2),
  country('Zimbabwe', 29.7, -19, 2),

  // ── Middle East & West/Central Asia ─────────────────────────────────────
  country('Turkey', 35, 39, 1),
  country('Saudi Arabia', 45, 24, 1),
  country('Iran', 54, 32.5, 1),
  country('Iraq', 43.5, 33, 2),
  country('Syria', 38.5, 35, 3),
  country('Yemen', 47.5, 15.5, 2),
  country('Jordan', 36.5, 31.2, 3),
  country('Lebanon', 35.8, 33.9, 3),
  country('Israel', 34.8, 31.5, 3),
  country('Oman', 56, 21, 3),
  country('United Arab Emirates', 54, 24, 3),
  country('Qatar', 51.2, 25.3, 3),
  country('Kuwait', 47.6, 29.3, 3),
  country('Bahrain', 50.5, 26, 3),
  country('Georgia', 43.5, 42, 3),
  country('Armenia', 45, 40, 3),
  country('Azerbaijan', 47.5, 40.3, 3),

  // ── South & Central Asia ────────────────────────────────────────────────
  country('Kazakhstan', 67, 48, 1),
  country('Uzbekistan', 64, 41.5, 2),
  country('Turkmenistan', 59, 39, 3),
  country('Kyrgyzstan', 74, 41, 3),
  country('Tajikistan', 71, 38.8, 3),
  country('Afghanistan', 66, 34, 2),
  country('Pakistan', 69, 30, 1),
  country('India', 79, 22, 1),
  country('Bangladesh', 90, 23.7, 1),
  country('Nepal', 84, 28.2, 2),
  country('Bhutan', 90.5, 27.4, 3),
  country('Sri Lanka', 80.8, 7.8, 2),
  country('Maldives', 73.5, 3.2, 3),

  // ── East & Southeast Asia ───────────────────────────────────────────────
  country('China', 104, 35, 1),
  country('Mongolia', 103, 47, 2),
  country('North Korea', 127, 40, 3),
  country('South Korea', 128, 36, 1),
  country('Japan', 138, 37, 1),
  country('Myanmar', 96, 21, 2),
  country('Thailand', 101, 15, 1),
  country('Laos', 103, 18, 3),
  country('Cambodia', 105, 12.5, 2),
  country('Vietnam', 106, 16.5, 1),
  country('Malaysia', 109, 4, 2),
  country('Singapore', 103.8, 1.35, 3),
  country('Brunei', 114.6, 4.5, 3),
  country('Indonesia', 115, -2, 1),
  country('Philippines', 122, 13, 1),
  country('Timor-Leste', 125.7, -8.8, 3),

  // ── Oceania ─────────────────────────────────────────────────────────────
  country('Australia', 134, -25, 1),
  country('Papua New Guinea', 144, -6, 2),
  country('New Zealand', 172, -41, 2),
  country('Fiji', 178, -17.8, 3),
  country('Solomon Islands', 160, -9, 3),
  country('Vanuatu', 168, -16, 3),
  country('Samoa', -172.5, -13.8, 3),
  country('Tonga', -175, -21, 3),
];

/**
 * The Present-mode sequence: one data file shared by the in-app presenter and
 * the phone remote (frontend/scripts/gen-phone-cards.mjs turns it into cards).
 * Every number here comes from deck/FACTS.md, data/artifacts/*.json,
 * data/artifacts/enso_history/impacts/index.json or docs/workers/REPORT_*.md.
 * Keep this file free of imports so it can be transpiled standalone.
 */

/* ------------------------------------------------------------------ */
/* Things you may want to edit before the talk                         */
/* ------------------------------------------------------------------ */

/**
 * The opening question. The first sentence is set small; every following
 * sentence becomes one giant line. Rewrite freely.
 */
export const OPENING_QUESTION =
  'Everyone says the climate is changing. Where? By how much? And how sure are we?';

/** Set to false to hide the QR code on the closing slide. */
export const SHOW_QR = true;

export const LIVE_URL = 'https://trendtrace.earth-trend-detective-frontend.workers.dev';

/* ------------------------------------------------------------------ */

export type SceneId =
  | 'question'
  | 'place'
  | 'locked'
  | 'reveal'
  | 'built'
  | 'method'
  | 'link'
  | 'impact'
  | 'close';

export type DemoAction =
  | { type: 'landing' }
  | {
      type: 'investigation';
      place: { name: string; lon: number; lat: number; regionId: string | null };
      variable: 'precipitation' | 'temperature' | 'aerosol_optical_depth' | 'soil_moisture';
      season: string;
    }
  | { type: 'enso'; hash: string };

/** Small caption shown over the live app on demo steps. */
export interface DemoCaption {
  label: string;
  /** The one number to read out (optional). */
  value?: string;
  detail?: string;
}

export interface PresentStep {
  id: string;
  kind: 'story' | 'demo';
  /** Phone-card title. */
  title: string;
  /** Story slides: the big words on screen (also used by the PowerPoint twin). */
  headline?: string;
  /** Story slides only: which designed scene to render. */
  scene?: SceneId;
  /** Demo steps only: which live app state to put on screen. */
  demo?: DemoAction;
  caption?: DemoCaption;
  /** Facts and methods that back up what is said on this step (phone cards). */
  supportNotes: string[];
}

/** Copy for the designed story scenes. Numbers are real; see the header. */
export const STORY = {
  eyebrow: 'NASA Space Apps Challenge',
  place: {
    pill: 'The problem',
    lines: ['The headline is global.', 'The question is local.'],
    sub: 'What about here? Almost no one can check the place they care about.',
    pin: 'here?',
  },
  locked: {
    pill: 'The data exists',
    giant: '46 YEARS',
    files: 2534,
    before: 'of open NASA records, locked inside',
    after: 'files.',
    sub: 'Public, free, and unreadable without code, file formats and statistics.',
    barriers: ['NetCDF files', '0.5° grids', 'Seasonal averages', 'Significance tests'],
  },
  reveal: {
    pill: 'So we built',
    giant: 'TRENDTRACE',
    tagline: ['Click anywhere on Earth.', 'See what’s changing, and how sure we are.'],
    metrics: ['Rainfall', 'Temperature', 'Aerosols (haze)', 'Soil moisture'],
  },
  built: {
    pill: 'What we built',
    headline: ['From raw files to one click,', 'in 48 hours.'],
    stations: [
      { value: 2534, label: 'raw files', sub: 'NASA + NOAA monthly records' },
      { value: 11055, label: 'map tiles', sub: '250.65 MB of seasonal series' },
      { value: 64800, label: 'cells you can click', sub: 'every 1° × 1° of the planet' },
    ],
    links: ['Python pipeline', 'statistics in your browser'],
    facts: ['4 metrics × 5 seasons', '0.29 ms per trend test', '809 timelapse frames', '291 automated tests'],
  },
  method: {
    pill: 'How we decide',
    headline: ['Is the trend', 'real?'],
    checks: [
      { name: 'Mann–Kendall test', note: 'Hamed–Rao corrected: is the direction more than year-to-year noise?' },
      { name: 'Sen’s slope + 95% interval', note: 'How fast, and how sure. Robust to odd years.' },
      { name: 'False discovery rate on maps', note: 'Thousands of cells tested, q = 0.10.' },
      { name: 'Checked against NASA Giovanni', note: 'Two test regions reproduced.' },
    ],
    chartLabel: 'Amazon · Dec–Feb temperature · 1981–2026',
    chartResult: '+0.25 °C per decade',
    chartDetail: 'p = 0.0001 · 95% CI +0.14 to +0.37',
  },
  link: {
    pill: 'The why, from our own data',
    giant: 'EL NIÑO',
    lead: 'One Pacific pattern shows up in both places.',
    stats: [
      { place: 'Amazon', value: '+0.82 °C', note: 'warmer in El Niño winters' },
      { place: 'Amazon', value: '−0.95 mm/day', note: 'drier in El Niño winters' },
      { place: 'Alberta / Prairies', value: '+1.51 °C', note: 'warmer in El Niño winters' },
    ],
    footer: 'El Niño winters minus La Niña winters, long-term trend removed. Associated with, not a proven cause.',
  },
  impact: {
    pill: 'Who it is for',
    people: ['Farmers.', 'Students.', 'Journalists.', 'Local planners.'],
    sub: 'Anyone with a place they care about, and no time to learn NetCDF.',
    nextTitle: 'What’s next',
    next: [
      'Compare temperature, aerosols and soil moisture with NASA Giovanni',
      'All five seasons for named regions',
      'Significance for sub-periods',
    ],
  },
  close: {
    giant: 'TRENDTRACE',
    line: 'Click anywhere on Earth. See what’s changing, and how sure we are.',
    url: 'trendtrace.earth-trend-detective-frontend.workers.dev',
    qrLabel: 'Try it now',
    credits: ['NASA GES DISC', 'GPCP v3.3', 'MERRA-2', 'GLDAS v2.1', 'NOAA ERSST v6', 'NOAA CPC RONI', 'Natural Earth'],
    footer: 'Built with AI coding assistance. Trends are observed history; links are associations.',
  },
} as const;

export const STEPS: PresentStep[] = [
  {
    id: 'question',
    kind: 'story',
    scene: 'question',
    title: 'Opening: the big question',
    headline: OPENING_QUESTION,
    supportNotes: [
      'Three questions frame the whole talk: where, by how much, how sure.',
      'TrendTrace answers all three for any 1° × 1° cell on Earth: 64,800 cells.',
      '4 NASA metrics: rainfall (GPCP v3.3), temperature (MERRA-2), aerosols/haze (MERRA-2 AOD), soil moisture (GLDAS v2.1).',
      'Every result shows the trend, the uncertainty and the limits, not just a colour.',
    ],
  },
  {
    id: 'problem-place',
    kind: 'story',
    scene: 'place',
    title: 'Problem: nobody can check their own place',
    headline: 'The headline is global. The question is local.',
    supportNotes: [
      'People hear global averages; their real question is about one place: a farm, a town, a river basin.',
      'Answering it today takes code, file formats and statistics most people do not have.',
      'The gap is not data. It is access, plus honesty about uncertainty.',
    ],
  },
  {
    id: 'problem-locked',
    kind: 'story',
    scene: 'locked',
    title: 'Problem: 46 years of data, locked in files',
    headline: '46 YEARS of open NASA records, locked inside 2,534 files.',
    supportNotes: [
      'MERRA-2 temperature and aerosols: 560 monthly files each, 1980-01 to 2026-08 (46 years).',
      'GPCP v3.3 rainfall: 516 monthly files, 1983–2025. GLDAS v2.1 soil moisture: 319 files, 2000–2026.',
      'NOAA ERSST v6 sea surface temperature: 574 monthly files, 1979–2026.',
      '2,534 input files in total = 516 + 560 + 560 + 319 + 574 + 2 NOAA index tables + 3 Natural Earth files.',
      'All public (NASA GES DISC, NOAA), but delivered as NetCDF grids that need code to read.',
    ],
  },
  {
    id: 'reveal',
    kind: 'story',
    scene: 'reveal',
    title: 'Reveal: TrendTrace',
    headline: 'TRENDTRACE. Click anywhere on Earth. See what’s changing, and how sure we are.',
    supportNotes: [
      'Product: TrendTrace. Click anywhere on Earth, see what is changing and how sure we are.',
      '4 metrics: rainfall, temperature, aerosols (haze), soil moisture (0–10 cm, land only).',
      '5 seasons per metric: annual, Dec–Feb, Mar–May, Jun–Aug, Sep–Nov.',
      'Runs as a static site: the statistics are computed in the browser, no server in the loop.',
    ],
  },
  {
    id: 'demo-landing',
    kind: 'demo',
    demo: { type: 'landing' },
    title: 'Live: the globe',
    caption: { label: 'The globe', detail: 'Drag, click any cell, or start an investigation' },
    supportNotes: [
      'Drag to rotate, click anywhere for that 1° cell, or use Start an investigation.',
      'Right bar ranks the 10 study regions for the chosen metric and season.',
      'Grid: 64,800 cells (1° × 1°); soil moisture is land only (GLDAS covers −59.5° to 89.5°).',
      'The tool also says when there is no clear trend: Coastal Peru rainfall, Dec–Feb, p = 0.52.',
    ],
  },
  {
    id: 'built',
    kind: 'story',
    scene: 'built',
    title: 'What we built in 48 hours',
    headline: 'From raw files to one click, in 48 hours. 2,534 files → 11,055 tiles → 64,800 cells.',
    supportNotes: [
      '2,534 input files → 11,055 JSON tiles (250.65 MB): rainfall, temperature, aerosols 3,240 each; soil moisture 1,335 (land only).',
      '64,800 cells × 5 seasons × 4 metrics; 809 timelapse frames in 20 sets.',
      'Trend test in the browser: 0.288 ms average for a 47-year series; matches the Python reference on 26 of 26 test series.',
      'Tests: 291 front-end tests and 180 Python pipeline tests pass; data integrity script 5 of 5.',
      'GLDAS v2.0 left out on purpose: it differs from v2.1 by +0.469 kg/m² over 2000–2014, which would fake a trend.',
    ],
  },
  {
    id: 'method',
    kind: 'story',
    scene: 'method',
    title: 'How we decide a trend is real',
    headline: 'Is the trend real? Mann–Kendall, Sen’s slope + 95% interval, false discovery rate, NASA Giovanni check.',
    supportNotes: [
      'Mann–Kendall asks: do values tend to rise or fall over time? Hamed–Rao corrects for autocorrelation (3 lags), so fewer false “significant” results.',
      'Sen’s slope = median of all pairwise slopes, robust to outliers; shown with a 95% confidence interval.',
      'False discovery rate (Benjamini–Hochberg, q = 0.10) limits false alarms when thousands of map cells are tested.',
      'Method check: our pipeline reproduced NASA Giovanni for 2 of 40 regional series (Coastal Peru and Indonesia rainfall, Dec–Feb). The other 38 use the same code, not compared one by one.',
      'Chart on the slide is the real Amazon Dec–Feb temperature series (MERRA-2, 46 winters).',
    ],
  },
  {
    id: 'demo-amazon-temp',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: { name: 'Amazon', lon: -60, lat: -5, regionId: 'amazon' },
      variable: 'temperature',
      season: 'DJF',
    },
    title: 'Live: Amazon temperature, Dec–Feb',
    caption: { label: 'Amazon · Dec–Feb temperature', value: '+0.25 °C per decade', detail: 'p = 0.0001 · 95% CI +0.14 to +0.37' },
    supportNotes: [
      'Amazon, temperature, Dec–Feb, 1981–2026 (46 winters, MERRA-2 T2M). Mean 25.19 °C.',
      'Sen’s slope +0.246 °C per decade, 95% CI +0.145 to +0.372, p = 0.00006 (drawer shows “< 0.001”): statistically significant.',
      'Prewhitening sensitivity check agrees (p = 0.002).',
      'The three warmest winters in the record (2024, 2016, 1998) were all El Niño winters.',
      'This series has not been compared with NASA Giovanni one by one (same code as the two that were).',
    ],
  },
  {
    id: 'demo-amazon-aod',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: { name: 'Amazon', lon: -60, lat: -5, regionId: 'amazon' },
      variable: 'aerosol_optical_depth',
      season: 'DJF',
    },
    title: 'Live: Amazon aerosols (haze), Dec–Feb',
    caption: { label: 'Amazon · Dec–Feb aerosols (haze)', value: '+0.010 AOD per decade', detail: 'p = 0.015 · same region, same winters' },
    supportNotes: [
      'Amazon, aerosol optical depth at 550 nm, Dec–Feb, 1981–2026 (46 winters, MERRA-2). Mean AOD 0.133.',
      'Sen’s slope +0.010 AOD per decade, 95% CI +0.004 to +0.016, p = 0.015: statistically significant.',
      'Same region and same winters as the warming: more haze and warmer air are found together. Associated, not a proven cause.',
      'Amazon rainfall and soil moisture trends over the same season are not significant (p = 0.21 and p = 0.22).',
    ],
  },
  {
    id: 'demo-alberta-soil',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' },
      variable: 'soil_moisture',
      season: 'DJF',
    },
    title: 'Live: Alberta / Prairies soil moisture, Dec–Feb',
    caption: { label: 'Alberta / Prairies · Dec–Feb soil moisture', value: '−1.80 kg/m² per decade', detail: 'p = 0.003 · 26 winters, 2001–2026' },
    supportNotes: [
      'Alberta / Prairies, topsoil moisture 0–10 cm, Dec–Feb, 2001–2026 (26 winters, GLDAS Noah v2.1). Mean 28.78 kg/m².',
      'Sen’s slope −1.80 kg/m² per decade, 95% CI −2.80 to −0.83, p = 0.003: statistically significant drying.',
      'Shorter record than the others (GLDAS v2.1 starts in 2000), so say so.',
      'Alberta winter temperature trend itself is not significant: +0.18 °C per decade, p = 0.29.',
      'Warmer winters, drier soils: associated, not a proven cause.',
    ],
  },
  {
    id: 'link',
    kind: 'story',
    scene: 'link',
    title: 'The why: El Niño links both places',
    headline: 'EL NIÑO. Amazon +0.82 °C and −0.95 mm/day; Alberta / Prairies +1.51 °C in El Niño winters.',
    supportNotes: [
      'Composite = El Niño winters minus La Niña winters, linearly detrended (temperature: 15 El Niño vs 20 La Niña winters; rainfall: 14 vs 19).',
      'Amazon: +0.82 °C (95% CI +0.53 to +1.12) and −0.95 mm/day (CI −1.27 to −0.65); both significant.',
      'Alberta / Prairies: +1.51 °C (CI +0.37 to +2.69), significant. Its soil-moisture difference (+0.46 kg/m²) is not significant.',
      'Method: permutation test (2,000), false discovery rate q = 0.10, bootstrap region intervals (2,000 resamples).',
      'Association, not causation: winters differ on average; it does not explain any single winter or the long-term trend.',
    ],
  },
  {
    id: 'demo-enso-normal',
    kind: 'demo',
    demo: { type: 'enso', hash: 'enso?mode=normal' },
    title: 'Live: the Pacific in a normal year',
    caption: { label: 'El Niño mode · a normal year', detail: 'Sea surface temperature, 1991–2020 average' },
    supportNotes: [
      'Normal year = 1991–2020 average sea surface temperature, absolute °C (12 monthly frames, −2 to 32 °C scale).',
      'Source: NOAA ERSST v6, 2° grid. Warm pool in the west Pacific, cold tongue in the east.',
      'El Niño is classified with the Relative Oceanic Niño Index (RONI), threshold ±0.5 °C.',
      'RONI history: 921 overlapping 3-month seasons (DJF 1950 to ASO 2026), 44 qualifying episodes.',
    ],
  },
  {
    id: 'demo-enso-elnino',
    kind: 'demo',
    demo: { type: 'enso', hash: 'enso?mode=el-nino' },
    title: 'Live: El Niño 1997–98',
    caption: { label: 'El Niño 1997–98', value: '+2.28 °C', detail: 'peak RONI · warm water spreads east' },
    supportNotes: [
      'Anomalies vs 1991–2020; 17 monthly frames, 1997-03 to 1998-07.',
      'Peak RONI +2.28 °C. The 1998 winter is one of the three warmest Amazon winters in our record.',
      'La Niña 2010–11 for contrast: RONI −1.63 °C. Full history: 574 monthly frames, 1979–2026.',
      'Latest season on record: ASO 2026, RONI +1.97 °C (El Niño). Observed history only.',
    ],
  },
  {
    id: 'demo-enso-impact',
    kind: 'demo',
    demo: { type: 'enso', hash: 'enso?region=alberta_prairies&map=t2m_DJF' },
    title: 'Live: El Niño impact map, winter temperature',
    caption: { label: 'El Niño winters minus La Niña winters', value: 'Alberta / Prairies +1.51 °C', detail: '95% CI +0.37 to +2.69' },
    supportNotes: [
      'Temperature, Dec–Feb: 15 El Niño winters minus 20 La Niña winters, detrended.',
      'Alberta / Prairies: +1.51 °C, 95% CI +0.37 to +2.69, statistically significant. Amazon on the same map: +0.82 °C.',
      'Rainfall map for contrast: Indonesia −1.10 mm/day, Amazon −0.95, East Africa +0.59.',
      'Dots mark cells that pass the false discovery rate check (q = 0.10).',
      'Association, not causation.',
    ],
  },
  {
    id: 'impact',
    kind: 'story',
    scene: 'impact',
    title: 'Impact: who it is for, and what is next',
    headline: 'Farmers. Students. Journalists. Local planners.',
    supportNotes: [
      'Users: anyone with a local question and no time to learn NetCDF: farmers, students, journalists, local planners.',
      'Each result can be saved, exported (CSV/JSON) and cited with its NASA source and DOI.',
      'Limits, stated up front: 2 of 40 regional series compared with NASA Giovanni; sub-period trends show no p-value yet; named regions are Dec–Feb only.',
      'Next: compare temperature, aerosols and soil moisture with Giovanni; all five seasons per region; sub-period significance.',
    ],
  },
  {
    id: 'close',
    kind: 'story',
    scene: 'close',
    title: 'Close: try it now',
    headline: 'TRENDTRACE. Click anywhere on Earth.',
    supportNotes: [
      'Live site: ' + LIVE_URL,
      'Data: NASA GES DISC (GPCP v3.3, MERRA-2, GLDAS v2.1), NOAA (ERSST v6, CPC RONI), Natural Earth.',
      'AI coding assistance disclosed. Trends are observed history; links are associations in the data.',
      'If asked “is it right?”: 26 of 26 browser-vs-Python parity checks, 2 regional series reproduced against NASA Giovanni.',
    ],
  },
];

export const STEP_COUNT = STEPS.length;

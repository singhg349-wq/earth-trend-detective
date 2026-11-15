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

export const OPENING_QUESTION =
  'Everyone says the climate is changing. Where? By how much? And how sure are we?';

/** Set to false to hide the QR code on the closing slide. */
export const SHOW_QR = true;

export const LIVE_URL = 'https://trendtrace.earth-trend-detective-frontend.workers.dev';

/* ------------------------------------------------------------------ */

export type SceneId =
  | 'question'
  | 'locked'
  | 'built'
  | 'method'
  | 'result'
  | 'impact'
  | 'close';

export type MetricVar = 'precipitation' | 'temperature' | 'aerosol_optical_depth' | 'soil_moisture';

export type DemoAction =
  | { type: 'landing' }
  | {
      type: 'investigation';
      place: { name: string; lon: number; lat: number; regionId: string | null };
      variable: MetricVar;
      season: string;
      compare?: {
        place: { name: string; lon: number; lat: number; regionId: string | null };
        variable: MetricVar;
        season: string;
      };
    }
  | { type: 'enso'; hash: string };

/** Small caption shown over the live app on demo steps. */
export interface DemoCaption {
  label: string;
  value?: string;
  detail?: string;
}

export interface PresentStep {
  id: string;
  kind: 'story' | 'demo';
  /** Phone-card title. */
  title: string;
  /** Story slides: headline shown on screen. */
  headline?: string;
  /** Story slides only: which designed scene to render. */
  scene?: SceneId;
  /** Progressive reveal count (1..N) on the same story slide. */
  reveal?: number;
  /** Demo steps only: which live app state to put on screen. */
  demo?: DemoAction;
  caption?: DemoCaption;
  /** Facts and methods that back up what is said on this step (phone cards). */
  supportNotes: string[];
}

/** Copy for the 6 story slides + closing slide. Numbers are real; see header. */
export const STORY = {
  eyebrow: '2026 NASA Space Apps · Be An Earth System Trend Detective!',
  question: {
    pill: '2026 NASA Space Apps · Be An Earth System Trend Detective!',
    lead: 'One interconnected Earth system — opposite local trends.',
    lines: ['What is changing?', 'Where & by how much?', 'Is it statistically significant?'],
    points: [
      'Even when the same global process drives both, one region can warm or dry while another shifts the opposite way.',
      'Our challenge: turn NASA mission & model variables into a tool anyone can use to test local trends — and separate real signals from noise.',
    ],
  },
  locked: {
    pill: 'The problem & NASA data',
    headline: '46 years of NASA estimates, locked inside 2,534 files.',
    files: 2534,
    datasets: [
      { name: 'Rainfall', detail: 'GPCP v3.3 · 1983–2025 · 516 monthly files (mm/day)' },
      { name: '2 m Temperature', detail: 'MERRA-2 reanalysis · 1980–2026 · 560 monthly files (°C)' },
      { name: 'Aerosols (haze)', detail: 'MERRA-2 550 nm AOD · 1980–2026 · 560 files (pre-2000 model-driven)' },
      { name: 'Topsoil moisture', detail: 'GLDAS Noah v2.1 · 2000–2026 · 319 files (v2.0 withheld: +0.47 kg/m² jump)' },
    ],
    barrierNote: 'Delivered as raw NetCDF grids — unreadable without code, seasonal averaging, and statistical tests.',
  },
  built: {
    pill: 'What we built · TrendTrace',
    headline: 'From raw NASA files to one click — zero server required.',
    stations: [
      { value: 2534, label: 'raw files', sub: 'NASA + NOAA monthly archives' },
      { value: 11055, label: 'map tiles', sub: '250.65 MB of 1° seasonal series' },
      { value: 64800, label: 'clickable cells', sub: '~0.3 ms browser trend test' },
    ],
    points: [
      'Click any 1° cell on the globe or search 25,000+ cities offline — full stats run in your browser.',
      '4 metrics × 5 seasons, 20 global anomaly timelapses, plus an El Niño atlas (NOAA RONI & ERSST v6).',
    ],
  },
  method: {
    pill: 'Statistical significance',
    headline: 'How do we see if a trend is statistically significant?',
    checks: [
      {
        name: '1. Mann–Kendall + Hamed–Rao (3 lags)',
        level: 'Checks at p < 0.05 (5% level)',
        note: 'Tests whether values rise or fall more consistently than year-to-year autocorrelation noise.',
      },
      {
        name: '2. Sen’s slope + 95% confidence interval',
        level: 'Checks 95% uncertainty range',
        note: 'Measures decadal rate of change robustly without assuming a straight line or normal data.',
      },
      {
        name: '3. Yue–Wang prewhitening check',
        level: 'Stricter sensitivity cross-check',
        note: 'Removes lag-1 persistence and flags a caution whenever the two tests disagree.',
      },
      {
        name: '4. Benjamini–Hochberg FDR + NASA Giovanni',
        level: 'Checks maps at q = 0.10 (10% FDR)',
        note: 'Controls false alarms across 64,800 cells, using a pipeline confirmed on NASA Giovanni.',
      },
    ],
  },
  result: {
    pill: 'Reading a full result',
    headline: 'One full result, labelled — plus what the data shows.',
    cardTitle: 'Amazon · Dec–Feb 2 m Temperature · 1981–2026 (MERRA-2)',
    labels: [
      { tag: '① Direction & rate', value: '+0.25 °C per decade', note: 'Sen’s slope over 46 winters' },
      { tag: '② 95% confidence interval', value: '+0.14 to +0.37 °C/decade', note: 'Entire interval is above zero' },
      { tag: '③ Significance verdict', value: 'p < 0.001 · Significant at 5%', note: 'Hamed–Rao & prewhitening agree; Giovanni-confirmed pipeline' },
    ],
    trends: [
      { place: 'Alberta soil moisture (DJF)', value: '−1.80 kg/m²/dec (p = 0.003)', note: 'Significant drying (26 winters, GLDAS v2.1)' },
      { place: 'Amazon aerosols (DJF)', value: '+0.010 AOD/dec (p = 0.015)', note: 'Significant (pre-2000 MODIS caveat noted)' },
      { place: 'Coastal Peru rainfall (DJF)', value: 'No clear trend (p = 0.52)', note: 'Honest null result — we do not colour noise' },
    ],
  },
  impact: {
    pill: 'Impact & who it is for',
    headline: 'Built for students, scientists, journalists, farmers — anyone with a local question.',
    points: [
      'No NetCDF or Python needed: get a plain-language verdict, uncertainty, and (i) glossary in seconds.',
      'Reproducible & open: export CSV/JSON, copy NASA source & DOI citations, inspect every statistical check.',
    ],
    nextTitle: 'What’s next',
    next: [
      'Expand individual Giovanni checks across temperature, aerosols & soil moisture',
      'All five seasons for named study regions + sub-period significance',
    ],
  },
  close: {
    giant: 'TRENDTRACE',
    line: 'Click anywhere on Earth. See what’s changing, and how sure we are.',
    url: 'trendtrace.earth-trend-detective-frontend.workers.dev',
    qrLabel: 'Try it now',
    credits: ['NASA GES DISC', 'GPCP v3.3', 'MERRA-2', 'GLDAS v2.1', 'NOAA ERSST v6', 'NOAA CPC RONI', 'Natural Earth', 'GeoNames'],
    footer: '2026 NASA Space Apps Challenge · Built with AI coding assistance. Trends reflect archive estimates; El Niño maps show associations.',
  },
} as const;

export const STEPS: PresentStep[] = [
  // ---- Slide 1: Question & Challenge (2 taps) ----
  {
    id: 'question-1',
    kind: 'story',
    scene: 'question',
    reveal: 1,
    title: 'Slide 1 (1/2): One Earth system, opposite trends',
    headline: 'One Earth system — opposite local trends. What is changing, where, by how much, and is it significant?',
    supportNotes: [
      '2026 NASA Space Apps Challenge: Be An Earth System Trend Detective!',
      'The same global driver (like El Niño) can push one region drier and another wetter at the exact same time.',
      'Press Next to tie directly into the problem and TrendTrace.',
    ],
  },
  {
    id: 'question-2',
    kind: 'story',
    scene: 'question',
    reveal: 2,
    title: 'Slide 1 (2/2): Challenge goal → Problem',
    headline: 'Separate real local signals from noise using NASA mission & model data.',
    supportNotes: [
      'Our goal: select NASA variables, visualize change over time, and test whether scientists would call it significant.',
      'Segue to Slide 2: the data to answer this already exists — but it is locked in 2,534 raw files.',
    ],
  },

  // ---- Slide 2: Problem & NASA Data (3 taps) ----
  {
    id: 'locked-1',
    kind: 'story',
    scene: 'locked',
    reveal: 1,
    title: 'Slide 2 (1/3): 46 years, 2,534 files',
    headline: STORY.locked.headline,
    supportNotes: [
      'GPCP v3.3 rainfall (516 monthly files, 1983–2025) and MERRA-2 2 m temperature (560 files, 1980–2026).',
      'Press Next to reveal Aerosols & Soil Moisture.',
    ],
  },
  {
    id: 'locked-2',
    kind: 'story',
    scene: 'locked',
    reveal: 2,
    title: 'Slide 2 (2/3): Aerosols & Soil Moisture',
    headline: STORY.locked.headline,
    supportNotes: [
      'MERRA-2 550 nm AOD (560 files; pre-2000 land AOD largely model-driven before MODIS).',
      'GLDAS Noah v2.1 topsoil moisture (319 files, 2000–2026). We audited v2.0 vs v2.1, found a +0.47 kg/m² jump, and withheld v2.0.',
    ],
  },
  {
    id: 'locked-3',
    kind: 'story',
    scene: 'locked',
    reveal: 3,
    title: 'Slide 2 (3/3): Why it was locked',
    headline: STORY.locked.headline,
    supportNotes: [
      'Raw NetCDF grids at 0.5° need code, seasonal averaging, and statistical testing to read.',
      'Next slide: how TrendTrace turns those 2,534 files into one click.',
    ],
  },

  // ---- Slide 3: What We Built (2 taps) ----
  {
    id: 'built-1',
    kind: 'story',
    scene: 'built',
    reveal: 1,
    title: 'Slide 3 (1/2): Files → Tiles → Cells',
    headline: STORY.built.headline,
    supportNotes: [
      '2,534 input files → 11,055 JSON tiles (250.65 MB) → 64,800 clickable 1° cells.',
      'Browser computes Sen’s slope, CI, and Mann–Kendall in ~0.3 ms with zero backend server.',
    ],
  },
  {
    id: 'built-2',
    kind: 'story',
    scene: 'built',
    reveal: 2,
    title: 'Slide 3 (2/2): Search, Timelapses & El Niño',
    headline: STORY.built.headline,
    supportNotes: [
      '25,000+ cities searchable offline, 4 metrics × 5 seasons, 20 seasonal anomaly timelapses.',
      'Plus a 76-year El Niño atlas (NOAA RONI 1950–2026 & ERSST v6) and 6 impact maps.',
    ],
  },

  // ---- Slide 4: How We Test Statistical Significance (4 taps) ----
  {
    id: 'method-1',
    kind: 'story',
    scene: 'method',
    reveal: 1,
    title: 'Slide 4 (1/4): Mann–Kendall + Hamed–Rao',
    headline: STORY.method.headline,
    supportNotes: [
      'Checks at p < 0.05 (5% level) whether values rise or fall more than year-to-year noise.',
      'Hamed–Rao (3 lags) corrects for autocorrelation so persistent climate years don’t inflate significance.',
    ],
  },
  {
    id: 'method-2',
    kind: 'story',
    scene: 'method',
    reveal: 2,
    title: 'Slide 4 (2/4): Sen’s slope + 95% CI',
    headline: STORY.method.headline,
    supportNotes: [
      'Median of all pairwise slopes — robust to extreme El Niño/La Niña outlier years.',
      'Shown with a 95% confidence interval so you see both speed and uncertainty.',
    ],
  },
  {
    id: 'method-3',
    kind: 'story',
    scene: 'method',
    reveal: 3,
    title: 'Slide 4 (3/4): Yue–Wang prewhitening',
    headline: STORY.method.headline,
    supportNotes: [
      'Stricter sensitivity check that removes lag-1 persistence before testing.',
      'If it disagrees with Hamed–Rao, the UI flags a caution rather than hiding borderline results.',
    ],
  },
  {
    id: 'method-4',
    kind: 'story',
    scene: 'method',
    reveal: 4,
    title: 'Slide 4 (4/4): FDR (q = 0.10) & Giovanni',
    headline: STORY.method.headline,
    supportNotes: [
      'Maps apply Benjamini–Hochberg FDR at q = 0.10 across thousands of cells.',
      'Aggregation & trend pipeline confirmed against NASA Giovanni reference series; 26/26 browser-vs-Python parity tests.',
    ],
  },

  // ---- Live Demo (5 step-by-step taps) ----
  {
    id: 'demo-landing',
    kind: 'demo',
    demo: { type: 'landing' },
    title: 'Demo 1/5: The live 3D globe',
    caption: { label: 'Live Globe', detail: '64,800 clickable 1° cells · 25,000+ cities offline' },
    supportNotes: [
      'Point out the 3D globe, ranking bar, and search bar.',
      'Next tap opens Alberta / Prairies soil moisture.',
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
    title: 'Demo 2/5: Alberta soil moisture (DJF)',
    caption: { label: 'Alberta / Prairies · Soil moisture (DJF)', value: '−1.80 kg/m²/dec', detail: 'p = 0.003 · 26 winters (GLDAS v2.1)' },
    supportNotes: [
      'Local Alberta/Prairies result: −1.80 kg/m² per decade (p = 0.003, 95% CI −2.80 to −0.83).',
      'Model-estimated 0–10 cm topsoil water (includes frozen winter moisture), 2001–2026.',
      'Next tap adds Amazon Temperature into Compare mode.',
    ],
  },
  {
    id: 'demo-compare-amazon',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' },
      variable: 'soil_moisture',
      season: 'DJF',
      compare: {
        place: { name: 'Amazon', lon: -60, lat: -5, regionId: 'amazon' },
        variable: 'temperature',
        season: 'DJF',
      },
    },
    title: 'Demo 3/5: Compare Alberta vs Amazon',
    caption: { label: 'Compare · Alberta Soil vs Amazon Temp', value: '+0.25 °C/dec', detail: 'Amazon DJF warming (p < 0.001) side by side' },
    supportNotes: [
      'Side-by-side comparison: Alberta soil drying (−1.80 kg/m²/dec) alongside Amazon winter warming (+0.25 °C/dec, p < 0.001).',
      'Different units use independent axes with no false difference claim.',
      'Next tap jumps to El Niño 1997–98 to show the Pacific link.',
    ],
  },
  {
    id: 'demo-enso-elnino',
    kind: 'demo',
    demo: { type: 'enso', hash: 'enso?mode=el-nino' },
    title: 'Demo 4/5: El Niño 1997–98 (Pacific link)',
    caption: { label: 'El Niño 1997–98 · Pacific link', value: '+2.28 °C RONI', detail: 'Shifts winters in both Amazon (+0.82 °C) & Alberta (+1.51 °C)' },
    supportNotes: [
      'One Pacific pattern connects both regions: El Niño winters warm the Amazon (+0.82 °C, −0.95 mm/day) and Alberta (+1.51 °C).',
      '1998, 2016, and 2024 — the three warmest Amazon winters — were all El Niño winters.',
      'Next tap opens the El Niño winter impact map for Alberta.',
    ],
  },
  {
    id: 'demo-enso-impact',
    kind: 'demo',
    demo: { type: 'enso', hash: 'enso?region=alberta_prairies&map=t2m_DJF' },
    title: 'Demo 5/5: El Niño impact map (Alberta)',
    caption: { label: 'El Niño − La Niña winters · Temp', value: 'Alberta +1.51 °C', detail: '95% CI +0.37 to +2.69 · 2,000 permutations + FDR' },
    supportNotes: [
      'Detrended composite: 15 El Niño winters minus 20 La Niña winters.',
      'Dots mark cells passing Benjamini–Hochberg FDR (q = 0.10). Association, not causation.',
    ],
  },

  // ---- Slide 5 (after demo): Full Annotated Result + Key Trends (4 taps) ----
  {
    id: 'result-1',
    kind: 'story',
    scene: 'result',
    reveal: 1,
    title: 'Slide 5 (1/4): Label ① Direction & rate',
    headline: STORY.result.headline,
    supportNotes: [
      'Every result starts with Sen’s slope: Amazon DJF temperature +0.25 °C per decade over 46 winters.',
    ],
  },
  {
    id: 'result-2',
    kind: 'story',
    scene: 'result',
    reveal: 2,
    title: 'Slide 5 (2/4): Label ② 95% confidence interval',
    headline: STORY.result.headline,
    supportNotes: [
      '95% CI (+0.14 to +0.37 °C/decade): the entire interval sits above zero.',
    ],
  },
  {
    id: 'result-3',
    kind: 'story',
    scene: 'result',
    reveal: 3,
    title: 'Slide 5 (3/4): Label ③ Significance verdict',
    headline: STORY.result.headline,
    supportNotes: [
      'p < 0.001 (significant at 5%): Hamed–Rao and Yue–Wang prewhitening agree, using our Giovanni-confirmed pipeline.',
    ],
  },
  {
    id: 'result-4',
    kind: 'story',
    scene: 'result',
    reveal: 4,
    title: 'Slide 5 (4/4): Real trends & honest contrast',
    headline: STORY.result.headline,
    supportNotes: [
      'Alberta soil drying −1.80 kg/m²/dec (p = 0.003); Amazon haze +0.010 AOD/dec (pre-2000 caveat).',
      'Coastal Peru DJF rainfall: No clear trend (p = 0.52) — we never colour noise as a trend.',
    ],
  },

  // ---- Slide 6: Who It's For & Impact (2 taps) ----
  {
    id: 'impact-1',
    kind: 'story',
    scene: 'impact',
    reveal: 1,
    title: 'Slide 6 (1/2): Who it is for',
    headline: STORY.impact.headline,
    supportNotes: [
      'Students, scientists, journalists, farmers, and local planners can check any place in seconds without NetCDF or Python.',
    ],
  },
  {
    id: 'impact-2',
    kind: 'story',
    scene: 'impact',
    reveal: 2,
    title: 'Slide 6 (2/2): Export, cite & what’s next',
    headline: STORY.impact.headline,
    supportNotes: [
      'Export CSV/JSON and copy NASA source + DOI citations.',
      'Next: expand individual Giovanni checks across all metrics, all 5 seasons per region, sub-period p-values.',
    ],
  },

  // ---- Slide 7: Closing Slide (1 tap) ----
  {
    id: 'close',
    kind: 'story',
    scene: 'close',
    reveal: 1,
    title: 'Slide 7: Try TrendTrace now',
    headline: 'TRENDTRACE. Click anywhere on Earth.',
    supportNotes: [
      'Live site: ' + LIVE_URL,
      '26/26 browser-vs-Python parity checks; pipeline confirmed against NASA Giovanni.',
      'Ready for judge Q&A.',
    ],
  },
];

export const STEP_COUNT = STEPS.length;

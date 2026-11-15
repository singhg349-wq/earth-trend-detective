/**
 * The Present-mode sequence: one data file shared by the in-app presenter and
 * the phone remote (frontend/scripts/gen-phone-cards.mjs turns it into cards).
 * Every number here comes from deck/FACTS.md, D:\trend-detective-data\raw,
 * data/artifacts/*.json, or data/artifacts/enso_history/impacts/index.json.
 * Keep this file free of imports so it can be transpiled standalone.
 */

export const OPENING_QUESTION =
  'Same planet. Opposite local trends. Which shifts are statistically significant?';

export const SHOW_QR = true;

export const LIVE_URL = 'https://trendtrace.earth-trend-detective-frontend.workers.dev';

export type SceneId =
  | 'question'
  | 'locked'
  | 'built'
  | 'method'
  | 'albertaCard'
  | 'compareCard'
  | 'impact'
  | 'close';

export type MetricVar = 'precipitation' | 'temperature' | 'aerosol_optical_depth' | 'soil_moisture';

export type DemoAction =
  | { type: 'landing' }
  | {
      type: 'workflow';
      place?: { name: string; lon: number; lat: number; regionId: string | null };
      variable?: MetricVar;
      season?: string;
    }
  | {
      type: 'investigation';
      place: { name: string; lon: number; lat: number; regionId: string | null };
      variable: MetricVar;
      season: string;
      scroll?: 'top' | 'chart';
      compare?: {
        place: { name: string; lon: number; lat: number; regionId: string | null };
        variable: MetricVar;
        season: string;
      };
    }
  | { type: 'library' }
  | { type: 'enso'; hash: string };

export interface DemoCaption {
  label: string;
  value?: string;
  detail?: string;
}

export interface PresentStep {
  id: string;
  kind: 'story' | 'demo';
  title: string;
  headline?: string;
  scene?: SceneId;
  reveal?: number;
  demo?: DemoAction;
  caption?: DemoCaption;
  supportNotes: string[];
}

export const STORY = {
  eyebrow: '2026 NASA Space Apps · Be An Earth System Trend Detective!',
  question: {
    pill: '2026 NASA Space Apps · Be An Earth System Trend Detective!',
    lead: 'Earth’s climate system is deeply interconnected — yet local trends often move in opposite directions.',
    lines: ['What is changing?', 'Where & by how much?', 'Is it statistically significant?'],
    points: [
      'A single global driver can warm or dry one region while pushing another the opposite way.',
      'Challenge objective: transform raw NASA mission & model archives into an accessible tool that tests local change with statistical rigor.',
    ],
  },
  locked: {
    pill: 'The problem & NASA archives',
    headline: '231.3 GB of raw NASA & NOAA archives — unreadable without code.',
    files: 2534,
    datasets: [
      { name: 'Rainfall · GPCP v3.3', detail: '1983–2025 · 516 monthly NetCDF files processed (mm/day)' },
      { name: '2 m Temperature · MERRA-2', detail: '1980–2026 · 560 monthly NetCDF files processed (°C)' },
      { name: 'Aerosols (haze) · MERRA-2 AOD', detail: '1980–2026 · 560 monthly files processed (pre-2000 model-driven)' },
      { name: 'Topsoil moisture · GLDAS v2.1', detail: '2000–2026 · 319 files (804 v2.0 files audited & withheld: +0.47 kg/m² jump)' },
    ],
    barrierNote: '8,970 raw files on disk (231.3 GB) across NASA GES DISC & NOAA — locked in gridded NetCDF formats.',
  },
  built: {
    pill: 'What we built · TrendTrace',
    headline: 'A Python pipeline distilled 231.3 GB into 11,055 browser-ready tiles.',
    stations: [
      { value: 2534, label: 'NetCDF & index files', sub: 'selected from 231.3 GB raw archive' },
      { value: 11055, label: 'JSON map tiles', sub: '250.65 MB · 4 metrics × 5 seasons' },
      { value: 64800, label: '1° global cells', sub: '~0.3 ms browser trend test' },
    ],
    points: [
      'Python (xarray, NumPy, SciPy) regridded, seasonally weighted, and packaged 64,800 cells × 5 seasons × 4 metrics + 809 timelapse PNGs.',
      'Zero backend required: click any 1° cell or search 25,000+ cities offline, with full statistical checks computed in-browser.',
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
        note: 'Measures decadal rate robustly without assuming linearity or normality.',
      },
      {
        name: '3. Yue–Wang prewhitening check',
        level: 'Stricter sensitivity cross-check',
        note: 'Removes lag-1 persistence and flags a caution whenever the two tests disagree.',
      },
      {
        name: '4. Benjamini–Hochberg FDR + NASA Giovanni',
        level: 'Checks maps at q = 0.10 (10% FDR)',
        note: 'Controls map false alarms across 64,800 cells, using a pipeline confirmed on NASA Giovanni.',
      },
    ],
  },
  albertaCard: {
    pill: 'Reading a full result · Alberta / Prairies',
    headline: 'A visual slope is not enough — here is how our model reads Alberta.',
    cardTitle: 'Alberta / Prairies · Dec–Feb 2 m Temperature · 1981–2026 (MERRA-2)',
    labels: [
      { tag: '① Apparent slope (Sen’s slope)', value: '+0.18 °C per decade', note: 'Looks like a slight warming line on the chart (+0.176 °C/dec)' },
      { tag: '② 95% confidence interval', value: '−0.33 to +0.73 °C/decade', note: 'Interval crosses zero — uncertainty spans both cooling and warming' },
      { tag: '③ Significance verdict', value: 'p = 0.29 · Not statistically significant', note: 'Fails the 5% threshold (prewhitening p = 0.33) → labelled “No clear trend”' },
    ],
  },
  compareCard: {
    pill: 'Why statistics matter · Side-by-side comparison',
    headline: 'Both graphs slope upward — only one is statistically significant.',
    left: {
      place: 'Alberta / Prairies · DJF Temp',
      slope: '+0.18 °C / decade',
      ci: '95% CI: −0.33 to +0.73',
      p: 'p = 0.29',
      verdict: 'Not significant (noise / variability)',
      sig: false,
    },
    right: {
      place: 'Amazon · DJF Temp',
      slope: '+0.25 °C / decade',
      ci: '95% CI: +0.14 to +0.37',
      p: 'p < 0.001',
      verdict: 'Statistically significant at 5%',
      sig: true,
    },
    takeaway: 'Eyeballing two upward lines misleads; Hamed–Rao + 95% CIs separate real regional warming from natural variability.',
  },
  impact: {
    pill: 'Impact & audience',
    headline: 'Built for researchers, planners, science journalists, and students.',
    points: [
      'Accessible scientific rigor: query any 1° cell in seconds with plain-language verdicts, uncertainty bounds, and inline glossary definitions.',
      'Reproducible by design: export CSV/JSON series, copy NASA source DOIs, and inspect every statistical check.',
    ],
    nextTitle: 'What’s next',
    next: [
      'Expand individual Giovanni comparisons across temperature, aerosols, and soil moisture',
      'All five seasons for named study regions + sub-period significance testing',
    ],
  },
  close: {
    giant: 'TRENDTRACE',
    line: 'Click anywhere on Earth. Quantify change. Verify significance.',
    url: 'trendtrace.earth-trend-detective-frontend.workers.dev',
    qrLabel: 'Try it now',
    credits: ['NASA GES DISC', 'GPCP v3.3', 'MERRA-2', 'GLDAS v2.1', 'NOAA ERSST v6', 'NOAA CPC RONI', 'Natural Earth', 'GeoNames'],
    footer: '2026 NASA Space Apps Challenge · Open-access climate trend verification powered by NASA Earthdata & NOAA archives. Statistical outputs reflect historical estimates and composite associations.',
  },
} as const;

export const STEPS: PresentStep[] = [
  // ---- Slide 1: Challenge & Segue (2 taps) ----
  {
    id: 'question-1',
    kind: 'story',
    scene: 'question',
    reveal: 1,
    title: 'Slide 1 (1/2): Interconnected Earth, opposite trends',
    headline: OPENING_QUESTION,
    supportNotes: [
      '2026 NASA Space Apps Challenge: Be An Earth System Trend Detective!',
      'Same global process can drive opposite regional shifts — we need statistical rigor to tell real trends from noise.',
    ],
  },
  {
    id: 'question-2',
    kind: 'story',
    scene: 'question',
    reveal: 2,
    title: 'Slide 1 (2/2): Challenge goal → Problem',
    headline: OPENING_QUESTION,
    supportNotes: [
      'Segue to Slide 2: the NASA data exists, but 231.3 GB of raw NetCDF files stand in the way.',
    ],
  },

  // ---- Slide 2: 231.3 GB Raw Archives (3 taps) ----
  {
    id: 'locked-1',
    kind: 'story',
    scene: 'locked',
    reveal: 1,
    title: 'Slide 2 (1/3): 231.3 GB archive — Rainfall & Temp',
    headline: STORY.locked.headline,
    supportNotes: [
      'GPCP v3.3 rainfall (516 files) and MERRA-2 2 m temperature (560 files).',
    ],
  },
  {
    id: 'locked-2',
    kind: 'story',
    scene: 'locked',
    reveal: 2,
    title: 'Slide 2 (2/3): Aerosols & Soil Moisture (v2.0 audit)',
    headline: STORY.locked.headline,
    supportNotes: [
      'MERRA-2 550 nm AOD (560 files; pre-2000 model-driven caveat).',
      'GLDAS v2.1 soil moisture (319 files; audited 804 v2.0 files, found +0.47 kg/m² jump, withheld v2.0).',
    ],
  },
  {
    id: 'locked-3',
    kind: 'story',
    scene: 'locked',
    reveal: 3,
    title: 'Slide 2 (3/3): 8,970 raw files on disk',
    headline: STORY.locked.headline,
    supportNotes: [
      '8,970 raw files on disk (231.3 GB) across NASA GES DISC & NOAA.',
    ],
  },

  // ---- Slide 3: Python Pipeline (2 taps) ----
  {
    id: 'built-1',
    kind: 'story',
    scene: 'built',
    reveal: 1,
    title: 'Slide 3 (1/2): Python pipeline (231.3 GB → 11,055 tiles)',
    headline: STORY.built.headline,
    supportNotes: [
      'Python (xarray, NumPy, SciPy) processed 2,534 NetCDF/index files into 11,055 JSON tiles (250.65 MB) covering 64,800 1° cells × 5 seasons × 4 metrics.',
    ],
  },
  {
    id: 'built-2',
    kind: 'story',
    scene: 'built',
    reveal: 2,
    title: 'Slide 3 (2/2): Zero backend, ~0.3 ms in-browser math',
    headline: STORY.built.headline,
    supportNotes: [
      '25,000+ offline cities, 809 timelapse PNGs, and an El Niño atlas — all static.',
    ],
  },

  // ---- Slide 4: How Do We See If a Trend Is Statistically Significant? (4 taps) ----
  {
    id: 'method-1',
    kind: 'story',
    scene: 'method',
    reveal: 1,
    title: 'Slide 4 (1/4): Mann–Kendall + Hamed–Rao (p < 0.05)',
    headline: STORY.method.headline,
    supportNotes: [
      'Checks at p < 0.05 (5% level) with 3-lag autocorrelation correction.',
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
      'Robust median pairwise slope + 95% confidence interval.',
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
      'Stricter sensitivity check; flags caution if it disagrees.',
    ],
  },
  {
    id: 'method-4',
    kind: 'story',
    scene: 'method',
    reveal: 4,
    title: 'Slide 4 (4/4): Benjamini–Hochberg FDR (q = 0.10) & Giovanni',
    headline: STORY.method.headline,
    supportNotes: [
      'Maps check at q = 0.10 FDR; pipeline confirmed against NASA Giovanni.',
    ],
  },

  // ---- Extra-Granular Live Demo + Annotated Cards ----
  {
    id: 'demo-landing',
    kind: 'demo',
    demo: { type: 'landing' },
    title: 'Demo 1/12: Live 3D globe',
    caption: { label: 'Live Globe', detail: '64,800 clickable 1° cells · Let’s investigate Alberta' },
    supportNotes: [
      'Show the 3D globe and ranking bar. Next tap opens the Investigation panel.',
    ],
  },
  {
    id: 'demo-workflow-open',
    kind: 'demo',
    demo: { type: 'workflow' },
    title: 'Demo 2/12: Open Investigation builder',
    caption: { label: 'Step 1 · Open Investigation', detail: 'Pick Place → Metric → Season → Run' },
    supportNotes: [
      'Show how a user starts an investigation step by step. Next tap selects Alberta / Prairies.',
    ],
  },
  {
    id: 'demo-workflow-place',
    kind: 'demo',
    demo: {
      type: 'workflow',
      place: { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' },
    },
    title: 'Demo 3/12: Select Alberta / Prairies',
    caption: { label: 'Step 2 · Place = Alberta / Prairies', detail: 'Next: pick Temperature & Dec–Feb' },
    supportNotes: [
      'Selected Alberta / Prairies. Next tap sets Temperature (MERRA-2) & DJF.',
    ],
  },
  {
    id: 'demo-workflow-metric',
    kind: 'demo',
    demo: {
      type: 'workflow',
      place: { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' },
      variable: 'temperature',
      season: 'DJF',
    },
    title: 'Demo 4/12: Select Temperature & DJF',
    caption: { label: 'Step 3 · Temperature (MERRA-2) · DJF', detail: 'Ready to run full 46-winter analysis' },
    supportNotes: [
      'Selected 2 m Temperature and Dec–Feb (DJF). Next tap clicks Run.',
    ],
  },
  {
    id: 'demo-alberta-run',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' },
      variable: 'temperature',
      season: 'DJF',
      scroll: 'top',
    },
    title: 'Demo 5/12: Alberta Temperature result',
    caption: { label: 'Alberta / Prairies · DJF Temperature', value: '+0.18 °C/dec', detail: 'p = 0.29 · No clear trend' },
    supportNotes: [
      'Top of result: +0.18 °C/dec looks positive, but p = 0.29 → "No clear trend". Next tap scrolls to the graph.',
    ],
  },
  {
    id: 'demo-alberta-scroll',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' },
      variable: 'temperature',
      season: 'DJF',
      scroll: 'chart',
    },
    title: 'Demo 6/12: Scroll to Alberta graph & checks',
    caption: { label: 'Alberta · Time series & checks', value: 'p = 0.29', detail: '95% CI −0.33 to +0.73 crosses zero' },
    supportNotes: [
      'Show the 46-winter series and statistical checks. Next tap explains this result on a labelled card.',
    ],
  },

  // ---- Mid-Demo Card 1: Annotated Alberta Result (3 progressive taps) ----
  {
    id: 'alberta-card-1',
    kind: 'story',
    scene: 'albertaCard',
    reveal: 1,
    title: 'Card 1 (1/3): Apparent slope (+0.18 °C/dec)',
    headline: STORY.albertaCard.headline,
    supportNotes: [
      'Point out: the slope is +0.18 °C/dec — visually it looks like warming.',
    ],
  },
  {
    id: 'alberta-card-2',
    kind: 'story',
    scene: 'albertaCard',
    reveal: 2,
    title: 'Card 1 (2/3): 95% CI crosses zero',
    headline: STORY.albertaCard.headline,
    supportNotes: [
      '95% CI is −0.33 to +0.73 °C/decade — it crosses zero.',
    ],
  },
  {
    id: 'alberta-card-3',
    kind: 'story',
    scene: 'albertaCard',
    reveal: 3,
    title: 'Card 1 (3/3): p = 0.29 → Not significant',
    headline: STORY.albertaCard.headline,
    supportNotes: [
      'p = 0.29 fails the 5% level. There is a visual slope, but it is NOT statistically significant.',
      'Next tap compares Alberta side-by-side with Amazon Temperature.',
    ],
  },

  // ---- Compare Alberta vs Amazon ----
  {
    id: 'demo-compare-top',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' },
      variable: 'temperature',
      season: 'DJF',
      scroll: 'top',
      compare: {
        place: { name: 'Amazon', lon: -60, lat: -5, regionId: 'amazon' },
        variable: 'temperature',
        season: 'DJF',
      },
    },
    title: 'Demo 7/12: Compare Alberta vs Amazon (Temperature)',
    caption: { label: 'Compare · Alberta vs Amazon (DJF Temp)', value: '+0.18 vs +0.25 °C/dec', detail: 'Same metric, shared axis' },
    supportNotes: [
      'Both regions side by side on the exact same Temperature metric. Next tap scrolls down to compare both graphs.',
    ],
  },
  {
    id: 'demo-compare-scroll',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' },
      variable: 'temperature',
      season: 'DJF',
      scroll: 'chart',
      compare: {
        place: { name: 'Amazon', lon: -60, lat: -5, regionId: 'amazon' },
        variable: 'temperature',
        season: 'DJF',
      },
    },
    title: 'Demo 8/12: Scroll to Compare graphs',
    caption: { label: 'Compare graphs · p = 0.29 vs p < 0.001', detail: 'Both lines slope up — only one is significant' },
    supportNotes: [
      'Scroll down to show both graphs. Next tap brings up the side-by-side p-value comparison card.',
    ],
  },

  // ---- Mid-Demo Card 2 (before Library): Graphs & p-values Comparison ----
  {
    id: 'compare-card',
    kind: 'story',
    scene: 'compareCard',
    reveal: 1,
    title: 'Card 2: Graphs, p-values & significance compared',
    headline: STORY.compareCard.headline,
    supportNotes: [
      'Looking at just the lines, both look upward. Our model proves Alberta (p = 0.29) is not significant while Amazon (p < 0.001) is.',
      'Next tap opens the Library.',
    ],
  },

  // ---- Library & El Niño Segue ----
  {
    id: 'demo-library',
    kind: 'demo',
    demo: { type: 'library' },
    title: 'Demo 9/12: Library (saved investigations)',
    caption: { label: 'Library · Saved investigations & presets', detail: 'Reopen, compare, or jump straight to El Niño' },
    supportNotes: [
      'Show the Library quickly: saved investigations and one-click presets.',
      'Segue: why do winters swing so much in Alberta & Amazon? Next tap opens the El Niño impact map.',
    ],
  },
  {
    id: 'demo-enso-impact',
    kind: 'demo',
    demo: { type: 'enso', hash: 'enso?region=alberta_prairies&map=t2m_DJF' },
    title: 'Demo 10/12: El Niño winter impact map (Alberta +1.51 °C)',
    caption: { label: 'El Niño − La Niña winters · Temp', value: 'Alberta +1.51 °C', detail: 'Amazon +0.82 °C · Same Pacific driver' },
    supportNotes: [
      'Segue from winter variability: El Niño winters warm Alberta by +1.51 °C (CI +0.37 to +2.69) and Amazon by +0.82 °C.',
      '15 El Niño vs 20 La Niña winters, detrended, 2,000 permutations + FDR (q = 0.10).',
    ],
  },

  // ---- Slide 6: Impact & Audience (2 taps) ----
  {
    id: 'impact-1',
    kind: 'story',
    scene: 'impact',
    reveal: 1,
    title: 'Slide 6 (1/2): Researchers, planners, journalists, students',
    headline: STORY.impact.headline,
    supportNotes: [
      'Accessible scientific rigor without NetCDF or Python.',
    ],
  },
  {
    id: 'impact-2',
    kind: 'story',
    scene: 'impact',
    reveal: 2,
    title: 'Slide 6 (2/2): Export, DOIs & what’s next',
    headline: STORY.impact.headline,
    supportNotes: [
      'CSV/JSON export, NASA DOI citations, and next steps.',
    ],
  },

  // ---- Slide 7: Closing Slide ----
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
    ],
  },
];

export const STEP_COUNT = STEPS.length;

/**
 * The Present-mode sequence: one data file shared by the in-app presenter and
 * the phone remote (frontend/scripts/gen-phone-cards.mjs turns it into cards).
 * Every number here comes from deck/FACTS.md, D:\trend-detective-data\raw,
 * data/artifacts/*.json, or data/artifacts/enso_history/impacts/index.json.
 * Keep this file free of imports so it can be transpiled standalone.
 */

export const OPENING_QUESTION =
  'Be An Earth System Trend Detective!';

export const SHOW_QR = true;

export const LIVE_URL = 'https://trendtrace.earth-trend-detective-frontend.workers.dev';

export type SceneId =
  | 'question'
  | 'locked'
  | 'built'
  | 'caseIntro'
  | 'method'
  | 'ensoBridge'
  | 'impact'
  | 'close';

export type MetricVar = 'precipitation' | 'temperature' | 'aerosol_optical_depth' | 'soil_moisture';

export interface DemoRing {
  key: string;
  to: string;
  label?: string;
  tone?: 'amber' | 'mint' | 'coral';
}

export interface UpsertDemoInput {
  id: string;
  name: string;
  mode: 'explore' | 'compare';
  regionIds: string[];
  slots: Array<{ regionId: string; variable: string; season: string; period: string }>;
  notes: string;
  tags: string[];
}

export type DemoPeriod = 'full' | 'first-half' | 'second-half';

export interface DemoPlace {
  name: string;
  lon: number;
  lat: number;
  regionId: string | null;
}

export type DemoAction =
  | { type: 'landing' }
  /** Stop the globe, fly it to a place and drop a labelled pin there. */
  | { type: 'fly'; place: DemoPlace; zoom?: number }
  | {
      type: 'workflow';
      place?: DemoPlace;
      variable?: MetricVar;
      season?: string;
      period?: DemoPeriod;
    }
  | {
      type: 'investigation';
      place: { name: string; lon: number; lat: number; regionId: string | null };
      variable: MetricVar;
      season: string;
      scroll?: 'top' | 'chart';
      tab?: 'standard' | 'expert' | 'sources' | 'notes';
      typedNote?: string;
      typedName?: string;
      typedTags?: string[];
      /** Auto-open the "Why?" breakdown on the result card. */
      openWhy?: boolean;
      compare?: {
        place: { name: string; lon: number; lat: number; regionId: string | null };
        variable: MetricVar;
        season: string;
      };
    }
  | { type: 'library'; tab?: 'catalog' | 'saved'; upsertDemo?: UpsertDemoInput }
  | { type: 'enso'; hash: string }
  | { type: 'timelapse'; variable: string; season: string; place?: { name: string; lon: number; lat: number } };

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
  rings?: DemoRing[];
  caption?: DemoCaption;
  supportNotes: string[];
}

export const STORY = {
  eyebrow: 'Team One · 2026 NASA Space Apps · Be An Earth System Trend Detective!',
  tagline: 'Four NASA variables. Every 1° cell. Five seasons. Statistically tested.',
  question: {
    pill: 'Team One · 2026 NASA Space Apps',
    hero: 'Be An Earth System Trend Detective!',
    lead: 'Earth’s climate system is interconnected — yet local trends often move in opposite directions.',
    lines: ['What is changing?', 'Where & by how much?', 'Is it statistically significant?'],
  },
  locked: {
    pill: 'Why it’s locked · 231.3 GB raw archives',
    peruLink:
      'You just watched 43 years of Peru rainfall tested in 0.3 ms. But the raw data behind that click is locked across 8,970 raw files (231.3 GB) behind Earthdata logins, with mismatched spatial grids and units.',
    headline: '231.3 GB in NetCDF/HDF5 behind Earthdata logins — with mismatched grids and units.',
    datasets: [
      { name: 'Rainfall · GPCP v3.3', detail: '1983–2025 · 516 monthly NetCDF files (mm/day)' },
      { name: '2 m Temperature · MERRA-2', detail: '1980–2026 · 560 monthly NetCDF files (°C)' },
      { name: 'Aerosols · MERRA-2 AOD', detail: '1980–2026 · 560 files · land AOD pre-2000 is model-driven' },
      { name: 'Soil moisture · GLDAS v2.1', detail: '2000–2026 · 319 files · land-only' },
    ],
    barrierNote: '8,970 raw files · 231.3 GB across NASA GES DISC & NOAA — unreadable without code.',
    limits: [
      'GLDAS v2.0: 804 files withheld after we caught a +0.47 kg/m² discontinuity at the v2.0/v2.1 join.',
      'MERRA-2 land AOD before 2000 is mostly model-driven: use the “Second half” (2003–2026) period for observed-era trends.',
    ],
  },
  built: {
    pill: 'What we built · TrendTrace',
    headline: 'One Python pipeline distilled 231.3 GB into 11,055 tiles.',
    peruLink: 'That Peru click read one of these tiles: 43 annual GPCP values for one 1° cell, already regridded and season-weighted.',
    pipeline: [
      'Earthdata',
      'xarray regrid 1°',
      'seasonal weighting',
      'MK + Hamed–Rao',
      '11,055 JSON tiles',
      'your browser (0.3 ms)',
    ],
    stations: [
      { value: 8970, label: 'raw NASA & NOAA files', sub: '231.3 GB archive' },
      { value: 11055, label: 'JSON map tiles', sub: '250.65 MB · 4 metrics × 5 seasons' },
      { value: 64800, label: '1° global cells', sub: 'every cell where the dataset exists (soil moisture is land-only)' },
    ],
    points: [
      'Four NASA variables. Every 1° cell. Five seasons. Statistically tested.',
    ],
  },
  caseIntro: {
    pill: 'Case study · Alberta / Prairies winters',
    lines: [
      'Let’s go through a case: what happens when we check Alberta’s winter temperature over 46 years?',
      'At first glance, the line slopes upward (+0.18 °C/decade). Is that real warming — or winter noise?',
    ],
    chips: ['MERRA-2 2 m temperature', 'Dec–Feb (DJF)', '1980–2026 · 46 winters', 'Area-weighted region'],
  },
  method: {
    pill: 'Why Alberta isn’t significant · How we checked',
    headline: 'Why Alberta isn’t significant — and how our tests check every trend.',
    whyTests:
      'Rank-based tests, not OLS: climate series are non-normal, have outliers, and neighbouring years are autocorrelated.',
    albertaVotes: [
      {
        morph: 'slope',
        name: 'Sen’s slope + Hamed–Rao (3 lags)',
        level: 'Checks at p < 0.05 (5% level)',
        vote: 'Hamed–Rao p = 0.29 ✗',
        pass: false,
        note: 'Slope is +0.18 °C/decade (+0.8 °C over 46 winters), but fails p < 0.05 against autocorrelation-adjusted noise.',
      },
      {
        morph: 'ci',
        name: '95% confidence interval',
        level: 'Checks if range excludes zero',
        vote: '95% CI −0.33…+0.73 ✗',
        pass: false,
        note: 'Interval crosses zero — both cooling and warming remain plausible in Alberta DJF.',
      },
      {
        morph: 'p',
        name: 'Yue–Wang prewhitening check',
        level: 'Stricter cross-check',
        vote: 'Yue–Wang p = 0.33 ✗',
        pass: false,
        note: 'Both Hamed–Rao (0.29) and Yue–Wang (0.33) agree: not statistically significant.',
      },
    ],
    signalVsNoise: {
      label: 'Alberta DJF signal vs year-to-year winter swing',
      signal: 0.8,
      noise: 2.2,
      noiseLabel: '1 SD = 2.2 °C typical winter swing',
      caption: '0.8 °C total 46-year change vs 2.2 °C typical winter swing (1 SD) → signal buried in natural variability.',
    },
    validationNote:
      'Pipeline validated 26/26 browser-vs-Python checks; GPCP rainfall series cross-checked against NASA Giovanni; BH FDR q = 0.10 across maps.',
    scaleNote: '25,000+ cities & 1° cells for local discovery; 10 area-weighted regions for statistical power.',
    thresholds: {
      title: 'Choose significance strictness',
      levels: [
        { cut: 'p < 0.01', name: 'Strict', desc: 'Fewer false alarms; only strong trends pass', tier: 'strict' as const },
        { cut: 'p < 0.05', name: 'Standard (default)', desc: 'Balanced check against autocorrelation-adjusted noise', tier: 'standard' as const },
        { cut: 'p < 0.10', name: 'Exploratory', desc: 'Catches weaker/emerging signals; higher false-positive risk', tier: 'exploratory' as const },
      ],
      fdr: 'Plus map-wide BH FDR (q = 0.10) controlling false discoveries across 64,800 cells.',
    },
    otherWays: [
      'Switch season on any 1° cell (all five seasons)',
      'Compare side-by-side with a lower-noise region (Amazon)',
      'Check the El Niño teleconnection driver',
    ],
  },
  ensoBridge: {
    pill: 'Why are Alberta winters so noisy? · Global climate drivers',
    headline: 'Alberta’s winter swings have a Pacific teleconnection.',
    lead: 'El Niño is one Pacific phenomenon we’re considering that could explain Alberta’s winter swings — and we will expand TrendTrace to compare with other global drivers too (NAO, PDO, IOD).',
    regular: {
      title: 'Regular winters',
      points: [
        'Pacific trade winds blow steadily west; the warm pool stays near Asia.',
        'The jet stream keeps its usual path, so Alberta’s seasonal swings stay balanced around normal.',
      ],
    },
    elNino: {
      title: 'El Niño winters',
      value: '+1.5 °C',
      points: [
        'Trade winds weaken and warm water spreads east across the tropical Pacific.',
        'The jet stream shifts north: Alberta winters run +1.5 °C warmer on average, amplifying seasonal swings.',
      ],
    },
    future: {
      title: 'Expand TrendTrace to other global drivers',
      items: ['NAO · North Atlantic Oscillation', 'PDO · Pacific Decadal Oscillation', 'IOD · Indian Ocean Dipole'],
      note: 'Same architecture: any global oscillation index → composite on every 1° cell → local trend context.',
    },
  },
  impact: {
    pill: 'Impact & audience · 4 NASA variables across 64,800 cells',
    headline: 'Built for researchers, planners, science journalists, and students.',
    points: [
      'Full exploration suite: 25,000+ cities search, 43-year global map timelapses, BH FDR (q = 0.10) spatial trend maps, and all 4 NASA variables (Rainfall, 2 m Temp, Aerosols, Soil Moisture).',
      'Accessible scientific rigor: plain-language takeaways, Hamed–Rao & Sen slope uncertainty bounds, and inline glossary terms for every 1° cell.',
      'Escalate in one flow: Search or click → Compare → Save notes → Export CSV/JSON + DOI.',
    ],
    nextTitle: 'What’s next',
    next: [
      'Extend Giovanni cross-checks to temperature, aerosols, and soil moisture',
      'All five seasons for named study regions + sub-period significance testing',
    ],
  },
  close: {
    giant: 'TRENDTRACE',
    team: 'Team One',
    line: 'Click anywhere on Earth or search 25,000+ cities. 4 NASA variables, global timelapses & BH FDR (q = 0.10) maps.',
    url: 'trendtrace.earth-trend-detective-frontend.workers.dev',
    qrLabel: 'Try it now',
    credits: ['NASA GES DISC', 'GPCP v3.3', 'MERRA-2', 'GLDAS v2.1', 'NOAA ERSST v6', 'NOAA CPC RONI', 'Natural Earth', 'GeoNames'],
  },
} as const;

/** Central-Peru 1° land cell (9.5°S, 74.5°W): 43/43 valid GPCP years, 1983–2025 (ANN). */
const PERU: DemoPlace = { name: 'Peru (10°S, 75°W)', lon: -75, lat: -10, regionId: null };
const ALBERTA = { name: 'Alberta / Prairies', lon: -108, lat: 54, regionId: 'alberta_prairies' };
const AMAZON = { name: 'Amazon', lon: -60, lat: -5, regionId: 'amazon' };
const SAVED_NOTE = 'Similar warming slope, 3× the noise. Check El Niño.';
const SAVED_NAME = 'Alberta / Prairies vs Amazon';
const SAVED_TAGS = ['DJF temperature'];

export const STEPS: PresentStep[] = [
  // ---- Slide 1: Challenge intro ----
  {
    id: 'question-1',
    kind: 'story',
    scene: 'question',
    reveal: 1,
    title: 'Slide 1: Challenge intro — Be An Earth System Trend Detective!',
    headline: STORY.question.hero,
    supportNotes: [
      'Team One · 2026 NASA Space Apps Challenge: Be An Earth System Trend Detective!',
      'Giovanni and Climate Reanalyzer plot the series; they don’t give an autocorrelation-corrected verdict or an FDR map. Let’s show TrendTrace live first.',
    ],
  },

  // ---- Step 2: Live site opening + Peru 1° cell walkthrough (5 taps) ----
  {
    id: 'demo-open-site',
    kind: 'demo',
    demo: { type: 'landing' },
    title: 'Demo 1/5: Open TrendTrace live',
    caption: { label: 'TrendTrace · Live global explorer', detail: '64,800 1° cells · 4 NASA variables · 5 seasons' },
    supportNotes: [
      'This is TrendTrace running live in the browser: 64,800 1° cells across the globe, four NASA variables, five seasons, all statistically tested.',
    ],
  },
  {
    id: 'demo-peru-fly',
    kind: 'demo',
    demo: { type: 'fly', place: PERU, zoom: 3.2 },
    rings: [{ key: 'peru-pin', to: '[data-anchor="globe-pin"]', label: 'Peru · one 1° cell', tone: 'amber' }],
    title: 'Demo 2/5: Fly to Peru (1° cell)',
    caption: { label: 'Fly to Peru (1° cell)', detail: '9.5°S, 74.5°W · one of 64,800 global cells' },
    supportNotes: [
      'Let’s pick one spot on Earth: central Peru, where the Andes meet the Amazon. Every 1° cell like this one has its own tested trend.',
    ],
  },
  {
    id: 'demo-peru-metric',
    kind: 'demo',
    demo: { type: 'workflow', place: PERU, variable: 'precipitation', season: 'ANN' },
    rings: [
      { key: 'metrics', to: '.investigation-panel [aria-label="Metric"]', label: '4 NASA variables', tone: 'amber' },
      { key: 'rainfall', to: '.investigation-panel [aria-label="Metric"] .is-active', label: 'Rainfall ✓', tone: 'mint' },
    ],
    title: 'Demo 3/5: Pick a variable — Rainfall',
    caption: { label: '1/4 variables · Select Rainfall', detail: 'Rainfall · 2 m Temp · Aerosols · Soil Moisture' },
    supportNotes: [
      'Clicking Peru opens the investigation. Four NASA variables: GPCP rainfall, MERRA-2 temperature and aerosols, GLDAS soil moisture. We pick Rainfall.',
    ],
  },
  {
    id: 'demo-peru-period',
    kind: 'demo',
    demo: { type: 'workflow', place: PERU, variable: 'precipitation', season: 'ANN', period: 'full' },
    rings: [
      { key: 'period', to: '.investigation-panel [aria-label="Period"] .is-active', label: 'Full record · 1983–2025', tone: 'mint' },
    ],
    title: 'Demo 4/5: Full 43-year record',
    caption: { label: 'Time period · Full 43-year record (1983–2025)', detail: 'Annual rainfall · every GPCP year' },
    supportNotes: [
      'Annual season, full record: 43 years of GPCP v3.3 rainfall, 1983 to 2025. First-half, second-half, and custom year ranges are one click away.',
    ],
  },
  {
    id: 'demo-peru-result',
    kind: 'demo',
    demo: { type: 'investigation', place: PERU, variable: 'precipitation', season: 'ANN', scroll: 'top' },
    rings: [
      { key: 'peru-slope', to: '[data-anchor="slope"]', label: '−0.11 mm/day per decade', tone: 'amber' },
      { key: 'peru-p', to: '[data-anchor="p"]', label: 'p = 0.47 · not significant', tone: 'coral' },
    ],
    title: 'Demo 5/5: Peru rainfall result',
    caption: { label: 'Peru 1° cell · Rainfall 1983–2025 in 0.3 ms', value: '−0.11 mm/day/dec', detail: '43 years · p = 0.47 · no clear trend' },
    supportNotes: [
      'Sen slope −0.11 mm/day per decade on a 6.0 mm/day mean; Hamed–Rao p = 0.47, so no clear trend. 43 real GPCP values, tested in your browser.',
      'Fallback if the cell is slow: search “Lima” and Run. Never click soil moisture over ocean or ice.',
    ],
  },

  // ---- Slides 2–3 (compressed) ----
  {
    id: 'locked-1',
    kind: 'story',
    scene: 'locked',
    reveal: 1,
    title: 'Slide 2 (1/2): Why it’s locked — four NASA archives',
    headline: STORY.locked.headline,
    supportNotes: [
      'You just watched 43 years of Peru rainfall tested in 0.3 ms. But the raw data is locked across 8,970 raw NASA files (231.3 GB) of NetCDF/HDF5 behind Earthdata logins, with mismatched grids and units.',
    ],
  },
  {
    id: 'locked-2',
    kind: 'story',
    scene: 'locked',
    reveal: 2,
    title: 'Slide 2 (2/2): Data limitations we found and flagged',
    headline: STORY.locked.headline,
    supportNotes: [
      'GLDAS v2.0: 804 files withheld because of a +0.47 kg/m² jump where v2.0 meets v2.1.',
      'MERRA-2 land AOD before 2000 is model-driven; the “Second half” 2003–2026 toggle shows the observed era.',
    ],
  },
  {
    id: 'built-1',
    kind: 'story',
    scene: 'built',
    reveal: 1,
    title: 'Slide 3: One Python pipeline → 11,055 tiles',
    headline: STORY.built.headline,
    supportNotes: [
      'Earthdata → xarray regrid 1° → seasonal weighting → MK + Hamed–Rao → 11,055 JSON tiles → browser (0.3 ms for the 43-point trend test).',
      'The Peru click read one of these 11,055 tiles. Four NASA variables. Every 1° cell. Five seasons. Statistically tested. Now: how sure are we about one result?',
    ],
  },

  // ---- Case study intro (2 taps) ----
  {
    id: 'caseIntro-1',
    kind: 'story',
    scene: 'caseIntro',
    reveal: 1,
    title: 'Case study (1/2): Alberta winter temperature',
    headline: STORY.caseIntro.lines[0],
    supportNotes: [
      'Let’s go through a case: what happens when we check Alberta’s winter temperature over 46 years?',
    ],
  },
  {
    id: 'caseIntro-2',
    kind: 'story',
    scene: 'caseIntro',
    reveal: 2,
    title: 'Case study (2/2): Real warming or winter noise?',
    headline: STORY.caseIntro.lines[1],
    supportNotes: [
      'At first glance, the line slopes upward (+0.18 °C/decade). Is that real warming — or winter noise? Next tap runs it live.',
    ],
  },

  // ---- Demo deep dive: Alberta ----
  {
    id: 'demo-alberta-run',
    kind: 'demo',
    demo: { type: 'investigation', place: ALBERTA, variable: 'temperature', season: 'DJF', scroll: 'top' },
    rings: [
      { key: 'slope', to: '[data-anchor="slope"]', label: '① +0.18 °C/dec', tone: 'amber' },
      { key: 'ci', to: '[data-anchor="ci"]', label: '② 95% CI crosses 0', tone: 'coral' },
      { key: 'p', to: '[data-anchor="p"]', label: '③ p = 0.29 (not sig)', tone: 'coral' },
    ],
    title: 'Demo 1/7: Alberta DJF temperature + rings',
    caption: { label: 'Alberta / Prairies · DJF Temp', value: '+0.18 °C/dec', detail: 'p = 0.29 · CI crosses zero' },
    supportNotes: [
      'Slope +0.18 °C/decade, 95% CI −0.33 to +0.73, p = 0.29 → “No clear trend”.',
    ],
  },
  {
    id: 'demo-alberta-why',
    kind: 'demo',
    demo: { type: 'investigation', place: ALBERTA, variable: 'temperature', season: 'DJF', scroll: 'top', openWhy: true },
    rings: [
      { key: 'why', to: '[data-anchor="why-takeaway"]', label: 'What this means & Why?', tone: 'mint' },
      { key: 'export', to: '[data-anchor="export"]', label: 'Download CSV / JSON + DOI', tone: 'amber' },
    ],
    title: 'Demo 2/7: What this means + export',
    caption: { label: 'Plain-language verdict & download', detail: 'Three test votes, signal vs noise, 1-click CSV / JSON' },
    supportNotes: [
      'Plain-language takeaway with the three votes open. CSV/JSON export plus NASA DOI is the escalation path for researchers.',
      'The p-value on a single place is nominal; the map’s FDR dots (q = 0.10) are the many-places answer.',
    ],
  },
  {
    id: 'demo-alberta-scroll',
    kind: 'demo',
    demo: { type: 'investigation', place: ALBERTA, variable: 'temperature', season: 'DJF', scroll: 'chart' },
    rings: [{ key: 'chart', to: '[data-anchor="chart"]', label: '46 winters · SD = 2.17 °C', tone: 'amber' }],
    title: 'Demo 3/7: Alberta time series',
    caption: { label: 'Alberta · 46-winter series', value: 'SD 2.17 °C', detail: 'Next: why the tests say “not significant”' },
    supportNotes: ['Show the 46-winter swings. Next tap opens Slide 4 to examine why the tests conclude not significant.'],
  },

  // ---- Slide 4: method (2 taps) ----
  {
    id: 'method-1',
    kind: 'story',
    scene: 'method',
    reveal: 1,
    title: 'Slide 4 (1/2): Alberta’s three test votes',
    headline: STORY.method.headline,
    supportNotes: [
      'Hamed–Rao p = 0.29 ✗, 95% CI −0.33…+0.73 ✗, Yue–Wang p = 0.33 ✗. All three agree: not significant.',
      'Why these tests, not OLS: climate series are non-normal, have outliers, and are autocorrelated. Mann–Kendall/Sen are rank-based; Hamed–Rao corrects for autocorrelation.',
    ],
  },
  {
    id: 'method-2',
    kind: 'story',
    scene: 'method',
    reveal: 2,
    title: 'Slide 4 (2/2): Signal vs noise & threshold strictness',
    headline: STORY.method.headline,
    supportNotes: [
      '0.8 °C total change vs 1 SD = 2.2 °C winter swing. The bar is intuition; the test is Mann–Kendall with Hamed–Rao variance correction.',
      'TrendTrace lets you choose how strict the check is: p < 0.01 (Strict: fewer false alarms), p < 0.05 (Standard default), p < 0.10 (Exploratory: catches emerging signals). Plus map-wide BH FDR (q = 0.10) controlling false discoveries across 64,800 cells.',
      'Pipeline validated 26/26 browser-vs-Python checks; GPCP rainfall cross-checked against NASA Giovanni; 25,000+ cities & 1° cells for local discovery.',
    ],
  },

  // ---- Demo: compare ----
  {
    id: 'demo-compare-top',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: ALBERTA,
      variable: 'temperature',
      season: 'DJF',
      scroll: 'top',
      compare: { place: AMAZON, variable: 'temperature', season: 'DJF' },
    },
    title: 'Demo 4/7: Compare Alberta vs Amazon',
    caption: { label: 'Compare · Alberta vs Amazon', value: '+0.18 vs +0.25 °C/dec', detail: 'Same metric, same statistical test' },
    supportNotes: ['Both regions on DJF temperature, same test. Next tap scrolls to both charts.'],
  },
  {
    id: 'demo-compare-scroll',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: ALBERTA,
      variable: 'temperature',
      season: 'DJF',
      scroll: 'chart',
      compare: { place: AMAZON, variable: 'temperature', season: 'DJF' },
    },
    rings: [
      { key: 'cmp-alberta', to: '.result-card:nth-child(1) [data-anchor="chart"]', label: 'Alberta: ±1 SD = 2.2 °C · p = 0.29 ✗', tone: 'coral' },
      { key: 'cmp-amazon', to: '.result-card:nth-child(2) [data-anchor="chart"]', label: 'Amazon: ±1 SD = 0.7 °C · p < 0.001 ✓', tone: 'mint' },
    ],
    title: 'Demo 5/7: 3× noisier winters',
    caption: { label: '3× noisier winters', value: 'SD 2.2 vs 0.7 °C', detail: 'p = 0.29 ✗ vs p < 0.001 ✓ · Where does Alberta’s noise come from? El Niño →' },
    supportNotes: [
      'Similar warming slope: buried in Alberta’s 2.2 °C winter swing, unmistakable in Amazon’s 0.7 °C swing. Axes differ per region.',
      'Plant the question: where does Alberta’s extra winter noise come from? We answer with El Niño right after we save this.',
    ],
  },

  // ---- Demo: save → library ----
  {
    id: 'demo-save-notes',
    kind: 'demo',
    demo: {
      type: 'investigation',
      place: ALBERTA,
      variable: 'temperature',
      season: 'DJF',
      tab: 'notes',
      typedNote: SAVED_NOTE,
      typedName: SAVED_NAME,
      typedTags: SAVED_TAGS,
      compare: { place: AMAZON, variable: 'temperature', season: 'DJF' },
    },
    rings: [{ key: 'save-btn', to: '.notes-save', label: 'Save with notes & tags', tone: 'mint' }],
    title: 'Demo 6/7: Notes, tags & save',
    caption: { label: 'Notes & Save', detail: 'Annotate findings before saving to Library' },
    supportNotes: ['Name, note and tag are filled in. Next tap saves and opens the Saved Library.'],
  },
  {
    id: 'demo-library',
    kind: 'demo',
    demo: {
      type: 'library',
      tab: 'saved',
      upsertDemo: {
        id: 'demo-alberta-amazon',
        name: SAVED_NAME,
        mode: 'compare',
        regionIds: ['alberta_prairies', 'amazon'],
        slots: [
          { regionId: 'alberta_prairies', variable: 'temperature', season: 'DJF', period: 'full' },
          { regionId: 'amazon', variable: 'temperature', season: 'DJF', period: 'full' },
        ],
        notes: SAVED_NOTE,
        tags: SAVED_TAGS,
      },
    },
    title: 'Demo 7/7: Library (Saved tab)',
    caption: { label: 'Library · Saved investigations', detail: 'Our note says “Check El Niño” — so that’s next →' },
    supportNotes: [
      'Saved comparison with notes and tags; one click reopens it. Our note says “Check El Niño”, so that’s the next stop: why are Alberta winters so noisy? The Pacific.',
      'Clear localStorage before the talk.',
    ],
  },

  // ---- El Niño segue ----
  {
    id: 'ensoBridge',
    kind: 'story',
    scene: 'ensoBridge',
    reveal: 1,
    title: 'El Niño bridge: regular winters vs El Niño winters',
    headline: STORY.ensoBridge.headline,
    supportNotes: [
      'El Niño is one Pacific phenomenon we’re considering that could explain Alberta’s winter swings — and we will expand TrendTrace to compare with other global drivers too (NAO, PDO, IOD).',
      'Regular winters: steady trade winds keep Pacific warm pools west, balancing Alberta’s seasonal swings around normal.',
      'El Niño winters: warm tropical Pacific water shifts the jet stream north, and Alberta winters run +1.5 °C warmer on average, amplifying seasonal swings.',
      'Future: the same architecture links NAO, PDO, or IOD across every 1° cell. Next tap shows the El Niño map live.',
    ],
  },
  {
    id: 'demo-enso-impact',
    kind: 'demo',
    demo: { type: 'enso', hash: 'enso?region=alberta_prairies&map=t2m_DJF' },
    title: 'El Niño winter contrast: Alberta +1.5 °C',
    caption: {
      label: 'Alberta winters: +1.5 °C warmer in El Niño winters',
      value: 'Alberta +1.5 °C',
      detail: 'El Niño winter contrast · 95% CI +0.4 to +2.7 · 15 El Niño winters',
    },
    supportNotes: [
      'Alberta DJF runs +1.5 °C warmer in El Niño winters (95% CI +0.4 to +2.7), from 15 El Niño winters compared with cool-phase Pacific winters. An association, not proof of causation.',
    ],
  },

  // ---- Impact & close ----
  {
    id: 'impact-1',
    kind: 'story',
    scene: 'impact',
    reveal: 1,
    title: 'Slide 5: Who it’s for + escalation workflow',
    headline: STORY.impact.headline,
    supportNotes: [
      'Researchers, planners, science journalists, students. Under-shown built features ready now: 43-year global map timelapse, Benjamini–Hochberg FDR (q = 0.10) trend maps, 25,000+ cities search, and all 4 NASA variables (Rainfall, 2 m Temp, Aerosols, Soil Moisture).',
      'Escalate in one flow: Read takeaway → Compare → Save notes → Export CSV/JSON + DOI.',
    ],
  },
  {
    id: 'close',
    kind: 'story',
    scene: 'close',
    reveal: 1,
    title: 'Slide 6: Try TrendTrace now · Team One',
    headline: 'TRENDTRACE. Click anywhere on Earth.',
    supportNotes: [
      'Team One · Live site: ' + LIVE_URL,
      'All 4 NASA variables (Rainfall, 2 m Temp, Aerosols, Soil Moisture). 25,000+ cities search, 43-year global map timelapses, and BH FDR (q = 0.10) spatial trend maps. 26/26 browser-vs-Python checks; GPCP rainfall cross-checked against NASA Giovanni.',
    ],
  },
];

export const STEP_COUNT = STEPS.length;

import type { SeriesDoc } from '../types';
import { readInference, formatPValue } from './inference';
import { metricById } from '../lib/metrics';
import { STUDY_REGIONS } from '../lib/gazetteer';

export interface Vote {
  id: 'hamedRao' | 'ci' | 'yueWang';
  label: string;
  pass: boolean | null;
  detail: string;
}

export type NextStepId = 'season' | 'annual' | 'compare' | 'enso';

export interface NextStep {
  id: NextStepId;
  label: string;
  data?: Record<string, string>;
}

export interface Diagnosis {
  sd: number;
  total: number;
  snr: number;
  sig: boolean;
  ciZero: boolean;
  units: string;
  votes: Vote[];
  reasons: string[];
  takeaway: string;
  nextSteps: NextStep[];
}

/** Maps with an ENSO impact artifact (`<slug>_<season>`). */
export const ENSO_MAP_IDS: ReadonlySet<string> = new Set([
  't2m_DJF', 't2m_JJA', 'precip_DJF', 'precip_JJA', 'sm_DJF', 'aod_SON',
]);

const fmt = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(Math.abs(x) < 0.1 ? 3 : 2)}`;

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
}

export function diagnoseTrend(doc: SeriesDoc, ensoMapIds: ReadonlySet<string> = ENSO_MAP_IDS): Diagnosis {
  const v = readInference(doc.trend?.inference);
  const metric = metricById(doc.variable);
  const u = metric?.units ?? doc.units;
  const slope = doc.trend?.sen_slope_per_decade;
  const slopeNum = typeof slope === 'number' && Number.isFinite(slope) ? slope : 0;
  const values = doc.values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const sd = stdDev(values);
  const decades = doc.years.length > 1 ? (doc.years[doc.years.length - 1] - doc.years[0]) / 10 : 0;
  const total = slopeNum * decades;
  const snr = sd > 0 ? Math.abs(total) / sd : 0;
  const ciZero = !!v.ci && v.ci[0] <= 0 && v.ci[1] >= 0;
  const sig = v.pValue !== null && v.pValue < 0.05;

  const reasons: string[] = [];
  if (!sig && snr < 0.6) {
    reasons.push(
      `A typical season differs from the average by about ${sd.toFixed(1)} ${u}, which is larger than the whole ${fmt(total)} ${u} change since ${doc.years[0]}.`,
    );
  }
  if (ciZero && v.ci) {
    reasons.push(
      `The 95% range for the trend runs from ${fmt(v.ci[0])} to ${fmt(v.ci[1])} ${u} per decade, so ${doc.variable === 'temperature' ? 'cooling and warming are' : 'a decrease and an increase are'} both still plausible.`,
    );
  }
  if (v.lag1 !== null && v.lag1 >= 0.3) {
    reasons.push(`Consecutive years are correlated (r1 = ${v.lag1.toFixed(2)}), so the effective number of independent years is smaller than it looks.`);
  }
  if (v.strictCheckPass !== null && v.strictCheckPass !== sig) {
    reasons.push('A stricter prewhitening check disagrees with the main test.');
  }
  if ((v.n ?? 99) < 30) {
    reasons.push(`Only ${v.n} seasons are on record.`);
  }
  if (doc.variable === 'aerosol_optical_depth') {
    reasons.push('Aerosol values before 2000 are mostly model-driven rather than observed.');
  }

  const votes: Vote[] = [
    {
      id: 'hamedRao',
      label: 'Hamed–Rao',
      pass: v.pValue === null ? null : sig,
      detail: v.pValue === null ? 'not recorded' : `p ${formatPValue(v.pValue).startsWith('<') ? '' : '= '}${formatPValue(v.pValue)}`,
    },
    {
      id: 'ci',
      label: '95% CI',
      pass: v.ci ? !ciZero : null,
      detail: v.ci ? (ciZero ? 'includes zero' : 'excludes zero') : 'not recorded',
    },
    {
      id: 'yueWang',
      label: 'Yue–Wang',
      pass: v.strictCheckPass,
      detail: v.strictCheckP === null ? 'not available' : `p ${formatPValue(v.strictCheckP).startsWith('<') ? '' : '= '}${formatPValue(v.strictCheckP)}`,
    },
  ];

  const name = (metric?.label ?? doc.variable).toLowerCase();
  const dir = slopeNum < 0 ? 'down' : 'up';
  let takeaway: string;
  if (v.status !== 'ok' || v.pValue === null) {
    takeaway = `The data lean ${dir}, but no significance test was recorded for this series.`;
  } else if (sig && !ciZero) {
    takeaway = `${doc.region.label} ${name} is trending ${dir}, and the change stands out from year-to-year noise.`;
  } else if (sig) {
    takeaway = `${doc.region.label} ${name} leans ${dir}, but the size of the change is uncertain.`;
  } else {
    takeaway = `${doc.region.label} ${name} may be drifting ${dir}, but the signal is lost in year-to-year noise.`;
  }

  const nextSteps: NextStep[] = [];
  const slug = metric?.slug ?? doc.variable;
  const season = doc.season.code;
  if (season !== 'ANN' && doc.region.id.startsWith('cell_')) {
    nextSteps.push({ id: 'annual', label: 'Try the annual average', data: { season: 'ANN' } });
  }
  // Named study regions only carry a DJF series; season switches would fail there.
  const isCell = doc.region.id.startsWith('cell_');
  if (isCell) {
    const altSeason = season === 'DJF' ? 'JJA' : 'DJF';
    nextSteps.push({ id: 'season', label: `Try ${altSeason}`, data: { season: altSeason } });
  }
  const other = STUDY_REGIONS.find((r) => r.id !== doc.region.id);
  if (other) {
    nextSteps.push({ id: 'compare', label: `Compare with ${other.label}`, data: { regionId: other.id } });
  }
  const mapId = `${slug}_${season}`;
  if (ensoMapIds.has(mapId)) {
    nextSteps.push({ id: 'enso', label: 'See the El Niño link', data: { map: mapId, regionId: doc.region.id } });
  }

  return { sd, total, snr, sig, ciZero, units: u, votes, reasons, takeaway, nextSteps };
}

/** Method comparison wording; raw artifact statuses remain unchanged for filtering and export provenance. */
export const METHOD_CHECK = "Method check: our processing pipeline reproduced NASA Giovanni's results for two test regions (Coastal Peru and Indonesia rainfall, Dec–Feb). Every other series is produced by the same code but has not been compared individually.";
export const SAME_PIPELINE = 'Same pipeline; not individually compared';
export const VALIDATION_LABELS = {
  passed: 'Compared with NASA Giovanni',
  'unchecked-same-method': SAME_PIPELINE,
  pending: SAME_PIPELINE,
} as const;

export type ListedValidationStatus = keyof typeof VALIDATION_LABELS;

export function validationLabel(status: unknown, context?: { regionId: string; variable: string; season: string }): string | null {
  if (typeof status !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(VALIDATION_LABELS, status)) return null;
  if (context) {
    const compared = status === 'passed' && context.variable === 'precipitation' && context.season === 'DJF' && ['coastal_peru', 'indonesia'].includes(context.regionId);
    const readerNote = ['aerosol_optical_depth', 'soil_moisture'].includes(context.variable) ? '; input reader not separately compared' : '';
    return (compared ? VALIDATION_LABELS.passed : SAME_PIPELINE) + readerNote;
  }
  return VALIDATION_LABELS[status as ListedValidationStatus];
}

export function comparisonLabel(doc: { variable: string; region: { id: string }; season: { code: string }; validation?: { status: string } }): string | null {
  return validationLabel(doc.validation?.status, { regionId: doc.region.id, variable: doc.variable, season: doc.season.code });
}

export function isListedValidation(status: unknown): boolean {
  return validationLabel(status) !== null;
}

/** Coverage text for a series: "X% mean, Y% lowest" or "X%". */
export function coverageText(doc: { coverage: (number | null)[] }): string {
  const valid = doc.coverage.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length === 0) return 'not recorded';
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const lowest = Math.min(...valid);
  const meanPct = Math.round(mean * 100);
  const lowPct = Math.round(lowest * 100);
  return lowPct < meanPct
    ? `${meanPct}% mean, ${lowPct}% lowest`
    : `${meanPct}%`;
}

import type { SeriesDoc } from '../types';
import { validationLabel } from '../data/validation';
import Chart from './Chart';
import InferenceBlock from './InferenceBlock';
import PeriodCompare from './PeriodCompare';

interface SeriesCardProps {
  slot: 'A' | 'B';
  doc: SeriesDoc;
  highlightYear?: number | null;
  onPin: (slot: 'A' | 'B') => void;
  onRemove: () => void;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'not available';
  return value.toFixed(digits);
}

export default function SeriesCard({
  slot,
  doc,
  highlightYear,
  onPin,
  onRemove,
}: SeriesCardProps) {
  const validValues = doc.values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const mean = validValues.length
    ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    : null;

  const validCoverage = doc.coverage.filter((value) => Number.isFinite(value));
  const meanCoverage = validCoverage.length
    ? validCoverage.reduce((sum, value) => sum + value, 0) / validCoverage.length
    : null;
  const minCoverage = validCoverage.length ? Math.min(...validCoverage) : null;

  const coverageText =
    meanCoverage === null
      ? 'not reported'
      : minCoverage !== null && minCoverage < meanCoverage
        ? `${Math.round(meanCoverage * 100)}% mean, ${Math.round(minCoverage * 100)}% lowest`
        : `${Math.round(meanCoverage * 100)}%`;

  const inference = doc.trend?.inference;
  const validation = doc.validation?.status ?? 'unknown';
  const validationText = validationLabel(validation) ?? validation;
  const slope = doc.trend?.sen_slope_per_decade;
  const firstYear = doc.years[0];
  const lastYear = doc.years[doc.years.length - 1];

  return (
    <article className={`card card-${slot.toLowerCase()}`}>
      <header className="card-head">
        <div>
          <p className="card-slot">Result {slot}</p>
          <h2>{doc.region.label}</h2>
          <p className="card-sub">
            {doc.season.code} · {doc.variable} · {doc.units}
          </p>
        </div>
        <span className={`tag tag-${validation}`}>
          Validation: {validationText}
        </span>
      </header>

      <Chart
        years={doc.years}
        values={doc.values}
        units={doc.units}
        highlightYear={highlightYear}
      />

      <dl className="facts">
        <div>
          <dt>Mean</dt>
          <dd>{mean === null ? 'not available' : `${formatNumber(mean)} ${doc.units}`}</dd>
        </div>
        <div>
          <dt>Sen slope (full period)</dt>
          <dd>
            {slope === null || slope === undefined
              ? 'not available'
              : `${formatNumber(slope, 3)} ${doc.units} per decade`}
          </dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>{coverageText}</dd>
        </div>
        <div>
          <dt>Years</dt>
          <dd>
            {firstYear}–{lastYear}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {doc.source.product} {doc.source.version}
            {doc.source.var ? ` · ${doc.source.var}` : ''}
          </dd>
        </div>
        <div>
          <dt>Region cells</dt>
          <dd>{doc.region.cells_used.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{doc.region.area_km2.toLocaleString()} km²</dd>
        </div>
      </dl>

      <InferenceBlock
        inference={inference}
        slopeUnits={`${doc.units} per decade`}
      />

      {doc.template_summary && <p className="summary">{doc.template_summary}</p>}

      <PeriodCompare
        key={`${doc.id}-period`}
        years={doc.years}
        values={doc.values}
        units={doc.units}
        label={`${doc.region.label} ${doc.season.code}`}
      />

      <footer className="card-actions">
        <button
          type="button"
          className={slot === 'A' ? 'pin on' : 'pin'}
          onClick={() => onPin('A')}
          aria-pressed={slot === 'A'}
        >
          {slot === 'A' ? 'Pinned A' : 'Pin A'}
        </button>
        <button
          type="button"
          className={slot === 'B' ? 'pin on' : 'pin'}
          onClick={() => onPin('B')}
          aria-pressed={slot === 'B'}
        >
          {slot === 'B' ? 'Pinned B' : 'Pin B'}
        </button>
        <button type="button" className="link-button" onClick={onRemove}>
          Remove
        </button>
      </footer>
    </article>
  );
}

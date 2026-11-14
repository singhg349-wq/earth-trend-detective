import type { CellSeriesOutcome } from '../lib/tiles';
import { validationLabel } from '../data/validation';
import Chart from './Chart';
import InferenceBlock from './InferenceBlock';
import PeriodCompare from './PeriodCompare';

interface CellCardProps {
  outcome: CellSeriesOutcome | null;
  loading: boolean;
  error: string | null;
  fixture: boolean;
  onClear: () => void;
}

function numberText(value: number | null | undefined, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'not available';
  return value.toFixed(digits);
}

export default function CellCard({
  outcome,
  loading,
  error,
  fixture,
  onClear,
}: CellCardProps) {
  if (loading) {
    return (
      <div className="cell-status">
        <p className="muted">Loading the 10 x 10 degree tile for this click&hellip;</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cell-status">
        <p className="error">{error}</p>
        <button type="button" className="link-button" onClick={onClear}>
          Clear
        </button>
      </div>
    );
  }

  if (!outcome) {
    return (
      <div className="cell-status">
        <p className="muted">
          Click any spot on the map to load the 1 degree cell for the selected
          variable and season. Only the clicked tile is fetched.
        </p>
      </div>
    );
  }

  if (outcome.status === 'no-data') {
    return (
      <div className="cell-status">
        <p>
          <strong>{outcome.message}</strong>
        </p>
        <p className="muted">
          {outcome.cellId} &middot; tile {outcome.tileKey} &middot; {outcome.reason}
        </p>
        <button type="button" className="link-button" onClick={onClear}>
          Clear
        </button>
      </div>
    );
  }

  const doc = outcome.result;
  const validValues = doc.values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const mean = validValues.length
    ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    : null;
  const coverage = doc.coverage.filter(
    (_value, index) => typeof doc.values[index] === 'number',
  );
  const meanCoverage = coverage.length
    ? coverage.reduce((sum, value) => sum + value, 0) / coverage.length
    : null;
  const minCoverage = coverage.length ? Math.min(...coverage) : null;
  const slope = doc.trend.sen_slope_per_decade;
  const period = doc.trend.period;
  const validation = doc.validation.status;
  const validationText = validationLabel(validation) ?? validation;
  const validationDetail =
    validation === 'passed'
      ? 'This cell has been checked against Giovanni.'
      : validation === 'pending'
        ? 'A Giovanni check for this cell is still pending.'
        : 'Only the featured regions get the independent reference check; this clicked cell uses the same processing and estimator.';

  return (
    <article className="card cell-card">
      <header className="card-head">
        <div>
          <p className="card-slot">Clicked 1 degree cell</p>
          <h2>{doc.region.label}</h2>
          <p className="card-sub">
            {doc.season.code} &middot; {doc.variable} &middot; {doc.units}
          </p>
        </div>
        <div className="tag-column">
          <span className={`tag tag-${validation}`}>{validationText}</span>
          {fixture && <span className="tag tag-fixture">fixture</span>}
        </div>
      </header>

      <p className="cell-label">
        <strong>{validationText}.</strong> {validationDetail}
      </p>

      <Chart years={doc.years} values={doc.values} units={doc.units} />

      <dl className="facts">
        <div>
          <dt>Sen slope (full period)</dt>
          <dd>
            {slope === null ? 'not available' : `${numberText(slope, 3)} ${doc.trend.slope_units}`}
          </dd>
        </div>
        <div>
          <dt>Mean</dt>
          <dd>{mean === null ? 'not available' : `${numberText(mean)} ${doc.units}`}</dd>
        </div>
        <div>
          <dt>Valid years</dt>
          <dd>
            n = {doc.trend.n_valid}
            {period ? ` (${period[0]}-${period[1]})` : ''}
          </dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>
            {meanCoverage === null
              ? 'not reported'
              : `${Math.round(meanCoverage * 100)}% mean, ${Math.round((minCoverage ?? 0) * 100)}% lowest`}
          </dd>
        </div>
        <div>
          <dt>Cell id</dt>
          <dd>{doc.region.id}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{doc.region.area_km2.toLocaleString()} km&sup2;</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {doc.source.product} {doc.source.version}
            {doc.source.var ? ` · ${doc.source.var}` : ''}
          </dd>
        </div>
      </dl>

      <InferenceBlock
        inference={doc.trend.inference}
        slopeUnits={doc.trend.slope_units ?? `${doc.units} per decade`}
      />

      <p className="summary">{doc.template_summary}</p>

      <PeriodCompare
        key={doc.id}
        years={doc.years}
        values={doc.values}
        units={doc.units}
        label={doc.region.label}
      />

      <footer className="card-actions">
        <button type="button" className="link-button" onClick={onClear}>
          Clear clicked cell
        </button>
      </footer>
    </article>
  );
}

import EnsoConnection from './EnsoConnection';
import { metricById } from '../../lib/metrics';
import InfoTip from '../InfoTip';
import type { ResolvedResult } from '../../data/exports';
import {
  RESULT_COLUMNS,
  resultTableCells,
  SUB_PERIOD_SLOPE_NOTE,
  SUB_PERIOD_SIGNIFICANCE_NOTE,
  buildResultCsv, serializeResultJson, downloadText,
} from '../../data/exports';
import type { SeriesDoc } from '../../types';
import type { EnsoDoc } from '../../data/enso';
import type { Suggestion, SuggestionContext } from '../../data/explain';
import type { InspectItem } from '../Inspector';
import {
  readInference,
  formatPValue,
  formatInterval,
  formatNumber,
} from '../../data/inference';
import {
  formatMean,
  formatSlope,
  slopeUnits,
  strictStatusLine,
  expandedExplanation,
  buildSuggestions,
} from '../../data/explain';
import { comparisonLabel } from '../../data/validation';
import TrendChart from '../TrendChart';
import WhyCard from './WhyCard';
import { diagnoseTrend, type NextStep } from '../../data/diagnose';
import { STUDY_REGIONS } from '../../lib/gazetteer';
import SlotMenu from '../SlotMenu';
import type { TrendSeries } from '../TrendChart';

interface ResultCardProps {
  item: InspectItem;
  row: ResolvedResult;
  index: number;
  isRef: boolean;
  isPinned: boolean;
  checksOpen: boolean;
  onToggleChecks: () => void;
  sharedSettings: { variable: string; season: string; period: string };
  onPin?: (id: string) => void;
  onSaveResult?: (id: string) => void;
  onRemove?: (id: string) => void;
  onOverride?: (id: string, patch: { variable?: string; season?: string; period?: string }) => void;
  onClearOverride?: (id: string) => void;
  onCompareSuggestion?: (regionId: string) => void;
  onOpenTimelapse?: (variable: string, season: string) => void;
  variables: string[];
  seasons: string[];
  inCompareMode: boolean;
  chartSeries: TrendSeries[];
  sharedHoverYear: number | null;
  onHoverYearChange: (year: number | null) => void;
  openWhy?: boolean;
}

export default function ResultCard(props: ResultCardProps) {
  const {
    item,
    row,
    isRef,
    isPinned,
    checksOpen,
    onToggleChecks,
    sharedSettings,
    onPin,
    onSaveResult,
    onRemove,
    onOverride,
    onClearOverride,
    onCompareSuggestion,
    onOpenTimelapse,
    variables,
    seasons,
    inCompareMode,
    chartSeries,
    sharedHoverYear,
    onHoverYearChange,
    openWhy,
  } = props;

  const view = readInference(item.doc.trend?.inference);
  const isSubPeriod = item.period !== 'full';
  const sentences = isSubPeriod ? subPeriodSummary(row) : [];
  const diagnosis = isSubPeriod ? null : diagnoseTrend(item.doc);

  const isPolar = Boolean(
    item.doc.region.cells_used === 1 && (
      (item.doc.region.bbox && Math.abs((item.doc.region.bbox[1] + item.doc.region.bbox[3]) / 2) >= 80) ||
      (/^cell_(-?\d+(?:\.\d+)?)_/.test(item.doc.region.id) && Math.abs(Number(/^cell_(-?\d+(?:\.\d+)?)_/.exec(item.doc.region.id)?.[1])) >= 80)
    )
  );

  const hasDifferentSettings = Boolean(
    item.overridden && (
      item.doc.variable !== sharedSettings.variable ||
      item.doc.season.code !== sharedSettings.season ||
      item.period !== sharedSettings.period
    )
  );

  const suggestionContext: SuggestionContext = {
    variable: item.doc.variable,
    season: item.doc.season.code,
    regionId: item.regionId,
    regionLabel: item.doc.region.label,
    catalog: STUDY_REGIONS.map((r) => ({ variable: item.doc.variable, season: item.doc.season.code, regionId: r.id, label: r.label })),
    hasTimelapse: Boolean(metricById(item.doc.variable)),
    checksOpen,
    inCompareMode,
    onCompareSuggestion,
    onOpenTimelapse,
    onToggleChecks: () => onToggleChecks(),
  };
  const suggestions = buildSuggestions(suggestionContext).filter((s) => s.action !== 'compare');

  const handleStep = (step: NextStep) => {
    if (step.id === 'season' || step.id === 'annual') {
      if (step.data?.season) onOverride?.(item.id, { season: step.data.season });
    } else if (step.id === 'compare') {
      if (step.data?.regionId) onCompareSuggestion?.(step.data.regionId);
    } else if (step.id === 'enso') {
      window.location.hash = `#enso?region=${encodeURIComponent(item.regionId)}&map=${encodeURIComponent(step.data?.map ?? '')}`;
    }
  };

  return (
    <section
      key={item.doc.id}
      className={`result-card ${isRef ? 'reference-card' : ''}`}
      style={{ borderLeftColor: item.color }}
    >
      <div className="result-card-header">
        <div className="result-card-title-row">
          <span className="slot-chip" style={{ backgroundColor: item.color }}>
            {item.slot}
          </span>
          {inCompareMode && <h3>{item.doc.region.label}</h3>}
          {isRef && <span className="tag tag-reference">Reference</span>}
          {hasDifferentSettings && (
            <span className="override-marker" title="This result uses its own settings">
              Own settings
            </span>
          )}
        </div>
        <SlotMenu
          id={item.id}
          regionId={item.regionId}
          regionLabel={item.doc.region.label}
          settings={{
            variable: item.doc.variable,
            season: item.doc.season.code,
            period: item.period,
          }}
          isPinned={isPinned}
          onPin={onPin}
          onSave={onSaveResult}
          onExportCsv={() => downloadText(`${row.id}.csv`, buildResultCsv([row]), 'text/csv')}
          onExportJson={() => downloadText(`${row.id}.json`, serializeResultJson({ mode: inCompareMode ? 'compare' : 'explore', period: item.period, exportedAt: new Date().toISOString(), rows: [row] }), 'application/json')}
          onToggleChecks={onToggleChecks}
          checksOpen={checksOpen}
          onRemove={onRemove}
          inCompareMode={inCompareMode}
          overridden={hasDifferentSettings}
          onOverride={onOverride}
          onClearOverride={onClearOverride}
          variables={variables}
          seasons={seasons}
        />
      </div>

      <div className="result-card-body">
        {isPolar && (
          <div className="polar-cell-caution" role="note">
            <span className="tag tag-caution">Caution</span>
            <span>Single 1° polar cell — small area and polar-night coverage</span>
          </div>
        )}

        {/* Headline-first result */}
        <div className="headline-result">
          <p className="ed-eyebrow">{metricById(item.doc.variable)?.label ?? item.doc.variable} · {item.doc.season.code}<InfoTip term="seasons" /> · {row.period.label}</p>
          <p className="r4-trend-number">
            <span data-anchor="slope">{row.slopePerDecade === null ? 'Unavailable' : `${row.slopePerDecade > 0 ? '+' : ''}${row.slopePerDecade.toFixed(metricById(item.doc.variable)?.decimals ?? 3)}`}</span>
            <span className={`r4-trend-verdict ${isSubPeriod ? 'r4-trend-verdict--subperiod' : view.status === 'ok' && view.pValue !== null && view.pValue < 0.05 ? 'r4-trend-verdict--sig' : 'r4-trend-verdict--neutral'}`}>
              {isSubPeriod
                ? 'Sub-period window'
                : view.status === 'ok' && view.pValue !== null
                  ? view.pValue < 0.05
                    ? 'Statistically significant (p < 0.05)'
                    : 'No clear trend'
                  : 'Inference unavailable'}
            </span>
            <small>{metricById(item.doc.variable)?.trendUnits ?? slopeUnits(item.doc)}<InfoTip term="senSlope" /></small>
          </p>
          {!isSubPeriod && view.status === 'ok' && (
            <dl className="r4-stat-rows">
              <div data-anchor="p">
                <dt>p-value<InfoTip term="pValue" /></dt>
                <dd>{formatPValue(view.pValue).startsWith('<') ? `p ${formatPValue(view.pValue)}` : `p = ${formatPValue(view.pValue)}`}</dd>
              </div>
              <div data-anchor="ci">
                <dt>95% confidence interval<InfoTip term="confidence" /></dt>
                <dd>{formatInterval(view.ci, slopeUnits(item.doc))}</dd>
              </div>
            </dl>
          )}
          {diagnosis ? (
            <WhyCard diagnosis={diagnosis} onStep={handleStep} defaultOpen={openWhy} />
          ) : (
            sentences.slice(0, 2).map((sentence, i) => (
              <p key={i} className="plain-summary">{sentence}</p>
            ))
          )}

          <EnsoConnection doc={item.doc} />
          {/* Prewhitening sensitivity check status line */}
          <div className="strict-status-line">
            {isSubPeriod
              ? 'Prewhitening sensitivity check: not computed for sub-period windows'
              : strictStatusLine(view)}
          </div>

          {/* Headline statistics */}
          <div className="headline-stats">
            <div className="stat">
              <span className="stat-label">Mean</span>
              <span className="stat-value">
                {isSubPeriod && row.mean !== null
                  ? `${row.mean.toFixed(2)} ${row.units}`
                  : formatMean(item.doc)}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Sample size</span>
              <span className="stat-value">n = {isSubPeriod ? row.n : (view.n ?? 'not recorded')}</span>
            </div>
          </div>
        </div>

        {hasDifferentSettings && (
          <p className="override-diff muted small">
            This result uses its own settings: {item.doc.variable} · {item.doc.season.code} · {item.period} (shared: {sharedSettings.variable} · {sharedSettings.season} · {sharedSettings.period}).
          </p>
        )}

        {/* Next-step suggestions */}
        <div className="suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              className="suggestion-btn"
              onClick={() => handleSuggestionClick(suggestion, item, suggestionContext, onSaveResult)}
            >
              {suggestion.label}
            </button>
          ))}
        </div>

        {/* Expandable plain-language explanation */}
        <details className="explanation-expander">
          <summary className="explanation-summary">
            Explain this in plain language
          </summary>
          <div className="explanation-content">
            {isSubPeriod
              ? subPeriodSummary(row).map((sentence, i) => <p key={i}>{sentence}</p>)
              : expandedExplanation(item.doc).map((sentence, i) => <p key={i}>{sentence}</p>)}
          </div>
        </details>

        {/* Validation tag */}
        <span className="tag tag-validation">
          {isSubPeriod
            ? (row.validationText ?? row.validationStatus)
            : (comparisonLabel(item.doc))}
        </span>
      </div>

      {/* Result table (collapsible on narrow) */}
      <details className="table-expander" open>
        <summary className="table-summary">Result table</summary>
        <div className="result-table-wrap">
          <table className="result-table">
            <caption className="visually-hidden">
              Resolved result for full window
            </caption>
            <thead>
              <tr>
                {RESULT_COLUMNS.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {RESULT_COLUMNS.map((column) => {
                  const cells = resultTableCells(row);
                  return <td key={column.key}>{cells[column.key]}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {isSubPeriod && (
          <p className="muted small">
            {SUB_PERIOD_SLOPE_NOTE} {SUB_PERIOD_SIGNIFICANCE_NOTE}
          </p>
        )}
      </details>

      {/* Chart */}
      <details className="chart-expander" open data-anchor="chart">
        <TrendChart
          series={chartSeries.filter((s) => s.id === item.doc.id)}
          units={item.doc.units}
          seasonLabel={seasonText(item.doc)}
          hoverYear={sharedHoverYear}
          onHoverYearChange={onHoverYearChange}
        />
        {isSubPeriod && (
          <p className="muted small">
            Dashed line: browser descriptive Sen fit for the selected half window.
          </p>
        )}
      </details>

      {/* ENSO block if available */}
      {item.enso && (
        <EnsoBlock
          key={`enso-${row.id}`}
          enso={item.enso as EnsoDoc}
          doc={item.doc}
          color={item.color}
          fullPeriod={!isSubPeriod}
        />
      )}
    </section>
  );
}

function seasonText(doc: SeriesDoc): string {
  return doc.season.code;
}

function subPeriodSummary(row: ResolvedResult): string[] {
  const label =
    row.period.key === 'first-half'
      ? 'First half'
      : row.period.key === 'second-half'
        ? 'Second half'
        : 'Custom';
  const sentences = [
    `${label} window: ${row.period.start}–${row.period.end}, ${row.n} ${
      row.n === 1 ? 'season' : 'seasons'
    } with values.`,
  ];
  if (row.slopePerDecade !== null) {
    sentences.push(
      `The browser's descriptive Sen slope for this window is ` +
        `${formatSlope(row.slopePerDecade, row.units)} (n = ${row.n}).`,
    );
  }
  sentences.push(SUB_PERIOD_SIGNIFICANCE_NOTE);
  const validation = row.validationText ?? row.validationStatus;
  if (validation !== 'not recorded') sentences.push(`Method comparison: ${validation}.`);
  return sentences;
}

function EnsoBlock({
  enso,
  doc,
  color,
  fullPeriod,
}: {
  enso: EnsoDoc;
  doc: SeriesDoc;
  color: string;
  fullPeriod: boolean;
}) {
  const rows: React.ReactNode[] = [];
  rows.push(
    <p key="head" className="muted">
      Rank correlation between detrended {doc.region.label} {doc.season.code} {(metricById(doc.variable)?.label ?? doc.variable).toLowerCase()} and the
      CPC Oceanic Niño Index (ONI), from the pipeline&apos;s ENSO artifact.
    </p>,
  );
  if (!fullPeriod) {
    rows.push(
      <p key="window" className="muted small">
        Full-period context: these ENSO statistics are not recalculated for sub-period
        windows.
      </p>,
    );
  }
  rows.push(
    <dl key="stats" className="fact-grid">
      <div>
        <dt>Spearman r<sub>s</sub></dt>
        <dd>{enso.rs.toFixed(3)}</dd>
      </div>
      <div>
        <dt>Approximate two-sided p</dt>
        <dd>{formatPValue(enso.p_value_two_sided_approx)}</dd>
      </div>
      <div>
        <dt>Effective n</dt>
        <dd>{formatNumber(enso.effective_sample_size)}</dd>
      </div>
      <div>
        <dt>95% block-bootstrap interval</dt>
        <dd>
          {enso.block_bootstrap_95_interval
            ? `${enso.block_bootstrap_95_interval[0].toFixed(3)} to ${enso.block_bootstrap_95_interval[1].toFixed(3)}`
            : 'not recorded'}
        </dd>
      </div>
    </dl>,
  );

  for (const comparison of enso.el_nino_rainfall_comparison) {
    rows.push(
      <p key={comparison.threshold_c} className="muted">
        El Niño years (ONI ≥ +{comparison.threshold_c.toFixed(1)} °C,{' '}
        {comparison.el_nino_year_count ?? 'count not recorded'} years): mean{' '}
        {comparison.el_nino_mean_rainfall_mm_day === null
          ? 'not recorded'
          : `${comparison.el_nino_mean_rainfall_mm_day.toFixed(2)} mm/day`}{' '}
        vs{' '}
        {comparison.other_mean_rainfall_mm_day === null
          ? 'not recorded'
          : `${comparison.other_mean_rainfall_mm_day.toFixed(2)} mm/day`}{' '}
        in the other {comparison.other_year_count ?? 'count not recorded'} years.
      </p>,
    );
  }
  rows.push(
    <p key="method" className="muted small">
      Method: {enso.p_value_method}. {enso.lag1_note}
    </p>,
  );

  return (
    <section className="inspector-section enso" aria-label="ENSO context">
      <h3 style={{ borderLeftColor: color }}>ENSO context</h3>
      {rows}
    </section>
  );
}

function handleSuggestionClick(
  suggestion: Suggestion,
  item: InspectItem,
  ctx: SuggestionContext,
  onSave?: (id: string) => void,
) {
  switch (suggestion.action) {
    case 'compare':
      if (suggestion.data?.regionId && typeof suggestion.data.regionId === 'string') {
        ctx.onCompareSuggestion?.(suggestion.data.regionId);
      }
      break;
    case 'timelapse':
      if (suggestion.data?.variable && suggestion.data?.season) {
        ctx.onOpenTimelapse?.(
          suggestion.data.variable as string,
          suggestion.data.season as string
        );
      }
      break;
    case 'toggleChecks':
      ctx.onToggleChecks?.(item.id);
      break;
    case 'save':
      onSave?.(item.id);
      break;
    case 'cite':
      const citation = `${item.doc.source.product} v${item.doc.source.version}${item.doc.source.var ? ` · ${item.doc.source.var}` : ''} · ${item.doc.region.label} · ${item.doc.season.code} · ${item.doc.units}`;
      navigator.clipboard.writeText(citation).catch(() => {});
      break;
  }
}

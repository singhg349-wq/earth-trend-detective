import { metricById } from '../lib/metrics';
import { METHOD_CHECK, comparisonLabel } from '../data/validation';
import InfoTip from './InfoTip';
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { readInference } from '../data/inference';
import {
  PERIOD_OPTIONS,
  buildResultCsv,
  downloadText,
  resolveResult,
  serializeResultJson,
  type PeriodKey,
} from '../data/exports';
import type { EnsoDoc } from '../data/enso';
import type { SeriesDoc } from '../types';
import type { TrendSeries } from './TrendChart';
import ResultCard from './result/ResultCard';
import ChecksPanel from './result/ChecksPanel';
import NotesPanel from './result/NotesPanel';
import './drawer.css';

export interface InspectItem {
  id: string;
  regionId: string;
  period: PeriodKey;
  overridden: boolean;
  doc: SeriesDoc;
  enso: EnsoDoc | null;
  color: string;
  slot: string;
}

/**
 * `checksOpen` / `sourcesOpen` / their toggles are part of App's interface.
 * The drawer now presents them as tabs with its own state, so they are kept
 * only to avoid an App.tsx change.
 */
interface InspectorProps {
  mode: 'explore' | 'compare';
  items: InspectItem[];
  checksOpen: boolean;
  sourcesOpen: boolean;
  onToggleChecks: () => void;
  onToggleSources: () => void;
  onClose: () => void;
  onSave: () => void;
  onRemove?: (id: string) => void;
  onPin?: (id: string) => void;
  pinnedIds?: string[];
  onSaveResult?: (id: string) => void;
  onCompareSuggestion?: (regionId: string) => void;
  onOpenTimelapse?: (variable: string, season: string) => void;
  onOverride?: (id: string, patch: { variable?: string; season?: string; period?: string }) => void;
  onClearOverride?: (id: string) => void;
  onPeriodChange?: (id: string, period: PeriodKey) => void;
  onNotesChange?: (value: string) => void;
  onTagsChange?: (tags: string[]) => void;
  catalog?: Array<{ regionId: string; label: string; variable: string; season: string }>;
  sharedSettings?: { variable: string; season: string; period: string };
}

const TABS = [
  { key: 'standard', label: 'Standard result' },
  { key: 'expert', label: 'Statistical tests' },
  { key: 'sources', label: 'Sources & method' },
  { key: 'notes', label: 'Notes & save' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function seasonText(doc: SeriesDoc): string {
  return doc.season.code;
}

function compareNote(items: InspectItem[]): string {
  if (items.length < 2) return '';
  const firstUnits = items[0].doc.units;
  const sameUnits = items.every((item) => item.doc.units === firstUnits);
  if (sameUnits) {
    return 'Both series share one axis (same units). The two series are shown side by side with no slope-difference or significance claim about the comparison.';
  }
  return 'The two series use different units, so they are shown on independent axes and no direct difference claim is made.';
}

function viewMethod(doc: SeriesDoc): string {
  const view = readInference(doc.trend?.inference);
  return view.method ?? 'not recorded';
}

export default function Inspector(props: InspectorProps) {
  const {
    mode,
    items,
    onClose,
    onSave,
    onRemove,
    onPin,
    pinnedIds = [],
    onSaveResult,
    onCompareSuggestion,
    onOpenTimelapse,
    onOverride,
    onClearOverride,
    onPeriodChange,
    onNotesChange,
    onTagsChange,
    catalog = [],
    sharedSettings: propSharedSettings,
  } = props;

  const [tab, setTab] = useState<TabKey>('standard');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});
  const [sharedHoverYear, setSharedHoverYear] = useState<number | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Compute shared settings from prop or the first non-overridden item
  const sharedItem = items.find((item) => !item.overridden);
  const sharedSettings = propSharedSettings ?? (sharedItem
    ? {
        variable: sharedItem.doc.variable,
        season: sharedItem.doc.season.code,
        period: sharedItem.period,
      }
    : {
        variable: items[0].doc.variable,
        season: items[0].doc.season.code,
        period: items[0].period,
      });

  // Extract unique variables and seasons from catalog for override selectors
  const variables = Array.from(new Set(catalog.map((c) => c.variable))).sort();
  const seasons = Array.from(new Set(catalog.map((c) => c.season))).sort();

  // Resolve each item with its own period
  const resolvedRows = items.map((item) => resolveResult(item.doc, item.period, item.slot));
  const chartSeries: TrendSeries[] = items.map((item, index) => {
    const row = resolvedRows[index];
    return {
      id: item.doc.id,
      label: `${item.slot} · ${item.doc.region.label}`,
      color: item.color,
      years: row.points.map((point) => point.year),
      values: row.points.map((point) => point.value),
      slopePerDecade: row.slopePerDecade,
      intercept: row.intercept,
      slopeCI: item.period === 'full' ? row.inference.ci : null,
    };
  });

  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex((entry) => entry.key === tab);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  const handleExport = (format: 'csv' | 'json', itemId?: string) => {
    const exportedAt = new Date().toISOString();
    const stamp = exportedAt.replace(/[:.]/g, '-');
    let rowsToExport = resolvedRows;
    let base = `earth-trend-${mode}-${stamp}`;
    if (itemId) {
      const itemIndex = items.findIndex((item) => item.id === itemId);
      if (itemIndex >= 0) {
        rowsToExport = [resolvedRows[itemIndex]];
        const item = items[itemIndex];
        const row = resolvedRows[itemIndex];
        const regionSlug = item.doc.region.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        base = `etd_${regionSlug}_${item.doc.season.code}_${row.period.start}-${row.period.end}`;
      }
    }
    if (format === 'csv') {
      const written = downloadText(`${base}.csv`, buildResultCsv(rowsToExport), 'text/csv');
      setExportNotice(written ? `CSV downloaded: ${base}.csv` : 'The browser refused the CSV download.');
      return;
    }
    const written = downloadText(
      `${base}.json`,
      serializeResultJson({ mode, period: 'full', exportedAt, rows: rowsToExport }),
      'application/json',
    );
    setExportNotice(written ? `JSON downloaded: ${base}.json` : 'The browser refused the JSON download.');
  };

  // Grid layout class based on item count
  const gridLayoutClass = `grid-${layoutName(items.length)}`;

  function layoutName(count: number): string {
    switch (count) {
      case 1: return 'single';
      case 2: return 'pair';
      case 3: return 'triple';
      case 4: return 'quad';
      case 5: return 'five';
      default: return 'single';
    }
  }

  function isReferenceCard(index: number): boolean {
    return items.length === 5 && index === 0;
  }

  return (
    <aside className="inspector" aria-label="Investigation inspector">
      <header className="inspector-head">
        <div>
          <p className="eyebrow">{mode === 'compare' ? 'Compare' : 'Investigation'}</p>
          <h2>
            {mode === 'compare' ? (
              `Comparison (${items.length} ${items.length === 1 ? 'region' : 'regions'})`
            ) : (
              items.map((item) => (
                <span key={item.doc.id} className="inspector-title">
                  <span className="slot-chip" style={{ backgroundColor: item.color }}>
                    {item.slot}
                  </span>
                  {item.doc.region.label}
                </span>
              ))
            )}
          </h2>
          <p className="muted">
            {metricById(items[0].doc.variable)?.label ?? items[0].doc.variable} · {seasonText(items[0].doc)} · {items[0].doc.units}
          </p>
        </div>
        <div className="inspector-head-actions">
          <button type="button" className="btn btn-ghost" onClick={onSave}>
            Save
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close inspector">
            ×
          </button>
        </div>
      </header>

      <div className="inspector-tabs" role="tablist" aria-label="Result sections" onKeyDown={handleTabKey}>
        {TABS.map((entry, index) => (
          <button
            key={entry.key}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`inspector-tab-${entry.key}`}
            aria-selected={tab === entry.key}
            aria-controls={`inspector-panel-${entry.key}`}
            tabIndex={tab === entry.key ? 0 : -1}
            className={tab === entry.key ? 'inspector-tab is-active' : 'inspector-tab'}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {tab === 'standard' && (
          <div
            role="tabpanel"
            id="inspector-panel-standard"
            aria-labelledby="inspector-tab-standard"
            tabIndex={0}
          >
            <div className="drawer-toolbar">
              <div className="period-controls" role="group" aria-label="Result period">
                <span className="control-label">Period</span>
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={items.every((item) => item.period === option.key) ? 'period-btn is-active' : 'period-btn'}
                    aria-pressed={items.every((item) => item.period === option.key)}
                    onClick={() => {
                      items.forEach((item) => onPeriodChange?.(item.id, option.key));
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="export-controls" role="group" aria-label="Export the displayed result">
                <button type="button" className="btn btn-ghost" onClick={() => handleExport('csv')}>
                  CSV
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => handleExport('json')}>
                  JSON
                </button>
              </div>
            </div>
            {exportNotice && (
              <p className="muted small export-notice" role="status">
                {exportNotice}
              </p>
            )}

            <div className={`result-grid ${gridLayoutClass}`}>
              {items.map((item, index) => {
                const row = resolvedRows[index];
                const isRef = isReferenceCard(index);
                const isPinned = pinnedIds.includes(item.id);
                const checksOpenForCard = expandedChecks[item.id] ?? false;

                return (
                  <ResultCard
                    key={item.doc.id}
                    item={item}
                    row={row}
                    index={index}
                    isRef={isRef}
                    isPinned={isPinned}
                    checksOpen={checksOpenForCard}
                    onToggleChecks={() => setExpandedChecks((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                    sharedSettings={sharedSettings}
                    onPin={onPin}
                    onSaveResult={onSaveResult}
                    onRemove={onRemove}
                    onOverride={onOverride}
                    onClearOverride={onClearOverride}
                    onCompareSuggestion={onCompareSuggestion}
                    onOpenTimelapse={onOpenTimelapse}
                    variables={variables}
                    seasons={seasons}
                    inCompareMode={mode === 'compare'}
                    chartSeries={chartSeries}
                    sharedHoverYear={sharedHoverYear}
                    onHoverYearChange={setSharedHoverYear}
                  />
                );
              })}
            </div>

            {items.length > 1 && (
              <p className="muted small">{compareNote(items)}</p>
            )}
          </div>
        )}

        {tab === 'expert' && (
          <div
            role="tabpanel"
            id="inspector-panel-expert"
            aria-labelledby="inspector-tab-expert"
            tabIndex={0}
          >
            <ChecksPanel
              items={items}
              expandedChecks={expandedChecks}
              onToggleChecks={(id) => setExpandedChecks((prev) => ({ ...prev, [id]: !prev[id] }))}
            />
          </div>
        )}

        {tab === 'sources' && (
          <div
            role="tabpanel"
            id="inspector-panel-sources"
            aria-labelledby="inspector-tab-sources"
            tabIndex={0}
          >
            <section className="inspector-section sources">
              <h3>Sources & method<InfoTip term="validation" /></h3>
              <p>{METHOD_CHECK}</p>
              {items.some(item => item.regionId.startsWith("cell_")) && <p>Trend test computed in the browser from the 1° grid using the Giovanni-confirmed pipeline method; export CSV/JSON for individual verification.</p>}
              {items.some(item => item.doc.variable === 'aerosol_optical_depth') && <p>MERRA-2 AOD note: MODIS aerosol assimilation began around 2000 (pre-2000 land AOD is largely model-driven); interpret early-period trends with caution.</p>}
              {items.map((item) => (
                <div key={item.doc.id} className="check-block">
                  <h4>
                    <span className="slot-chip" style={{ backgroundColor: item.color }}>
                      {item.slot}
                    </span>
                    {item.doc.region.label}
                  </h4>
                  <dl className="fact-grid">
                    <div>
                      <dt>Source</dt>
                      <dd>
                        {item.doc.source.product} v{item.doc.source.version}
                        {item.doc.source.var ? ` · ${item.doc.source.var}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Method</dt>
                      <dd>{viewMethod(item.doc)}</dd>
                    </div>
                    <div>
                      <dt>Method comparison</dt>
                      <dd>
                        {item.doc.validation?.reference ?? 'not recorded'} ·{' '}
                        {comparisonLabel(item.doc)}
                      </dd>
                    </div>
                    <div>
                      <dt>Region footprint</dt>
                      <dd>
                        {item.doc.region.cells_used} cells ·{' '}
                        {Math.round(item.doc.region.area_km2).toLocaleString()} km²
                      </dd>
                    </div>
                    <div>
                      <dt>Generated</dt>
                      <dd>{item.doc.generated ?? 'not recorded'}</dd>
                    </div>
                  </dl>
                  {item.doc.source.doi_or_url && (
                    <p className="muted small">
                      <a href={item.doc.source.doi_or_url} target="_blank" rel="noreferrer">
                        {item.doc.source.doi_or_url}
                      </a>
                    </p>
                  )}
                  
                </div>
              ))}
            </section>
          </div>
        )}

        {tab === 'notes' && (
          <NotesPanel
            key={items.map((item) => item.id).sort().join('|')}
            items={items}
            onSave={onSave}
            onNotesChange={onNotesChange}
            onTagsChange={onTagsChange}
          />
        )}
      </div>
    </aside>
  );
}

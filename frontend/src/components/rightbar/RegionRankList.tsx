import InfoTip from '../InfoTip';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { getSeries, listSeries } from '../../data/seriesSource';
import type { SeriesDoc, SeriesSummary } from '../../types';
import {
  formatRankPValue,
  formatSlope,
  rankRegions,
  rankSubtitle,
  significanceLabel,
  type RankCandidate,
  type RankedRegion,
} from '../../lib/regionRank';
import { METRICS } from '../../lib/metrics';
import './rightbar.css';

type RankVariable = import('../../lib/metrics').MetricId;

export interface RegionRankListProps {
  variable: RankVariable;
  season: string;
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  onChangeVariable?: (variable: RankVariable) => void;
  onChangeSeason?: (season: string) => void;
}

interface LoadState {
  key: string;
  rows: RankedRegion[] | null;
  loading: boolean;
  error: string | null;
  missing: number;
}

const EMPTY: LoadState = { key: '', rows: null, loading: true, error: null, missing: 0 };

// One fetch per variable+season for the life of the page; switching the
// variable back and forth shouldn't flash a loading state again.
const CACHE = new Map<string, RankedRegion[]>();

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

function candidateFromDoc(summary: SeriesSummary, doc: SeriesDoc): RankCandidate {
  const slope = doc.trend?.sen_slope_per_decade;
  const pValue = doc.trend?.inference?.p_value;
  return {
    regionId: doc.region?.id || summary.region_id,
    regionLabel: doc.region?.label || summary.region_label,
    slopePerDecade: typeof slope === 'number' && Number.isFinite(slope) ? slope : null,
    units: (doc.units || summary.units || '').trim(),
    pValue: typeof pValue === 'number' && Number.isFinite(pValue) ? pValue : null,
    inferenceStatus: doc.trend?.inference?.status ?? 'unavailable',
  };
}

function rankIndexLabel(row: RankedRegion): string {
  return row.rank === null ? '—' : String(row.rank).padStart(2, '0');
}

export default function RegionRankList({
  variable,
  season,
  selectedRegionId,
  onSelectRegion,
  onChangeVariable,
  onChangeSeason,
}: RegionRankListProps) {
  const [attempt, setAttempt] = useState(0);
  const currentKey = `${variable}:${season}`;
  const [state, setState] = useState<LoadState>(() => {
    const cached = CACHE.get(`${variable}:${season}`);
    return cached
      ? { key: `${variable}:${season}`, rows: cached, loading: false, error: null, missing: 0 }
      : EMPTY;
  });
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const key = `${variable}:${season}`;
    const cached = CACHE.get(key);
    if (cached) {
      setState({ key, rows: cached, loading: false, error: null, missing: 0 });
      return;
    }

    let alive = true;
    setState({ key, rows: null, loading: true, error: null, missing: 0 });

    (async () => {
      try {
        const list = await listSeries();
        const wanted = list.filter(
          (summary) => summary.variable === variable && summary.season === season,
        );
        const docs = await Promise.all(
          wanted.map(async (summary) => {
            try {
              return await getSeries(summary.id);
            } catch {
              return null;
            }
          }),
        );
        let missing = 0;
        const candidates: RankCandidate[] = [];
        wanted.forEach((summary, index) => {
          const doc = docs[index];
          if (!doc) {
            missing += 1;
            return;
          }
          candidates.push(candidateFromDoc(summary, doc));
        });
        const ranked = rankRegions(candidates);
        if (ranked.length === 0 && wanted.length > 0) {
          throw new Error('The region series for this season did not load.');
        }
        if (ranked.length > 0) CACHE.set(key, ranked);
        if (alive) setState({ key, rows: ranked, loading: false, error: null, missing });
      } catch (error) {
        if (alive) {
          setState({ key, rows: null, loading: false, error: errorText(error), missing: 0 });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [variable, season, attempt]);

  // The rows are a single-tab-stop listbox: arrow keys move the highlight.
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('.rb-row') ?? [],
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % buttons.length;
    else if (event.key === 'ArrowUp')
      next = current <= 0 ? buttons.length - 1 : current - 1;
    buttons[next]?.focus();
  }, []);

  const subtitle = useMemo(() => rankSubtitle(variable, season), [variable, season]);
  const stale = state.key !== currentKey;
  const rows = stale ? null : state.rows;
  const loading = stale || state.loading;
  const error = stale ? null : state.error;

  return (
    <section className="rb" aria-label={`Regions ranked by significance: ${subtitle}`}>
      <div className="rb-head">
        <p className="ed-eyebrow">Ranked by significance</p>
        {rows && rows.length > 0 ? (
          <span className="rb-count">{rows.length} regions</span>
        ) : null}
      </div>
      <div className="rb-controls" role="group" aria-label="Ranking criteria">
        <label className="rb-control-label">
          <span className="visually-hidden">Metric</span>
          <select
            className="rb-select"
            aria-label="Select metric"
            value={variable}
            onChange={(e) => onChangeVariable?.(e.target.value as RankVariable)}
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.shortLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="rb-control-label">
          <span className="visually-hidden">Season</span>
          <select
            className="rb-select"
            aria-label="Select season"
            value={season}
            onChange={(e) => onChangeSeason?.(e.target.value)}
          >
            <option value="ANN">Annual (ANN)</option>
            <option value="DJF">Dec–Feb (DJF)</option>
            <option value="MAM">Mar–May (MAM)</option>
            <option value="JJA">Jun–Aug (JJA)</option>
            <option value="SON">Sep–Nov (SON)</option>
          </select>
        </label>
      </div>
      <p className="rb-sub">{subtitle}</p>

      {loading ? (
        <div aria-live="polite" aria-busy="true">
          <span className="rb-state" role="status">
            Loading region trends…
          </span>
          {Array.from({ length: 4 }, (_, index) => (
            <span className="rb-skeleton-row" key={index} aria-hidden="true">
              <span className="rb-skeleton" />
              <span className="rb-skeleton" />
            </span>
          ))}
        </div>
      ) : error ? (
        <div className="rb-state rb-state--error" role="alert">
          <p style={{ margin: 0 }}>Region trends did not load. {error}</p>
          <button
            type="button"
            className="rb-retry"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="rb-state">
          No region series for this variable and season yet.
        </p>
      ) : (
        <>
          <div
            ref={listRef}
            role="listbox"
            aria-label={`Regions, ${subtitle}, smallest p-value first`}
            className="rb-list"
            onKeyDown={onKeyDown}
          >
            {rows.map((row, index) => {
              const selected = row.regionId === selectedRegionId;
              const slope = formatSlope(row.slopePerDecade, row.units);
              const p = formatRankPValue(row.pValue);
              const marker = significanceLabel(row.significance);
              return (
                <button
                  key={row.regionId}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={selected || (!selectedRegionId && index === 0) ? 0 : -1}
                  className={`rb-row rb-row--${row.significance}${selected ? ' rb-row--selected' : ''}`}
                  onClick={() => onSelectRegion(row.regionId)}
                >
                  <span className="rb-rank" aria-hidden="true">
                    {rankIndexLabel(row)}
                  </span>
                  <span className="rb-main">
                    <span className="rb-line">
                      <span className="rb-name">{row.regionLabel}</span>
                      <span className={`rb-slope rb-slope--${row.direction}`}>
                        {slope}
                      </span>
                    </span>
                    <span className="rb-meta">
                      <span className="rb-bar" aria-hidden="true">
                        <span
                          className="rb-bar-fill"
                          style={{ width: `${Math.round(row.barFraction * 100)}%` }}
                        />
                      </span>
                      <span className="rb-p">
                        {row.pValue === null ? 'p —' : p.startsWith('<') ? `p ${p}` : `p = ${p}`}
                      </span>
                      <span
                        className={`rb-sig${
                          row.significance === 'significant' ? ' rb-sig--significant' : ''
                        }`}
                      >
                        {marker}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {state.missing > 0 ? (
            <p className="rb-state">
              {state.missing} of {rows.length + state.missing} region series could not be
              loaded.
            </p>
          ) : null}

          <div className="rb-foot"><p><span title="Raw p-values, ranked for navigation only: no multiple-testing correction on this list. The trend maps use Benjamini–Hochberg (q = 0.10).">p-value</span><InfoTip term="pValue" /> · Mann–Kendall test<InfoTip term="mannKendall" /></p><p>Sen’s slope<InfoTip term="senSlope" /></p></div>
        </>
      )}
    </section>
  );
}

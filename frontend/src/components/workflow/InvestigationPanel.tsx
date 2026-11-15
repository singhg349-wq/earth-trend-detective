import { METRICS, metricById, type MetricId } from '../../lib/metrics';
import { getGridCatalog } from '../../data/seriesSource';
import InfoTip from '../InfoTip';
import { useEffect, useState } from 'react';
import type { PeriodKey } from '../../data/exports';
import PlaceSearch from '../search/PlaceSearch';
import type { PlaceResult } from '../../lib/gazetteer';
import './workflow.css';

export interface WorkflowPlace {
  name: string;
  lon: number;
  lat: number;
  regionId: string | null;
}

export interface WorkflowSelection {
  place: WorkflowPlace;
  variable: MetricId;
  season: string;
  period: PeriodKey;
}

const SEASONS: Array<{ code: string; label: string; detail: string }> = [
  { code: 'DJF', label: 'Winter', detail: 'Dec\u2013Feb' },
  { code: 'MAM', label: 'Spring', detail: 'Mar\u2013May' },
  { code: 'JJA', label: 'Summer', detail: 'Jun\u2013Aug' },
  { code: 'SON', label: 'Autumn', detail: 'Sep\u2013Nov' },
  { code: 'ANN', label: 'Annual', detail: 'Jan\u2013Dec' },
];

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'full', label: 'Full record' },
  { key: 'first-half', label: 'First half' },
  { key: 'second-half', label: 'Second half' },
];

interface InvestigationPanelProps {
  place: WorkflowPlace | null;
  initialVariable: string;
  initialSeason: string;
  initialPeriod: PeriodKey;
  onChooseRegion: (regionId: string) => void;
  onChoosePoint: (lon: number, lat: number) => void;
  onRun: (selection: WorkflowSelection) => void;
  onClose: () => void;
}

function fmtCoord(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(2)}\u00b0${value < 0 ? negative : positive}`;
}

/**
 * The four-step investigation workflow: Place, Metric, Season, Period, then Run.
 * It is the primary way to start an investigation. Metric/season/period live here
 * as a pending selection and are only applied when the user presses Run; the place
 * is owned by App (it can be set by search, a region click or a globe click).
 */
export default function InvestigationPanel({
  place,
  initialVariable,
  initialSeason,
  initialPeriod,
  onChooseRegion,
  onChoosePoint,
  onRun,
  onClose,
}: InvestigationPanelProps) {
  const [variable, setVariable] = useState<MetricId>(
    metricById(initialVariable)?.id ?? 'precipitation',
  );
  const [available, setAvailable] = useState<string[]>(['precip','t2m']);
  useEffect(() => { let alive = true; void getGridCatalog().then(c => { if(alive && c) setAvailable(Object.keys(c.index.variables)); }); return () => {alive = false;}; }, []);
  const [season, setSeason] = useState(initialSeason);
  const [period, setPeriod] = useState<PeriodKey>(initialPeriod);
  const isRegion = place?.regionId != null;
  const canRun = place !== null;

  function choosePlace(result: PlaceResult) {
    if (result.regionId) onChooseRegion(result.regionId);
    else onChoosePoint(result.lon, result.lat);
  }

  function run() {
    if (!place) return;
    onRun({
      place,
      variable,
      // Named regions only carry a DJF series; grid points honour the full set.
      season: isRegion ? 'DJF' : season,
      period,
    });
  }

  return (
    <section className="investigation-panel ed-panel" aria-label="Start an investigation">
      <header className="inv-head">
        <div>
          <p className="ed-eyebrow">Investigation</p>
          <h2 className="ed-h3">Start an investigation</h2>
        </div>
        <button type="button" className="inv-close" onClick={onClose} aria-label="Close workflow">
          &times;
        </button>
      </header>

      <div className="inv-step">
        <p className="inv-step-label">
          <span className="inv-step-no">01</span> Place
        </p>
        <PlaceSearch
          autoFocus
          onChoose={choosePlace}
          onClose={onClose}
        />
        <p className="inv-hint">or click the globe</p>
        <div className="inv-place" aria-live="polite">
          {place ? (
            <>
              <span className="inv-place-name">{place.name}</span>
              <span className="inv-place-coord">
                {fmtCoord(place.lat, 'N', 'S')}, {fmtCoord(place.lon, 'E', 'W')}
              </span>
            </>
          ) : (
            <span className="inv-place-empty">No place chosen yet</span>
          )}
        </div>
      </div>

      <div className="inv-step">
        <p className="inv-step-label">
          <span className="inv-step-no">02</span> Metric{variable === "soil_moisture" && <InfoTip term="soil" />}
        </p>
        <div className="inv-seg" role="group" aria-label="Metric">
          {METRICS.filter(m => available.includes(m.slug)).map((metric) => (
            <button
              key={metric.id}
              type="button"
              className={variable === metric.id ? 'inv-seg-btn is-active' : 'inv-seg-btn'}
              aria-pressed={variable === metric.id}
              onClick={() => setVariable(metric.id)}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div className="inv-step">
        <p className="inv-step-label">
          <span className="inv-step-no">03</span> Season<InfoTip term="seasons" />
        </p>
        <div className="inv-seg inv-seg-wrap" role="group" aria-label="Season">
          {SEASONS.map((entry) => (
            <button
              key={entry.code}
              type="button"
              title={entry.detail}
              className={season === entry.code ? 'inv-seg-btn is-active' : 'inv-seg-btn'}
              aria-pressed={season === entry.code}
              onClick={() => setSeason(entry.code)}
            >
              {entry.label}
              <span className="inv-seg-sub">{entry.code}</span>
            </button>
          ))}
        </div>
        {isRegion && (
          <p className="inv-note">The ten named regions have a DJF series only; other seasons apply to grid points.</p>
        )}
      </div>

      <div className="inv-step">
        <p className="inv-step-label">
          <span className="inv-step-no">04</span> Period
        </p>
        <div className="inv-seg" role="group" aria-label="Period">
          {PERIODS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={period === option.key ? 'inv-seg-btn is-active' : 'inv-seg-btn'}
              aria-pressed={period === option.key}
              onClick={() => {
                setPeriod(option.key);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="ed-btn ed-btn--primary inv-run"
        disabled={!canRun}
        onClick={run}
      >
        Run investigation
      </button>
    </section>
  );
}

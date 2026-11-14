import { useEffect, useRef, useState } from 'react';
import MapView from './components/MapView';
import SeriesCard from './components/SeriesCard';
import Timelapse from './components/Timelapse';
import {
  getRegionsGeoJson,
  getSeries,
  getTimelapseIndex,
  listSeries,
  timelapseFrameUrl,
} from './data/seriesSource';
import type {
  RegionsGeoJson,
  SeriesDoc,
  SeriesSummary,
  TimelapseIndex,
} from './types';

type Slot = 'A' | 'B';
type Bbox = [number, number, number, number];

const FALLBACK_EXTENT: Bbox = [-180, -90, 180, 90];

function bboxOf(doc: SeriesDoc | null): Bbox | null {
  const bbox = doc?.region.bbox;
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    bbox.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    return null;
  }
  return [bbox[0], bbox[1], bbox[2], bbox[3]];
}

function mergeBoxes(boxes: Bbox[]): Bbox | null {
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

export default function App() {
  const [seriesList, setSeriesList] = useState<SeriesSummary[] | null>(null);
  const [regions, setRegions] = useState<RegionsGeoJson | null>(null);
  const [timelapse, setTimelapse] = useState<TimelapseIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const [slotA, setSlotA] = useState<SeriesDoc | null>(null);
  const [slotB, setSlotB] = useState<SeriesDoc | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>('A');

  const [year, setYear] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showTimelapseOnMap, setShowTimelapseOnMap] = useState(true);

  const requestRef = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, regionData, timelapseIndex] = await Promise.all([
          listSeries(),
          getRegionsGeoJson(),
          getTimelapseIndex(),
        ]);
        if (!alive) return;
        setSeriesList(list);
        setRegions(regionData);
        setTimelapse(timelapseIndex);
        if (timelapseIndex) setYear(timelapseIndex.years[timelapseIndex.years.length - 1]);
      } catch (error) {
        if (alive) setLoadError(errorText(error));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!playing || !timelapse || timelapse.years.length < 2) return;
    const timer = window.setInterval(() => {
      setYear((current) => {
        const years = timelapse.years;
        const index = years.indexOf(current ?? years[0]);
        return years[(index + 1) % years.length];
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, timelapse]);

  async function chooseSeries(summary: SeriesSummary) {
    const token = requestRef.current + 1;
    requestRef.current = token;
    setLoadingId(summary.id);
    setPickError(null);
    try {
      const doc = await getSeries(summary.id);
      if (requestRef.current !== token) return;
      if (activeSlot === 'A') {
        setSlotA(doc);
        if (!slotB) setActiveSlot('B');
      } else {
        setSlotB(doc);
      }
    } catch (error) {
      if (requestRef.current === token) setPickError(errorText(error));
    } finally {
      if (requestRef.current === token) setLoadingId(null);
    }
  }

  function pinTo(doc: SeriesDoc, target: Slot) {
    if (target === 'A') {
      if (slotA?.id === doc.id) return;
      const displaced = slotA;
      setSlotA(doc);
      if (slotB?.id === doc.id) setSlotB(displaced);
    } else {
      if (slotB?.id === doc.id) return;
      const displaced = slotB;
      setSlotB(doc);
      if (slotA?.id === doc.id) setSlotA(displaced);
    }
  }

  function removeSlot(slot: Slot) {
    if (slot === 'A') setSlotA(null);
    else setSlotB(null);
    setActiveSlot(slot);
  }

  function selectFromMap(regionId: string) {
    const summary = seriesList?.find((item) => item.region_id === regionId);
    if (summary) void chooseSeries(summary);
  }

  const fixtureData =
    [slotA, slotB].some((doc) => doc?.validation.status === 'fixture') ||
    Boolean(
      timelapse && (timelapse.fixture || /fixture/i.test(timelapse.source)),
    );
  const inferenceUnavailable = [slotA, slotB].some(
    (doc) => doc?.trend.inference.status === 'unavailable',
  );
  const validationFailed = [slotA, slotB].some(
    (doc) => doc?.validation.status === 'failed',
  );

  const focus = mergeBoxes(
    [bboxOf(slotA), bboxOf(slotB)].filter((box): box is Bbox => box !== null),
  );
  const selectedRegionIds = [slotA?.region.id, slotB?.region.id].filter(
    (id): id is string => typeof id === 'string',
  );

  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">Seasonal climate comparison</p>
        <h1>Earth System Trend Detective</h1>
        <p className="lede">
          Compare DJF rainfall for regions of the world. DJF is December, January and
          February, labelled by the January year.
        </p>
      </header>

      {fixtureData && (
        <div className="banner banner-fixture">
          <strong>FIXTURE DATA</strong>
          <span>
            The values and time-lapse frames shown are placeholders for interface testing.
            They are not climate results.
          </span>
        </div>
      )}
      {inferenceUnavailable && (
        <div className="banner banner-info">
          <strong>Inference unavailable</strong>
          <span>
            A descriptive Sen slope is shown. No p-value, significance verdict or
            confidence interval is displayed until the inference method is validated.
          </span>
        </div>
      )}
      {validationFailed && (
        <div className="banner banner-error">
          <strong>Validation failed</strong>
          <span>These values did not pass an independent reference check.</span>
        </div>
      )}
      {loadError && (
        <div className="banner banner-error">
          <strong>Data could not be loaded</strong>
          <span>{loadError}</span>
        </div>
      )}

      <div className="layout">
        <aside className="panel sidebar">
          <h2>Choose a region</h2>
          <p className="muted">
            Pick from the list or click a region on the map. The next pick fills result{' '}
            <strong>{activeSlot}</strong>.
          </p>

          <div className="slot-switch" role="group" aria-label="Result slot to fill">
            <button
              type="button"
              className={activeSlot === 'A' ? 'slot active' : 'slot'}
              onClick={() => setActiveSlot('A')}
              aria-pressed={activeSlot === 'A'}
            >
              <span className="slot-name">A</span>
              <span>{slotA ? slotA.region.label : 'empty'}</span>
            </button>
            <button
              type="button"
              className={activeSlot === 'B' ? 'slot active' : 'slot'}
              onClick={() => setActiveSlot('B')}
              aria-pressed={activeSlot === 'B'}
            >
              <span className="slot-name">B</span>
              <span>{slotB ? slotB.region.label : 'empty'}</span>
            </button>
          </div>

          {pickError && <p className="error">{pickError}</p>}
          {loadingId && <p className="muted">Loading {loadingId}…</p>}

          <div className="region-list">
            {seriesList === null && !loadError && <p className="muted">Loading regions…</p>}
            {seriesList?.length === 0 && (
              <p className="muted">No series were found. Add JSON files to data/artifacts.</p>
            )}
            {seriesList?.map((summary) => {
              const pinned = [
                slotA?.id === summary.id ? 'A' : null,
                slotB?.id === summary.id ? 'B' : null,
              ]
                .filter(Boolean)
                .join('/');
              return (
                <button
                  key={summary.id}
                  type="button"
                  className={
                    [slotA?.id, slotB?.id].includes(summary.id)
                      ? 'region selected'
                      : 'region'
                  }
                  onClick={() => void chooseSeries(summary)}
                  disabled={loadingId !== null}
                >
                  <span className="region-top">
                    <span className="region-name">{summary.region_label}</span>
                    {pinned && <span className="pin-mark">{pinned}</span>}
                  </span>
                  <span className="region-meta">
                    {summary.season} · {summary.variable} · {summary.units}
                  </span>
                  {(summary.fixture || summary.validation_status !== 'passed') && (
                    <span className={`tag tag-${summary.validation_status}`}>
                      {summary.validation_status}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="content">
          <section className="panel map-panel">
            <div className="panel-head">
              <h2>Map</h2>
              <p className="muted">Region outlines come from local GeoJSON.</p>
            </div>
            <MapView
              regions={regions}
              selectedRegionIds={selectedRegionIds}
              focusBbox={focus}
              timelapseUrl={timelapse && year !== null ? timelapseFrameUrl(year) : null}
              timelapseExtent={timelapse?.extent ?? FALLBACK_EXTENT}
              showTimelapse={showTimelapseOnMap}
              onSelectRegion={selectFromMap}
            />
          </section>

          <Timelapse
            index={timelapse}
            year={year}
            playing={playing}
            showOnMap={showTimelapseOnMap}
            onChangeYear={setYear}
            onTogglePlay={() => setPlaying((value) => !value)}
            onToggleMap={setShowTimelapseOnMap}
          />

          <section className="results" aria-label="Comparison results">
            <div className="results-head">
              <h2>Comparison</h2>
              <p className="muted">Pin up to two regions and compare them side by side.</p>
            </div>
            <div className="cards">
              {slotA ? (
                <SeriesCard
                  slot="A"
                  doc={slotA}
                  highlightYear={year}
                  onPin={(target) => pinTo(slotA, target)}
                  onRemove={() => removeSlot('A')}
                />
              ) : (
                <div className={activeSlot === 'A' ? 'card empty active' : 'card empty'}>
                  <p className="card-slot">Result A</p>
                  <p>Pick a region to fill result A.</p>
                  <button type="button" className="pin" onClick={() => setActiveSlot('A')}>
                    Choose for A
                  </button>
                </div>
              )}

              {slotB ? (
                <SeriesCard
                  slot="B"
                  doc={slotB}
                  highlightYear={year}
                  onPin={(target) => pinTo(slotB, target)}
                  onRemove={() => removeSlot('B')}
                />
              ) : (
                <div className={activeSlot === 'B' ? 'card empty active' : 'card empty'}>
                  <p className="card-slot">Result B</p>
                  <p>Pick a second region to compare.</p>
                  <button type="button" className="pin" onClick={() => setActiveSlot('B')}>
                    Choose for B
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      <footer className="footer">
        <p>
          Time-lapse year {year ?? '–'}
          {timelapse ? ` of ${timelapse.years.length} frames` : ''}. Values are seasonal
          means in the units shown on each result.
        </p>
      </footer>
    </div>
  );
}

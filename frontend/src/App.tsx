import { useEffect, useMemo, useRef, useState } from 'react';
import CellCard from './components/CellCard';
import MapView from './components/MapView';
import SeriesCard from './components/SeriesCard';
import Timelapse from './components/Timelapse';
import {
  FDR_Q,
  getCellSeries,
  getGridCatalog,
  getRegionsGeoJson,
  getSeries,
  getTimelapseIndex,
  getTrendMapCatalog,
  listSeries,
  timelapseFrameUrl,
  trendMapHatchGeoJsonUrl,
  trendMapHatchUrl,
  trendMapUrl,
} from './data/seriesSource';
import type { GridCatalog, TrendMapEntry } from './data/seriesSource';
import type { CellSeriesOutcome } from './lib/tiles';
import type {
  RegionsGeoJson,
  SeriesDoc,
  SeriesSummary,
  TimelapseIndex,
} from './types';

type Slot = 'A' | 'B';
type Bbox = [number, number, number, number];

const FALLBACK_EXTENT: Bbox = [-180, -90, 180, 90];
const SEASONS = ['ANN', 'DJF', 'MAM', 'JJA', 'SON'] as const;

const VARIABLES = [
  { slug: 'precip', label: 'Rainfall', source: 'GPCP 3.3' },
  { slug: 't2m', label: '2 m air temperature', source: 'MERRA-2' },
  { slug: 'aod', label: 'Aerosol optical depth', source: 'MERRA-2' },
  { slug: 'soil', label: 'Soil moisture', source: 'GLDAS 2.1' },
] as const;

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

function cellBbox(lon: number, lat: number): Bbox {
  const lonNorm = ((((lon + 180) % 360) + 360) % 360) - 180;
  const latClamped = Math.min(89.999999, Math.max(-90, lat));
  const west = Math.floor(lonNorm);
  const south = Math.floor(latClamped);
  return [west, south, west + 1, south + 1];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

export default function App() {
  const [seriesList, setSeriesList] = useState<SeriesSummary[] | null>(null);
  const [regions, setRegions] = useState<RegionsGeoJson | null>(null);
  const [timelapse, setTimelapse] = useState<TimelapseIndex | null>(null);
  const [gridCatalog, setGridCatalog] = useState<GridCatalog | null>(null);
  const [trendMaps, setTrendMaps] = useState<TrendMapEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const [slotA, setSlotA] = useState<SeriesDoc | null>(null);
  const [slotB, setSlotB] = useState<SeriesDoc | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>('A');

  const [year, setYear] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showTimelapseOnMap, setShowTimelapseOnMap] = useState(true);

  const [variable, setVariable] = useState('precip');
  const [season, setSeason] = useState('DJF');
  const [trendMapOn, setTrendMapOn] = useState(false);
  const [cellOutcome, setCellOutcome] = useState<CellSeriesOutcome | null>(null);
  const [cellLoading, setCellLoading] = useState(false);
  const [cellError, setCellError] = useState<string | null>(null);
  const [pickedPoint, setPickedPoint] = useState<[number, number] | null>(null);

  const requestRef = useRef(0);
  const cellRequestRef = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, regionData, timelapseIndex, catalog, maps] = await Promise.all([
          listSeries(),
          getRegionsGeoJson(),
          getTimelapseIndex(),
          getGridCatalog(),
          getTrendMapCatalog(),
        ]);
        if (!alive) return;
        setSeriesList(list);
        setRegions(regionData);
        setTimelapse(timelapseIndex);
        setGridCatalog(catalog);
        setTrendMaps(maps);
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

  const variableMeta = gridCatalog?.index.variables[variable] ?? null;
  const variableSelection = VARIABLES.find((item) => item.slug === variable);
  const selectedTrendMap =
    trendMaps.find((entry) => entry.variable === variable && entry.season === season) ??
    null;
  const trendUrl = selectedTrendMap ? trendMapUrl(selectedTrendMap) : null;
  const trendHatchUrl = selectedTrendMap ? trendMapHatchUrl(selectedTrendMap) : null;
  const trendHatchGeoJsonUrl = selectedTrendMap
    ? trendMapHatchGeoJsonUrl(selectedTrendMap)
    : null;
  const trendFdrQ = selectedTrendMap?.fdr_q ?? FDR_Q;
  const hasTrendHatch = Boolean(trendHatchUrl || trendHatchGeoJsonUrl);

  useEffect(() => {
    if (!trendUrl && trendMapOn) setTrendMapOn(false);
  }, [trendUrl, trendMapOn]);

  useEffect(() => {
    // A variable or season change invalidates the clicked cell and any request
    // still in flight.
    cellRequestRef.current += 1;
    setCellOutcome(null);
    setCellError(null);
    setCellLoading(false);
    setPickedPoint(null);
  }, [variable, season]);

  function chooseVariable(slug: string) {
    setVariable(slug);
    const meta = gridCatalog?.index.variables[slug];
    if (!meta) return;
    if (!meta.years_by_season?.[season]?.length) {
      const next = SEASONS.find(
        (code) => (meta.years_by_season?.[code]?.length ?? 0) > 0,
      );
      if (next) setSeason(next);
    }
  }

  async function pickCell(lon: number, lat: number) {
    const token = cellRequestRef.current + 1;
    cellRequestRef.current = token;
    setPickedPoint([lon, lat]);
    setCellLoading(true);
    setCellError(null);
    try {
      const outcome = await getCellSeries({ lon, lat, variable, season });
      if (cellRequestRef.current !== token) return;
      setCellOutcome(outcome);
    } catch (error) {
      if (cellRequestRef.current === token) setCellError(errorText(error));
    } finally {
      if (cellRequestRef.current === token) setCellLoading(false);
    }
  }

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

  function clearCell() {
    cellRequestRef.current += 1;
    setCellOutcome(null);
    setCellError(null);
    setCellLoading(false);
    setPickedPoint(null);
  }

  const pickedCellBbox = useMemo<Bbox | null>(
    () => (pickedPoint ? cellBbox(pickedPoint[0], pickedPoint[1]) : null),
    [pickedPoint],
  );

  const gridFixture =
    Boolean(gridCatalog?.fixture) || Boolean(selectedTrendMap?.fixture);
  const fixtureData =
    [slotA, slotB].some((doc) => doc?.validation.status === 'fixture') ||
    Boolean(
      timelapse && (timelapse.fixture || /fixture/i.test(timelapse.source)),
    ) ||
    gridFixture;
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
          Compare seasonal trends for regions of the world, or click any spot for one
          1 degree cell. DJF is December, January and February, labelled by the
          January year.
        </p>
      </header>

      {fixtureData && (
        <div className="banner banner-fixture">
          <strong>FIXTURE DATA</strong>
          <span>
            Grid cells, trend maps and series shown are placeholders for interface
            testing. They are not climate results.
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
          {loadingId && <p className="muted">Loading {loadingId}&hellip;</p>}

          <div className="region-list">
            {seriesList === null && !loadError && (
              <p className="muted">Loading regions&hellip;</p>
            )}
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
                    {summary.season} &middot; {summary.variable} &middot; {summary.units}
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
          <section className="panel controls-panel" aria-label="Variable, season and map layers">
            <div className="control-groups">
              <div className="control-group">
                <h2>Variable</h2>
                <div className="chips">
                  {VARIABLES.map((option) => {
                    const ready = Boolean(gridCatalog?.index.variables[option.slug]);
                    return (
                      <button
                        key={option.slug}
                        type="button"
                        className={variable === option.slug ? 'chip active' : 'chip'}
                        onClick={() => chooseVariable(option.slug)}
                        disabled={!ready}
                        aria-pressed={variable === option.slug}
                        title={ready ? option.source : `${option.label}: not ready`}
                      >
                        <span>{option.label}</span>
                        <span className="chip-sub">
                          {ready ? option.source : 'not ready'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="control-group">
                <h2>Season</h2>
                <div className="chips season-chips">
                  {SEASONS.map((code) => {
                    const ready = Boolean(
                      variableMeta?.years_by_season?.[code]?.length,
                    );
                    return (
                      <button
                        key={code}
                        type="button"
                        className={season === code ? 'chip active' : 'chip'}
                        onClick={() => setSeason(code)}
                        disabled={!ready}
                        aria-pressed={season === code}
                        title={ready ? `${code} available` : `${code}: not ready`}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="control-group layer-group">
                <h2>Trend map</h2>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={trendMapOn}
                    disabled={!trendUrl}
                    onChange={(event) => setTrendMapOn(event.target.checked)}
                  />
                  Show Sen slope layer
                </label>
                <div className="trend-legend">
                  <span className="trend-legend-bar" />
                  <span className="trend-legend-labels">
                    <span>negative</span>
                    <span>zero</span>
                    <span>positive</span>
                  </span>
                </div>
                {hasTrendHatch && (
                  <div className="trend-hatch-legend">
                    <span className="trend-hatch-swatch" aria-hidden="true" />
                    <span>
                      hatched = passes FDR q = {trendFdrQ.toFixed(2)}
                    </span>
                  </div>
                )}
                <p className="muted control-note">
                  {trendUrl
                    ? 'Every valid cell is coloured by its full-period Sen slope. ' +
                      (hasTrendHatch
                        ? `Hatched cells pass the false-discovery-rate test at q = ${trendFdrQ.toFixed(2)}. Significant cells can cluster in space, so a cluster is not independent confirmation.`
                        : 'No FDR hatch mask is available for this layer.') +
                      (selectedTrendMap?.fixture ? ' Fixture layer.' : '')
                    : 'No trend map for this variable and season yet.'}
                </p>
              </div>
            </div>
            <p className="muted grid-note">
              {gridCatalog
                ? `Grid catalog format v${gridCatalog.index.format_version}; ${
                    Object.keys(gridCatalog.index.variables).length
                  } variable(s) ready.`
                : 'Global grid artifacts are not present; clicked-cell results are unavailable.'}
            </p>
          </section>

          <section className="panel map-panel">
            <div className="panel-head">
              <h2>Map</h2>
              <p className="muted">Local outlines and local raster layers.</p>
            </div>
            <MapView
              regions={regions}
              selectedRegionIds={selectedRegionIds}
              focusBbox={focus}
              timelapseUrl={timelapse && year !== null ? timelapseFrameUrl(year) : null}
              timelapseExtent={timelapse?.extent ?? FALLBACK_EXTENT}
              showTimelapse={showTimelapseOnMap}
              trendMapUrl={trendMapOn ? trendUrl : null}
              trendMapHatchUrl={
                trendMapOn && !trendHatchGeoJsonUrl ? trendHatchUrl : null
              }
              trendMapHatchGeoJsonUrl={trendMapOn ? trendHatchGeoJsonUrl : null}
              trendMapExtent={FALLBACK_EXTENT}
              pickedCellBbox={pickedCellBbox}
              onSelectRegion={selectFromMap}
              onPickCell={(lon, lat) => void pickCell(lon, lat)}
            />
          </section>

          <section className="panel cell-panel" aria-label="Clicked cell result">
            <div className="panel-head">
              <div>
                <h2>Clicked cell</h2>
                <p className="muted">
                  {variableSelection?.label ?? variable} &middot; {season}. One 10 x 10
                  degree tile is fetched per click.
                </p>
              </div>
              {gridFixture && <span className="tag tag-fixture">fixture grid</span>}
            </div>
            <CellCard
              outcome={cellOutcome}
              loading={cellLoading}
              error={cellError}
              fixture={gridFixture}
              onClear={clearCell}
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
          Time-lapse year {year ?? '--'}
          {timelapse ? ` of ${timelapse.years.length} frames` : ''}. Cell results use
          the same method as the featured regions and are not individually checked.
        </p>
      </footer>
    </div>
  );
}

import GlossaryPage from './pages/GlossaryPage';
import PresentMode from './present/PresentMode';
import type { PresentStep } from './present/steps';
import PlaybackBar from './components/timelapse/PlaybackBar';
import { metricById } from './lib/metrics';
import type { EnsoOverlay } from './pages/EnsoPage';
import './components/results-r4.css';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import GlobeView, { type FocusTarget } from './components/GlobeView';
import Inspector from './components/Inspector';
import LibraryOverlay from './components/LibraryOverlay';
import PinRail from './components/PinRail';
import TopBar from './components/TopBar';
import EnsoPage from './pages/EnsoPage';
import LandingHero from './components/landing/LandingHero';
import RegionRankList from './components/rightbar/RegionRankList';
import InvestigationPanel, {
  type WorkflowPlace,
  type WorkflowSelection,
} from './components/workflow/InvestigationPanel';
import PlaceSearch from './components/search/PlaceSearch';
import { STUDY_REGIONS, type PlaceResult } from './lib/gazetteer';
import './app-controls.css';
import { MAX_SLOTS, type SlotSettings } from './data/comparison';
import { getEnso, type EnsoDoc } from './data/enso';
import type { ContractResult } from './lib/types';
import {
  deleteInvestigation,
  loadSaved,
  saveInvestigation,
  type SavedInvestigation,
} from './data/library';
import {
  getRegionsGeoJson,
  getSeries,
  getTimelapseIndex,
  listSeries,
  timelapseFrameUrl,
  getCellSeries,
  type CellSeriesRequest,
} from './data/seriesSource';
import {
  createInitialState,
  drawerWidth,
  inspectorItems,
  investigationReducer,
  panelStyle,
  pinnedItems,
  type AppMode,
  type ComparisonEntry,
} from './state/investigation';
import type { RegionsGeoJson, SeriesDoc, SeriesSummary } from './types';

type Bbox = [number, number, number, number];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

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

/** Convert a grid-cell outcome's contract result into the drawer's `SeriesDoc`. */
function cellResultToDoc(cellResult: ContractResult): SeriesDoc {
  return {
    id: cellResult.id,
    variable: cellResult.variable,
    units: metricById(cellResult.variable)?.units ?? cellResult.units,
    source: {
      product: cellResult.source.product,
      version: cellResult.source.version,
      var: cellResult.source.var,
      doi_or_url: cellResult.source.doi_or_url,
    },
    region: {
      id: cellResult.region.id,
      label: cellResult.region.label,
      geometry: cellResult.geometry_file ?? undefined,
      bbox: cellResult.region.bbox,
      cells_used: 1,
      area_km2: cellResult.region.area_km2,
    },
    season: {
      code: cellResult.season.code,
      year_label: cellResult.season.year_label,
      months: cellResult.season.months,
      aggregation: cellResult.season.aggregation,
    },
    years: cellResult.years,
    values: cellResult.values,
    coverage: cellResult.coverage,
    anomaly_baseline: cellResult.anomaly_baseline,
    geometry_file: cellResult.geometry_file ?? undefined,
    template_summary: cellResult.template_summary,
    trend: {
      sen_slope_per_decade: cellResult.trend.sen_slope_per_decade,
      intercept: cellResult.trend.intercept,
      method: cellResult.trend.method,
      slope_units: cellResult.trend.slope_units,
      n_valid: cellResult.trend.n_valid,
      period: cellResult.trend.period,
      inference: {
        status: cellResult.trend.inference.status,
        p_value: cellResult.trend.inference.p_value ?? null,
        ci: cellResult.trend.inference.ci ?? null,
        method: cellResult.trend.inference.method,
        strict_check_pass: cellResult.trend.inference.strict_check_pass ?? null,
        strict_check_p: cellResult.trend.inference.strict_check_p ?? null,
        lag1: cellResult.trend.inference.lag1 ?? null,
        caution: cellResult.trend.inference.caution ?? false,
        ci_note: cellResult.trend.inference.ci_note ?? null,
        n: cellResult.trend.inference.n ?? null,
      },
    },
    validation: {
      reference: cellResult.validation.reference,
      status: cellResult.validation.status,
      notes: cellResult.validation.notes,
    },
    generated: cellResult.generated,
    code_version: cellResult.code_version,
  };
}

interface LoadedRegion {
  doc: SeriesDoc;
  enso: EnsoDoc | null;
}

export default function App() {
  // One reducer owns the investigation; effects below only fetch and dispatch.
  const [state, dispatch] = useReducer(investigationReducer, undefined, createInitialState);
  const { mode, comparison, exploreDoc, pins, addMode, timelapse, status, saved } = state;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const series = params.get('series');
    const loadLinkedTimelapse=(variable:string,season:string)=>{if(params.get('timelapse')==='1')void getTimelapseIndex(variable,season).then(index=>{if(index)dispatch({type:'openTimelapse',variable:metricById(variable)?.slug ?? variable,season,index});});};
    const lat = Number(params.get('lat')), lon = Number(params.get('lon'));
    let alive = true;
    if(series) {
      void getSeries(series).then(doc => {if(alive){dispatch({type:'loadExplore',doc,enso:null});dispatch({type:'applySharedSettings',patch:{variable:doc.variable,season:doc.season.code}});setAutoRotate(false);setSearchOpen(true);loadLinkedTimelapse(doc.variable,doc.season.code);}}).catch(()=>{});
    } else if(params.has('lat') && params.has('lon') && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90) {
      const variable=metricById(params.get('metric') ?? '')?.id ?? 'precipitation', season=params.get('season') ?? 'DJF';
      dispatch({type:'applySharedSettings',patch:{variable,season}});
      void getCellSeries({lon,lat,variable,season}).then(outcome=>{if(alive && outcome.status==='ok'){dispatch({type:'loadExplore',doc:cellResultToDoc(outcome.result),enso:null});setPickedPoint({lon,lat});setAutoRotate(false);setSearchOpen(true);loadLinkedTimelapse(variable,season);}}).catch(()=>{});
    }
    return ()=>{alive=false;};
  },[]);
  const [seriesList, setSeriesList] = useState<SeriesSummary[] | null>(null);
  const [regions, setRegions] = useState<RegionsGeoJson | null>(null);

  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    const onHash = () => {const hash = window.location.hash;setView(hash.startsWith('#glossary') ? 'glossary' : hash.startsWith('#enso') ? 'enso' : 'globe'); if(hash.startsWith('#glossary/')) requestAnimationFrame(() => document.getElementById('term-'+hash.split('/')[1])?.scrollIntoView());};
    onHash();window.addEventListener('hashchange',onHash);return () => window.removeEventListener('hashchange',onHash);
  },[]);
  const [checksOpen, setChecksOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [pickedPoint, setPickedPoint] = useState<{ lon: number; lat: number } | null>(null);
  const [ensoOverlay, setEnsoOverlay] = useState<EnsoOverlay | null>(null);
  const [view, setView] = useState<'globe' | 'enso' | 'glossary'>(() => window.location.hash.startsWith('#glossary') ? 'glossary' : window.location.hash.startsWith('#enso') ? 'enso' : 'globe');
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<WorkflowPlace | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState<FocusTarget | null>(null);
  const [rightBarOpen, setRightBarOpen] = useState(true);
  // Present mode (keyboard-driven talk). Off unless ?present=1 or the top-bar button.
  const [presenting, setPresenting] = useState(() => new URLSearchParams(window.location.search).get('present') === '1');
  const [presentStep, setPresentStep] = useState<PresentStep | null>(null);
  const [ensoKey, setEnsoKey] = useState(0);
  const demoToken = useRef(0);
  const presentStepRef = useRef<PresentStep | null>(null);
  const seriesListRef = useRef<SeriesSummary[] | null>(null);
  seriesListRef.current = seriesList;

  const requestRef = useRef(0);
  const cellRequestRef = useRef(0);
  const searchFocusSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, regionData] = await Promise.all([
          listSeries(),
          getRegionsGeoJson(),
        ]);
        if (!alive) return;
        setSeriesList(list);
        setRegions(regionData);
      } catch (loadError) {
        if (alive) dispatch({ type: 'setError', message: errorText(loadError) });
      }
    })();
    dispatch({ type: 'setSaved', saved: loadSaved() });
    return () => {
      alive = false;
    };
  }, []);


  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // A search-driven fly is a one-shot: once a result loads, drop the pending
  // centre so closing the drawer does not re-fly to a stale point.
  useEffect(() => {
    if (exploreDoc) setSearchFocus(null);
  }, [exploreDoc]);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const summary of seriesList ?? []) {
      map[summary.region_id] = summary.region_label;
    }
    return map;
  }, [seriesList]);

  async function loadRegion(regionId: string, variable = comparison.shared.variable, season = comparison.shared.season): Promise<LoadedRegion> {
    const point = /^cell_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/.exec(regionId);
    if(point){const outcome=await getCellSeries({lat:Number(point[1]),lon:Number(point[2]),variable,season});if(outcome.status==='no-data')throw new Error(outcome.message);return {doc:cellResultToDoc(outcome.result),enso:null};}
    const summary = (seriesList ?? []).find((item) => item.region_id === regionId && item.variable === variable && item.season === season);
    if (!summary) {
      throw new Error(`No catalogued series for "${regionId}".`);
    }
    const [doc, enso] = await Promise.all([
      getSeries(summary.id),
      getEnso(regionId),
    ]);
    return { doc, enso };
  }

  function togglePin(id: string) {
    // A pin outlives the panel it came from, so it stores its own copy of the
    // result: changing selection or closing the drawer cannot make it vanish.
    const item = inspectorItems(state).find((entry) => entry.id === id);
    dispatch({ type: 'togglePin', id, item });
  }

  function saveResult(id: string) {
    const slot = comparison.slots.find((entry) => entry.id === id);
    if (!slot) return;
    const updated = saveInvestigation({
      name: `${labels[slot.regionId] ?? slot.regionId} · ${slot.period}`,
      mode: 'compare',
      regionIds: [slot.regionId],
      slots: [
        {
          regionId: slot.regionId,
          variable: slot.variable,
          season: slot.season,
          period: slot.period,
        },
      ],
    });
    dispatch({ type: 'setSaved', saved: updated });
    dispatch({ type: 'setBanner', message: 'Saved this result.' });
  }

  async function addRegionById(regionId: string) {
    try {
      const loaded = await loadRegion(regionId);
      dispatch({
        type: 'addSlot',
        doc: loaded.doc,
        enso: loaded.enso,
        settings: comparison.shared,
      });
    } catch (loadError) {
      dispatch({ type: 'setError', message: errorText(loadError) });
    }
  }

  async function openTimelapse(variable: string, season: string) {
    const index = await getTimelapseIndex(variable, season);
    dispatch({ type: 'openTimelapse', variable, season, index });
  }

  async function selectRegion(regionId: string) {
    setAutoRotate(false);
    dispatch({ type: 'setError', message: null });
    const token = requestRef.current + 1;
    requestRef.current = token;
    dispatch({ type: 'setLoading', loading: true });
    try {
      const loaded = await loadRegion(regionId);
      if (requestRef.current !== token) return;
      if (mode === 'compare' || addMode.active) {
        dispatch({
          type: 'addSlot',
          doc: loaded.doc,
          enso: loaded.enso,
          settings: comparison.shared,
        });
      } else {
        dispatch({ type: 'loadExplore', doc: loaded.doc, enso: loaded.enso });
      }
    } catch (loadError) {
      if (requestRef.current === token) {
        dispatch({ type: 'setError', message: errorText(loadError) });
      }
    } finally {
      if (requestRef.current === token) dispatch({ type: 'setLoading', loading: false });
    }
  }

  async function handlePickLocation(lon: number, lat: number, _hitRegionId: string | null) {
    setPickedPoint({ lon, lat });
    setAutoRotate(false);
    dispatch({ type: 'setError', message: null });

    // Use the current shared variable and season for the cell series query.
    const variable = comparison.shared.variable;
    const season = comparison.shared.season;

    const token = cellRequestRef.current + 1;
    cellRequestRef.current = token;
    dispatch({ type: 'setLoading', loading: true });

    try {
      const request: CellSeriesRequest = { lon, lat, variable, season };
      const outcome = await getCellSeries(request);
      if (cellRequestRef.current !== token) return;

      if (outcome.status === 'no-data') {
        dispatch({ type: 'setError', message: outcome.message });
        dispatch({ type: 'setLoading', loading: false });
        return;
      }

      // Convert ContractResult to SeriesDoc format.
      const doc = cellResultToDoc(outcome.result);

      if (mode === 'compare' || addMode.active) {
        dispatch({
          type: 'addSlot',
          doc,
          enso: null, // No ENSO for arbitrary grid cells
          settings: comparison.shared,
        });
      } else {
        dispatch({ type: 'loadExplore', doc, enso: null });
      }
    } catch (loadError) {
      if (cellRequestRef.current === token) {
        dispatch({ type: 'setError', message: errorText(loadError) });
      }
    } finally {
      if (cellRequestRef.current === token) dispatch({ type: 'setLoading', loading: false });
    }
  }

  function navigate(next: AppMode) {
    window.location.hash='';
    setView('globe');
    dispatch({ type: 'navigate', mode: next });
    if (next !== 'explore') setAutoRotate(false);
    else if (!exploreDoc) setAutoRotate(true);
  }

  function handleSave() {
    const regionIds =
      mode === 'compare'
        ? comparison.slots.map((slot) => slot.regionId)
        : exploreDoc
          ? [exploreDoc.region.id]
          : [];
    if (regionIds.length === 0) return;
    const firstName = labels[regionIds[0]] ?? regionIds[0];
    const name =
      regionIds.length > 1 ? `${firstName} +${regionIds.length - 1} more` : firstName;
    const updated = saveInvestigation({
      name,
      mode: mode === 'compare' ? 'compare' : 'explore',
      regionIds,
      slots:
        mode === 'compare'
          ? comparison.slots.map(({ regionId, variable, season, period }) => ({
              regionId,
              variable,
              season,
              period,
            }))
          : exploreDoc ? [{regionId:exploreDoc.region.id,variable:exploreDoc.variable,season:exploreDoc.season.code,period:state.explorePeriod}] : undefined,
    });
    dispatch({ type: 'setSaved', saved: updated });
    dispatch({ type: 'setBanner', message: 'Saved to this browser.' });
  }

  function openSaved(item: SavedInvestigation) {
    dispatch({ type: 'setBanner', message: null });
    if (item.mode === 'compare') {
      dispatch({ type: 'navigate', mode: 'compare' });
      void (async () => {
        // allSettled: one missing region must not discard the slots that do load.
        // Each result keeps its original index so stored settings stay aligned.
        const settled = await Promise.allSettled(item.regionIds.map((id,i) => loadRegion(id,item.slots?.[i]?.variable,item.slots?.[i]?.season)));
        const entries: ComparisonEntry[] = [];
        const missing: string[] = [];
        settled.forEach((outcome, index) => {
          if (outcome.status === 'rejected') {
            missing.push(item.regionIds[index]);
            return;
          }
          const stored = item.slots?.[index];
          entries.push({
            doc: outcome.value.doc,
            enso: outcome.value.enso,
            settings: stored
              ? {
                  variable: stored.variable,
                  season: stored.season,
                  period: stored.period as SlotSettings['period'],
                }
              : undefined,
          });
        });
        dispatch({ type: 'restoreComparison', entries, missing });
      })();
    } else {
      const id = item.regionIds[0];
      dispatch({ type: 'navigate', mode: 'explore' });
      void (async () => {
        try {
          const loaded = await loadRegion(id,item.slots?.[0]?.variable,item.slots?.[0]?.season);
          dispatch({ type: 'loadExplore', doc: loaded.doc, enso: loaded.enso });
          dispatch({type:'applySharedSettings',patch:{variable:loaded.doc.variable,season:loaded.doc.season.code}});
          dispatch({type:'setExplorePeriod',period:(item.slots?.[0]?.period ?? 'full') as SlotSettings['period']});
        } catch (loadError) {
          dispatch({ type: 'setError', message: errorText(loadError) });
        }
      })();
    }
  }

  function openDataset(id: string) {
    const summary = (seriesList ?? []).find((item) => item.id === id);
    if (!summary) return;
    setAutoRotate(false);
    dispatch({ type: 'navigate', mode: 'explore' });
    dispatch({ type: 'applySharedSettings', patch: {variable: summary.variable, season: summary.season} });
    void Promise.all([getSeries(id), getEnso(summary.region_id)]).then(([doc, enso]) => dispatch({type:'loadExplore', doc, enso})).catch(e => dispatch({type:'setError', message:errorText(e)}));
  }

  function handleRegionSelect(regionId: string) {
    if (workflowOpen) {
      const region = STUDY_REGIONS.find((entry) => entry.id === regionId);
      setPendingPlace({
        name: region?.label ?? labels[regionId] ?? regionId,
        lon: region?.lon ?? 0,
        lat: region?.lat ?? 0,
        regionId,
      });
      return;
    }
    setSearchOpen(true);
    void selectRegion(regionId);
  }

  function handleGlobePick(lon: number, lat: number, hitRegionId: string | null) {
    if (workflowOpen) {
      if (hitRegionId) {
        handleRegionSelect(hitRegionId);
      } else {
        setPendingPlace({
          name: `${lat.toFixed(2)}\u00b0, ${lon.toFixed(2)}\u00b0`,
          lon,
          lat,
          regionId: null,
        });
      }
      return;
    }
    setSearchOpen(true);
    void handlePickLocation(lon, lat, hitRegionId);
  }

  async function runInvestigation(selection: WorkflowSelection, list: SeriesSummary[] = seriesList ?? [], stale: () => boolean = () => false) {
    setWorkflowOpen(false);
    setSearchOpen(true);
    setAutoRotate(false);
    dispatch({ type: 'setError', message: null });
    dispatch({
      type: 'applySharedSettings',
      patch: {
        variable: selection.variable,
        season: selection.season,
        period: selection.period,
      },
    });
    dispatch({ type: 'setExplorePeriod', period: selection.period });
    try {
      if (selection.place.regionId) {
        const summary = list.find(
          (item) =>
            item.region_id === selection.place.regionId &&
            item.variable === selection.variable,
        );
        if (!summary) {
          dispatch({
            type: 'setError',
            message: `No ${selection.variable} series for that region.`,
          });
          return;
        }
        const [doc, enso] = await Promise.all([
          getSeries(summary.id),
          getEnso(summary.region_id),
        ]);
        if (stale()) return;
        dispatch({ type: 'loadExplore', doc, enso });
      } else {
        const outcome = await getCellSeries({
          lon: selection.place.lon,
          lat: selection.place.lat,
          variable: selection.variable,
          season: selection.season,
        });
        if (outcome.status === 'no-data') {
          dispatch({ type: 'setError', message: outcome.message });
          return;
        }
        if (stale()) return;
        setPickedPoint({ lon: selection.place.lon, lat: selection.place.lat });
        dispatch({ type: 'loadExplore', doc: cellResultToDoc(outcome.result), enso: null });
      }
    } catch (loadError) {
      dispatch({ type: 'setError', message: errorText(loadError) });
    }
  }

  /** Put the app into its pristine landing state (used by every Present step). */
  function resetApp() {
    requestRef.current += 1;
    cellRequestRef.current += 1;
    dispatch({ type: 'setError', message: null });
    dispatch({ type: 'setLoading', loading: false });
    dispatch({ type: 'setBanner', message: null });
    dispatch({ type: 'closeTimelapse' });
    dispatch({ type: 'clearExplore' });
    dispatch({ type: 'resetComparison' });
    dispatch({ type: 'navigate', mode: 'explore' });
    dispatch({ type: 'applySharedSettings', patch: { variable: 'precipitation', season: 'DJF', period: 'full' } });
    dispatch({ type: 'setExplorePeriod', period: 'full' });
    window.location.hash = '';
    setView('globe');
    setEnsoOverlay(null);
    setWorkflowOpen(false);
    setSearchOpen(false);
    setPendingPlace(null);
    setPickedPoint(null);
    setSearchFocus(null);
    setChecksOpen(false);
    setSourcesOpen(false);
    setAutoRotate(true);
  }

  /** Drive the real app into the state a Present step needs. Idempotent. */
  async function runDemo(step: PresentStep) {
    const token = ++demoToken.current;
    const stale = () => demoToken.current !== token;
    const wasDemo = presentStepRef.current?.kind === 'demo';
    presentStepRef.current = step;
    setPresentStep(step);
    const action = step.kind === 'demo' ? step.demo : undefined;
    if (!action) {
      // Story slide: let the black stage fade in before the app resets behind it.
      if (wasDemo) await new Promise((resolve) => setTimeout(resolve, 420));
      if (!stale()) resetApp();
      return;
    }
    resetApp();
    if (action.type === 'landing') return;
    if (action.type === 'enso') {
      window.location.hash = action.hash;
      setEnsoKey((key) => key + 1);
      setView('enso');
      return;
    }
    const waitFor = async <T,>(read: () => T | null | undefined, ms = 12000): Promise<T | null> => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (stale()) return null;
        const value = read();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return null;
    };
    const list = await waitFor(() => seriesListRef.current);
    if (!list || stale()) return;
    if (action.compare && action.place.regionId && action.compare.place.regionId) {
      const s1 = list.find((item) => item.region_id === action.place.regionId && item.variable === action.variable);
      const s2 = list.find((item) => item.region_id === action.compare!.place.regionId && item.variable === action.compare!.variable);
      if (s1 && s2) {
        const [[d1, e1], [d2, e2]] = await Promise.all([
          Promise.all([getSeries(s1.id), getEnso(s1.region_id)]),
          Promise.all([getSeries(s2.id), getEnso(s2.region_id)]),
        ]);
        if (stale()) return;
        dispatch({ type: 'navigate', mode: 'compare' });
        dispatch({ type: 'addSlot', doc: d1, enso: e1, settings: { variable: action.variable, season: action.season, period: 'full' } });
        dispatch({ type: 'addSlot', doc: d2, enso: e2, settings: { variable: action.compare.variable, season: action.compare.season, period: 'full' } });
        return;
      }
    }
    await runInvestigation(
      { place: action.place, variable: action.variable, season: action.season, period: 'full' },
      list,
      stale,
    );
  }
  const demoRef = useRef(runDemo);
  demoRef.current = runDemo;
  const exitRef = useRef(() => {});
  exitRef.current = () => {
    demoToken.current += 1;
    setPresenting(false);
    presentStepRef.current = null;
    setPresentStep(null);
    resetApp();
    const url = new URL(window.location.href);
    if (url.searchParams.has('present')) {
      url.searchParams.delete('present');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  };

  function chooseSearchPlace(result: PlaceResult) {
    setSearchOpen(false);
    if (result.regionId) {
      void selectRegion(result.regionId);
      return;
    }
    searchFocusSeq.current += 1;
    setSearchFocus({
      kind: 'center',
      key: `search_${searchFocusSeq.current}`,
      center: [result.lon, result.lat],
      zoom: 2.5,
    });
    void handlePickLocation(result.lon, result.lat, null);
  }

  const items = inspectorItems(state);

  const focus = useMemo<FocusTarget | null>(() => {
    // A search-chosen point flies the globe before any result has loaded.
    if (mode === 'explore' && !exploreDoc && searchFocus) {
      return searchFocus;
    }
    const boxes: Bbox[] = [];
    if (mode === 'explore' && exploreDoc) {
      const box = bboxOf(exploreDoc);
      if (box) boxes.push(box);
    }
    if (mode === 'compare') {
      for (const slot of comparison.slots) {
        const box = bboxOf(slot.doc);
        if (box) boxes.push(box);
      }
    }
    if (boxes.length === 0) return null;
    const merged = mergeBoxes(boxes);
    if (!merged) return null;
    const key = boxes.map((box) => box.join(',')).join('|');
    return { kind: 'bounds', key, bounds: merged };
  }, [mode, exploreDoc, comparison.slots, searchFocus]);

  const selectedIds = useMemo(() => {
    const ids: string[] = [];
    if (mode === 'explore' && exploreDoc) ids.push(exploreDoc.region.id);
    if (mode === 'compare') {
      for (const slot of comparison.slots) ids.push(slot.regionId);
    }
    return ids;
  }, [mode, exploreDoc, comparison.slots]);

  const timelapseFrame = timelapse
    ? {
        url: timelapseFrameUrl(timelapse.variable, timelapse.season, timelapse.year),
        extent: timelapse.index.extent,
      }
    : null;

  const compareHint = addMode.active
    ? `Pick a region on the globe to add it (${comparison.slots.length} of ${MAX_SLOTS} used)`
    : mode === 'compare' && comparison.slots.length === 0
      ? 'Pick a region on the globe to start a comparison'
      : null;

  const landing = mode === 'explore' && !exploreDoc && !status.loading;

  return (
    <div className={`app${presenting ? ' is-presenting' : ''}${presenting && presentStep?.kind === 'story' ? ' is-present-story' : ''}`} style={panelStyle(state, viewportWidth)}>
      <TopBar
        mode={mode}
        onNavigate={navigate}
        view={view}
        onShowEnso={() => {window.location.hash='enso';setView('enso');}}
        onBackToGlobe={() => {window.location.hash='';setView('globe');}}
        onPresent={() => setPresenting(true)}
      />

      <div className="stage">
        <GlobeView
          regions={regions}
          labels={labels}
          selectedRegionIds={selectedIds}
          focus={view === 'enso' ? (window.location.hash.includes('region=') ? {kind:'center',key:window.location.hash,center:[STUDY_REGIONS.find(r=>r.id===new URLSearchParams(window.location.hash.split('?')[1]).get('region'))?.lon ?? -160,STUDY_REGIONS.find(r=>r.id===new URLSearchParams(window.location.hash.split('?')[1]).get('region'))?.lat ?? 0],zoom:2} : {kind:'center', key:'enso-pacific', center:[-160,0], zoom:1.65}) : timelapse ? {kind:'center',key:'timelapse-'+timelapse.variable+'-'+timelapse.season,center:[pickedPoint?.lon ?? 30,pickedPoint?.lat ?? 0],zoom:1.9} : focus}
          autoRotate={view !== 'enso' && autoRotate && mode !== 'library'}
          onSelectRegion={(id) => handleRegionSelect(id)}
          onUserInteract={() => setAutoRotate(false)}
          onPickLocation={(lon, lat, hitRegionId) => handleGlobePick(lon, lat, hitRegionId)}
          pickedPoint={pickedPoint}
          drawerWidth={view === 'enso' ? 420 : timelapse ? 0 : drawerWidth(state, viewportWidth)}
          timelapseFrame={view === 'enso' ? ensoOverlay : timelapseFrame}
        />

        {view === 'glossary' ? <GlossaryPage /> : view === 'enso' ? <EnsoPage key={ensoKey} onOverlay={setEnsoOverlay} /> : <>
        {landing && !workflowOpen && !timelapse && !(presenting && presentStep?.kind === 'story') && <LandingHero onStart={() => setWorkflowOpen(true)} />}

        {workflowOpen && mode === 'explore' && !exploreDoc && (
          <InvestigationPanel
            place={pendingPlace}
            initialVariable={comparison.shared.variable}
            initialSeason={comparison.shared.season}
            initialPeriod={comparison.shared.period}
            onChooseRegion={(regionId) => handleRegionSelect(regionId)}
            onChoosePoint={(lon, lat) =>
              setPendingPlace({
                name: `${lat.toFixed(2)}\u00b0, ${lon.toFixed(2)}\u00b0`,
                lon,
                lat,
                regionId: null,
              })
            }
            onRun={(selection) => void runInvestigation(selection)}
            onClose={() => setWorkflowOpen(false)}
          />
        )}

        {mode === 'explore' && exploreDoc && searchOpen && !timelapse && (
          <div className="search-popup">
            <span className="search-popup-label">Jump to another place</span>
            <PlaceSearch
              autoFocus
              onChoose={chooseSearchPlace}
              onClose={() => setSearchOpen(false)}
            />
          </div>
        )}

        {mode === 'explore' && items.length === 0 && !timelapse && !workflowOpen &&
          (rightBarOpen ? (
            <>
              <div className="rightbar">
                <RegionRankList
                  variable={metricById(comparison.shared.variable)?.id ?? 'precipitation'}
                  season={comparison.shared.season}
                  selectedRegionId={pendingPlace?.regionId ?? null}
                  onSelectRegion={(regionId) => handleRegionSelect(regionId)}
                  onChangeVariable={(variable) => {
                    dispatch({ type: 'applySharedSettings', patch: { variable } });
                  }}
                  onChangeSeason={(season) => {
                    dispatch({ type: 'applySharedSettings', patch: { season } });
                  }}
                />
              </div>
              <button
                type="button"
                className="rightbar-toggle"
                onClick={() => setRightBarOpen(false)}
                aria-label="Collapse regions"
              >
                &rsaquo;
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rightbar-toggle rightbar-toggle-closed"
              onClick={() => setRightBarOpen(true)}
              aria-label="Show regions"
            >
              &lsaquo;
            </button>
          ))}

        {mode === 'compare' && !addMode.active && (
          <button
            type="button"
            className="add-region-btn"
            disabled={comparison.slots.length >= MAX_SLOTS}
            onClick={() => dispatch({ type: 'openAddMode' })}
          >
            &#65291; Add region
            <span className="add-region-count">
              {comparison.slots.length}/{MAX_SLOTS}
            </span>
          </button>
        )}

        {addMode.active && (
          <div className="banner banner-add" role="status">
            <span>Choose a region on the globe, or type one:</span>
            <input
              className="add-region-input"
              list="region-options"
              value={addMode.query}
              placeholder="Region name"
              onChange={(event) =>
                dispatch({ type: 'setAddQuery', query: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                const match = (seriesList ?? []).find(
                  (item) => item.region_label.toLowerCase() === addMode.query.trim().toLowerCase(),
                );
                if (match) void selectRegion(match.region_id);
              }}
            />
            <datalist id="region-options">
              {(seriesList ?? []).map((item) => (
                <option key={item.id} value={item.region_label} />
              ))}
            </datalist>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => dispatch({ type: 'closeAddMode' })}
            >
              Cancel
            </button>
          </div>
        )}

        {(mode === 'explore' ? exploreDoc !== null : comparison.slots.length > 0) &&
          mode !== 'library' &&
          !timelapse && (
            <button
              type="button"
              className="timelapse-open"
              onClick={() => void openTimelapse(metricById(exploreDoc?.variable ?? comparison.shared.variable)?.slug ?? 'precip', comparison.shared.season)}
            >
              Timelapse
            </button>
          )}

        {timelapse && <PlaybackBar index={timelapse.index} variable={timelapse.variable} season={timelapse.season} year={timelapse.year} playing={timelapse.playing}
          onSet={(variable,season) => void openTimelapse(variable,season)} onAdvance={() => dispatch({type:'advanceTimelapse'})} onYear={year => dispatch({type:'setTimelapseYear',year})} onToggle={() => dispatch({type:'togglePlay'})} onClose={() => dispatch({type:'closeTimelapse'})} />}

        {timelapse?.playing && (
          <div className="globe-live" role="status">
            <span className="globe-live-dot" />
            playing {timelapse.season} {timelapse.year}
          </div>
        )}

        {compareHint && <div className="compare-hint">{compareHint}</div>}

        {status.loading && <div className="loading-chip">Loading&hellip;</div>}
        {status.error && (
          <div className="banner banner-error" role="alert">
            <strong>
              {/^(A comparison|That region)/.test(status.error) ? 'Limit reached' : 'Could not load'}
            </strong>
            <span>{status.error}</span>
          </div>
        )}
        {status.banner && (
          <div className="banner banner-ok">
            <span>{status.banner}</span>
          </div>
        )}

        {items.length > 0 && mode !== 'library' && !timelapse && (
          <Inspector
            mode={mode === 'compare' ? 'compare' : 'explore'}
            items={items}
            checksOpen={checksOpen}
            sourcesOpen={sourcesOpen}
            onToggleChecks={() => setChecksOpen((value) => !value)}
            onToggleSources={() => setSourcesOpen((value) => !value)}
            onClose={() => {
              if (mode === 'compare') {
                dispatch({ type: 'resetComparison' });
              } else {
                dispatch({ type: 'clearExplore' });
                setAutoRotate(true);
              }
            }}
            onSave={handleSave}
            onRemove={(id) => dispatch({ type: 'removeSlot', id })}
            onPin={togglePin}
            pinnedIds={pins.ids}
            onSaveResult={saveResult}
            onCompareSuggestion={(regionId) => void addRegionById(regionId)}
            onOpenTimelapse={(variable, season) => void openTimelapse(variable, season)}
            onOverride={(id, patch) => dispatch({ type: 'overrideSlot', id, patch })}
            onClearOverride={(id) => dispatch({ type: 'clearOverride', id })}
            onPeriodChange={(id, period) => {
              if (mode === 'explore') {
                dispatch({ type: 'setExplorePeriod', period });
              } else {
                dispatch({ type: 'applySharedSettings', patch: { period } });
                dispatch({ type: 'overrideSlot', id, patch: { period } });
              }
            }}
            sharedSettings={comparison.shared}
            catalog={(seriesList ?? []).map((item) => ({
              regionId: item.region_id,
              label: item.region_label,
              variable: item.variable,
              season: item.season,
            }))}
          />
        )}

        {pins.ids.length > 0 && (
          <PinRail
            items={pinnedItems(state)}
            onUnpin={togglePin}
          />
        )}

        {mode === 'library' && (
          <LibraryOverlay
            datasets={seriesList ?? []}
            saved={saved}
            onClose={() => navigate('explore')}
            onOpenDataset={openDataset}
            onOpenSaved={openSaved}
            onDeleteSaved={(id) =>
              dispatch({ type: 'setSaved', saved: deleteInvestigation(id) })
            }
          />
        )}
      </>}
      </div>
      {presenting && <PresentMode onStep={(step) => void demoRef.current(step)} onExit={() => exitRef.current()} />}
    </div>
  );
}
import { mercatorRaster } from '../lib/globeRaster';
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { GeoJSONSource, ImageSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globe/globe.css';
import type { RegionsGeoJson } from '../types';
import { COUNTRIES, OCEANS, type NamedPlace } from '../lib/placeData';
import {
  cullLabels,
  densityForZoom,
  isFarSide,
  isPlaceVisible,
  type LabelPoint,
} from './globe/labels';

setWorkerUrl(workerUrl);

const BASE_URL = import.meta.env.BASE_URL;
const MERCATOR_LIMIT = 85.051129;

const EMPTY_REGIONS: RegionsGeoJson = { type: 'FeatureCollection', features: [] };

// Fallback camera altitude (metres) if the private transform API is unavailable.
const FALLBACK_ALTITUDE = 3_000_000;

const BASE_STYLE: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  sky: {
    'sky-color': '#03050c',
    'horizon-color': '#0b1626',
    'fog-color': '#04060e',
    'sky-horizon-blend': 0.4,
    'horizon-fog-blend': 0.5,
  },
  sources: {
    earth: {
      type: 'image',
      url: `${BASE_URL}assets/earth-blue-marble.jpg`,
      coordinates: [
        [-180, MERCATOR_LIMIT],
        [180, MERCATOR_LIMIT],
        [180, -MERCATOR_LIMIT],
        [-180, -MERCATOR_LIMIT],
      ],
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#d7dfe7' },
    },
    { id: 'earth-raster', type: 'raster', source: 'earth' },
  ],
};

export type FocusTarget =
  | { kind: 'center'; key: string; center: [number, number]; zoom: number }
  | { kind: 'bounds'; key: string; bounds: [number, number, number, number] };

interface GlobeViewProps {
  regions: RegionsGeoJson | null;
  labels: Record<string, string>;
  selectedRegionIds: string[];
  focus: FocusTarget | null;
  autoRotate: boolean;
  onSelectRegion: (regionId: string) => void;
  onUserInteract: () => void;
  /** Called when the user clicks anywhere on the globe (including on regions). */
  onPickLocation?: (lon: number, lat: number, hitRegionId: string | null) => void;
  /** Currently picked coordinate for point marker and footprint display. */
  pickedPoint?: { lon: number; lat: number } | null;
  /** Width of the right-hand drawer in pixels (0 when closed). Used for safe-frame padding. */
  drawerWidth?: number;
  /** Global raster draped on the globe, e.g. one time-lapse frame. */
  timelapseFrame?: { url: string; extent: [number, number, number, number]; significanceUrl?: string } | null;
}

/** Read the camera altitude above sea level (metres) without depending on internals. */
function getCameraAltitude(map: MapLibreMap): number {
  const transform = (map as unknown as {
    transform?: { getCameraAltitude?: () => number };
  }).transform;
  const altitude = transform?.getCameraAltitude?.();
  return typeof altitude === 'number' && Number.isFinite(altitude)
    ? altitude
    : FALLBACK_ALTITUDE;
}

/** Priority used when two labels collide (higher is kept). */
function placePriority(place: NamedPlace): number {
  if (place.kind === 'ocean') return 100;
  if (place.kind === 'sea') return 30;
  return place.tier === 1 ? 90 : place.tier === 2 ? 60 : 40;
}

const ALL_PLACES: Array<NamedPlace & { key: string; priority: number }> = [
  ...OCEANS,
  ...COUNTRIES,
].map((place) => ({
  ...place,
  key: `${place.kind}:${place.name}`,
  priority: placePriority(place),
}));

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION).matches;

export default function GlobeView({
  regions,
  labels: _labels,
  selectedRegionIds: _selectedRegionIds,
  focus,
  autoRotate,
  onSelectRegion,
  onUserInteract,
  onPickLocation,
  pickedPoint,
  drawerWidth = 0,
  timelapseFrame = null,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const selectRef = useRef(onSelectRegion);
  selectRef.current = onSelectRegion;
  const interactRef = useRef(onUserInteract);
  interactRef.current = onUserInteract;
  const pickRef = useRef(onPickLocation);
  pickRef.current = onPickLocation;
  const [ready, setReady] = useState(false);
  const rasterSlot = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const overlay = labelsRef.current;
    if (!container || !overlay) return;

    const map = new MapLibreMap({
      container,
      style: BASE_STYLE,
      center: focus?.kind === 'center' ? focus.center : [30, 18],
      zoom: focus?.kind === 'center' ? focus.zoom + 0.5 : 1.9,
      minZoom: 0,
      maxZoom: 8,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      renderWorldCopies: false,
      fadeDuration: 0,
    });
    mapRef.current = map;

    // Build the label DOM once; each update only mutates transform/visibility.
    const els = labelEls.current;
    for (const place of ALL_PLACES) {
      const element = document.createElement('div');
      element.className =
        place.kind === 'country'
          ? 'globe-label globe-label--country'
          : 'globe-label globe-label--water';
      element.textContent = place.name;
      element.classList.add('is-hidden');
      overlay.appendChild(element);
      els.set(place.key, element);
    }

    // Zoom-aware, far-side-aware, collision-culled label placement.
    // Runs at most once per animation frame; never writes React state.
    let raf = 0;
    const updateLabels = () => {
      raf = 0;
      const density = densityForZoom(map.getZoom());
      const center = map.getCenter();
      const altitude = getCameraAltitude(map);
      const canvas = map.getCanvas();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const points: LabelPoint[] = [];
      const projected = new Map<string, { x: number; y: number }>();

      for (const place of ALL_PLACES) {
        if (!isPlaceVisible(place, density)) continue;
        if (isFarSide(place.lat, place.lon, center.lat, center.lng, altitude)) continue;
        const point = map.project([place.lon, place.lat]);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        if (point.x < -40 || point.y < -40 || point.x > width + 40 || point.y > height + 40) {
          continue;
        }
        points.push({ key: place.key, x: point.x, y: point.y, priority: place.priority, width: place.name.length * (place.kind === "country" ? 6.5 : 8), height: 18 });
        projected.set(place.key, { x: point.x, y: point.y });
      }

      const keep = cullLabels(points, 30);
      for (const place of ALL_PLACES) {
        const element = els.get(place.key);
        if (!element) continue;
        const position = projected.get(place.key);
        if (!position || !keep.has(place.key)) {
          if (!element.classList.contains('is-hidden')) element.classList.add('is-hidden');
          continue;
        }
        element.classList.remove('is-hidden');
        element.style.transform = `translate(-50%, -50%) translate3d(${position.x.toFixed(1)}px, ${position.y.toFixed(1)}px, 0)`;
      }
    };
    const scheduleLabelUpdate = () => {
      if (raf) return;
      raf = requestAnimationFrame(updateLabels);
    };

    // Size the globe to fill about 88% of the shorter side of the free area
    // (below the top bar), centred; the side panels overlay it.
    const fitGlobe = () => {
      const el = map.getContainer();
      const zoom = Math.log2(Math.max(320, Math.min(el.clientWidth, el.clientHeight - 64)) * 0.88 / 256) + 0.55;
      map.jumpTo({ center: [30,18], zoom, pitch: 0, bearing: 0, padding: {top:64,bottom:0,left:0,right:0} });
      scheduleLabelUpdate();
    };

    map.on('load', () => {
      map.addSource('regions', { type: 'geojson', data: EMPTY_REGIONS as never });
      // Invisible but hit-testable: keeps `hitRegionId` correct without drawing
      // any region fill or outline.
      map.addLayer({
        id: 'regions-hit',
        type: 'fill',
        source: 'regions',
        paint: { 'fill-opacity': 0 },
      });

      // Single click handler: pick the location and, if it lands on a region,
      // also select that region (mirrors the previous dual-handler behaviour).
      map.on('click', (event) => {
        interactRef.current();
        const lngLat = event.lngLat;
        if (!lngLat) return;
        const features = map.queryRenderedFeatures(event.point, { layers: ['regions-hit'] });
        const hitRegionId =
          features.length > 0 ? (features[0].properties?.id as string | undefined) : null;
        const pickFn = pickRef.current;
        if (pickFn) pickFn(lngLat.lng, lngLat.lat, hitRegionId ?? null);
        else if (typeof hitRegionId === 'string') selectRef.current(hitRegionId);
      });
      map.on('mouseenter', 'regions-hit', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'regions-hit', () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('dragstart', () => interactRef.current());
      map.on('wheel', () => interactRef.current());
      map.on('pitchend', () => interactRef.current());

      void mercatorRaster(`${BASE_URL}assets/earth-blue-marble.jpg`,[-180,-90,180,90]).then(url => {if(mapRef.current === map)(map.getSource('earth') as ImageSource)?.updateImage({url});}).catch(()=>{});
      if (focus?.kind !== 'center') fitGlobe();
      scheduleLabelUpdate();
      setReady(true);
    });

    map.on('move', scheduleLabelUpdate);
    map.on('zoom', scheduleLabelUpdate);
    map.on('resize', scheduleLabelUpdate);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      for (const element of els.values()) element.remove();
      els.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed the region outlines into the hit-test source (not drawn).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource('regions') as GeoJSONSource | undefined;
    if (source) source.setData((regions ?? EMPTY_REGIONS) as never);
  }, [regions, ready]);

  // Fly to the focus target whenever its key changes.
  const focusKey = focus?.key ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focus) return;
    const reduced = prefersReducedMotion();
    const duration = reduced ? 0 : 1400;
    if (focus.kind === 'center') {
      map.flyTo({
        center: focus.center,
        zoom: focus.key.startsWith('enso') ? focus.zoom + 0.5 : focus.zoom,
        pitch: 0,
        essential: true,
        duration,
      });
    } else {
      const topBarHeight = 60;
      const canvasWidth = map.getContainer().clientWidth;
      const rightPadding = Math.min(drawerWidth + 24, Math.max(0,canvasWidth - 240));
      const padding = { top: topBarHeight, right: rightPadding, bottom: 24, left: 24 };
      map.fitBounds(
        [
          [focus.bounds[0], focus.bounds[1]],
          [focus.bounds[2], focus.bounds[3]],
        ],
        { padding, maxZoom: focus.bounds[2]-focus.bounds[0] <= 2 ? 2.5 : 3.5, pitch: 0, duration },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready, drawerWidth]);

  // Slow idle rotation on the landing state; stops on interaction/reduced motion.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !autoRotate || prefersReducedMotion()) return;
    let raf = 0;
    let last = performance.now();
    let bearing = map.getBearing();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      bearing = (bearing + dt * 0.006) % 360;
      map.setBearing(bearing);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, ready]);

  // Two raster slots keep the decoded previous image visible during a time-based cross-fade.
  const frameUrl = timelapseFrame?.url;
  const significanceUrl = timelapseFrame?.significanceUrl;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false, raf = 0;
    if (!timelapseFrame) {
      for (const id of ['frame-0','frame-1','frame-significance']) if (map.getLayer(id)) map.setPaintProperty(id,'raster-opacity',0);
      return;
    }
    const [west,south,east,north] = timelapseFrame.extent;
    const nt=Math.min(MERCATOR_LIMIT,north), st=Math.max(-MERCATOR_LIMIT,south);
    const coordinates: [[number,number],[number,number],[number,number],[number,number]] = [[west,nt],[east,nt],[east,st],[west,st]];
    const originalUrl = timelapseFrame.url;
    const slot = 1-rasterSlot.current;
    const id = `frame-${slot}`, oldId = `frame-${rasterSlot.current}`;
    const show = (url:string) => {
      if(cancelled) return;
      const existing = map.getSource(id) as ImageSource | undefined;
      if(existing) existing.updateImage({url,coordinates});
      else {
        map.addSource(id,{type:'image',url,coordinates});
        map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0,'raster-fade-duration':0,'raster-opacity-transition':{duration:0}}},map.getLayer('regions-hit')?'regions-hit':undefined);
      }
      rasterSlot.current=slot;
      const start = performance.now();
      const animate = (now:number) => {
        if(cancelled) return;
        // rAF timestamps can precede `start` slightly: clamp so opacity never goes below 0.
        const t = prefersReducedMotion() ? 1 : Math.max(0, Math.min(1,(now-start)/160));
        map.setPaintProperty(id,'raster-opacity',0.85*t);
        if(map.getLayer(oldId)) map.setPaintProperty(oldId,'raster-opacity',0.85*(1-t));
        if(t<1) raf=requestAnimationFrame(animate);
        else rasterSlot.current=slot;
      };
      raf=requestAnimationFrame(animate);
    };
    void mercatorRaster(originalUrl,timelapseFrame.extent).then(show).catch(() => { /* Keep the previous valid frame. */ });
    if(significanceUrl) {
      void mercatorRaster(significanceUrl,timelapseFrame.extent).then(url=>{
        if(cancelled)return;
        const id='frame-significance';
        const existing=map.getSource(id) as ImageSource | undefined;
        if(existing) existing.updateImage({url,coordinates});
        else {map.addSource(id,{type:'image',url,coordinates});map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0.85,'raster-fade-duration':0}});}
        map.setPaintProperty(id,'raster-opacity',0.85);
      }).catch(()=>{});
    } else if(map.getLayer('frame-significance')) map.setPaintProperty('frame-significance','raster-opacity',0);
    return () => {cancelled=true;cancelAnimationFrame(raf);};
  },[ready,frameUrl,significanceUrl]);

  // Picked point marker and 1° cell footprint.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (map.getLayer('picked-point')) map.removeLayer('picked-point');
    if (map.getSource('picked-point')) map.removeSource('picked-point');
    if (map.getLayer('picked-footprint')) map.removeLayer('picked-footprint');
    if (map.getSource('picked-footprint')) map.removeSource('picked-footprint');

    if (!pickedPoint) return;

    const { lon, lat } = pickedPoint;
    map.addSource('picked-point', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {},
      },
    });
    map.addLayer({
      id: 'picked-point',
      type: 'circle',
      source: 'picked-point',
      paint: {
        'circle-radius': 6,
        'circle-color': '#f6a945',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
  }, [ready, pickedPoint]);

  return (
    <div className="globe-wrap">
      <div ref={containerRef} className="globe" aria-label="Interactive Earth globe" />
      <div ref={labelsRef} className="globe-labels" aria-hidden="true" />
      <div className="globe-halo" aria-hidden="true" />
    </div>
  );
}

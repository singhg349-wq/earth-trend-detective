import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type {
  ExpressionSpecification,
  GeoJSONSource,
  ImageSource,
  MapLayerMouseEvent,
  MapMouseEvent,
  StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { RegionsGeoJson } from '../types';

interface MapViewProps {
  regions: RegionsGeoJson | null;
  selectedRegionIds: string[];
  focusBbox: [number, number, number, number] | null;
  timelapseUrl: string | null;
  timelapseExtent: [number, number, number, number];
  showTimelapse: boolean;
  trendMapUrl: string | null;
  trendMapHatchUrl: string | null;
  trendMapHatchGeoJsonUrl: string | null;
  trendMapExtent: [number, number, number, number];
  pickedCellBbox: [number, number, number, number] | null;
  onSelectRegion: (regionId: string) => void;
  onPickCell: (lon: number, lat: number) => void;
}

setWorkerUrl(workerUrl);

const EMPTY_REGIONS: RegionsGeoJson = { type: 'FeatureCollection', features: [] };

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e8eef3' },
    },
  ],
};

export default function MapView({
  regions,
  selectedRegionIds,
  focusBbox,
  timelapseUrl,
  timelapseExtent,
  showTimelapse,
  trendMapUrl,
  trendMapHatchUrl,
  trendMapHatchGeoJsonUrl,
  trendMapExtent,
  pickedCellBbox,
  onSelectRegion,
  onPickCell,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const selectRef = useRef(onSelectRegion);
  selectRef.current = onSelectRegion;
  const pickRef = useRef(onPickCell);
  pickRef.current = onPickCell;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: BASE_STYLE,
      center: [30, -8],
      zoom: 0.8,
      minZoom: 0,
      maxZoom: 8,
      dragRotate: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('regions', { type: 'geojson', data: EMPTY_REGIONS as never });
      map.addLayer({
        id: 'regions-fill',
        type: 'fill',
        source: 'regions',
        paint: { 'fill-color': 'rgba(31, 111, 235, 0.15)' },
      });
      map.addLayer({
        id: 'regions-line',
        type: 'line',
        source: 'regions',
        paint: { 'line-color': '#1f6feb', 'line-width': 1.6 },
      });

      map.addSource('picked-cell', {
        type: 'geojson',
        data: EMPTY_REGIONS as never,
      });
      map.addLayer({
        id: 'picked-cell-fill',
        type: 'fill',
        source: 'picked-cell',
        paint: { 'fill-color': 'rgba(180, 83, 9, 0.16)' },
      });
      map.addLayer({
        id: 'picked-cell-line',
        type: 'line',
        source: 'picked-cell',
        paint: { 'line-color': '#b45309', 'line-width': 2 },
      });

      // A small diagonal pattern used only for cells that pass the FDR test.
      // The cell list comes from the trend-map catalog as GeoJSON.
      const hatchCanvas = document.createElement('canvas');
      hatchCanvas.width = 8;
      hatchCanvas.height = 8;
      const hatchContext = hatchCanvas.getContext('2d');
      if (hatchContext) {
        hatchContext.strokeStyle = 'rgba(23, 32, 51, 0.85)';
        hatchContext.lineWidth = 1.2;
        for (let offset = -8; offset < 16; offset += 5) {
          hatchContext.beginPath();
          hatchContext.moveTo(offset, 0);
          hatchContext.lineTo(offset + 8, 8);
          hatchContext.stroke();
        }
        map.addImage('fdr-hatch', hatchContext.getImageData(0, 0, 8, 8), {
          pixelRatio: 1,
        });
        map.addSource('trendmap-hatch-cells', {
          type: 'geojson',
          data: EMPTY_REGIONS as never,
        });
        map.addLayer(
          {
            id: 'trendmap-hatch-cells-layer',
            type: 'fill',
            source: 'trendmap-hatch-cells',
            paint: {
              'fill-pattern': 'fdr-hatch',
              'fill-opacity': 0.95,
            },
          },
          'regions-fill',
        );
      }

      // Any click loads that 1 degree cell. A click on a region outline also
      // selects the region through the layer handler below.
      map.on('click', (event: MapMouseEvent) => {
        pickRef.current(event.lngLat.lng, event.lngLat.lat);
      });
      map.on('click', 'regions-fill', (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === 'string') selectRef.current(id);
      });
      map.on('mouseenter', 'regions-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'regions-fill', () => {
        map.getCanvas().style.cursor = '';
      });
      setReady(true);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const source = map.getSource('regions') as GeoJSONSource | undefined;
    if (source) source.setData((regions ?? EMPTY_REGIONS) as never);

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    for (const feature of (regions ?? EMPTY_REGIONS).features) {
      const point = feature.properties.label_point;
      if (!Array.isArray(point) || point.length !== 2) continue;
      const element = document.createElement('span');
      element.className = 'map-label';
      element.textContent = String(feature.properties.label ?? feature.properties.id ?? '');
      const marker = new MapLibreMarker({ element, anchor: 'center' })
        .setLngLat([Number(point[0]), Number(point[1])])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [regions, ready]);

  const selectedKey = selectedRegionIds.join(',');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('regions-fill')) return;
    const expression = [
      'case',
      ['in', ['get', 'id'], ['literal', selectedRegionIds]],
      'rgba(31, 111, 235, 0.42)',
      'rgba(31, 111, 235, 0.15)',
    ] as unknown as ExpressionSpecification;
    map.setPaintProperty('regions-fill', 'fill-color', expression);
    // Only the joined key matters here; the array is read from this render.
  }, [selectedKey, ready]);

  const focusWest = focusBbox?.[0];
  const focusSouth = focusBbox?.[1];
  const focusEast = focusBbox?.[2];
  const focusNorth = focusBbox?.[3];
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (
      focusWest === undefined ||
      focusSouth === undefined ||
      focusEast === undefined ||
      focusNorth === undefined
    ) {
      return;
    }
    map.fitBounds(
      [
        [focusWest, focusSouth],
        [focusEast, focusNorth],
      ],
      { padding: 40, maxZoom: 5, duration: 600 },
    );
  }, [ready, focusWest, focusSouth, focusEast, focusNorth]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource('picked-cell') as GeoJSONSource | undefined;
    if (!source) return;

    if (!pickedCellBbox) {
      source.setData({ type: 'FeatureCollection', features: [] } as never);
      return;
    }

    const [cellWest, cellSouth, cellEast, cellNorth] = pickedCellBbox;
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [cellWest, cellSouth],
                [cellEast, cellSouth],
                [cellEast, cellNorth],
                [cellWest, cellNorth],
                [cellWest, cellSouth],
              ],
            ],
          },
        },
      ],
    } as never);
  }, [pickedCellBbox, ready]);

  const [trendWest, trendSouth, trendEast, trendNorth] = trendMapExtent;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const existingSource = map.getSource('trendmap') as ImageSource | undefined;

    if (!trendMapUrl) {
      if (map.getLayer('trendmap-layer')) map.removeLayer('trendmap-layer');
      if (existingSource) map.removeSource('trendmap');
      return;
    }

    // The trend PNG is written in EPSG:4326 (plate carree). MapLibre uses Web
    // Mercator, so clamp the image corners to its latitude limit.
    const mercatorLimit = 85.051129;
    const clampLat = (value: number) =>
      Math.max(-mercatorLimit, Math.min(mercatorLimit, value));
    const coordinates: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] = [
      [trendWest, clampLat(trendNorth)],
      [trendEast, clampLat(trendNorth)],
      [trendEast, clampLat(trendSouth)],
      [trendWest, clampLat(trendSouth)],
    ];

    if (existingSource) {
      existingSource.updateImage({ url: trendMapUrl, coordinates });
      return;
    }

    map.addSource('trendmap', {
      type: 'image',
      url: trendMapUrl,
      coordinates,
    });
    const beforeId = map.getLayer('timelapse-layer')
      ? 'timelapse-layer'
      : map.getLayer('regions-fill')
        ? 'regions-fill'
        : undefined;
    map.addLayer(
      {
        id: 'trendmap-layer',
        type: 'raster',
        source: 'trendmap',
        paint: { 'raster-opacity': 0.55, 'raster-fade-duration': 0 },
      },
      beforeId,
    );
  }, [ready, trendMapUrl, trendWest, trendSouth, trendEast, trendNorth]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const existingSource = map.getSource('trendmap-hatch') as
      | ImageSource
      | undefined;

    if (!trendMapHatchUrl) {
      if (map.getLayer('trendmap-hatch-layer')) {
        map.removeLayer('trendmap-hatch-layer');
      }
      if (existingSource) map.removeSource('trendmap-hatch');
      return;
    }

    // The hatch mask is also EPSG:4326 and uses the same extent as the slope
    // PNG. MapLibre needs its corners clamped to the Web Mercator limit.
    const mercatorLimit = 85.051129;
    const clampLat = (value: number) =>
      Math.max(-mercatorLimit, Math.min(mercatorLimit, value));
    const coordinates: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] = [
      [trendWest, clampLat(trendNorth)],
      [trendEast, clampLat(trendNorth)],
      [trendEast, clampLat(trendSouth)],
      [trendWest, clampLat(trendSouth)],
    ];

    if (existingSource) {
      existingSource.updateImage({ url: trendMapHatchUrl, coordinates });
      return;
    }

    map.addSource('trendmap-hatch', {
      type: 'image',
      url: trendMapHatchUrl,
      coordinates,
    });
    const beforeId = map.getLayer('regions-fill') ? 'regions-fill' : undefined;
    map.addLayer(
      {
        id: 'trendmap-hatch-layer',
        type: 'raster',
        source: 'trendmap-hatch',
        paint: {
          'raster-opacity': 1,
          'raster-fade-duration': 0,
          'raster-resampling': 'nearest',
        },
      },
      beforeId,
    );
  }, [ready, trendMapHatchUrl, trendWest, trendSouth, trendEast, trendNorth]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource('trendmap-hatch-cells') as
      | GeoJSONSource
      | undefined;
    if (!source) return;

    const empty = { type: 'FeatureCollection', features: [] } as never;
    if (!trendMapHatchGeoJsonUrl) {
      source.setData(empty);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(trendMapHatchGeoJsonUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (cancelled || mapRef.current !== map) return;
        if (
          body &&
          body.type === 'FeatureCollection' &&
          Array.isArray(body.features)
        ) {
          source.setData(body as never);
        } else {
          source.setData(empty);
        }
      } catch {
        if (cancelled || mapRef.current !== map) return;
        try {
          source.setData(empty);
        } catch {
          // The map was removed between the response and this update.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, trendMapHatchGeoJsonUrl]);

  const [west, south, east, north] = timelapseExtent;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const existingSource = map.getSource('timelapse') as ImageSource | undefined;

    if (!showTimelapse || !timelapseUrl) {
      if (map.getLayer('timelapse-layer')) map.removeLayer('timelapse-layer');
      if (existingSource) map.removeSource('timelapse');
      return;
    }

    // MapLibre uses Web Mercator, so image corners are clamped to its
    // latitude limit. The data extent in index.json keeps -90..90.
    const mercatorLimit = 85.051129;
    const clampLat = (value: number) => Math.max(-mercatorLimit, Math.min(mercatorLimit, value));
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [west, clampLat(north)],
      [east, clampLat(north)],
      [east, clampLat(south)],
      [west, clampLat(south)],
    ];

    if (existingSource) {
      existingSource.updateImage({ url: timelapseUrl, coordinates });
      return;
    }

    map.addSource('timelapse', { type: 'image', url: timelapseUrl, coordinates });
    map.addLayer(
      {
        id: 'timelapse-layer',
        type: 'raster',
        source: 'timelapse',
        paint: { 'raster-opacity': 0.72, 'raster-fade-duration': 0 },
      },
      map.getLayer('regions-fill') ? 'regions-fill' : undefined,
    );
  }, [ready, timelapseUrl, showTimelapse, west, south, east, north]);

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" />
      <p className="map-note">
        Local region outlines. Click anywhere for that 1&deg; cell; click an outline to
        add the region to A or B. Trend cells are coloured by Sen slope; hatched cells
        pass the FDR test at q = 0.10 and can cluster in space. No online base map is
        used.
      </p>
    </div>
  );
}

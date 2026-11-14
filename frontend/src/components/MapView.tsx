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
  onSelectRegion: (regionId: string) => void;
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
  onSelectRegion,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const selectRef = useRef(onSelectRegion);
  selectRef.current = onSelectRegion;
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
      <p className="map-note">Local region outlines. No online base map is used.</p>
    </div>
  );
}

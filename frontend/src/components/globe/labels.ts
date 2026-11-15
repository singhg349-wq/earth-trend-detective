/**
 * Pure helpers for the globe's HTML-overlay labels.
 *
 * Kept free of DOM and map APIs so the geometry and density rules are unit
 * testable. The component handles projection, positioning and DOM writes.
 */

import type { NamedPlace } from '../../lib/placeData';

/** Which tiers are revealed at a given zoom (globe projection). */
export interface LabelDensity {
  showTier2: boolean;
  showTier3: boolean;
}

/** Zoom thresholds for revealing tier-2 and tier-3 labels. */
export function densityForZoom(zoom: number): LabelDensity {
  return {
    showTier2: zoom >= 2.1,
    showTier3: zoom >= 3.3,
  };
}

/** Whether a place's label should be shown at the current density. */
export function isPlaceVisible(place: NamedPlace, density: LabelDensity): boolean {
  if (place.kind === 'ocean') return true; // tier 1: always at the default view
  if (place.kind === 'sea') return density.showTier3;
  if (place.tier === 1) return true;
  if (place.tier === 2) return density.showTier2;
  return density.showTier3;
}

const DEG_TO_RAD = Math.PI / 180;

/** Great-circle central angle between two points, in degrees. */
export function centralAngleDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const lat1r = lat1 * DEG_TO_RAD;
  const lat2r = lat2 * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const cos =
    Math.sin(lat1r) * Math.sin(lat2r) +
    Math.cos(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return Math.acos(clamp(cos, -1, 1)) / DEG_TO_RAD;
}

/**
 * The visible horizon angle (degrees) of the globe at a given camera altitude.
 *
 * A point on the far side of the globe sits behind the limb; its central angle
 * from the camera's look-at point exceeds `acos(R / (R + altitude))`.
 * `altitude` is the camera height above sea level in metres (maplibre's
 * `transform.getCameraAltitude()`), `R` is the WGS84-ish globe radius.
 */
export function horizonAngleDeg(cameraAltitudeMeters: number): number {
  const R = 6371008.8;
  const altitude = Math.max(0, cameraAltitudeMeters);
  const ratio = R / (R + altitude);
  return Math.acos(clamp(ratio, -1, 1)) / DEG_TO_RAD;
}

/** True when the point is on the far side of the globe (hidden by the limb). */
export function isFarSide(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
  cameraAltitudeMeters: number,
  marginDeg = 1.5,
): boolean {
  const angle = centralAngleDeg(lat, lon, centerLat, centerLon);
  return angle > horizonAngleDeg(cameraAltitudeMeters) - marginDeg;
}

/** A projected label ready for collision culling. */
export interface LabelPoint {
  key: string;
  x: number;
  y: number;
  /** Higher priority is kept when two labels collide. */
  priority: number;
  width?: number;
  height?: number;
}

/**
 * Simple collision culling by screen distance. Labels are kept in priority
 * order; a label is dropped when it sits within `minDistance` pixels of one
 * that was already kept. Returns the set of keys to keep.
 */
export function cullLabels(points: LabelPoint[], minDistance: number): Set<string> {
  const keep = new Set<string>();
  const kept: LabelPoint[] = [];
  const sorted = [...points].sort((a, b) => b.priority - a.priority);
  const min2 = minDistance * minDistance;

  for (const point of sorted) {
    let collides = false;
    for (const other of kept) {
      const dx = point.x - other.x;
      const dy = point.y - other.y;
      const rectanglesOverlap = point.width !== undefined && other.width !== undefined && Math.abs(dx) < (point.width + other.width) / 2 + 10 && Math.abs(dy) < ((point.height ?? 16) + (other.height ?? 16)) / 2 + 6;
      if (rectanglesOverlap || dx * dx + dy * dy < min2) {
        collides = true;
        break;
      }
    }
    if (!collides) {
      keep.add(point.key);
      kept.push(point);
    }
  }
  return keep;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

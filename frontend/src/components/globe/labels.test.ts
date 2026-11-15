import { describe, expect, it } from 'vitest';

import {
  centralAngleDeg,
  cullLabels,
  densityForZoom,
  horizonAngleDeg,
  isFarSide,
  isPlaceVisible,
} from './labels';
import type { NamedPlace } from '../../lib/placeData';

const country: NamedPlace = {
  name: 'Testland',
  lon: 0,
  lat: 0,
  kind: 'country',
  tier: 2,
};
const ocean: NamedPlace = { name: 'Test Ocean', lon: 0, lat: 0, kind: 'ocean', tier: 1 };
const sea: NamedPlace = { name: 'Test Sea', lon: 0, lat: 0, kind: 'sea', tier: 3 };

describe('densityForZoom / isPlaceVisible', () => {
  it('reveals tiers progressively as the camera zooms in', () => {
    expect(densityForZoom(1)).toEqual({ showTier2: false, showTier3: false });
    expect(densityForZoom(2.5)).toEqual({ showTier2: true, showTier3: false });
    expect(densityForZoom(4)).toEqual({ showTier2: true, showTier3: true });
  });

  it('always shows oceans, and only shows seas and tier 3 when zoomed in', () => {
    const wide = densityForZoom(1);
    const mid = densityForZoom(2.5);
    const close = densityForZoom(4);

    expect(isPlaceVisible(ocean, wide)).toBe(true);
    expect(isPlaceVisible(ocean, mid)).toBe(true);
    expect(isPlaceVisible(ocean, close)).toBe(true);

    expect(isPlaceVisible(sea, wide)).toBe(false);
    expect(isPlaceVisible(sea, mid)).toBe(false);
    expect(isPlaceVisible(sea, close)).toBe(true);

    expect(isPlaceVisible(country, wide)).toBe(false);
    expect(isPlaceVisible(country, mid)).toBe(true);
    expect(isPlaceVisible(country, close)).toBe(true);
  });
});

describe('centralAngleDeg', () => {
  it('measures zero for identical points and 180 for antipodes', () => {
    expect(centralAngleDeg(10, 20, 10, 20)).toBeLessThan(1e-5);
    expect(centralAngleDeg(0, 0, 0, 180)).toBeCloseTo(180, 5);
    expect(centralAngleDeg(90, 0, -90, 0)).toBeCloseTo(180, 5);
  });

  it('measures a quarter of the globe as 90 degrees', () => {
    expect(centralAngleDeg(0, 0, 0, 90)).toBeCloseTo(90, 6);
    expect(centralAngleDeg(0, 0, 90, 0)).toBeCloseTo(90, 6);
  });
});

describe('horizonAngleDeg / isFarSide', () => {
  it('approaches 90 degrees as the camera moves far away', () => {
    expect(horizonAngleDeg(1e9)).toBeLessThan(90);
    expect(horizonAngleDeg(1e9)).toBeGreaterThan(89);
  });

  it('subtends less than 90 degrees close up, so far-side points hide correctly', () => {
    // At low altitude (camera near the surface) the visible cap narrows.
    expect(horizonAngleDeg(6371008.8)).toBeCloseTo(60, 5);

    // A point near the camera centre is never far-side.
    expect(isFarSide(0, 0, 0, 0, 6371008.8)).toBe(false);
    // A point directly opposite the centre is always far-side.
    expect(isFarSide(0, 180, 0, 0, 6371008.8)).toBe(true);
    // A point well inside the visible cap stays visible from far away.
    expect(isFarSide(0, 45, 0, 0, 1e9)).toBe(false);
    // A point at the limb (90°) is just past the horizon and is hidden.
    expect(isFarSide(0, 90, 0, 0, 1e9)).toBe(true);
  });
});

describe('cullLabels', () => {
  it('drops the lower-priority label when two overlap', () => {
    const keep = cullLabels(
      [
        { key: 'a', x: 0, y: 0, priority: 1 },
        { key: 'b', x: 5, y: 5, priority: 2 },
      ],
      30,
    );
    expect(keep.has('b')).toBe(true);
    expect(keep.has('a')).toBe(false);
  });

  it('keeps labels that are far enough apart', () => {
    const keep = cullLabels(
      [
        { key: 'a', x: 0, y: 0, priority: 1 },
        { key: 'b', x: 100, y: 0, priority: 2 },
      ],
      30,
    );
    expect(keep.size).toBe(2);
  });
});

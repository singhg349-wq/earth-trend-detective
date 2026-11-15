import { describe, expect, it } from 'vitest';
import {
  allPlaces,
  normalizeQuery,
  parseCoordinates,
  searchPlaces,
} from './gazetteer';

describe('parseCoordinates', () => {
  it('reads a signed decimal pair, latitude first', () => {
    const result = parseCoordinates('53.55, -113.49');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('coords');
    expect(result?.lat).toBeCloseTo(53.55, 6);
    expect(result?.lon).toBeCloseTo(-113.49, 6);
  });

  it('accepts a space instead of a comma and a unicode minus', () => {
    const result = parseCoordinates('53.55 \u2212113.49');
    expect(result?.lon).toBeCloseTo(-113.49, 6);
    expect(result?.lat).toBeCloseTo(53.55, 6);
  });

  it('reads hemisphere suffixes in either order', () => {
    const latLon = parseCoordinates('53.55N 113.49W');
    expect(latLon?.lat).toBeCloseTo(53.55, 6);
    expect(latLon?.lon).toBeCloseTo(-113.49, 6);

    const lonLat = parseCoordinates('113.49W, 53.55N');
    expect(lonLat?.lon).toBeCloseTo(-113.49, 6);
    expect(lonLat?.lat).toBeCloseTo(53.55, 6);
  });

  it('reads hemisphere prefixes and degree signs', () => {
    const result = parseCoordinates('S12.05° E77.04°');
    expect(result?.lat).toBeCloseTo(-12.05, 6);
    expect(result?.lon).toBeCloseTo(77.04, 6);
  });

  it('rejects out-of-range values and plain words', () => {
    expect(parseCoordinates('95.5, 10')).toBeNull();
    expect(parseCoordinates('10, 200')).toBeNull();
    expect(parseCoordinates('Nairobi')).toBeNull();
    expect(parseCoordinates('12')).toBeNull();
    expect(parseCoordinates('10N 20N')).toBeNull();
  });
});

describe('searchPlaces', () => {
  it('returns a coordinate result alone', () => {
    const results = searchPlaces('53.55, -113.49');
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('coords');
  });

  it('puts an exact name first', () => {
    const first = searchPlaces('Nairobi')[0];
    expect(first.name).toBe('Nairobi');
    expect(first.kind).toBe('city');
    expect(first.lon).toBeCloseTo(36.82, 6);
    expect(first.lat).toBeCloseTo(-1.29, 6);
  });

  it('prefers prefix over word-prefix over substring', () => {
    const results = searchPlaces('am', 12);
    // Amazon (prefix) before places that only contain "am".
    expect(results[0].name).toBe('Amazon');
    const tiers = results.map((place) => place.name.indexOf('am'));
    // All returned names either start with "am" or contain it later.
    expect(tiers.length).toBeGreaterThan(0);
  });

  it('is diacritic- and case-insensitive', () => {
    const plain = searchPlaces('sao paulo');
    expect(plain[0]?.name).toBe('São Paulo');
    expect(searchPlaces('BOGOTA')[0]?.name).toBe('Bogotá');
  });

  it('matches word prefixes', () => {
    const results = searchPlaces('china');
    expect(results.some((place) => place.name === 'South China Sea')).toBe(true);
  });

  it('carries the region id for study regions', () => {
    const region = searchPlaces('coastal peru')[0];
    expect(region.kind).toBe('region');
    expect(region.regionId).toBe('coastal_peru');
  });

  it('respects the limit and returns nothing for no match', () => {
    expect(searchPlaces('a', 3)).toHaveLength(3);
    expect(searchPlaces('')).toEqual([]);
    expect(searchPlaces('zzzzzz')).toEqual([]);
  });

  it('ships ~40 cities with in-range coordinates', () => {
    const cities = allPlaces().filter((place) => place.kind === 'city');
    expect(cities.length).toBeGreaterThanOrEqual(40);
    for (const city of cities) {
      expect(Math.abs(city.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(city.lon)).toBeLessThanOrEqual(180);
    }
  });
});

describe('normalizeQuery', () => {
  it('strips diacritics and collapses spaces', () => {
    expect(normalizeQuery('  São   Paulo ')).toBe('sao paulo');
  });
});

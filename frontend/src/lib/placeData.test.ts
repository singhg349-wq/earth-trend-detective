import { describe, expect, it } from 'vitest';

import { COUNTRIES, OCEANS, type NamedPlace } from './placeData';

function allPlaces(): NamedPlace[] {
  return [...OCEANS, ...COUNTRIES];
}

function byName(name: string): NamedPlace | undefined {
  return COUNTRIES.find((place) => place.name === name);
}

describe('placeData ranges and shape', () => {
  it('keeps every coordinate inside sane bounds', () => {
    for (const place of allPlaces()) {
      expect(Number.isFinite(place.lon)).toBe(true);
      expect(Number.isFinite(place.lat)).toBe(true);
      expect(place.lon).toBeGreaterThanOrEqual(-180);
      expect(place.lon).toBeLessThanOrEqual(180);
      expect(place.lat).toBeGreaterThanOrEqual(-90);
      expect(place.lat).toBeLessThanOrEqual(90);
    }
  });

  it('assigns every place a valid kind and tier', () => {
    for (const place of allPlaces()) {
      expect(['country', 'ocean', 'sea']).toContain(place.kind);
      expect([1, 2, 3]).toContain(place.tier);
    }
  });

  it('has no duplicate names', () => {
    const names = allPlaces().map((place) => place.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('labels countries as countries and water as ocean or sea', () => {
    for (const place of COUNTRIES) expect(place.kind).toBe('country');
    for (const place of OCEANS) expect(['ocean', 'sea']).toContain(place.kind);
  });
});

describe('placeData spot checks', () => {
  it('places Canada, Peru and Indonesia near their interior points', () => {
    const canada = byName('Canada');
    const peru = byName('Peru');
    const indonesia = byName('Indonesia');
    expect(canada).toBeDefined();
    expect(peru).toBeDefined();
    expect(indonesia).toBeDefined();

    expect(Math.abs(canada!.lon - -100)).toBeLessThan(20);
    expect(Math.abs(canada!.lat - 60)).toBeLessThan(15);
    expect(Math.abs(peru!.lon - -75)).toBeLessThan(15);
    expect(Math.abs(peru!.lat - -10)).toBeLessThan(10);
    expect(Math.abs(indonesia!.lon - 115)).toBeLessThan(20);
    expect(Math.abs(indonesia!.lat - -2)).toBeLessThan(12);
  });

  it('includes roughly 150 countries and all of the G20', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(140);
    expect(COUNTRIES.length).toBeLessThanOrEqual(200);

    const g20 = [
      'Argentina', 'Australia', 'Brazil', 'Canada', 'China', 'France',
      'Germany', 'India', 'Indonesia', 'Italy', 'Japan', 'Mexico', 'Russia',
      'Saudi Arabia', 'South Africa', 'South Korea', 'Turkey',
      'United Kingdom', 'United States',
    ];
    for (const name of g20) {
      expect(byName(name)).toBeDefined();
    }
  });

  it('includes all South America and Southeast Asia', () => {
    const southAmerica = [
      'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador',
      'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela',
    ];
    const seAsia = [
      'Brunei', 'Cambodia', 'Indonesia', 'Laos', 'Malaysia', 'Myanmar',
      'Philippines', 'Singapore', 'Thailand', 'Timor-Leste', 'Vietnam',
    ];
    for (const name of [...southAmerica, ...seAsia]) {
      expect(byName(name)).toBeDefined();
    }
  });

  it('splits the oceans into north/south and lists the five plus seas', () => {
    const oceanNames = OCEANS.map((place) => place.name);
    for (const name of [
      'North Pacific Ocean', 'South Pacific Ocean', 'North Atlantic Ocean',
      'South Atlantic Ocean', 'Indian Ocean', 'Southern Ocean', 'Arctic Ocean',
    ]) {
      expect(oceanNames).toContain(name);
    }
    // Seas are tier 3 (only revealed when zoomed in).
    for (const place of OCEANS) {
      if (place.kind === 'sea') expect(place.tier).toBe(3);
    }
  });
});

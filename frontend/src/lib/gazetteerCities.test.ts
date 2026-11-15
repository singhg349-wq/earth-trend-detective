import { readFileSync, statSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCityLoadState,
  loadCities,
  resetCities,
  searchPlaces,
  setCities,
  type CityRow,
} from './gazetteer';

const FIXTURE: CityRow[] = [
  ['Edmonton', '', 'Alberta', 'Canada', 53.55, -113.469, 1010899],
  ['Edmonds', '', 'Washington', 'United States', 47.81, -122.377, 42000],
  ['Paris', '', 'Île-de-France', 'France', 48.853, 2.349, 2138551],
  ['Paris', '', 'Texas', 'United States', 33.661, -95.556, 24782],
  ['São Paulo', 'Sao Paulo', 'São Paulo', 'Brazil', -23.547, -46.636, 10021295],
  ['Red Deer', '', 'Alberta', 'Canada', 52.267, -113.802, 100844],
  ['Nairobi', '', 'Nairobi Area', 'Kenya', -1.284, 36.815, 4397073],
  ['Zürich', 'Zurich', 'Zurich', 'Switzerland', 47.367, 8.55, 341730],
  ['Shanghai', '', 'Shanghai', 'China', 31.222, 121.458, 24874500],
  ['Bad', '', '', 'Nowhere', 999, 0, 1], // out of range: skipped
];

function json(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

const asFetch = (impl: unknown) => impl as typeof fetch;

afterEach(() => resetCities());

describe('city search (fixture)', () => {
  it('ranks prefix matches by population: "edm" gives Edmonton first', () => {
    setCities(FIXTURE);
    const results = searchPlaces('edm');
    expect(results[0].name).toBe('Edmonton, Alberta, Canada');
    expect(results[0].kind).toBe('city');
    expect(results[1].name).toBe('Edmonds, Washington, United States');
  });

  it('puts Paris, France before Paris, Texas', () => {
    setCities(FIXTURE);
    const names = searchPlaces('paris').map((p) => p.name);
    expect(names.slice(0, 2)).toEqual([
      'Paris, Île-de-France, France',
      'Paris, Texas, United States',
    ]);
  });

  it('matches São Paulo without the accent, and with it', () => {
    setCities(FIXTURE);
    expect(searchPlaces('sao paulo')[0].name).toBe('São Paulo, Brazil');
    expect(searchPlaces('SÃO PAULO')[0].kind).toBe('city');
    expect(searchPlaces('zurich')[0].name).toContain('Zürich');
  });

  it('finds Red Deer, Alberta, also by full label', () => {
    setCities(FIXTURE);
    expect(searchPlaces('red deer')[0].name).toBe('Red Deer, Alberta, Canada');
    expect(searchPlaces('red deer alberta')[0].name).toBe('Red Deer, Alberta, Canada');
    expect(searchPlaces('paris texas')[0].name).toBe('Paris, Texas, United States');
  });

  it('skips a label part equal to the city name', () => {
    setCities(FIXTURE);
    expect(searchPlaces('shanghai')[0].name).toBe('Shanghai, China');
  });

  it('hides a hand-written city the loaded list already covers', () => {
    setCities(FIXTURE);
    const nairobi = searchPlaces('nairobi').filter((p) => p.kind === 'city');
    expect(nairobi).toHaveLength(1);
    expect(nairobi[0].name).toBe('Nairobi, Nairobi Area, Kenya');
  });

  it('keeps study regions and countries', () => {
    setCities(FIXTURE);
    expect(searchPlaces('amazon')[0].kind).toBe('region');
    expect(searchPlaces('canada')[0].kind).toBe('country');
  });

  it('still parses coordinates', () => {
    setCities(FIXTURE);
    expect(searchPlaces('53.55, -113.49')[0].kind).toBe('coords');
  });

  it('skips rows with out-of-range coordinates', () => {
    setCities(FIXTURE);
    expect(searchPlaces('bad').some((p) => p.name.startsWith('Bad'))).toBe(false);
  });
});

describe('loadCities', () => {
  it('fetches once, caches, and enables city results', async () => {
    const fetchMock = vi.fn(async () => json(FIXTURE));
    expect(getCityLoadState()).toBe('idle');
    const pending = loadCities(asFetch(fetchMock), '/x/cities.json');
    expect(getCityLoadState()).toBe('loading');
    expect(await pending).toBe(true);
    expect(await loadCities(asFetch(fetchMock))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/x/cities.json');
    expect(getCityLoadState()).toBe('ready');
    expect(searchPlaces('red deer')[0].name).toBe('Red Deer, Alberta, Canada');
  });

  it.each([
    ['network error', () => Promise.reject(new Error('offline'))],
    ['HTTP error', async () => json(null, false)],
    ['malformed data', async () => json({ not: 'an array' })],
  ])('falls back to the built-in sources on %s', async (_label, impl) => {
    const ok = await loadCities(asFetch(vi.fn(impl)));
    expect(ok).toBe(false);
    expect(getCityLoadState()).toBe('failed');
    // Built-in cities, countries and regions still work.
    expect(searchPlaces('edmonton')[0].name).toBe('Edmonton');
    expect(searchPlaces('peru')[0].kind).not.toBe('city');
    expect(searchPlaces('53.55, -113.49')[0].kind).toBe('coords');
  });

  it('can retry after a failure', async () => {
    await loadCities(asFetch(async () => json(null, false)));
    expect(await loadCities(asFetch(async () => json(FIXTURE)))).toBe(true);
  });

  it('survives a fetch that throws synchronously', async () => {
    const boom = asFetch(() => {
      throw new Error('boom');
    });
    expect(await loadCities(boom)).toBe(false);
    expect(getCityLoadState()).toBe('failed');
  });
});

describe('shipped cities.json', () => {
  const file = new URL('../../public/assets/gazetteer/cities.json', import.meta.url);

  it('stays under 1.6 MB and has the expected shape', () => {
    expect(statSync(file).size).toBeLessThan(1.6 * 1024 * 1024);
    const rows = JSON.parse(readFileSync(file, 'utf8')) as CityRow[];
    expect(rows.length).toBeGreaterThan(20000);
    for (const row of rows.slice(0, 50)) {
      expect(row).toHaveLength(7);
      expect(typeof row[0]).toBe('string');
      expect(Math.abs(row[4])).toBeLessThanOrEqual(90);
      expect(Math.abs(row[5])).toBeLessThanOrEqual(180);
    }
    for (let i = 1; i < rows.length; i++) expect(rows[i][6]).toBeLessThanOrEqual(rows[i - 1][6]);
  });

  it('answers the demo queries from the real data', () => {
    setCities(JSON.parse(readFileSync(file, 'utf8')) as CityRow[]);
    expect(searchPlaces('edm')[0].name).toBe('Edmonton, Alberta, Canada');
    expect(searchPlaces('paris')[0].name).toBe('Paris, Île-de-France, France');
    expect(searchPlaces('sao paulo')[0].name).toContain('São Paulo');
    expect(searchPlaces('red deer')[0].name).toBe('Red Deer, Alberta, Canada');
  });
});

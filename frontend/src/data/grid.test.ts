import { describe, expect, it } from 'vitest';
import gridIndex from '../../../data/fixtures/grid/index.json';
import indonesiaDjf from '../../../data/fixtures/grid/precip/DJF/100_-10.json';
import peruDjf from '../../../data/fixtures/grid/precip/DJF/-80_-10.json';
import { fetchCellSeries } from '../lib/tiles';

const basePath = 'data/fixtures/grid';

const responses: Record<string, unknown> = {
  [`${basePath}/index.json`]: gridIndex,
  [`${basePath}/precip/DJF/-80_-10.json`]: peruDjf,
  [`${basePath}/precip/DJF/100_-10.json`]: indonesiaDjf,
};

async function fetchFixture(url: string) {
  const payload = responses[url];
  if (!payload) {
    return { ok: false, status: 404, json: async () => null };
  }
  return { ok: true, status: 200, json: async () => payload };
}

describe('fixture grid through the click lookup', () => {
  it('decodes a known Peru cell into a contract result', async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: 'precip', season: 'DJF' },
      { basePath, fetchImpl: fetchFixture },
    );

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.cellId).toBe('cell_-4.5_-79.5');
    expect(outcome.result.years).toHaveLength(42);
    expect(outcome.result.values[0]).not.toBeNull();
    expect(outcome.result.trend.sen_slope_per_decade).not.toBeNull();
    expect(outcome.result.validation.status).toBe('unchecked-same-method');
    expect(outcome.result.trend.inference.status).toBe('ok');
  });

  it('reports no data outside the fixture tiles without a failed request', async () => {
    const outcome = await fetchCellSeries(
      { lon: 0, lat: 0, variable: 'precip', season: 'DJF' },
      { basePath, fetchImpl: fetchFixture },
    );

    expect(outcome.status).toBe('no-data');
    if (outcome.status === 'no-data') expect(outcome.reason).toBe('no-tile');
  });

  it('decodes a partial coverage array', async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.2, lat: -9.2, variable: 'precip', season: 'DJF' },
      { basePath, fetchImpl: fetchFixture },
    );

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.result.coverage.some((value) => value < 1)).toBe(true);
  });
});

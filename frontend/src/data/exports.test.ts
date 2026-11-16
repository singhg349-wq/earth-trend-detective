import { describe, expect, it } from 'vitest';
import artifact from '../../../data/artifacts/t2m_alberta_prairies_DJF.json';
import {
  RESULT_COLUMNS,
  SUB_PERIOD_SIGNIFICANCE_REASON,
  buildResultCsv,
  buildResultJson,
  periodWindow,
  resolveResult,
  resultTableCells,
} from './exports';
import type { SeriesDoc } from '../types';

const doc = artifact as unknown as SeriesDoc;

describe('periodWindow', () => {
  it('splits the stored span at its midpoint, the first half keeping the middle year', () => {
    // The artifact covers 1981–2026 (46 seasons).
    expect(periodWindow('full', doc.years)?.label).toBe('1981–2026');
    expect(periodWindow('first-half', doc.years)?.label).toBe('1981–2003');
    expect(periodWindow('second-half', doc.years)?.label).toBe('2004–2026');
  });

  it('computes custom windows bounded by available years or sensible defaults', () => {
    expect(periodWindow('custom', doc.years, [1990, 2010])?.label).toBe('1990–2010');
    expect(periodWindow('custom', doc.years, [2010, 1990])?.label).toBe('1990–2010');
    expect(periodWindow('custom', doc.years)?.label).toBe('2007–2026');
  });

  it('returns null for a series with no years', () => {
    expect(periodWindow('full', [])).toBeNull();
  });
});

describe('resolveResult', () => {
  it('copies the stored full-period slope, interval and p value', () => {
    const row = resolveResult(doc, 'full', 'A');

    expect(row.origin).toBe('stored artifact');
    expect(row.slopePerDecade).toBe(doc.trend.sen_slope_per_decade);
    expect(row.inferenceAvailable).toBe(true);
    expect(row.inference.pValue).toBe(doc.trend.inference.p_value);
    expect(row.inference.ci).toEqual(doc.trend.inference.ci);
    expect(row.n).toBe(46);
    expect(row.mean).toBeCloseTo(
      doc.values.reduce((sum: number, value) => sum + (value ?? 0), 0) / 46,
      10,
    );

    const cells = resultTableCells(row);
    expect(cells['result origin']).toBe('stored artifact');
    expect(cells['p value']).toBe('0.289');
    expect(cells['95% interval']).toBe('-0.334 to 0.727 degC per decade');
    expect(cells['Sen slope per decade']).toBe('+0.176 degC per decade');
    expect(cells.window).toBe('1981–2026 (full period)');
  });

  it('never lets the full-period p value or interval reach a sub-period or custom window', () => {
    for (const key of ['first-half', 'second-half', 'custom'] as const) {
      const row = resolveResult(doc, key, 'A', key === 'custom' ? [1995, 2015] : undefined);
      const cells = resultTableCells(row);

      expect(row.origin).toBe('browser calculation');
      expect(row.inferenceAvailable).toBe(false);
      expect(cells['p value']).toBe(SUB_PERIOD_SIGNIFICANCE_REASON);
      expect(cells['95% interval']).toBe(SUB_PERIOD_SIGNIFICANCE_REASON);
      expect(cells['p value']).not.toContain('0.289');
      expect(row.slopePerDecade).not.toBe(doc.trend.sen_slope_per_decade);
    }
  });

  it('says why inference is missing when the artifact records none', () => {
    const withoutInference: SeriesDoc = {
      ...doc,
      trend: {
        ...doc.trend,
        inference: { status: 'unavailable', p_value: null, ci: null },
      },
    };
    const cells = resultTableCells(resolveResult(withoutInference, 'full'));

    expect(cells['p value']).toBe('unavailable: the artifact did not record an inference result');
    expect(cells['95% interval']).toBe(
      'unavailable: the artifact did not record an inference result',
    );
  });

  it('shows an unlisted validation status as the artifact states it', () => {
    const failed: SeriesDoc = {
      ...doc,
      validation: { status: 'failed', reference: 'Giovanni check' },
    };
    const cells = resultTableCells(resolveResult(failed, 'full'));
    expect(cells['validation status']).toBe('failed');
  });
});

describe('result exports', () => {
  const rows = [resolveResult(doc, 'full', 'A'), resolveResult(doc, 'first-half', 'B')];

  it('builds a CSV whose header is exactly the displayed columns', () => {
    const lines = buildResultCsv(rows).trimEnd().split('\r\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(RESULT_COLUMNS.map((column) => column.label).join(','));
    expect(lines[1]).toBe(
      RESULT_COLUMNS.map((column) => resultTableCells(rows[0])[column.key]).join(','),
    );
    expect(lines[2]).toContain(SUB_PERIOD_SIGNIFICANCE_REASON);
  });

  it('quotes CSV cells that contain a comma', () => {
    const withComma: SeriesDoc = {
      ...doc,
      region: { ...doc.region, label: 'Alberta, Prairies' },
    };
    const csv = buildResultCsv([resolveResult(withComma, 'full', 'A')]);
    expect(csv).toContain('"A · Alberta, Prairies"');
  });

  it('exports the same resolved numbers and window the screen shows', () => {
    const payload = buildResultJson({
      mode: 'compare',
      period: 'full',
      exportedAt: '2026-11-14T00:00:00.000Z',
      rows,
    });

    expect(payload.schema).toBe('earth-trend-detective-result-export');
    expect(payload.period).toEqual({
      key: 'full',
      start: 1981,
      end: 2026,
      label: '1981–2026',
    });
    expect(payload.columns).toEqual(RESULT_COLUMNS.map((column) => column.label));
    expect(payload.rows).toHaveLength(2);

    const [full, half] = payload.rows;
    expect(full.series).toBe('A · Alberta / Prairies');
    expect(full.window).toEqual({ key: 'full', start: 1981, end: 2026, label: '1981–2026' });
    expect(full.p_value).toBe(doc.trend.inference.p_value);
    expect(full.interval_95_per_decade).toEqual(doc.trend.inference.ci);
    expect(full.mean).toBe(rows[0].mean);
    expect(full.sen_slope_per_decade).toBe(doc.trend.sen_slope_per_decade);
    expect(full.values).toHaveLength(46);
    expect(full.validation.status).toBe(doc.validation.status);

    expect(half.window).toEqual({ key: 'first-half', start: 1981, end: 2003, label: '1981–2003' });
    expect(half.result_origin).toBe('browser calculation');
    expect(half.p_value).toBeNull();
    expect(half.interval_95_per_decade).toBeNull();
    expect(half.inference.available).toBe(false);
    expect(half.values).toHaveLength(23);
  });

  it('exports a custom window with descriptive stats and null p-value/interval', () => {
    const customRow = resolveResult(doc, 'custom', 'C', [1990, 2010]);
    const payload = buildResultJson({
      mode: 'explore',
      period: 'custom',
      exportedAt: '2026-11-14T00:00:00.000Z',
      rows: [customRow],
    });

    expect(payload.period).toEqual({
      key: 'custom',
      start: 1990,
      end: 2010,
      label: '1990–2010',
    });
    expect(payload.rows[0].window).toEqual({
      key: 'custom',
      start: 1990,
      end: 2010,
      label: '1990–2010',
    });
    expect(payload.rows[0].result_origin).toBe('browser calculation');
    expect(payload.rows[0].p_value).toBeNull();
    expect(payload.rows[0].interval_95_per_decade).toBeNull();
    expect(payload.rows[0].values).toHaveLength(21);
    expect(resultTableCells(customRow).window).toBe('1990–2010 (custom)');
  });
});

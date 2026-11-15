import { afterEach, describe, expect, it, vi } from 'vitest';
import { listSeries, timelapseFrameUrl, timelapseKey } from './seriesSource';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('time-lapse source paths', () => {
  it('uses one real folder per variable and season', () => {
    expect(timelapseKey('precip', 'DJF')).toBe('precip_DJF');
    expect(timelapseKey('precip', 'SON')).toBe('precip_SON');
  });

  it('falls back to the rainfall DJF folder for unlisted input', () => {
    expect(timelapseKey('bad/slug', 'XYZ')).toBe('precip_DJF');
    expect(timelapseKey('precip', '../etc')).toBe('precip_DJF');
  });

  it('builds the frame URL under the copied static data root', () => {
    expect(timelapseFrameUrl('precip', 'MAM', 2025)).toMatch(
      /\/data\/timelapse\/precip_MAM\/2025\.png$/,
    );
  });
});

describe('series list filtering', () => {
  it('keeps listed statuses and hides failed or unlisted regions', async () => {
    vi.stubGlobal('window', { location: { hostname: 'example.com' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          series: [
            { id: 'passed_one', validation_status: 'passed' },
            { id: 'same_method', validation_status: 'unchecked-same-method' },
            { id: 'pending_one', validation_status: 'pending' },
            { id: 'failed_one', validation_status: 'failed' },
            { id: 'fixture_one', validation_status: 'fixture' },
            { id: 'unknown_one' },
          ],
        }),
      })),
    );

    const list = await listSeries();
    expect(list.map((summary) => summary.id)).toEqual([
      'passed_one',
      'same_method',
      'pending_one',
    ]);
  });
});

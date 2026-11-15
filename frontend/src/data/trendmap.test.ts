import { describe, expect, it } from 'vitest';
import catalog from './__fixtures__/inference/trendmap_index.json';
import {
  FDR_Q,
  normalizeTrendMapEntry,
  trendMapHatchGeoJsonUrl,
  trendMapHatchUrl,
  trendMapUrl,
} from './trendmap';

const entries = catalog.entries.map(normalizeTrendMapEntry);

describe('trend map catalog', () => {
  it('keeps the optional FDR hatch file', () => {
    const entry = entries[0];
    expect(entry).not.toBeNull();
    if (!entry) return;
    expect(entry.hatch).toBe('DJF_hatch.png');
    expect(entry.hatch_geojson).toBe('DJF_hatch.geojson');
    expect(entry.fdr_q).toBe(FDR_Q);
    expect(trendMapUrl('data/trendmap', entry)).toBe(
      'data/trendmap/precip/DJF.png',
    );
    expect(trendMapHatchUrl('data/trendmap', entry)).toBe(
      'data/trendmap/precip/DJF_hatch.png',
    );
    expect(trendMapHatchGeoJsonUrl('data/trendmap', entry)).toBe(
      'data/trendmap/precip/DJF_hatch.geojson',
    );
  });

  it('returns no hatch when the entry has none', () => {
    const entry = entries[1];
    expect(entry).not.toBeNull();
    if (!entry) return;
    expect(entry.hatch).toBeNull();
    expect(trendMapHatchUrl('data/trendmap', entry)).toBeNull();
    expect(entry.hatch_geojson).toBeNull();
    expect(trendMapHatchGeoJsonUrl('data/trendmap', entry)).toBeNull();
    expect(entry.fdr_q).toBe(FDR_Q);
  });

  it('rejects a hatch path that leaves the variable folder', () => {
    const entry = entries[2];
    expect(entry).not.toBeNull();
    if (!entry) return;
    expect(entry.hatch).toBeNull();
    expect(trendMapHatchUrl('data/trendmap', entry)).toBeNull();
  });

  it('ignores an entry without a variable or season', () => {
    expect(normalizeTrendMapEntry({ variable: 'precip' })).toBeNull();
    expect(normalizeTrendMapEntry({ season: 'DJF' })).toBeNull();
    expect(normalizeTrendMapEntry('precip')).toBeNull();
  });
});

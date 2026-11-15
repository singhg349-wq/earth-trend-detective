import { describe, expect, it } from 'vitest';
import { buildPngCaption, buildPngFilename } from './exportPng';

describe('buildPngCaption', () => {
  const baseData = {
    regionLabel: 'Sahel',
    seasonCode: 'DJF',
    seasonYearLabel: 'January year',
    periodLabel: '1981–2026',
    units: 'mm/day',
    method: 'MK + Hamed-Rao (3 lags)',
    validationStatus: 'passed',
    product: 'CHIRPS',
    version: '2.0',
    variable: 'precipitation',
    pValue: 0.031,
    inferenceAvailable: true,
    inferenceReason: '',
    isSubPeriod: false,
  };

  it('builds caption for full period with p-value', () => {
    const caption = buildPngCaption(baseData);
    expect(caption).toContain('Sahel · DJF · January year · 1981–2026');
    expect(caption).toContain('Units: mm/day · Method: MK + Hamed-Rao (3 lags) · Comparison: Same pipeline; not individually compared');
    expect(caption).toContain('Source: CHIRPS v2.0 · precipitation');
    expect(caption).toContain('uncommon if no trend were present, p = 0.031');
  });

  it('builds caption for sub-period', () => {
    const subPeriodData = { ...baseData, isSubPeriod: true, periodLabel: '1981–2003' };
    const caption = buildPngCaption(subPeriodData);
    expect(caption).toContain('1981–2003');
    expect(caption).toContain('sub-period: significance not computed');
    expect(caption).not.toContain('uncommon if no trend were present');
  });

  it('builds caption when inference missing', () => {
    const missingData = { ...baseData, inferenceAvailable: false, pValue: null };
    const caption = buildPngCaption(missingData);
    expect(caption).toContain('unavailable: the artifact did not record an inference result');
  });

  it('handles missing season year label', () => {
    const noYearLabel = { ...baseData, seasonYearLabel: null };
    const caption = buildPngCaption(noYearLabel);
    expect(caption).toContain('Sahel · DJF · 1981–2026');
  });
  it('handles missing variable in source', () => {
    const noVar = { ...baseData, variable: undefined };
    const caption = buildPngCaption(noVar);
    expect(caption).toContain('Source: CHIRPS v2.0');
    expect(caption).not.toContain('Source: CHIRPS v2.0 ·');
  });
});

describe('buildPngFilename', () => {
  it('generates correct filename for normal region', () => {
    const filename = buildPngFilename('Sahel', 'DJF', 1981, 2026);
    expect(filename).toBe('etd_sahel_DJF_1981-2026.png');
  });

  it('generates correct filename for region with spaces', () => {
    const filename = buildPngFilename('Coastal Peru', 'DJF', 1981, 2026);
    expect(filename).toBe('etd_coastal-peru_DJF_1981-2026.png');
  });

  it('generates correct filename for region with special characters', () => {
    const filename = buildPngFilename('Alberta Prairies', 'DJF', 1981, 2026);
    expect(filename).toBe('etd_alberta-prairies_DJF_1981-2026.png');
  });

  it('generates correct filename for sub-period', () => {
    const filename = buildPngFilename('Sahel', 'DJF', 1981, 2003);
    expect(filename).toBe('etd_sahel_DJF_1981-2003.png');
  });
});

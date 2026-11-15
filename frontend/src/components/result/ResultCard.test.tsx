import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ResultCard from './ResultCard';
import type { InspectItem } from '../Inspector';
import type { SeriesDoc } from '../../types';
import { resolveResult } from '../../data/exports';

function mockDoc(overrides: Partial<SeriesDoc> = {}): SeriesDoc {
  return {
    id: 'test_doc_DJF',
    variable: 'temperature',
    units: '°C',
    source: { product: 'NASA MERRA-2', version: '5.12.4', var: 'T2M', doi_or_url: '10.5067/AP1B0BA5PD2K' },
    region: { id: 'test_region', label: 'Test Region', bbox: [-10, 20, -9, 21], cells_used: 1, area_km2: 12000 },
    season: { code: 'DJF', year_label: 'January year', aggregation: 'mean' },
    years: [2000, 2001, 2002, 2003],
    values: [10.1, 10.5, 10.8, 11.2],
    coverage: [1, 1, 1, 1],
    trend: {
      sen_slope_per_decade: 1.1,
      intercept: 10.0,
      inference: {
        status: 'ok',
        p_value: 0.0001, // p < 0.001
        strict_check_pass: true,
        strict_check_p: 0.0002,
        ci: [0.5, 1.7],
        method: 'MK + Hamed-Rao',
        lag1: 0.1,
        caution: false,
        n: 4,
      },
    },
    ...overrides,
  } as unknown as SeriesDoc;
}

function makeItem(doc: SeriesDoc, overridden = false, period: 'full' | 'first-half' | 'second-half' = 'full'): InspectItem {
  return {
    id: doc.id,
    regionId: doc.region.id,
    period,
    overridden,
    doc,
    enso: null,
    color: '#68b88b',
    slot: 'A',
  };
}

describe('ResultCard', () => {
  it('renders inline significance verdict and clean p < 0.001 without = <', () => {
    const doc = mockDoc();
    const item = makeItem(doc);
    const row = resolveResult(doc, 'full', 'A');
    const markup = renderToStaticMarkup(
      <ResultCard
        item={item}
        row={row}
        index={0}
        isRef={false}
        isPinned={false}
        checksOpen={false}
        onToggleChecks={() => {}}
        sharedSettings={{ variable: 'temperature', season: 'DJF', period: 'full' }}
        variables={['temperature']}
        seasons={['DJF']}
        inCompareMode={false}
        chartSeries={[]}
        sharedHoverYear={null}
        onHoverYearChange={() => {}}
      />,
    );

    expect(markup).toMatch(/Statistically significant \(p (&lt;|<) 0\.05\)/);
    expect(markup).toMatch(/p (&lt;|<) 0\.001/);
    expect(markup).not.toContain('p = <');
    expect(markup).not.toContain('p = &lt;');
    expect(markup).not.toContain('January year');
  });

  it('renders No clear trend verdict when p >= 0.05', () => {
    const doc = mockDoc({
      trend: {
        sen_slope_per_decade: 0.05,
        inference: {
          status: 'ok',
          p_value: 0.42,
          strict_check_pass: false,
          strict_check_p: 0.5,
          ci: [-0.2, 0.3],
          method: 'MK + Hamed-Rao',
          n: 4,
        },
      } as any,
    });
    const item = makeItem(doc);
    const row = resolveResult(doc, 'full', 'A');
    const markup = renderToStaticMarkup(
      <ResultCard
        item={item}
        row={row}
        index={0}
        isRef={false}
        isPinned={false}
        checksOpen={false}
        onToggleChecks={() => {}}
        sharedSettings={{ variable: 'temperature', season: 'DJF', period: 'full' }}
        variables={['temperature']}
        seasons={['DJF']}
        inCompareMode={false}
        chartSeries={[]}
        sharedHoverYear={null}
        onHoverYearChange={() => {}}
      />,
    );

    expect(markup).toContain('No clear trend');
    expect(markup).toContain('p = 0.420');
  });

  it('displays caution tag for single 1° polar cell when latitude >= 80', () => {
    const polarDoc = mockDoc({
      region: { id: 'cell_84.5_12.5', label: '85°N, 13°E (1° cell)', bbox: [12, 84, 13, 85], cells_used: 1, area_km2: 1200 },
    });
    const item = makeItem(polarDoc);
    const row = resolveResult(polarDoc, 'full', 'A');
    const markup = renderToStaticMarkup(
      <ResultCard
        item={item}
        row={row}
        index={0}
        isRef={false}
        isPinned={false}
        checksOpen={false}
        onToggleChecks={() => {}}
        sharedSettings={{ variable: 'temperature', season: 'DJF', period: 'full' }}
        variables={['temperature']}
        seasons={['DJF']}
        inCompareMode={false}
        chartSeries={[]}
        sharedHoverYear={null}
        onHoverYearChange={() => {}}
      />,
    );

    expect(markup).toContain('Single 1° polar cell — small area and polar-night coverage');
  });

  it('only shows OWN SETTINGS badge when slot actually differs from shared settings', () => {
    const doc = mockDoc();
    const row = resolveResult(doc, 'full', 'A');

    // Case 1: overridden is true but settings match shared -> DO NOT SHOW
    const sameItem = makeItem(doc, true, 'full');
    const sameMarkup = renderToStaticMarkup(
      <ResultCard
        item={sameItem}
        row={row}
        index={0}
        isRef={false}
        isPinned={false}
        checksOpen={false}
        onToggleChecks={() => {}}
        sharedSettings={{ variable: 'temperature', season: 'DJF', period: 'full' }}
        variables={['temperature']}
        seasons={['DJF']}
        inCompareMode={true}
        chartSeries={[]}
        sharedHoverYear={null}
        onHoverYearChange={() => {}}
      />,
    );
    expect(sameMarkup).not.toContain('Own settings');

    // Case 2: overridden is true and settings differ -> SHOW
    const diffItem = makeItem(doc, true, 'first-half');
    const diffRow = resolveResult(doc, 'first-half', 'A');
    const diffMarkup = renderToStaticMarkup(
      <ResultCard
        item={diffItem}
        row={diffRow}
        index={0}
        isRef={false}
        isPinned={false}
        checksOpen={false}
        onToggleChecks={() => {}}
        sharedSettings={{ variable: 'temperature', season: 'DJF', period: 'full' }}
        variables={['temperature']}
        seasons={['DJF']}
        inCompareMode={true}
        chartSeries={[]}
        sharedHoverYear={null}
        onHoverYearChange={() => {}}
      />,
    );
    expect(diffMarkup).toContain('Own settings');
  });
});

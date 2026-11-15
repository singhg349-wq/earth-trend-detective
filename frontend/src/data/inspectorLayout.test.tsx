import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Inspector, { type InspectItem } from '../components/Inspector';
import type { SeriesDoc } from '../types';

/**
 * The drawer's layout contract is the thing most likely to drift silently:
 * a count that maps to the wrong grid still renders, just wrong. These renders
 * assert the class the user's five-result rule depends on actually reaches the DOM.
 */
function seriesDoc(index: number): SeriesDoc {
  return {
    id: `precip_region_${index}_DJF`,
    variable: 'precipitation',
    units: 'mm/day',
    region: { id: `region_${index}`, label: `Region ${index}`, bbox: [-10, -5, 10, 5] },
    season: { code: 'DJF', year_label: 'January year', aggregation: 'mean' },
    years: [1984, 1985, 1986],
    values: [1.2, 1.4, 1.1],
    coverage: [1, 1, 1],
    trend: {
      sen_slope_per_decade: 0.1,
      intercept: 1.2,
      inference: { status: 'ok', method: 'MK + Hamed-Rao (3 lags)', p_value: 0.2, ci: [-0.1, 0.3], n: 3 },
    },
    validation: { status: 'passed', reference: 'Giovanni' },
  } as unknown as SeriesDoc;
}

function items(count: number): InspectItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `slot_${index}`,
    regionId: `region_${index}`,
    period: 'full' as const,
    overridden: false,
    doc: seriesDoc(index),
    enso: null,
    color: '#4c9aff',
    slot: String.fromCharCode(65 + index),
  }));
}

function render(count: number): string {
  return renderToStaticMarkup(
    <Inspector
      mode="compare"
      items={items(count)}
      checksOpen={false}
      sourcesOpen={false}
      onToggleChecks={() => {}}
      onToggleSources={() => {}}
      onClose={() => {}}
      onSave={() => {}}
    />,
  );
}

describe('result grid layout', () => {
  it.each([
    [1, 'grid-single'],
    [2, 'grid-pair'],
    [3, 'grid-triple'],
    [4, 'grid-quad'],
    [5, 'grid-five'],
  ])('renders %i result(s) with %s', (count, expected) => {
    const markup = render(count);
    expect(markup).toContain(expected);
    expect(markup.match(/class="result-card(?: |")/g)?.length).toBe(count);
  });

  it('marks exactly the first of five results as the reference', () => {
    const markup = render(5);
    expect(markup.match(/tag-reference/g)?.length).toBe(1);
    expect(markup.match(/reference-card/g)?.length).toBe(1);
  });

  it('marks no result as reference below five', () => {
    expect(render(4)).not.toContain('tag-reference');
  });
});

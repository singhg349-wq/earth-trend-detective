import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RegionRankList from './RegionRankList';

/**
 * Server render: the effect does not run, so this pins the header and loading
 * state the shell shows on first paint.
 */
describe('RegionRankList', () => {
  const markup = renderToStaticMarkup(
    <RegionRankList
      variable="precipitation"
      season="DJF"
      selectedRegionId={null}
      onSelectRegion={() => {}}
    />,
  );

  it('shows the eyebrow and the variable-and-season subtitle', () => {
    expect(markup).toContain('Ranked by significance');
    expect(markup).toContain('Rainfall · Winter (DJF)');
  });

  it('announces the loading state instead of placeholder numbers', () => {
    expect(markup).toContain('Loading region trends');
    expect(markup).toContain('aria-busy="true"');
  });

  it('renders interactive metric and season selectors', () => {
    expect(markup).toContain('aria-label="Select metric"');
    expect(markup).toContain('aria-label="Select season"');
    expect(markup).toContain('Rainfall');
    expect(markup).toContain('Temperature');
    expect(markup).toContain('Dec–Feb (DJF)');
  });
});

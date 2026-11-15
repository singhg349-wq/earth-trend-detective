import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PlaceSearch from './PlaceSearch';

/**
 * The shell mounts this popup over the globe, so the initial markup must carry
 * the combobox wiring even before any typing happens.
 */
describe('PlaceSearch', () => {
  const markup = renderToStaticMarkup(
    <PlaceSearch onChoose={() => {}} onClose={() => {}} />,
  );

  it('renders a labelled combobox', () => {
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Search for a place or coordinates"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('explains what can be typed', () => {
    expect(markup).toContain('53.55, -113.49');
    expect(markup).toContain('Esc');
  });

  it('uses the solid panel classes', () => {
    expect(markup).toContain('ps');
    expect(markup).toContain('ed-panel');
  });
});

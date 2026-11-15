import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TopBar from './TopBar';

describe('TopBar', () => {
  it('renders nav tabs and El Niño button in globe view', () => {
    const markup = renderToStaticMarkup(
      <TopBar
        mode="explore"
        view="globe"
        onNavigate={() => {}}
        onShowEnso={() => {}}
        onBackToGlobe={() => {}}
      />,
    );
    expect(markup).toContain('Explore');
    expect(markup).toContain('Compare');
    expect(markup).toContain('Library');
    expect(markup).toContain('Glossary');
    expect(markup).toContain('El Niño');
    expect(markup).not.toContain('Back to globe');
  });

  it('keeps top nav tabs visible in El Niño mode alongside Back to globe button', () => {
    const markup = renderToStaticMarkup(
      <TopBar
        mode="explore"
        view="enso"
        onNavigate={() => {}}
        onShowEnso={() => {}}
        onBackToGlobe={() => {}}
      />,
    );
    expect(markup).toContain('Explore');
    expect(markup).toContain('Compare');
    expect(markup).toContain('Library');
    expect(markup).toContain('Glossary');
    expect(markup).toContain('Back to globe');
  });
});

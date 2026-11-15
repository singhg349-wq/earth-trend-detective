import '../present/present.css';
import './topbar.css';

export type AppMode = 'explore' | 'compare' | 'library';

export type AppView = 'globe' | 'enso' | 'glossary';

interface TopBarProps {
  mode: AppMode;
  onNavigate: (mode: AppMode) => void;
  view: AppView;
  onShowEnso: () => void;
  onBackToGlobe: () => void;
  onPresent?: () => void;
}

const NAV: Array<{ id: AppMode; label: string }> = [
  { id: 'explore', label: 'Explore' },
  { id: 'compare', label: 'Compare' },
  { id: 'library', label: 'Library' },
];

/**
 * Editorial, minimal top bar: a serif wordmark, understated text-tab nav with an
 * underline on the active item, and the El Ni\u00f1o outlook as the one prominent
 * (but tasteful) action. No "" label. Class names are `ed-`
 * prefixed so they never collide with the legacy `styles.css`.
 */
export default function TopBar({
  mode,
  onNavigate,
  view,
  onShowEnso,
  onBackToGlobe,
  onPresent,
}: TopBarProps) {
  return (
    <header className="ed-topbar">
      <div className="ed-brand">
        <span className="ed-brand-name">TrendTrace</span>
      </div>

      {view !== 'globe' ? (
        <button type="button" className="ed-btn ed-enso-back" onClick={onBackToGlobe}>
          <span aria-hidden="true">&larr;</span> Back to globe
        </button>
      ) : (
        <>
          <nav className="ed-nav" aria-label="Primary">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  mode === item.id ? 'ed-nav-item is-active' : 'ed-nav-item'
                }
                onClick={() => onNavigate(item.id)}
                aria-current={mode === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
            <a className="nav-item" href="#glossary">Glossary</a>
            {onPresent && <button type="button" className="ed-present-btn" onClick={onPresent} title="Fullscreen talk mode (keyboard: arrows, Home, Esc)">Present</button>}
      </nav>
          <button
            type="button"
            className="ed-btn ed-btn--primary ed-enso-btn"
            onClick={onShowEnso}
          >
            <span className="ed-enso-dot" aria-hidden="true" />
            El Ni&ntilde;o
          </button>
        </>
      )}
    </header>
  );
}

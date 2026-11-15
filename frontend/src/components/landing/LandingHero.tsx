import './landing.css';

interface LandingHeroProps {
  onStart: () => void;
}

/**
 * Cinematic landing hero over the globe. This is the one place the design spec
 * allows a glass treatment (`.ed-glass`): a narrow, top-left editorial block
 * that leaves the globe large and visible behind it. Fades/translates in once
 * and respects `prefers-reduced-motion`.
 */
export default function LandingHero({ onStart }: LandingHeroProps) {
  return (
    <div className="landing-hero ed-glass" aria-label="TrendTrace">
      <p className="ed-eyebrow">TrendTrace</p>
      <h1 className="ed-h1">
        Click anywhere on Earth. See what&rsquo;s changing &mdash; and how sure we are.
      </h1>
      <p className="ed-lede">
        Seasonal rainfall, temperature, aerosol and soil-moisture trends from NASA satellite-era data, with the
        statistics and their limits shown in plain language.
      </p>

      <div className="landing-actions">
        <button type="button" className="ed-btn ed-btn--primary" onClick={onStart}>
          Start an investigation
        </button>
        <span className="landing-or">Or click the globe</span>
      </div>

      <hr className="ed-rule" />

      <dl className="landing-facts">
        <div>
          <dt>Coverage</dt>
          <dd>1&deg; grid, global</dd>
        </div>
        <div>
          <dt>Variables</dt>
          <dd>4 climate metrics</dd>
        </div>
        <div>
          <dt>Seasons</dt>
          <dd>5 &middot; DJF&ndash;Annual</dd>
        </div>
      </dl>
    </div>
  );
}

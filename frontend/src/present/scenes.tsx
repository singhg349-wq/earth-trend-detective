import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { LIVE_URL, OPENING_QUESTION, SHOW_QR, STORY, type SceneId } from './steps';

/** Stagger index for the shared entrance animation. */
const at = (i: number): CSSProperties => ({ ['--i' as string]: i }) as CSSProperties;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that ticks up once when the slide enters. */
function Counter({ to, delay = 120, ms = 850 }: { to: number; delay?: number; ms?: number }) {
  const [value, setValue] = useState(() => (reducedMotion() ? to : 0));
  useEffect(() => {
    if (reducedMotion()) {
      setValue(to);
      return;
    }
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      setValue(Math.round(to * (1 - Math.pow(1 - t, 4))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, delay, ms]);
  return <span className="pm-count">{value.toLocaleString('en-US')}</span>;
}

/**
 * Giant display word, one span per letter. Letters listed in `front` sit above
 * the ribbon blob; the rest are only drawn on the layer underneath it, so the
 * ribbon appears to weave through the word.
 */
function Giant({ text, front = [], className = '' }: { text: string; front?: number[]; className?: string }) {
  return (
    <div className={`pm-giant${front.length ? ' pm-weave' : ''} ${className}`} aria-label={text} role="heading" aria-level={1}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`pm-letter${front.includes(i) ? ' is-front' : ''}${ch === ' ' ? ' is-space' : ''}`}
          style={at(i)}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </div>
  );
}

function Pill({ children, tone = 'warm', i = 0 }: { children: ReactNode; tone?: 'warm' | 'cool' | 'mint'; i?: number }) {
  return (
    <span className={`pm-pill pm-pill--${tone} pm-in`} style={at(i)}>
      {children}
    </span>
  );
}

function Question() {
  const parts = OPENING_QUESTION.split(/(?<=[.?!])\s+/).filter(Boolean);
  const lead = parts.length > 1 ? parts[0] : null;
  const giants = parts.length > 1 ? parts.slice(1) : parts;
  return (
    <div className="pm-s pm-question">
      <Pill tone="cool">{STORY.eyebrow}</Pill>
      {lead && (
        <p className="pm-q-lead pm-in" style={at(1)}>
          {lead}
        </p>
      )}
      <div className={`pm-q-giants pm-q-giants--${Math.min(giants.length, 4)}`}>
        {giants.map((line, i) => (
          <h1 key={line} className="pm-in pm-rise" style={at(3 + i * 2)}>
            {line}
          </h1>
        ))}
      </div>
    </div>
  );
}

function Place() {
  const c = STORY.place;
  return (
    <div className="pm-s pm-place">
      <Pill>{c.pill}</Pill>
      <h1 className="pm-h pm-in pm-rise" style={at(1)}>
        {c.lines[0]}
      </h1>
      <h1 className="pm-h pm-h--em pm-in pm-rise" style={at(3)}>
        {c.lines[1]}
      </h1>
      <p className="pm-sub pm-in" style={at(6)}>
        {c.sub}
      </p>
      <div className="pm-pin-dot pm-in" style={at(5)} aria-hidden="true" />
      <div className="pm-pin-label pm-in" style={at(8)}>
        {c.pin}
      </div>
    </div>
  );
}

function Locked() {
  const c = STORY.locked;
  return (
    <div className="pm-s pm-locked">
      <Pill tone="cool">{c.pill}</Pill>
      <Giant text={c.giant} className="pm-giant--years" />
      <p className="pm-locked-line pm-in" style={at(8)}>
        {c.before}{' '}
        <strong>
          <Counter to={c.files} delay={380} />
        </strong>{' '}
        {c.after}
      </p>
      <p className="pm-sub pm-in" style={at(10)}>
        {c.sub}
      </p>
      <ul className="pm-barriers" aria-label="What stands in the way">
        {c.barriers.map((b, i) => (
          <li key={b} className="pm-in" style={at(9 + i * 1.6)}>
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reveal() {
  const c = STORY.reveal;
  return (
    <div className="pm-s pm-reveal">
      <Pill>{c.pill}</Pill>
      <Giant text={c.giant} front={[1, 2, 5, 6, 9]} className="pm-giant--mark" />
      <p className="pm-tagline pm-in" style={at(9)}>
        {c.tagline[0]} <em>{c.tagline[1]}</em>
      </p>
      <ul className="pm-chips">
        {c.metrics.map((m, i) => (
          <li key={m} className="pm-in" style={at(11 + i)}>
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Built() {
  const c = STORY.built;
  return (
    <div className="pm-s pm-built">
      <Pill tone="mint">{c.pill}</Pill>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
        {c.headline[0]} <em>{c.headline[1]}</em>
      </h1>
      <svg className="pm-flow" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
        <path className="pm-flow-line" pathLength={1} d="M368 398 Q550 286 732 398" style={at(7)} />
        <path className="pm-flow-dash" d="M368 398 Q550 286 732 398" />
        <path className="pm-flow-line" pathLength={1} d="M868 398 Q1050 286 1232 398" style={at(12)} />
        <path className="pm-flow-dash" d="M868 398 Q1050 286 1232 398" />
      </svg>
      {c.links.map((label, i) => (
        <span key={label} className={`pm-flow-label pm-flow-label--${i} pm-in`} style={at(8 + i * 5)}>
          {label}
        </span>
      ))}
      {c.stations.map((s, i) => (
        <div key={s.label} className={`pm-station pm-station--${i} pm-in`} style={at(3 + i * 5)}>
          <span className="pm-station-num">
            <Counter to={s.value} delay={200 + i * 300} ms={750} />
          </span>
          <span className="pm-station-label">{s.label}</span>
          <span className="pm-station-sub">{s.sub}</span>
        </div>
      ))}
      <ul className="pm-chips pm-chips--facts">
        {c.facts.map((fact, i) => (
          <li key={fact} className="pm-in" style={at(15 + i)}>
            {fact}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Real series: Amazon Dec–Feb 2 m air temperature, 1981–2026, °C
 * (data/artifacts/t2m_amazon_DJF.json, values rounded to 2 decimals).
 * Sen's slope +0.2457 °C/decade, intercept −24.178; 95% CI 0.1448..0.3722.
 */
const AMAZON_T = [
  24.67, 24.64, 25.71, 24.24, 24.32, 24.19, 24.85, 25.34, 24.21, 24.69, 24.92, 25.51, 24.77, 24.75, 24.99, 24.76, 24.71,
  26.52, 24.82, 24.58, 24.61, 25.22, 25.59, 25.38, 25.67, 24.97, 25.67, 24.75, 24.78, 25.71, 24.68, 24.82, 25.33, 25.12,
  25.45, 26.86, 25.26, 25.39, 25.36, 26.13, 25.58, 25.09, 24.87, 27.14, 26.19, 25.92,
];
const Y0 = 1981;
const Y1 = 2026;
const SEN = { slope: 0.02456613636, intercept: -24.1781592, lo: 0.014480210526, hi: 0.037219304348 };

function MethodChart() {
  const W = 760;
  const H = 400;
  const tMin = 23.9;
  const tMax = 27.4;
  const x = (year: number) => 42 + ((year - Y0) / (Y1 - Y0)) * (W - 62);
  const y = (t: number) => H - 24 - ((t - tMin) / (tMax - tMin)) * (H - 48);
  const fit = (year: number) => SEN.intercept + SEN.slope * year;
  const mid = (Y0 + Y1) / 2;
  const fan = (slope: number, year: number) => fit(mid) + slope * (year - mid);
  const fanPath = `M${x(Y0)} ${y(fan(SEN.lo, Y0))} L${x(Y1)} ${y(fan(SEN.hi, Y1))} L${x(Y1)} ${y(fan(SEN.lo, Y1))} L${x(Y0)} ${y(fan(SEN.hi, Y0))} Z`;
  return (
    <svg className="pm-chart" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {[24, 25, 26, 27].map((t) => (
        <g key={t}>
          <line className="pm-chart-grid" x1={30} x2={W - 12} y1={y(t)} y2={y(t)} />
          <text className="pm-chart-tick" x={20} y={y(t) + 5}>
            {t}°
          </text>
        </g>
      ))}
      <path className="pm-chart-fan" d={fanPath} />
      <polyline
        className="pm-chart-series"
        pathLength={1}
        points={AMAZON_T.map((t, i) => `${x(Y0 + i).toFixed(1)},${y(t).toFixed(1)}`).join(' ')}
      />
      {AMAZON_T.map((t, i) => (
        <circle key={i} className="pm-chart-dot" cx={x(Y0 + i)} cy={y(t)} r={4.2} style={at(i)} />
      ))}
      <line className="pm-chart-trend" pathLength={1} x1={x(Y0)} y1={y(fit(Y0))} x2={x(Y1)} y2={y(fit(Y1))} />
      <text className="pm-chart-year" x={34} y={H - 2}>
        {Y0}
      </text>
      <text className="pm-chart-year pm-chart-year--end" x={W - 12} y={H - 2}>
        {Y1}
      </text>
    </svg>
  );
}

function Method() {
  const c = STORY.method;
  return (
    <div className="pm-s pm-method">
      <Pill tone="cool">{c.pill}</Pill>
      <h1 className="pm-h pm-h--big pm-in pm-rise" style={at(1)}>
        {c.headline[0]} <em>{c.headline[1]}</em>
      </h1>
      <ol className="pm-checks">
        {c.checks.map((check, i) => (
          <li key={check.name} className="pm-in" style={at(4 + i * 3)}>
            <span className="pm-check-n">{i + 1}</span>
            <span className="pm-check-body">
              <strong>{check.name}</strong>
              <span>{check.note}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="pm-chart-wrap">
        <p className="pm-chart-label pm-in" style={at(2)}>
          {c.chartLabel}
        </p>
        <MethodChart />
        <p className="pm-chart-result pm-in" style={at(18)}>
          <strong>{c.chartResult}</strong>
          <span>{c.chartDetail}</span>
        </p>
      </div>
    </div>
  );
}

function Link() {
  const c = STORY.link;
  return (
    <div className="pm-s pm-link">
      <Pill>{c.pill}</Pill>
      <Giant text={c.giant} front={[1, 4, 5]} className="pm-giant--nino" />
      <p className="pm-link-lead pm-in" style={at(8)}>
        {c.lead}
      </p>
      <ul className="pm-stats">
        {c.stats.map((s, i) => (
          <li key={s.value} className="pm-in" style={at(10 + i * 2)}>
            <span className="pm-stat-place">{s.place}</span>
            <strong>{s.value}</strong>
            <span className="pm-stat-note">{s.note}</span>
          </li>
        ))}
      </ul>
      <p className="pm-foot pm-in" style={at(17)}>
        {c.footer}
      </p>
    </div>
  );
}

function Impact() {
  const c = STORY.impact;
  return (
    <div className="pm-s pm-impact">
      <Pill tone="mint">{c.pill}</Pill>
      <div className="pm-people">
        {c.people.map((p, i) => (
          <h1 key={p} className="pm-in pm-rise" style={at(1 + i * 2)}>
            {p}
          </h1>
        ))}
      </div>
      <p className="pm-sub pm-in" style={at(10)}>
        {c.sub}
      </p>
      <div className="pm-next">
        <p className="pm-next-title pm-in" style={at(9)}>
          {c.nextTitle}
        </p>
        <ol>
          {c.next.map((n, i) => (
            <li key={n} className="pm-in" style={at(11 + i * 2)}>
              {n}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Close() {
  const c = STORY.close;
  return (
    <div className={`pm-s pm-close${SHOW_QR ? '' : ' pm-close--noqr'}`}>
      <Giant text={c.giant} front={[0, 3, 4, 7, 8]} className="pm-giant--mark" />
      <p className="pm-tagline pm-in" style={at(8)}>
        <em>{c.line}</em>
      </p>
      <p className="pm-url pm-in" style={at(10)}>
        <span className="pm-url-dot" aria-hidden="true" />
        {c.url}
      </p>
      <ul className="pm-chips pm-chips--credits">
        {c.credits.map((credit, i) => (
          <li key={credit} className="pm-in" style={at(12 + i * 0.6)}>
            {credit}
          </li>
        ))}
      </ul>
      <p className="pm-foot pm-in" style={at(17)}>
        {c.footer}
      </p>
      {SHOW_QR && (
        <div className="pm-qr pm-in" style={at(11)}>
          <img src="/assets/present/qr-live.svg" alt={`QR code for ${LIVE_URL}`} />
          <span>{c.qrLabel}</span>
        </div>
      )}
    </div>
  );
}

const SCENES: Record<SceneId, () => ReactNode> = {
  question: Question,
  place: Place,
  locked: Locked,
  reveal: Reveal,
  built: Built,
  method: Method,
  link: Link,
  impact: Impact,
  close: Close,
};

/** Scenes whose giant word is woven through blob 0 (rendered on two layers). */
export const WEAVE_SCENES: ReadonlySet<SceneId> = new Set<SceneId>(['reveal', 'link', 'close']);

export function Scene({ scene }: { scene: SceneId }) {
  const Component = SCENES[scene];
  return <Component />;
}

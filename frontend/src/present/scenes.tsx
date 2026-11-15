import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { LIVE_URL, SHOW_QR, STORY, type SceneId } from './steps';

/** Stagger index for the shared entrance animation. */
const at = (i: number): CSSProperties => ({ ['--i' as string]: i }) as CSSProperties;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Wrapper that reveals progressively on the same slide as `reveal` increases. */
function Rev({ show, children, className = '' }: { show: boolean; children: ReactNode; className?: string }) {
  return <div className={`pm-rev${show ? ' is-shown' : ''} ${className}`}>{children}</div>;
}

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
 * Display wordmark, one span per letter. Letters listed in `front` sit above
 * the ribbon blob; the rest are drawn on the layer underneath it.
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
          {ch === ' ' ? '\u00A0' : ch}
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

function Question({ reveal }: { reveal: number }) {
  const c = STORY.question;
  return (
    <div className="pm-s pm-question">
      <Pill tone="cool">{c.pill}</Pill>
      <p className="pm-q-lead pm-in" style={at(1)}>
        {c.lead}
      </p>
      <div className="pm-q-giants">
        {c.lines.map((line, i) => (
          <h1 key={line} className="pm-in pm-rise" style={at(2 + i)}>
            {line}
          </h1>
        ))}
      </div>
      <div className="pm-points">
        {c.points.map((pt, i) => (
          <Rev key={pt} show={reveal >= i + 1}>
            <p className="pm-point">{pt}</p>
          </Rev>
        ))}
      </div>
    </div>
  );
}

function Locked({ reveal }: { reveal: number }) {
  const c = STORY.locked;
  return (
    <div className="pm-s pm-locked">
      <Pill tone="cool">{c.pill}</Pill>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
        46 years of NASA estimates, locked inside <em><Counter to={c.files} delay={200} /></em> files.
      </h1>
      <div className="pm-ds-grid">
        {c.datasets.map((ds, i) => {
          const stepNeeded = i < 2 ? 1 : 2;
          return (
            <Rev key={ds.name} show={reveal >= stepNeeded} className="pm-ds-card">
              <strong>{ds.name}</strong>
              <span>{ds.detail}</span>
            </Rev>
          );
        })}
      </div>
      <Rev show={reveal >= 3}>
        <p className="pm-sub pm-locked-note">{c.barrierNote}</p>
      </Rev>
    </div>
  );
}

function Built({ reveal }: { reveal: number }) {
  const c = STORY.built;
  return (
    <div className="pm-s pm-built">
      <Pill tone="mint">{c.pill}</Pill>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
        {c.headline}
      </h1>
      <div className="pm-stations-row">
        {c.stations.map((s, i) => (
          <div key={s.label} className="pm-station-card pm-in" style={at(2 + i * 2)}>
            <span className="pm-station-num">
              <Counter to={s.value} delay={160 + i * 200} ms={700} />
            </span>
            <span className="pm-station-label">{s.label}</span>
            <span className="pm-station-sub">{s.sub}</span>
          </div>
        ))}
      </div>
      <div className="pm-points">
        {c.points.map((pt, i) => (
          <Rev key={pt} show={reveal >= i + 1}>
            <p className="pm-point">{pt}</p>
          </Rev>
        ))}
      </div>
    </div>
  );
}

function Method({ reveal }: { reveal: number }) {
  const c = STORY.method;
  return (
    <div className="pm-s pm-method">
      <Pill tone="cool">{c.pill}</Pill>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
        {c.headline}
      </h1>
      <ol className="pm-checks">
        {c.checks.map((check, i) => (
          <Rev key={check.name} show={reveal >= i + 1} className="pm-check-item">
            <span className="pm-check-n">{i + 1}</span>
            <span className="pm-check-body">
              <span className="pm-check-head">
                <strong>{check.name}</strong>
                <em className="pm-check-level">{check.level}</em>
              </span>
              <span>{check.note}</span>
            </span>
          </Rev>
        ))}
      </ol>
    </div>
  );
}

function Result({ reveal }: { reveal: number }) {
  const c = STORY.result;
  return (
    <div className="pm-s pm-result">
      <Pill>{c.pill}</Pill>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
        {c.headline}
      </h1>
      <div className="pm-result-layout">
        <div className="pm-result-card pm-in" style={at(2)}>
          <p className="pm-result-title">{c.cardTitle}</p>
          <div className="pm-result-labels">
            {c.labels.map((lbl, i) => (
              <Rev key={lbl.tag} show={reveal >= i + 1} className="pm-result-row">
                <span className="pm-result-tag">{lbl.tag}</span>
                <strong>{lbl.value}</strong>
                <span className="pm-result-note">{lbl.note}</span>
              </Rev>
            ))}
          </div>
        </div>
        <Rev show={reveal >= 4} className="pm-trends-col">
          <p className="pm-trends-head">What the data shows across regions</p>
          <ul className="pm-trends-list">
            {c.trends.map((t) => (
              <li key={t.place}>
                <span className="pm-trend-place">{t.place}</span>
                <strong>{t.value}</strong>
                <span>{t.note}</span>
              </li>
            ))}
          </ul>
        </Rev>
      </div>
    </div>
  );
}

function Impact({ reveal }: { reveal: number }) {
  const c = STORY.impact;
  return (
    <div className="pm-s pm-impact">
      <Pill tone="mint">{c.pill}</Pill>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
        {c.headline}
      </h1>
      <div className="pm-points">
        {c.points.map((pt, i) => (
          <Rev key={pt} show={reveal >= i + 1}>
            <p className="pm-point">{pt}</p>
          </Rev>
        ))}
      </div>
      <Rev show={reveal >= 2} className="pm-next-box">
        <p className="pm-next-title">{c.nextTitle}</p>
        <ol>
          {c.next.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ol>
      </Rev>
    </div>
  );
}

function Close() {
  const c = STORY.close;
  return (
    <div className={`pm-s pm-close${SHOW_QR ? '' : ' pm-close--noqr'}`}>
      <Giant text={c.giant} front={[0, 3, 4, 7, 8]} className="pm-giant--mark" />
      <p className="pm-tagline pm-in" style={at(4)}>
        <em>{c.line}</em>
      </p>
      <p className="pm-url pm-in" style={at(6)}>
        <span className="pm-url-dot" aria-hidden="true" />
        {c.url}
      </p>
      <ul className="pm-chips pm-chips--credits">
        {c.credits.map((credit, i) => (
          <li key={credit} className="pm-in" style={at(8 + i * 0.5)}>
            {credit}
          </li>
        ))}
      </ul>
      <p className="pm-foot pm-in" style={at(12)}>
        {c.footer}
      </p>
      {SHOW_QR && (
        <div className="pm-qr pm-in" style={at(7)}>
          <img src="/assets/present/qr-live.svg" alt={`QR code for ${LIVE_URL}`} />
          <span>{c.qrLabel}</span>
        </div>
      )}
    </div>
  );
}

const SCENES: Record<SceneId, (props: { reveal: number }) => ReactNode> = {
  question: Question,
  locked: Locked,
  built: Built,
  method: Method,
  result: Result,
  impact: Impact,
  close: Close,
};

/** Scenes whose wordmark is woven through blob 0 (rendered on two layers). */
export const WEAVE_SCENES: ReadonlySet<SceneId> = new Set<SceneId>(['close']);

export function Scene({ scene, reveal }: { scene: SceneId; reveal: number }) {
  const Component = SCENES[scene];
  return <Component reveal={reveal} />;
}

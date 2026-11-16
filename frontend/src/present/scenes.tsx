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
  void reveal;
  const c = STORY.question;
  return (
    <div className="pm-s pm-question">
      <Pill tone="cool">{c.pill}</Pill>
      <h1 className="pm-q-hero pm-in pm-rise" style={at(1)}>
        Be An Earth System <em>Trend Detective!</em>
      </h1>
      <p className="pm-q-lead pm-in" style={at(2)}>
        {c.lead}
      </p>
      <div className="pm-q-triad pm-in" style={at(3)}>
        {c.lines.map((line, i) => (
          <div key={line} className="pm-q-triad-item">
            <span className="pm-q-triad-num">{i + 1}</span>
            <span>{line}</span>
          </div>
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
      <p className="pm-peru-link pm-in" style={at(1)}>{c.peruLink}</p>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(2)}>
        <em>231.3 GB</em> of raw NASA &amp; NOAA archives — unreadable without code.
      </h1>
      <div className="pm-ds-grid">
        {c.datasets.map((ds, i) => {
          void i;
          return (
            <Rev key={ds.name} show={reveal >= 1} className="pm-ds-card">
              <strong>{ds.name}</strong>
              <span>{ds.detail}</span>
            </Rev>
          );
        })}
      </div>
      <p className="pm-sub pm-locked-note">{c.barrierNote}</p>
      <Rev show={reveal >= 2}>
        <div className="pm-points">
          {c.limits.map((pt) => (
            <p key={pt} className="pm-point">{pt}</p>
          ))}
        </div>
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
      <div className="pm-pipeline pm-in" style={at(2)}>
        {c.pipeline.map((stage, i) => (
          <div key={stage} className="pm-pipe-step" style={at(2 + i)}>
            <span className="pm-pipe-node">{stage}</span>
            {i < c.pipeline.length - 1 && <span className="pm-pipe-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
      <div className="pm-stations-row">
        {c.stations.map((s, i) => (
          <div key={s.label} className="pm-station-card pm-in" style={at(3 + i * 2)}>
            <span className="pm-station-num">
              <Counter to={s.value} delay={160 + i * 200} ms={700} />
            </span>
            <span className="pm-station-label">{s.label}</span>
            <span className="pm-station-sub">{s.sub}</span>
          </div>
        ))}
      </div>
      <div className="pm-points">
        {c.points.map((pt) => (
          <Rev key={pt} show={reveal >= 1}>
            <p className="pm-point">{pt}</p>
          </Rev>
        ))}
        <Rev show={reveal >= 1}>
          <p className="pm-point pm-point--peru">{c.peruLink}</p>
        </Rev>
      </div>
    </div>
  );
}

function CaseIntro({ reveal }: { reveal: number }) {
  const c = STORY.caseIntro;
  return (
    <div className="pm-s pm-case">
      <Pill tone="warm">{c.pill}</Pill>
      <div className="pm-case-lines">
        <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
          {c.lines[0]}
        </h1>
        <Rev show={reveal >= 2}>
          <p className="pm-case-q">
            {c.lines[1]}
          </p>
        </Rev>
      </div>
      <ul className="pm-chips pm-case-chips">
        {c.chips.map((chip, i) => (
          <li key={chip} className="pm-in" style={at(3 + i * 0.5)}>
            {chip}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EnsoBridge({ reveal }: { reveal: number }) {
  const c = STORY.ensoBridge;
  return (
    <div className="pm-s pm-enso-bridge">
      <Pill tone="warm">{c.pill}</Pill>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
        {c.headline}
      </h1>
      <p className="pm-sub pm-enso-lead pm-in" style={at(1.5)}>
        {c.lead}
      </p>
      <div className="pm-enso-cols">
        <div className="pm-enso-col pm-enso-col--regular pm-in" style={at(2)}>
          <p className="pm-enso-col-title">{c.regular.title}</p>
          <ul>
            {c.regular.points.map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ul>
        </div>
        <div className="pm-enso-col pm-enso-col--nino pm-in" style={at(3)}>
          <p className="pm-enso-col-title">
            {c.elNino.title}
            <strong className="pm-enso-value">{c.elNino.value}</strong>
          </p>
          <ul>
            {c.elNino.points.map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ul>
        </div>
      </div>
      <Rev show={reveal >= 1} className="pm-enso-future">
        <span className="pm-other-label">{c.future.title}</span>
        <ul>
          {c.future.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="pm-enso-future-note">{c.future.note}</p>
      </Rev>
    </div>
  );
}

function Method({ reveal }: { reveal: number }) {
  const c = STORY.method;
  const snrPct = Math.round((c.signalVsNoise.signal / c.signalVsNoise.noise) * 100);
  return (
    <div className="pm-s pm-method">
      <Pill tone="cool">{c.pill}</Pill>
      <h1 className="pm-h pm-h--mid pm-in pm-rise" style={at(1)}>
        {c.headline}
      </h1>
      <p className="pm-sub pm-why-tests pm-in" style={at(2)}>{c.whyTests}</p>
      <ol className="pm-checks">
        {c.albertaVotes.map((check, i) => (
          <li key={check.name} data-morph={check.morph} className="pm-check-item pm-in" style={at(2 + i)}>
            <span className="pm-check-n">{i + 1}</span>
            <span className="pm-check-body">
              <span className="pm-check-head">
                <strong>{check.name}</strong>
                <span className={`pm-vote-chip ${check.pass ? 'is-pass' : 'is-fail'}`}>{check.vote}</span>
              </span>
              <span>{check.note}</span>
            </span>
          </li>
        ))}
      </ol>
      <Rev show={reveal >= 2} className="pm-method-grid">
        <div className="pm-snr-box">
          <div className="pm-snr-head">
            <strong>{c.signalVsNoise.label}</strong>
            <span>{c.signalVsNoise.caption}</span>
          </div>
          <div className="pm-snr-bars" aria-hidden="true">
            <div className="pm-snr-track">
              <span className="pm-snr-fill pm-snr-noise" style={{ width: '100%' }}>
                {c.signalVsNoise.noiseLabel}
              </span>
            </div>
            <div className="pm-snr-track">
              <span className="pm-snr-fill pm-snr-signal" style={{ width: `${snrPct}%` }}>
                +0.8 °C change
              </span>
            </div>
          </div>
          <p className="pm-snr-fdr">{c.validationNote}</p>
          <p className="pm-snr-fdr">{c.scaleNote}</p>
        </div>

        <div className="pm-threshold-card">
          <div className="pm-threshold-head">
            <strong>{c.thresholds.title}</strong>
            <span className="pm-threshold-tag">Strictness</span>
          </div>
          <div className="pm-threshold-list">
            {c.thresholds.levels.map((lvl) => (
              <div key={lvl.cut} className="pm-threshold-item">
                <span className={`pm-threshold-badge pm-threshold-badge--${lvl.tier}`}>
                  {lvl.cut} · {lvl.name}
                </span>
                <span className="pm-threshold-desc">{lvl.desc}</span>
              </div>
            ))}
          </div>
          <p className="pm-threshold-fdr">{c.thresholds.fdr}</p>
        </div>
      </Rev>
      <Rev show={reveal >= 2} className="pm-other-ways">
        <span className="pm-other-label">Other ways to check:</span>
        <ul>
          {c.otherWays.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </Rev>
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
        {c.points.map((pt) => (
          <Rev key={pt} show={reveal >= 1}>
            <p className="pm-point">{pt}</p>
          </Rev>
        ))}
      </div>
      <Rev show={reveal >= 1} className="pm-next-box">
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
      <Giant text={c.giant} front={[0, 2, 3, 4, 7, 8, 9]} className="pm-giant--mark" />
      <p className="pm-tagline pm-in" style={at(4)}>
        <em>{c.line}</em>
      </p>
      <p className="pm-team pm-in" style={at(5)}>
        {c.team}
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
  caseIntro: CaseIntro,
  method: Method,
  ensoBridge: EnsoBridge,
  impact: Impact,
  close: Close,
};

/** Scenes whose wordmark is woven through blob 0 (rendered on two layers). */
export const WEAVE_SCENES: ReadonlySet<SceneId> = new Set<SceneId>(['close']);

export function Scene({ scene, reveal }: { scene: SceneId; reveal: number }) {
  const Component = SCENES[scene];
  return <Component reveal={reveal} />;
}

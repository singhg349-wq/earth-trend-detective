import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { initialPresentState, keyToAction, presentReducer } from './engine';
import { backdropOpacity, blobPath, layoutFor, type BlobSpec } from './blobs';
import { Scene, WEAVE_SCENES } from './scenes';
import { STEPS, type DemoRing, type PresentStep } from './steps';
import './present.css';

interface MeasuredRing {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  label?: string;
  tone: 'amber' | 'mint' | 'coral';
  fading?: boolean;
}

interface PresentModeProps {
  /** Called whenever the current step changes (and once on mount). */
  onStep: (step: PresentStep, index: number) => void;
  onExit: () => void;
}

/** One persistent blob: its path and gradient morph between steps via CSS. */
function Blob({ index, spec }: { index: number; spec: BlobSpec }) {
  const d = blobPath(spec);
  const morph = { d: `path("${d}")` } as CSSProperties;
  return (
    <svg className={`pm-blob pm-blob-${index}`} viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`pm-grad-${index}`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" style={{ stopColor: spec.colors[0] }} />
          <stop offset="1" style={{ stopColor: spec.colors[1] }} />
        </linearGradient>
      </defs>
      <path d={d} style={morph} fill={`url(#pm-grad-${index})`} />
      <path d={d} style={morph} fill="url(#pm-grain-pattern)" />
    </svg>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

function requestFull() {
  if (typeof document === 'undefined') return;
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

function exitFull() {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement) {
    void document.exitFullscreen?.().catch(() => {});
  }
}

/**
 * Fullscreen presenter. Story steps render a designed scene on black with
 * progressive Next reveals on the same slide; demo steps drive the real app.
 */
export default function PresentMode({ onStep, onExit }: PresentModeProps) {
  const [state, send] = useReducer(
    (s: ReturnType<typeof initialPresentState>, a: Parameters<typeof presentReducer>[1]) =>
      presentReducer(s, a, STEPS.length),
    undefined,
    () => initialPresentState(true),
  );
  const step = STEPS[state.index];

  // Track scene changes (do NOT cross-fade when staying on the same scene for a progressive reveal).
  const [track, setTrack] = useState<{ current: PresentStep; previous: PresentStep | null }>({ current: step, previous: null });
  if (track.current !== step) {
    const sameScene = track.current.kind === 'story' && step.kind === 'story' && track.current.scene === step.scene;
    setTrack({ current: step, previous: sameScene ? null : track.current });
  }
  const leaving = track.current === step ? track.previous : track.current;
  useEffect(() => {
    if (!track.previous) return;
    const timer = window.setTimeout(() => setTrack((t) => ({ ...t, previous: null })), 170);
    return () => window.clearTimeout(timer);
  }, [track]);

  useEffect(() => {
    void document.fonts?.load('400 64px "Instrument Serif"');
    void document.fonts?.load('italic 400 64px "Instrument Serif"');
    requestFull();
    return () => exitFull();
  }, []);

  useEffect(() => {
    const handled = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return null;
      // Let typing in search/notes fields work normally (Space, arrows, Escape).
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return null;
      // Plain Escape reaches the app (closing dropdowns); only Shift+Escape exits.
      if (event.key === 'Escape' && !event.shiftKey) return null;
      return keyToAction(event.key);
    };
    const down = (event: KeyboardEvent) => {
      const action = handled(event);
      if (!action) return;
      if (action !== 'exit') requestFull();
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      send(action);
    };
    const up = (event: KeyboardEvent) => {
      if (handled(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, []);

  useEffect(() => {
    if (!state.active) {
      exitFull();
      onExit();
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    onStep(step, state.index);
    // onStep/onExit are stable refs from App; only the step index drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, state.active]);

  const [rings, setRings] = useState<MeasuredRing[]>([]);
  const prevRingsRef = useRef<MeasuredRing[]>([]);

  useLayoutEffect(() => {
    const stepRings: DemoRing[] = step.kind === 'demo' ? (step.rings ?? []) : [];
    if (step.kind === 'demo') {
      if (stepRings.length === 0) {
        setRings([]);
        prevRingsRef.current = [];
        return;
      }
      const measure = () => {
        const next: MeasuredRing[] = [];
        for (const r of stepRings) {
          const el = document.querySelector(r.to);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          next.push({
            key: r.key,
            left: rect.left - 4,
            top: rect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            label: r.label,
            tone: r.tone ?? 'amber',
          });
        }
        if (next.length > 0) {
          setRings(next);
          prevRingsRef.current = next;
        }
      };
      measure();
      const t1 = window.setTimeout(measure, 180);
      const t2 = window.setTimeout(measure, 520);
      const t3 = window.setTimeout(measure, 1100);
      // Globe flies take ~1.4 s; re-measure once the map pin has landed.
      const t4 = window.setTimeout(measure, 1700);
      window.addEventListener('resize', measure);
      window.addEventListener('scroll', measure, true);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
        window.clearTimeout(t4);
        window.removeEventListener('resize', measure);
        window.removeEventListener('scroll', measure, true);
      };
    }

    // Story slide: FLIP-morph any persistent keys (`slope`, `ci`, `p`) into `[data-morph=...]`
    if (step.scene === 'method' && prevRingsRef.current.length > 0) {
      const morphed: MeasuredRing[] = [];
      for (const prev of prevRingsRef.current) {
        const target = document.querySelector(`[data-morph="${prev.key}"]`);
        if (!target) continue;
        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        morphed.push({
          ...prev,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          label: undefined,
          fading: true,
        });
      }
      prevRingsRef.current = [];
      if (morphed.length > 0) {
        requestAnimationFrame(() => setRings(morphed));
        const clear = window.setTimeout(() => setRings([]), 700);
        return () => window.clearTimeout(clear);
      }
    }
    setRings([]);
    prevRingsRef.current = [];
  }, [step]);

  if (!state.active) return null;
  const isStory = step.kind === 'story';
  const scene = isStory ? step.scene : undefined;
  const reveal = step.reveal ?? 99;
  const layout = layoutFor(step);
  const weave = scene && WEAVE_SCENES.has(scene);
  const leavingScene =
    leaving && leaving.kind === 'story' && leaving.scene !== scene ? leaving.scene : undefined;
  const layers: Array<{ step: PresentStep; out: boolean }> = [];
  if (leavingScene && leaving) layers.push({ step: leaving, out: true });
  if (scene) layers.push({ step, out: false });
  const progress = STEPS.length > 1 ? state.index / (STEPS.length - 1) : 1;

  return (
    <div className="pm-root" data-kind={step.kind} data-scene={scene ?? 'demo'} data-step={step.id}>
      <svg className="pm-defs" width="0" height="0" aria-hidden="true">
        <defs>
          <pattern id="pm-grain-pattern" width="256" height="256" patternUnits="userSpaceOnUse">
            <image href="/assets/present/grain.png" width="256" height="256" />
          </pattern>
        </defs>
      </svg>

      <div className="pm-black" style={{ opacity: isStory ? backdropOpacity(scene) : 0 }} />

      {layers.map(({ step: layerStep, out }) =>
        out ? (
          <div key={`out-${layerStep.id}`} className="pm-layer pm-leaving pm-under">
            <Scene scene={layerStep.scene!} reveal={layerStep.reveal ?? 99} />
          </div>
        ) : weave ? (
          <div key={`under-${layerStep.scene}`} className="pm-layer pm-under">
            <Scene scene={layerStep.scene!} reveal={reveal} />
          </div>
        ) : null,
      )}

      <Blob index={0} spec={layout[0]} />
      <Blob index={1} spec={layout[1]} />
      <Blob index={2} spec={layout[2]} />
      <Blob index={3} spec={layout[3]} />
      <div className="pm-grain" />

      {layers.map(({ step: layerStep, out }) =>
        out ? (
          <div key={`out2-${layerStep.id}`} className="pm-layer pm-leaving pm-over">
            <Scene scene={layerStep.scene!} reveal={layerStep.reveal ?? 99} />
          </div>
        ) : (
          <div key={`in-${layerStep.scene}`} className={`pm-layer${weave ? ' pm-over' : ''}`}>
            <Scene scene={layerStep.scene!} reveal={reveal} />
          </div>
        ),
      )}

      {rings.length > 0 && (
        <div className="pm-rings-layer" aria-hidden="true">
          {rings.map((r) => (
            <div
              key={r.key}
              className={`pm-ring pm-ring--${r.tone}${r.fading ? ' is-fading' : ''}`}
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            >
              {r.label && (
                <span
                  className={`pm-ring-label${r.top < 34 ? ' is-below' : ''}${r.left + r.label.length * 7.4 + 28 > window.innerWidth - 8 ? ' is-right' : ''}`}
                >
                  {r.label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!isStory && step.caption && (
        <aside className="pm-caption" key={step.id}>
          <span className="pm-caption-live">Live</span>
          <span className="pm-caption-label">{step.caption.label}</span>
          {step.caption.value && <strong className="pm-caption-value">{step.caption.value}</strong>}
          {step.caption.detail && <span className="pm-caption-detail">{step.caption.detail}</span>}
        </aside>
      )}

      <div className="pm-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="present-counter" aria-live="polite">
        {pad(state.index + 1)} / {pad(STEPS.length)}
      </div>
    </div>
  );
}

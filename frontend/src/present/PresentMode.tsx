import { useEffect, useReducer, useState, type CSSProperties } from 'react';
import { initialPresentState, keyToAction, presentReducer } from './engine';
import { backdropOpacity, blobPath, layoutFor, type BlobSpec } from './blobs';
import { Scene, WEAVE_SCENES } from './scenes';
import { STEPS, type PresentStep } from './steps';
import './present.css';

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

/**
 * Fullscreen presenter. Story steps render a designed scene on black; demo
 * steps leave the real app (driven by App via `onStep`) on screen with a small
 * caption. Four blobs persist across every step and morph between layouts, so
 * story → demo → story reads as one continuous piece. Keyboard only.
 */
export default function PresentMode({ onStep, onExit }: PresentModeProps) {
  const [state, send] = useReducer(
    (s: ReturnType<typeof initialPresentState>, a: Parameters<typeof presentReducer>[1]) =>
      presentReducer(s, a, STEPS.length),
    undefined,
    () => initialPresentState(true),
  );
  const step = STEPS[state.index];

  // The step that is on its way out stays mounted briefly for a fast exit.
  // Derived during render so the outgoing scene never unmounts and remounts.
  const [track, setTrack] = useState<{ current: PresentStep; previous: PresentStep | null }>({ current: step, previous: null });
  if (track.current !== step) setTrack({ current: step, previous: track.current });
  const leaving = track.current === step ? track.previous : track.current;
  useEffect(() => {
    if (!track.previous) return;
    const timer = window.setTimeout(() => setTrack((t) => ({ ...t, previous: null })), 170);
    return () => window.clearTimeout(timer);
  }, [track]);

  useEffect(() => {
    // Warm the display font so the first headline never flashes a fallback.
    void document.fonts?.load('400 64px "Instrument Serif"');
    void document.fonts?.load('italic 400 64px "Instrument Serif"');
  }, []);

  useEffect(() => {
    const handled = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return null;
      return keyToAction(event.key);
    };
    const down = (event: KeyboardEvent) => {
      const action = handled(event);
      if (!action) return;
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
      onExit();
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    onStep(step, state.index);
    // onStep/onExit are stable refs from App; only the step index drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, state.active]);

  if (!state.active) return null;
  const isStory = step.kind === 'story';
  const scene = isStory ? step.scene : undefined;
  const layout = layoutFor(step);
  const weave = scene && WEAVE_SCENES.has(scene);
  const leavingScene = leaving && leaving.kind === 'story' && leaving !== step ? leaving.scene : undefined;
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
      <Blob index={3} spec={layout[3]} />
      <Blob index={2} spec={layout[2]} />
      <Blob index={1} spec={layout[1]} />
      {weave && scene && (
        <div className="pm-layer pm-under" key={`under-${step.id}`} aria-hidden="true">
          <Scene scene={scene} />
        </div>
      )}
      <Blob index={0} spec={layout[0]} />
      <div className="pm-grain" />

      {layers.map((layer) => (
        <section
          className={`pm-layer pm-over${layer.out ? ' pm-leaving' : ''}`}
          key={layer.step.id}
          aria-label={layer.step.title}
          aria-hidden={layer.out || undefined}
        >
          <Scene scene={layer.step.scene!} />
        </section>
      ))}

      {!isStory && step.caption && (
        <div className="pm-caption" key={`cap-${step.id}`}>
          <span className="pm-caption-live">Live</span>
          <span className="pm-caption-label">{step.caption.label}</span>
          {step.caption.value && <strong className="pm-caption-value">{step.caption.value}</strong>}
          {step.caption.detail && <span className="pm-caption-detail">{step.caption.detail}</span>}
        </div>
      )}

      <div className="pm-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="present-counter" aria-live="off">
        {pad(state.index + 1)} / {pad(STEPS.length)}
      </div>
    </div>
  );
}

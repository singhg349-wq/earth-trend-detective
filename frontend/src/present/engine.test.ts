import { describe, expect, it } from 'vitest';
import { initialPresentState, keyToAction, presentReducer } from './engine';
import { LIVE_URL, SHOW_QR, STEPS, STORY } from './steps';
import { DEMO_LAYOUT, PALETTE, STORY_LAYOUTS, blobPath, layoutFor } from './blobs';

describe('present engine', () => {
  const N = STEPS.length;
  it('maps keys', () => {
    for (const k of ['ArrowRight', 'PageDown', ' ']) expect(keyToAction(k)).toBe('next');
    for (const k of ['ArrowLeft', 'PageUp']) expect(keyToAction(k)).toBe('back');
    expect(keyToAction('Home')).toBe('home');
    expect(keyToAction('Escape')).toBe('exit');
    expect(keyToAction('a')).toBeNull();
  });
  it('moves forward and back with bounds', () => {
    let s = initialPresentState();
    expect(presentReducer(s, 'back', N).index).toBe(0);
    for (let i = 0; i < N + 5; i++) s = presentReducer(s, 'next', N);
    expect(s.index).toBe(N - 1);
    s = presentReducer(s, 'back', N);
    expect(s.index).toBe(N - 2);
  });
  it('home restarts from any step', () => {
    let s = initialPresentState();
    for (let i = 0; i < 6; i++) s = presentReducer(s, 'next', N);
    expect(presentReducer(s, 'home', N).index).toBe(0);
  });
  it('escape exits and then ignores keys', () => {
    let s = presentReducer(initialPresentState(), 'next', N);
    s = presentReducer(s, 'exit', N);
    expect(s.active).toBe(false);
    expect(presentReducer(s, 'next', N)).toBe(s);
  });
  it('step state is a pure function of the index (idempotent)', () => {
    let s = initialPresentState();
    for (let i = 0; i < 5; i++) s = presentReducer(s, 'next', N);
    const here = s.index;
    const roundTrip = presentReducer(presentReducer(s, 'next', N), 'back', N);
    expect(roundTrip.index).toBe(here);
    expect(STEPS[roundTrip.index]).toBe(STEPS[here]);
  });
});

describe('steps data', () => {
  it('has unique ids, support notes and kind-appropriate content', () => {
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
    expect(STEPS.length).toBeGreaterThanOrEqual(12);
    expect(STEPS.length).toBeLessThanOrEqual(40);
    expect(STEPS[0].headline).toBeTruthy();
    expect(LIVE_URL).toBe('https://trendtrace.earth-trend-detective-frontend.workers.dev');
    expect(typeof SHOW_QR).toBe('boolean');
    for (const s of STEPS) {
      expect(s.supportNotes.length).toBeGreaterThanOrEqual(1);
      expect(s.supportNotes.length).toBeLessThanOrEqual(5);
      if (s.kind === 'story') {
        expect(s.scene).toBeTruthy();
        expect(s.headline).toBeTruthy();
        expect(STORY_LAYOUTS[s.scene!]).toBeTruthy();
      } else {
        expect(s.demo).toBeTruthy();
        expect(s.caption?.label).toBeTruthy();
      }
    }
  });
  it('never mentions prediction or skill, and blobs can always morph', () => {
    const text = JSON.stringify([STEPS, STORY]).toLowerCase();
    expect(text).not.toMatch(/brier|hindcast|skill|predict|forecast|outlook/);
    // Every layout compiles to the same path command structure, so the browser
    // can interpolate `d` between any two steps (morph, never cut).
    const shape = (d: string) => d.replace(/[-\d.\s]+/g, '');
    const reference = shape(blobPath(DEMO_LAYOUT[0]));
    expect(reference).toBe('M' + 'C'.repeat(12) + 'Z');
    for (const s of STEPS) {
      const layout = layoutFor(s);
      expect(layout).toHaveLength(4);
      for (const blob of layout) {
        const d = blobPath(blob);
        expect(shape(d)).toBe(reference);
        expect(d).not.toMatch(/NaN|Infinity/);
        for (const colour of blob.colors) expect(Object.values(PALETTE)).toContain(colour);
      }
    }
    expect(layoutFor({ kind: 'demo' })).toBe(DEMO_LAYOUT);
  });
});

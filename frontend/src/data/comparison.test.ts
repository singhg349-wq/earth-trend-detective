import { describe, expect, it } from 'vitest';
import {
  MAX_SLOTS,
  addSlot,
  applyShared,
  createSlot,
  hasOverrides,
  layoutFor,
  overrideSlot,
  panelPercent,
  removeSlot,
  slotKey,
  type ComparisonSlot,
  type ComparisonState,
  type SlotSettings,
} from './comparison';
import type { SeriesDoc } from '../types';

const doc = { id: 'precip_indonesia_DJF' } as SeriesDoc;

const settings: SlotSettings = { variable: 'precipitation', season: 'DJF', period: 'full' };

function empty(): ComparisonState {
  return { slots: [], activeId: null, shared: settings };
}

function slot(id: string, regionId: string, overrides: Partial<SlotSettings> = {}): ComparisonSlot {
  return createSlot({
    id,
    regionId,
    doc,
    enso: null,
    settings: { ...settings, ...overrides },
  });
}

function filled(count: number): ComparisonState {
  let state = empty();
  for (let index = 0; index < count; index += 1) {
    const result = addSlot(state, slot(`s${index}`, `region_${index}`));
    if (!result.ok) throw new Error(`fixture rejected slot ${index}`);
    state = result.state;
  }
  return state;
}

describe('slot identity', () => {
  it('treats region plus settings as the identity', () => {
    expect(slotKey('indonesia', settings)).toBe('indonesia|precipitation|DJF|full');
  });

  it('allows the same region twice with different periods', () => {
    const state = empty();
    const first = addSlot(state, slot('a', 'indonesia'));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addSlot(first.state, slot('b', 'indonesia', { period: 'first-half' }));
    expect(second.ok).toBe(true);
  });

  it('rejects an identical combination', () => {
    const state = empty();
    const first = addSlot(state, slot('a', 'indonesia'));
    if (!first.ok) throw new Error('expected first add to succeed');
    const duplicate = addSlot(first.state, slot('b', 'indonesia'));
    expect(duplicate).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('refuses a sixth result', () => {
    const state = filled(MAX_SLOTS);
    expect(addSlot(state, slot('extra', 'region_extra'))).toEqual({ ok: false, reason: 'full' });
  });
});

describe('shared settings', () => {
  it('propagates to slots that are not overridden', () => {
    const state = filled(2);
    const next = applyShared(state, { period: 'first-half' });
    expect(next.slots.map((item) => item.period)).toEqual(['first-half', 'first-half']);
    expect(next.slots[0].key).toContain('first-half');
  });

  it('leaves an overridden slot alone and reports the override', () => {
    const state = filled(2);
    const pinned = overrideSlot(state, 's0', { season: 'JJA' });
    const next = applyShared(pinned, { season: 'MAM' });
    expect(next.slots[0].season).toBe('JJA');
    expect(next.slots[1].season).toBe('MAM');
    expect(hasOverrides(next)).toBe(true);
  });

  it('reports no overrides when everything inherits the shared settings', () => {
    const state = applyShared(filled(3), { season: 'SON' });
    expect(hasOverrides(state)).toBe(false);
  });

  it('never lets a shared change duplicate an existing identity', () => {
    let state = empty();
    const full = addSlot(state, slot('a', 'indonesia'));
    if (!full.ok) throw new Error('expected first add');
    state = full.state;
    const half = addSlot(state, slot('b', 'indonesia', { period: 'first-half' }));
    if (!half.ok) throw new Error('expected second add');
    state = overrideSlot(half.state, 'b', { period: 'first-half' });

    const next = applyShared(state, { period: 'first-half' });

    const keys = next.slots.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(next.slots[0].key).not.toBe(next.slots[1].key);
  });

  it('refuses an override that would duplicate another slot', () => {
    let state = empty();
    const first = addSlot(state, slot('a', 'indonesia'));
    if (!first.ok) throw new Error('expected first add');
    const second = addSlot(first.state, slot('b', 'indonesia', { period: 'first-half' }));
    if (!second.ok) throw new Error('expected second add');
    state = second.state;

    const attempted = overrideSlot(state, 'b', { period: 'full' });

    expect(attempted).toBe(state);
    expect(attempted.slots[1].period).toBe('first-half');
  });
});

describe('removal', () => {
  it('moves the active slot to the last remaining one', () => {
    const state = filled(2);
    const next = removeSlot(state, 's1');
    expect(next.slots.map((item) => item.id)).toEqual(['s0']);
    expect(next.activeId).toBe('s0');
  });

  it('clears the active slot when the last one goes', () => {
    const next = removeSlot(filled(1), 's0');
    expect(next.slots).toEqual([]);
    expect(next.activeId).toBeNull();
  });
});

describe('layout', () => {
  it('maps counts to the agreed layout', () => {
    expect([0, 1, 2, 3, 4, 5].map(layoutFor)).toEqual([
      'empty',
      'single',
      'pair',
      'triple',
      'quad',
      'five',
    ]);
  });

  it('keeps the globe at 30% only for a single result', () => {
    expect(panelPercent(1)).toBe(70);
    expect([2, 3, 4, 5].map(panelPercent)).toEqual([100, 100, 100, 100]);
  });
});

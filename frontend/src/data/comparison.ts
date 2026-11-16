/**
 * Comparison model: up to five results side by side.
 *
 * A slot's identity for dedupe is region + variable + season + period, so the same
 * region may appear twice with different periods but never twice identically.
 * `id` is a stable handle that survives a settings change; `key` is the identity.
 * Settings are shared by default; a slot carrying its own settings is flagged as
 * an override so the UI can show that its window differs from the rest.
 */

import type { EnsoDoc } from './enso';
import type { PeriodKey } from './exports';
import type { SeriesDoc } from '../types';

export const MAX_SLOTS = 5;

export interface SlotSettings {
  variable: string;
  season: string;
  period: PeriodKey;
  customRange?: [number, number];
}

export interface ComparisonSlot extends SlotSettings {
  /** Stable handle; does not change when settings change. */
  id: string;
  /** Dedupe identity: region + variable + season + period. */
  key: string;
  regionId: string;
  doc: SeriesDoc;
  enso: EnsoDoc | null;
  /** True when this slot's settings were chosen individually. */
  overridden: boolean;
}

export interface ComparisonState {
  slots: ComparisonSlot[];
  activeId: string | null;
  /** Settings applied to every non-overridden slot. */
  shared: SlotSettings;
}

export type AddResult =
  | { ok: true; state: ComparisonState; slot: ComparisonSlot }
  | { ok: false; reason: 'duplicate' | 'full' };

export function slotKey(regionId: string, settings: SlotSettings): string {
  const range =
    settings.period === 'custom' && settings.customRange
      ? `|${settings.customRange[0]}-${settings.customRange[1]}`
      : '';
  return `${regionId}|${settings.variable}|${settings.season}|${settings.period}${range}`;
}

export function createSlot(input: {
  id: string;
  regionId: string;
  doc: SeriesDoc;
  enso: EnsoDoc | null;
  settings: SlotSettings;
  overridden?: boolean;
}): ComparisonSlot {
  const { id, regionId, doc, enso, settings, overridden = false } = input;
  return {
    id,
    key: slotKey(regionId, settings),
    regionId,
    doc,
    enso,
    overridden,
    variable: settings.variable,
    season: settings.season,
    period: settings.period,
  };
}

export function addSlot(state: ComparisonState, slot: ComparisonSlot): AddResult {
  if (state.slots.some((candidate) => candidate.key === slot.key)) {
    return { ok: false, reason: 'duplicate' };
  }
  if (state.slots.length >= MAX_SLOTS) {
    return { ok: false, reason: 'full' };
  }
  return {
    ok: true,
    slot,
    state: { ...state, slots: [...state.slots, slot], activeId: slot.id },
  };
}

export function removeSlot(state: ComparisonState, id: string): ComparisonState {
  const slots = state.slots.filter((slot) => slot.id !== id);
  return {
    ...state,
    slots,
    activeId:
      state.activeId === id ? (slots.length > 0 ? slots[slots.length - 1].id : null) : state.activeId,
  };
}

/**
 * Applies shared settings to every slot that has not been individually set.
 *
 * A slot that would collide with another slot's identity keeps its own settings and
 * becomes an override instead: two rows in one comparison must never share an
 * identity, because the identity is what the user is comparing.
 */
export function applyShared(state: ComparisonState, patch: Partial<SlotSettings>): ComparisonState {
  const shared = { ...state.shared, ...patch };
  const taken = new Set(state.slots.filter((slot) => slot.overridden).map((slot) => slot.key));
  const slots = state.slots.map((slot) => {
    if (slot.overridden) return slot;
    const next: ComparisonSlot = {
      ...slot,
      variable: shared.variable,
      season: shared.season,
      period: shared.period,
    };
    const key = slotKey(slot.regionId, next);
    if (taken.has(key)) return { ...slot, overridden: true };
    taken.add(key);
    return { ...next, key };
  });
  return { ...state, shared, slots };
}

/**
 * Sets one slot's settings and marks it as an override.
 * Refuses (returns the state unchanged) when the result would duplicate another
 * slot's identity, so a comparison can never hold the same selection twice.
 */
export function overrideSlot(
  state: ComparisonState,
  id: string,
  patch: Partial<SlotSettings>,
): ComparisonState {
  const target = state.slots.find((slot) => slot.id === id);
  if (!target) return state;
  const next: ComparisonSlot = { ...target, ...patch, overridden: true };
  const key = slotKey(target.regionId, next);
  if (state.slots.some((slot) => slot.id !== id && slot.key === key)) return state;
  return {
    ...state,
    slots: state.slots.map((slot) => (slot.id === id ? { ...next, key } : slot)),
  };
}

export function hasOverrides(state: ComparisonState): boolean {
  return state.slots.some((slot) => slot.overridden);
}

export type ComparisonLayout = 'empty' | 'single' | 'pair' | 'triple' | 'quad' | 'five';

export function layoutFor(count: number): ComparisonLayout {
  if (count <= 0) return 'empty';
  if (count === 1) return 'single';
  if (count === 2) return 'pair';
  if (count === 3) return 'triple';
  if (count === 4) return 'quad';
  return 'five';
}

/**
 * Panel share of viewport width: one result keeps the globe at 30% so it stays a
 * live locator; two or more take the full width.
 */
export function panelPercent(count: number): number {
  return count === 1 ? 70 : 100;
}

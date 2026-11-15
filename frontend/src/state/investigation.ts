/**
 * Investigation state: the whole UI state behind one reducer.
 *
 * Every mutation the app performs goes through `investigationReducer`, so the
 * rules that used to live in scattered handlers are enforced in one place: at
 * most five results, one identity per result, shared settings that never
 * overwrite an override, pins that outlive the panel they came from, a
 * time-lapse year that always exists in the index, and limit messages that are
 * errors rather than save confirmations.
 *
 * The reducer is pure: no `window`, no `localStorage`, no clock. Anything that
 * needs I/O (loading a series, reading the saved library, asking for a
 * time-lapse index) happens in the component and arrives here as data.
 */

import {
  MAX_SLOTS,
  addSlot,
  applyShared,
  createSlot,
  overrideSlot,
  panelPercent,
  removeSlot,
  type ComparisonSlot,
  type ComparisonState,
  type SlotSettings,
} from '../data/comparison';
import { PERIOD_OPTIONS, periodWindow, type PeriodKey } from '../data/exports';
import type { EnsoDoc } from '../data/enso';
import type { SavedInvestigation } from '../data/library';
import type { InspectItem } from '../components/Inspector';
import type { SeriesDoc, TimelapseIndex } from '../types';
import type { CSSProperties } from 'react';

/** Explore, compare, or the saved-investigation library. */
export type AppMode = 'explore' | 'compare' | 'library';

/** Pinned references: ids in display order plus the snapshot each one captured. */
export interface PinState {
  ids: string[];
  snapshots: Record<string, InspectItem>;
}

/** The "add a region" banner: open or closed, plus its type-ahead text. */
export interface AddModeState {
  active: boolean;
  query: string;
}

/** One open time-lapse player. */
export interface TimelapseState {
  variable: string;
  season: string;
  year: number;
  playing: boolean;
  index: TimelapseIndex;
}

/** Loading, the error about data or limits, and the save confirmation. */
export interface StatusState {
  loading: boolean;
  error: string | null;
  banner: string | null;
}

export interface InvestigationState {
  mode: AppMode;
  comparison: ComparisonState;
  exploreDoc: SeriesDoc | null;
  exploreEnso: EnsoDoc | null;
  /** Period window shown for the single explore result (the drawer's period control). */
  explorePeriod: PeriodKey;
  pins: PinState;
  addMode: AddModeState;
  timelapse: TimelapseState | null;
  status: StatusState;
  saved: SavedInvestigation[];
  /**
   * Source of slot ids. Ids are never reused, so a pin snapshot can never
   * become the snapshot of a different result after a slot is removed.
   */
  nextSlotId: number;
}

/** A slot's settings as the drawer sends them: `period` arrives as a string. */
export interface SlotPatch {
  variable?: string;
  season?: string;
  period?: string;
}

/** One result to build a comparison from, already loaded. */
export interface ComparisonEntry {
  doc: SeriesDoc;
  enso: EnsoDoc | null;
  /** Absent entries take the shared settings. */
  settings?: SlotSettings;
}

export type InvestigationAction =
  | { type: 'navigate'; mode: AppMode }
  | { type: 'loadExplore'; doc: SeriesDoc; enso: EnsoDoc | null }
  | { type: 'setExplorePeriod'; period: PeriodKey }
  | { type: 'clearExplore' }
  | { type: 'addSlot'; doc: SeriesDoc; enso: EnsoDoc | null; settings?: SlotSettings }
  | { type: 'startComparison'; entries: ComparisonEntry[] }
  | { type: 'restoreComparison'; entries: ComparisonEntry[]; missing?: string[] }
  | { type: 'removeSlot'; id: string }
  | { type: 'overrideSlot'; id: string; patch: SlotPatch }
  | { type: 'clearOverride'; id: string }
  | { type: 'applySharedSettings'; patch: Partial<SlotSettings> }
  | { type: 'resetComparison' }
  | { type: 'togglePin'; id: string; item?: InspectItem }
  | { type: 'openAddMode' }
  | { type: 'closeAddMode' }
  | { type: 'setAddQuery'; query: string }
  | { type: 'openTimelapse'; variable: string; season: string; index: TimelapseIndex | null }
  | { type: 'closeTimelapse' }
  | { type: 'setTimelapseYear'; year: number }
  | { type: 'togglePlay' }
  | { type: 'advanceTimelapse' }
  | { type: 'setLoading'; loading: boolean }
  | { type: 'setError'; message: string | null }
  | { type: 'setBanner'; message: string | null }
  | { type: 'setSaved'; saved: SavedInvestigation[] };

/** At most three results can be pinned at once. */
export const MAX_PINS = 3;

export const LIMIT_MESSAGES = {
  slotsFull: `A comparison holds at most ${MAX_SLOTS} results. Remove one to add another.`,
  duplicate: 'That region, season and period is already in this comparison.',
  pinsFull: 'A comparison can pin at most three results.',
  timelapseMissing: 'No time-lapse frames exist for that variable and season.',
} as const;

const SLOT_COLORS = ['#4c9aff', '#f6a945', '#57c98b', '#c084fc', '#f472b6'];

export const DEFAULT_SETTINGS: SlotSettings = {
  variable: 'precipitation',
  season: 'DJF',
  period: 'full',
};

export function createInitialState(): InvestigationState {
  return {
    mode: 'explore',
    comparison: { slots: [], activeId: null, shared: DEFAULT_SETTINGS },
    exploreDoc: null,
    exploreEnso: null,
    explorePeriod: 'full',
    pins: { ids: [], snapshots: {} },
    addMode: { active: false, query: '' },
    timelapse: null,
    status: { loading: false, error: null, banner: null },
    saved: [],
    nextSlotId: 1,
  };
}

/** Narrows the drawer's loose patch to real settings; an unknown period is dropped. */
function toSlotSettings(patch: SlotPatch): Partial<SlotSettings> {
  const next: Partial<SlotSettings> = {};
  if (patch.variable) next.variable = patch.variable;
  if (patch.season) next.season = patch.season;
  const period = PERIOD_OPTIONS.find((option) => option.key === patch.period)?.key;
  if (period) next.period = period;
  return next;
}

/** One slot from one loaded result, under the id `nextSlotId` would allocate. */
function entrySlot(
  nextSlotId: number,
  entry: ComparisonEntry,
  settings: SlotSettings,
): ComparisonSlot {
  return createSlot({
    id: `slot_${nextSlotId}`,
    regionId: entry.doc.region.id,
    doc: entry.doc,
    enso: entry.enso,
    settings: entry.settings ?? settings,
  });
}

function dropPin(pins: PinState, id: string): PinState {
  if (!pins.ids.includes(id)) return pins;
  const snapshots = { ...pins.snapshots };
  delete snapshots[id];
  return { ids: pins.ids.filter((entry) => entry !== id), snapshots };
}

export function investigationReducer(
  state: InvestigationState,
  action: InvestigationAction,
): InvestigationState {
  switch (action.type) {
    case 'navigate':
      // Navigating closes the add banner and the save confirmation; it never
      // touches the comparison or the pins.
      return {
        ...state,
        mode: action.mode,
        status: { ...state.status, banner: null },
      };

    case 'loadExplore':
      return { ...state, exploreDoc: action.doc, exploreEnso: action.enso };

    case 'setExplorePeriod':
      return { ...state, explorePeriod: action.period };

    case 'clearExplore':
      return { ...state, exploreDoc: null, exploreEnso: null };

    case 'addSlot': {
      const settings = action.settings ?? state.comparison.shared;
      const result = addSlot(
        state.comparison,
        entrySlot(state.nextSlotId, action, settings),
      );
      const nextSlotId = state.nextSlotId + 1;
      if (!result.ok) {
        return {
          ...state,
          nextSlotId,
          addMode: { active: false, query: '' },
          status: {
            ...state.status,
            error:
              result.reason === 'full'
                ? LIMIT_MESSAGES.slotsFull
                : LIMIT_MESSAGES.duplicate,
          },
        };
      }
      return {
        ...state,
        nextSlotId,
        comparison: result.state,
        mode: 'compare',
        addMode: { active: false, query: '' },
        status: { ...state.status, error: null },
      };
    }

    case 'startComparison': {
      if (action.entries.length === 0) return state;
      const settings = state.comparison.shared;
      let comparison: ComparisonState = { slots: [], activeId: null, shared: settings };
      let nextSlotId = state.nextSlotId;
      for (const entry of action.entries) {
        const result = addSlot(comparison, entrySlot(nextSlotId, entry, settings));
        nextSlotId += 1;
        // A starter that cannot be built changes nothing: the previous
        // comparison stays on screen.
        if (!result.ok) return { ...state, nextSlotId };
        comparison = result.state;
      }
      return {
        ...state,
        nextSlotId,
        comparison,
        mode: 'compare',
        addMode: { active: false, query: '' },
      };
    }

    case 'restoreComparison': {
      const settings = state.comparison.shared;
      let comparison: ComparisonState = { slots: [], activeId: null, shared: settings };
      let nextSlotId = state.nextSlotId;
      const missing = [...(action.missing ?? [])];
      for (const entry of action.entries) {
        const result = addSlot(comparison, entrySlot(nextSlotId, entry, settings));
        nextSlotId += 1;
        if (result.ok) comparison = result.state;
        else missing.push(entry.doc.region.label);
      }
      return {
        ...state,
        nextSlotId,
        comparison,
        mode: 'compare',
        status: {
          ...state.status,
          error:
            missing.length > 0
              ? `Reopened without: ${missing.join(', ')}. The data may have changed.`
              : state.status.error,
        },
      };
    }

    case 'removeSlot':
      return {
        ...state,
        comparison: removeSlot(state.comparison, action.id),
        pins: dropPin(state.pins, action.id),
      };

    case 'overrideSlot': {
      const comparison = overrideSlot(
        state.comparison,
        action.id,
        toSlotSettings(action.patch),
      );
      // `overrideSlot` returns the same object when the change would duplicate
      // another result's identity.
      return comparison === state.comparison ? state : { ...state, comparison };
    }

    case 'clearOverride': {
      const target = state.comparison.slots.find((slot) => slot.id === action.id);
      if (!target) return state;
      const comparison = overrideSlot(state.comparison, action.id, state.comparison.shared);
      if (comparison === state.comparison) return state;
      return {
        ...state,
        comparison: {
          ...comparison,
          slots: comparison.slots.map((slot) =>
            slot.id === action.id ? { ...slot, overridden: false } : slot,
          ),
        },
      };
    }

    case 'applySharedSettings':
      return { ...state, comparison: applyShared(state.comparison, action.patch) };

    case 'resetComparison':
      // Closing the comparison clears its results but keeps the pins: a pin is
      // a snapshot of a result the user wanted to keep looking at.
      return {
        ...state,
        comparison: { ...state.comparison, slots: [], activeId: null },
        addMode: { active: false, query: '' },
      };

    case 'togglePin': {
      const { pins } = state;
      if (pins.ids.includes(action.id)) {
        return { ...state, pins: dropPin(pins, action.id) };
      }
      if (pins.ids.length >= MAX_PINS) {
        return {
          ...state,
          status: { ...state.status, error: LIMIT_MESSAGES.pinsFull },
        };
      }
      return {
        ...state,
        pins: {
          ids: [...pins.ids, action.id],
          snapshots: action.item
            ? { ...pins.snapshots, [action.id]: action.item }
            : pins.snapshots,
        },
      };
    }

    case 'openAddMode':
      return { ...state, addMode: { active: true, query: '' } };

    case 'closeAddMode':
      return { ...state, addMode: { active: false, query: '' } };

    case 'setAddQuery':
      return { ...state, addMode: { ...state.addMode, query: action.query } };

    case 'openTimelapse': {
      if (!action.index || action.index.years.length === 0) {
        // No index: the player stays closed rather than half-open.
        return {
          ...state,
          timelapse: null,
          status: { ...state.status, error: LIMIT_MESSAGES.timelapseMissing },
        };
      }
      const { index } = action;
      const window = periodWindow(state.comparison.shared.period, index.years);
      const inWindow = window
        ? index.years.filter((year) => year >= window.start && year <= window.end)
        : index.years;
      const years = inWindow.length > 0 ? inWindow : index.years;
      return {
        ...state,
        timelapse: {
          variable: action.variable,
          season: action.season,
          year: years[years.length - 1],
          playing: false,
          index,
        },
        status: { ...state.status, error: null },
      };
    }

    case 'closeTimelapse':
      return state.timelapse ? { ...state, timelapse: null } : state;

    case 'setTimelapseYear': {
      const current = state.timelapse;
      if (!current || current.index.years.length === 0) return state;
      const { years } = current.index;
      const year = years.reduce((best, candidate) =>
        Math.abs(candidate - action.year) < Math.abs(best - action.year) ? candidate : best,
      );
      // Scrubbing takes the player off auto-play, as the slider always did.
      return { ...state, timelapse: { ...current, year, playing: false } };
    }

    case 'togglePlay': {
      const current = state.timelapse;
      if (!current) return state;
      return { ...state, timelapse: { ...current, playing: !current.playing } };
    }

    case 'advanceTimelapse': {
      const current = state.timelapse;
      if (!current || !current.playing) return state;
      const { years } = current.index;
      if (years.length < 2) return state;
      const position = years.indexOf(current.year);
      return {
        ...state,
        timelapse: { ...current, year: years[(position + 1) % years.length] },
      };
    }

    case 'setLoading':
      return { ...state, status: { ...state.status, loading: action.loading } };

    case 'setError':
      return { ...state, status: { ...state.status, error: action.message } };

    case 'setBanner':
      return { ...state, status: { ...state.status, banner: action.message } };

    case 'setSaved':
      return { ...state, saved: action.saved };

    default:
      return state;
  }
}

/**
 * The results the drawer is showing right now, in display order.
 *
 * Compare mode maps the comparison's slots; explore mode is the single
 * inspected result. Slot colour and letter are positional, so they follow the
 * order the slots are shown in rather than the order they were added.
 */
export function inspectorItems(state: InvestigationState): InspectItem[] {
  if (state.mode === 'compare') {
    return state.comparison.slots.map((slot, index) => ({
      id: slot.id,
      regionId: slot.regionId,
      period: slot.period,
      overridden: slot.overridden,
      doc: slot.doc,
      enso: slot.enso,
      color: SLOT_COLORS[index % SLOT_COLORS.length],
      slot: String.fromCharCode(65 + index),
    }));
  }
  const { exploreDoc } = state;
  if (exploreDoc) {
    return [
      {
        id: `explore_${exploreDoc.region.id}`,
        regionId: exploreDoc.region.id,
        period: state.explorePeriod,
        overridden: false,
        doc: exploreDoc,
        enso: state.exploreEnso,
        color: SLOT_COLORS[0],
        slot: 'A',
      },
    ];
  }
  return [];
}

/**
 * Pinned references, in the order they were pinned.
 *
 * A pin keeps the snapshot taken when it was pinned, so changing the selection,
 * adding a result or closing the drawer cannot make it vanish. The live item
 * wins while the result is still on screen, so an override shows through.
 */
export function pinnedItems(state: InvestigationState): InspectItem[] {
  const items = inspectorItems(state);
  const resolved = state.pins.ids.map(
    (id) => items.find((item) => item.id === id) ?? state.pins.snapshots[id],
  );
  return resolved.filter((item): item is InspectItem => Boolean(item));
}

/** Drawer width in pixels; zero when no panel is showing. */
export function drawerWidth(state: InvestigationState, viewportWidth: number): number {
  // The library covers the stage, so no panel is laid out behind it.
  if (inspectorItems(state).length === 0 || state.mode === 'library') return 0;
  return Math.round((viewportWidth * panelPercent(inspectorItems(state).length)) / 100);
}

/** The `--panel-width` custom property the drawer and the globe both read. */
export function panelStyle(
  state: InvestigationState,
  _viewportWidth: number,
): CSSProperties {
  const percent =
    inspectorItems(state).length > 0 && state.mode !== 'library'
      ? panelPercent(inspectorItems(state).length)
      : 0;
  return { '--panel-width': `${percent}%` } as CSSProperties;
}
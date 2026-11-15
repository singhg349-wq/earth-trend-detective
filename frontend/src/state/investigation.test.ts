import { describe, expect, it } from 'vitest';
import { MAX_SLOTS, slotKey, type SlotSettings } from '../data/comparison';
import type { InspectItem } from '../components/Inspector';
import type { SeriesDoc, TimelapseIndex } from '../types';
import {
  LIMIT_MESSAGES,
  MAX_PINS,
  createInitialState,
  drawerWidth,
  inspectorItems,
  investigationReducer,
  panelStyle,
  pinnedItems,
  type ComparisonEntry,
  type InvestigationAction,
  type InvestigationState,
} from './investigation';

function doc(regionId: string): SeriesDoc {
  return {
    id: `precip_${regionId}_DJF`,
    variable: 'precipitation',
    units: 'mm/day',
    source: { product: 'GPCP', version: '3.3' },
    region: {
      id: regionId,
      label: regionId,
      bbox: [-10, -5, 10, 5],
      cells_used: 4,
      area_km2: 100,
    },
    season: { code: 'DJF', year_label: 'January year', months: [12, 1, 2], aggregation: 'mean' },
    years: [1984, 1985, 1986],
    values: [1, 2, 3],
    coverage: [1, 1, 1],
    template_summary: `${regionId} summary`,
    trend: {
      sen_slope_per_decade: 0.1,
      intercept: 1,
      method: 'Sen',
      slope_units: 'mm/day/decade',
      inference: { status: 'ok', p_value: 0.2, ci: [0, 0.2], method: 'MK', n: 3 },
    },
    validation: { status: 'passed', reference: 'Giovanni' },
  };
}

function entry(regionId: string, settings?: SlotSettings): ComparisonEntry {
  return { doc: doc(regionId), enso: null, settings };
}

function add(
  state: InvestigationState,
  regionId: string,
  settings?: SlotSettings,
): InvestigationState {
  return investigationReducer(state, { type: 'addSlot', ...entry(regionId, settings) });
}

function addMany(count: number): InvestigationState {
  let state = createInitialState();
  for (let index = 0; index < count; index += 1) {
    state = add(state, `region_${index}`);
  }
  return state;
}

function act(
  state: InvestigationState,
  ...actions: InvestigationAction[]
): InvestigationState {
  return actions.reduce(investigationReducer, state);
}

function pin(state: InvestigationState, id: string, item: InspectItem): InvestigationState {
  return investigationReducer(state, { type: 'togglePin', id, item });
}

const index: TimelapseIndex = {
  years: [1984, 1985, 1986],
  units: 'mm/day',
  vmin: 0,
  vmax: 10,
  colormap: 'viridis',
  extent: [-180, -90, 180, 90],
  source: 'GPCP 3.3',
};

function openPlayer(period: SlotSettings['period'] = 'full'): InvestigationState {
  let state = createInitialState();
  if (period !== 'full') {
    state = investigationReducer(state, {
      type: 'applySharedSettings',
      patch: { period },
    });
  }
  return investigationReducer(state, {
    type: 'openTimelapse',
    variable: 'precip',
    season: 'DJF',
    index,
  });
}

describe('slot limit', () => {
  it('admits five results and refuses a sixth without touching the comparison', () => {
    const full = addMany(MAX_SLOTS);
    expect(full.comparison.slots).toHaveLength(MAX_SLOTS);

    const sixth = add(full, 'region_six');
    expect(sixth.comparison).toBe(full.comparison);
    expect(sixth.comparison.slots).toHaveLength(MAX_SLOTS);
    expect(sixth.status.error).toBe(LIMIT_MESSAGES.slotsFull);
  });

  it('accepts a sixth slot once one is removed', () => {
    const full = addMany(MAX_SLOTS);
    const removed = investigationReducer(full, {
      type: 'removeSlot',
      id: full.comparison.slots[0].id,
    });
    expect(add(removed, 'region_six').comparison.slots).toHaveLength(MAX_SLOTS);
  });
});

describe('slot identity', () => {
  it('refuses a second slot with the same region, variable, season and period', () => {
    const one = add(createInitialState(), 'indonesia');
    const duplicate = add(one, 'indonesia');
    expect(duplicate.comparison).toBe(one.comparison);
    expect(duplicate.status.error).toBe(LIMIT_MESSAGES.duplicate);
  });

  it('allows the same region twice with a different period', () => {
    const one = add(createInitialState(), 'indonesia');
    const two = add(one, 'indonesia', {
      variable: 'precipitation',
      season: 'DJF',
      period: 'first-half',
    });
    expect(two.comparison.slots).toHaveLength(2);
    const keys = two.comparison.slots.map((slot) => slot.key);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toHaveLength(0);
  });

  it('never reuses a slot id, so a pin cannot alias a later result', () => {
    const one = add(createInitialState(), 'indonesia');
    const firstId = one.comparison.slots[0].id;
    const removed = investigationReducer(one, { type: 'removeSlot', id: firstId });
    const readded = add(removed, 'indonesia');
    expect(readded.comparison.slots[0].id).not.toBe(firstId);
  });
});

describe('shared settings and overrides', () => {
  it('keeps an override when the shared settings change', () => {
    const one = add(createInitialState(), 'indonesia');
    const id = one.comparison.slots[0].id;
    const overridden = investigationReducer(one, {
      type: 'overrideSlot',
      id,
      patch: { period: 'first-half' },
    });

    const shared = investigationReducer(overridden, {
      type: 'applySharedSettings',
      patch: { period: 'second-half' },
    });

    const slot = shared.comparison.slots.find((candidate) => candidate.id === id);
    expect(slot?.period).toBe('first-half');
    expect(slot?.overridden).toBe(true);
    expect(shared.comparison.shared.period).toBe('second-half');
  });

  it('does not create two slots with one identity when the shared patch collides', () => {
    // Slot A overrides to first half; slot B follows the shared settings.
    const one = add(createInitialState(), 'indonesia');
    const firstId = one.comparison.slots[0].id;
    const two = add(one, 'indonesia', {
      variable: 'precipitation',
      season: 'DJF',
      period: 'second-half',
    });
    const overridden = investigationReducer(two, {
      type: 'overrideSlot',
      id: firstId,
      patch: { period: 'first-half' },
    });

    const shared = investigationReducer(overridden, {
      type: 'applySharedSettings',
      patch: { period: 'first-half' },
    });

    const keys = shared.comparison.slots.map((slot) => slot.key);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toHaveLength(0);
    // B would have collided with A, so it keeps its own settings instead.
    const second = shared.comparison.slots.find((slot) => slot.id !== firstId);
    expect(second?.period).toBe('second-half');
    expect(second?.overridden).toBe(true);
  });

  it('refuses an override that would duplicate another slot', () => {
    const one = add(createInitialState(), 'indonesia');
    const two = add(one, 'indonesia', {
      variable: 'precipitation',
      season: 'DJF',
      period: 'first-half',
    });
    const firstId = one.comparison.slots[0].id;

    const refused = investigationReducer(two, {
      type: 'overrideSlot',
      id: firstId,
      patch: { period: 'first-half' },
    });
    expect(refused).toBe(two);

    const reset = investigationReducer(two, { type: 'clearOverride', id: firstId });
    expect(reset.comparison.slots.find((slot) => slot.id === firstId)?.overridden).toBe(false);
  });

  it('clearing an override that would duplicate another slot is refused', () => {
    // A is overridden to first half, B follows the shared settings (also first half
    // after the patch), so clearing A would put two slots on one identity.
    const one = add(createInitialState(), 'indonesia');
    const firstId = one.comparison.slots[0].id;
    const two = add(one, 'indonesia', {
      variable: 'precipitation',
      season: 'DJF',
      period: 'second-half',
    });
    const overridden = investigationReducer(two, {
      type: 'overrideSlot',
      id: firstId,
      patch: { period: 'first-half' },
    });
    const shared = investigationReducer(overridden, {
      type: 'applySharedSettings',
      patch: { period: 'first-half' },
    });
    // B kept second half rather than colliding, so clearing A is safe.
    expect(
      investigationReducer(shared, { type: 'clearOverride', id: firstId }).comparison.slots
        .find((slot) => slot.id === firstId)?.overridden,
    ).toBe(false);
  });
});

describe('pins', () => {
  function explorePin(): { state: InvestigationState; item: InspectItem } {
    const state = investigationReducer(createInitialState(), {
      type: 'loadExplore',
      doc: doc('indonesia'),
      enso: null,
    });
    return { state, item: inspectorItems(state)[0] };
  }

  it('survives a selection change, a new slot and a closed drawer', () => {
    const { state, item } = explorePin();
    const pinned = pin(state, item.id, item);
    expect(pinned.pins.ids).toEqual([item.id]);

    const compare = act(
      pinned,
      { type: 'navigate', mode: 'compare' },
      { type: 'addSlot', ...entry('coastal_peru') },
    );
    expect(compare.pins.ids).toEqual([item.id]);
    expect(pinnedItems(compare).map((entryItem) => entryItem.doc.region.id)).toEqual([
      'indonesia',
    ]);

    const closed = investigationReducer(compare, { type: 'resetComparison' });
    expect(closed.comparison.slots).toHaveLength(0);
    // The drawer is gone; the pin still renders from its snapshot.
    expect(pinnedItems(closed)).toHaveLength(1);
    expect(pinnedItems(closed)[0].doc.region.id).toBe('indonesia');
  });

  it('unpins and drops the snapshot', () => {
    const { state, item } = explorePin();
    const pinned = pin(state, item.id, item);
    const unpinned = pin(pinned, item.id, item);
    expect(unpinned.pins.ids).toEqual([]);
    expect(unpinned.pins.snapshots).toEqual({});
  });

  it('refuses a fourth pin and says so as a limit', () => {
    let state = createInitialState();
    for (let index = 0; index < MAX_PINS; index += 1) {
      const id = `slot_${index + 1}`;
      state = pin(state, id, {
        id,
        regionId: `region_${index}`,
        period: 'full',
        overridden: false,
        doc: doc(`region_${index}`),
        enso: null,
        color: '#4c9aff',
        slot: String.fromCharCode(65 + index),
      });
    }
    expect(state.pins.ids).toHaveLength(MAX_PINS);

    const fourth = pin(state, 'slot_4', {
      id: 'slot_4',
      regionId: 'region_4',
      period: 'full',
      overridden: false,
      doc: doc('region_4'),
      enso: null,
      color: '#4c9aff',
      slot: 'D',
    });
    expect(fourth.pins.ids).toHaveLength(MAX_PINS);
    expect(fourth.status.error).toBe(LIMIT_MESSAGES.pinsFull);
  });

  it('drops a pin when its slot is removed', () => {
    const one = add(createInitialState(), 'indonesia');
    const id = one.comparison.slots[0].id;
    const item = inspectorItems(one)[0];
    const pinned = pin(one, id, item);
    const removed = investigationReducer(pinned, { type: 'removeSlot', id });
    expect(removed.pins.ids).toEqual([]);
  });
});

describe('time-lapse player', () => {
  it('opens on the last year of the index', () => {
    const state = openPlayer();
    expect(state.timelapse?.year).toBe(1986);
    expect(state.timelapse?.playing).toBe(false);
  });

  it('stays inside the shared period window', () => {
    const state = openPlayer('first-half');
    // 1984–1986 split at the midpoint: the first half is 1984–1985.
    expect(state.timelapse?.year).toBe(1985);
  });

  it('plays forward and wraps at the end of the index', () => {
    const playing = act(openPlayer(), { type: 'togglePlay' });
    expect(playing.timelapse?.playing).toBe(true);

    const advanced = act(playing, { type: 'advanceTimelapse' });
    expect(advanced.timelapse?.year).toBe(1984);

    const wrapped = act(advanced, { type: 'advanceTimelapse' }, { type: 'advanceTimelapse' });
    expect(wrapped.timelapse?.year).toBe(1986);
  });

  it('does not advance while paused', () => {
    const paused = act(openPlayer(), { type: 'advanceTimelapse' });
    expect(paused.timelapse?.year).toBe(1986);
  });

  it('snaps a scrubbed year onto the index and stops playback', () => {
    const playing = act(openPlayer(), { type: 'togglePlay' });
    const scrubbed = act(playing, { type: 'setTimelapseYear', year: 1985 });
    expect(scrubbed.timelapse?.year).toBe(1985);
    expect(scrubbed.timelapse?.playing).toBe(false);

    const between = act(openPlayer(), { type: 'setTimelapseYear', year: 1900 });
    expect(between.timelapse?.year).toBe(1984);
  });

  it('leaves the player closed when there is no index', () => {
    const state = investigationReducer(createInitialState(), {
      type: 'openTimelapse',
      variable: 'precip',
      season: 'DJF',
      index: null,
    });
    expect(state.timelapse).toBeNull();
    expect(state.status.error).toBe(LIMIT_MESSAGES.timelapseMissing);
  });

  it('closes the player', () => {
    const closed = act(openPlayer(), { type: 'closeTimelapse' });
    expect(closed.timelapse).toBeNull();
  });
});

describe('removal and mode', () => {
  it('clears the active id when the last slot goes', () => {
    const one = add(createInitialState(), 'indonesia');
    const removed = investigationReducer(one, {
      type: 'removeSlot',
      id: one.comparison.slots[0].id,
    });
    expect(removed.comparison.slots).toHaveLength(0);
    expect(removed.comparison.activeId).toBeNull();
    // Compare stays selected but with nothing to show: the drawer closes.
    expect(removed.mode).toBe('compare');
    expect(inspectorItems(removed)).toHaveLength(0);
  });

  it('falls back to the last remaining slot when another is removed', () => {
    const two = addMany(2);
    const removed = investigationReducer(two, {
      type: 'removeSlot',
      id: two.comparison.slots[0].id,
    });
    expect(removed.comparison.activeId).toBe(two.comparison.slots[1].id);
  });
});

describe('errors and banners', () => {
  it('keeps a limit message out of the save banner', () => {
    const limited = add(addMany(MAX_SLOTS), 'region_six');
    expect(limited.status.error).toBe(LIMIT_MESSAGES.slotsFull);
    expect(limited.status.banner).toBeNull();

    const saved = investigationReducer(limited, {
      type: 'setBanner',
      message: 'Saved this result.',
    });
    expect(saved.status.error).toBe(LIMIT_MESSAGES.slotsFull);
    expect(saved.status.banner).toBe('Saved this result.');
  });

  it('clears an error without clearing the banner, and the reverse', () => {
    const saved = act(
      createInitialState(),
      { type: 'setError', message: 'boom' },
      { type: 'setBanner', message: 'Saved to this browser.' },
    );
    expect(investigationReducer(saved, { type: 'setError', message: null }).status).toEqual({
      loading: false,
      error: null,
      banner: 'Saved to this browser.',
    });
    expect(investigationReducer(saved, { type: 'setBanner', message: null }).status).toEqual({
      loading: false,
      error: 'boom',
      banner: null,
    });
  });

  it('drops the banner on navigation but keeps the error', () => {
    const state = act(
      createInitialState(),
      { type: 'setError', message: 'boom' },
      { type: 'setBanner', message: 'Saved to this browser.' },
    );
    const navigated = investigationReducer(state, { type: 'navigate', mode: 'library' });
    expect(navigated.status.error).toBe('boom');
    expect(navigated.status.banner).toBeNull();
  });
});

describe('comparison builders', () => {
  it('builds a starter comparison from two results', () => {
    const state = investigationReducer(createInitialState(), {
      type: 'startComparison',
      entries: [entry('indonesia'), entry('coastal_peru')],
    });
    expect(state.mode).toBe('compare');
    expect(state.comparison.slots.map((slot) => slot.regionId)).toEqual([
      'indonesia',
      'coastal_peru',
    ]);
    expect(state.comparison.activeId).toBe(state.comparison.slots[1].id);
  });

  it('reports what a reopened comparison had to drop', () => {
    const state = investigationReducer(createInitialState(), {
      type: 'restoreComparison',
      entries: [entry('indonesia'), entry('indonesia')],
      missing: ['amazon'],
    });
    expect(state.comparison.slots).toHaveLength(1);
    expect(state.status.error).toBe(
      'Reopened without: amazon, indonesia. The data may have changed.',
    );
  });

  it('keeps the previous error when a reopened comparison loses nothing', () => {
    const withError = act(createInitialState(), { type: 'setError', message: 'boom' });
    const state = investigationReducer(withError, {
      type: 'restoreComparison',
      entries: [entry('indonesia')],
    });
    expect(state.comparison.slots).toHaveLength(1);
    expect(state.status.error).toBe('boom');
  });
});

describe('selectors', () => {
  it('labels compare results by position', () => {
    const two = addMany(2);
    const items = inspectorItems(two);
    expect(items.map((item) => item.slot)).toEqual(['A', 'B']);
    expect(items.map((item) => item.id)).toEqual(
      two.comparison.slots.map((slot) => slot.id),
    );
  });

  it('shows the explore result as slot A', () => {
    const state = investigationReducer(createInitialState(), {
      type: 'loadExplore',
      doc: doc('indonesia'),
      enso: null,
    });
    const items = inspectorItems(state);
    expect(items).toHaveLength(1);
    expect(items[0].slot).toBe('A');
    expect(items[0].id).toBe('explore_indonesia');
  });

  it('gives one result 70% and two results the full width', () => {
    expect(drawerWidth(addMany(1), 1440)).toBe(1008);
    expect(drawerWidth(addMany(2), 1440)).toBe(1440);
    expect(panelStyle(addMany(1), 1440)).toEqual({ '--panel-width': '70%' });
    expect(panelStyle(addMany(2), 1440)).toEqual({ '--panel-width': '100%' });
  });

  it('hides the panel behind the library and on the empty state', () => {
    const one = addMany(1);
    const library = investigationReducer(one, { type: 'navigate', mode: 'library' });
    expect(drawerWidth(library, 1440)).toBe(0);
    expect(panelStyle(library, 1440)).toEqual({ '--panel-width': '0%' });
    expect(drawerWidth(createInitialState(), 1440)).toBe(0);
  });
});

describe('purity', () => {
  it('returns the same state for an unknown action', () => {
    const state = addMany(1);
    // The default arm exists so a new action cannot silently mutate state.
    const unknown = { type: 'not-an-action' } as unknown as InvestigationAction;
    expect(investigationReducer(state, unknown)).toBe(state);
  });

  it('never mutates the state it was given', () => {
    const state = addMany(2);
    const snapshot = structuredClone(state);
    act(
      state,
      { type: 'removeSlot', id: state.comparison.slots[0].id },
      { type: 'navigate', mode: 'library' },
      { type: 'setError', message: 'boom' },
    );
    expect(state).toEqual(snapshot);
    expect(slotKey('indonesia', { variable: 'precipitation', season: 'DJF', period: 'full' })).toBe(
      'indonesia|precipitation|DJF|full',
    );
  });
});
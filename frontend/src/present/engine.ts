/** Pure step engine for Present mode. */

export interface PresentState {
  /** Zero-based current step. */
  index: number;
  active: boolean;
}

export type PresentAction = 'next' | 'back' | 'home' | 'exit';

export function initialPresentState(active = true): PresentState {
  return { index: 0, active };
}

export function presentReducer(state: PresentState, action: PresentAction, count: number): PresentState {
  if (!state.active) return state;
  const last = Math.max(0, count - 1);
  switch (action) {
    case 'next':
      return state.index >= last ? state : { ...state, index: state.index + 1 };
    case 'back':
      return state.index <= 0 ? state : { ...state, index: state.index - 1 };
    case 'home':
      return state.index === 0 ? state : { ...state, index: 0 };
    case 'exit':
      return { ...state, active: false };
  }
}

/** Map a KeyboardEvent.key to an action, or null when the key is not ours. */
export function keyToAction(key: string): PresentAction | null {
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
    case 'Spacebar':
      return 'next';
    case 'ArrowLeft':
    case 'PageUp':
      return 'back';
    case 'Home':
      return 'home';
    case 'Escape':
      return 'exit';
    default:
      return null;
  }
}

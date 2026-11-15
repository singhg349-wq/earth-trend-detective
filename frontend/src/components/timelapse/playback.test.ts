import { expect, it } from 'vitest';
import { frameAtElapsed } from './PlaybackBar';
it('maps elapsed time to speed, looping and end stop', () => {
  expect(frameAtElapsed(650, 10, 1, true)).toBe(1);
  expect(frameAtElapsed(650, 10, 2, true)).toBe(2);
  expect(frameAtElapsed(650, 10, 0.5, true)).toBe(0);
  expect(frameAtElapsed(6500, 10, 1, true)).toBe(0);
  expect(frameAtElapsed(6500, 10, 1, false)).toBe(9);
});

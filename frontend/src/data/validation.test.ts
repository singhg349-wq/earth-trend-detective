import { describe, expect, it } from 'vitest';
import {
  isListedValidation,
  validationLabel,
} from './validation';

describe('validation status labels', () => {
  it('maps the three listed statuses to the agreed wording', () => {
    expect(validationLabel('passed')).toBe('checked against Giovanni');
    expect(validationLabel('unchecked-same-method')).toBe(
      'same method, not individually checked',
    );
    expect(validationLabel('pending')).toBe('pending check');
  });

  it('hides failed, fixture and unknown statuses', () => {
    expect(validationLabel('failed')).toBeNull();
    expect(validationLabel('fixture')).toBeNull();
    expect(validationLabel('unknown')).toBeNull();
    expect(validationLabel('')).toBeNull();
    expect(validationLabel(null)).toBeNull();
    expect(validationLabel(42)).toBeNull();
  });

  it('reports which statuses may be listed', () => {
    expect(isListedValidation('passed')).toBe(true);
    expect(isListedValidation('unchecked-same-method')).toBe(true);
    expect(isListedValidation('pending')).toBe(true);
    expect(isListedValidation('failed')).toBe(false);
    expect(isListedValidation('fixture')).toBe(false);
  });
});

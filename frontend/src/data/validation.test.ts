import { describe, expect, it } from 'vitest';
import {
  isListedValidation,
  validationLabel,
  comparisonLabel,
} from './validation';

describe('validation status labels', () => {
  it('limits comparison claims to the two rainfall DJF test regions', () => {
    const doc = { variable: 'precipitation', region: { id: 'coastal_peru' }, season: { code: 'DJF' }, validation: { status: 'passed' } };
    expect(comparisonLabel(doc)).toBe('Compared with NASA Giovanni');
    expect(comparisonLabel({...doc,region:{id:'indonesia'}})).toBe('Compared with NASA Giovanni');
    expect(comparisonLabel({...doc,variable:'temperature'})).toBe('Same pipeline; not individually compared');
    expect(comparisonLabel({...doc,region:{id:'india'}})).toBe('Same pipeline; not individually compared');
    expect(comparisonLabel({...doc,season:{code:'JJA'}})).toBe('Same pipeline; not individually compared');
    expect(comparisonLabel({...doc,variable:'aerosol_optical_depth'})).toBe('Same pipeline; not individually compared; input reader not separately compared');
    expect(comparisonLabel({...doc,variable:'soil_moisture'})).toContain('input reader not separately compared');
  });
  it('maps the three listed statuses to the agreed wording', () => {
    expect(validationLabel('passed')).toBe('Compared with NASA Giovanni');
    expect(validationLabel('unchecked-same-method')).toBe(
      'Same pipeline; not individually compared',
    );
    expect(validationLabel('pending')).toBe('Same pipeline; not individually compared');
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

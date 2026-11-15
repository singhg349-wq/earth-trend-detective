import { describe, expect, it } from 'vitest';
import artifact from '../../../data/artifacts/t2m_alberta_prairies_DJF.json';
import {
  buildSuggestions,
  expandedExplanation,
  lag1SensitivityExplanation,
  sampleSizeExplanation,
  strictCheckExplanation,
  strictStatusLine,
  type SuggestionContext,
} from './explain';
import { readInference } from './inference';
import type { SeriesDoc } from '../types';

const doc = artifact as unknown as SeriesDoc;
const view = readInference(doc.trend?.inference);

describe('strictStatusLine', () => {
  it('returns meets criterion with p value when prewhitening sensitivity check passes', () => {
    const okView = { ...view, strictCheckPass: true, strictCheckP: 0.031 } as typeof view;
    expect(strictStatusLine(okView)).toBe('Prewhitening sensitivity check: p = 0.031, statistically significant at the 5% level, with the same direction');
  });

  it('returns does not meet criterion with p value when prewhitening sensitivity check fails', () => {
    const failView = { ...view, strictCheckPass: false, strictCheckP: 0.333 } as typeof view;
    expect(strictStatusLine(failView)).toBe('Prewhitening sensitivity check: p = 0.333, does not confirm significance in the same direction');
  });

  it('returns not available when prewhitening sensitivity check pass is null', () => {
    const naView = { ...view, strictCheckPass: null, strictCheckP: null } as typeof view;
    expect(strictStatusLine(naView)).toBe('Prewhitening sensitivity check: not available');
  });

  it('returns not available when prewhitening sensitivity check p is null but pass is boolean', () => {
    const naView = { ...view, strictCheckPass: true, strictCheckP: null } as typeof view;
    expect(strictStatusLine(naView)).toBe('Prewhitening sensitivity check: not available');
  });
});

describe('expandedExplanation', () => {
  it('produces 2-3 sentences from artifact fields only', () => {
    const sentences = expandedExplanation(doc);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(4);
  });

  it('includes mean and sample size in first sentence', () => {
    const sentences = expandedExplanation(doc);
    expect(sentences[0]).toContain('mean over the full');
    expect(sentences[0]).toContain('seasons');
  });

  it('includes Sen slope and p-value wording for significant result', () => {
    const significantDoc = {
      ...doc,
      trend: {
        ...doc.trend,
        inference: {
          ...doc.trend!.inference,
          p_value: 0.01,
          status: 'ok',
          method: 'MK + Hamed-Rao (3 lags)',
        },
      },
    } as SeriesDoc;
    const sentences = expandedExplanation(significantDoc);
    const slopeSentence = sentences.find((s) => s.includes('Sen slope'));
    expect(slopeSentence).toContain('would be uncommon if no trend were present');
    expect(slopeSentence).toContain('p = 0.01');
  });

  it('includes non-significant wording when p >= 0.05', () => {
    const sentences = expandedExplanation(doc);
    const slopeSentence = sentences.find((s) => s.includes('Sen slope'));
    expect(slopeSentence).toContain('would not be uncommon if no trend were present');
  });

  it('includes interval wording when CI exists', () => {
    const sentences = expandedExplanation(doc);
    const intervalSentence = sentences.find((s) => s.includes('95% confidence interval'));
    expect(intervalSentence).toContain('includes zero');
  });

  it('mentions prewhitening sensitivity check divergence when it differs from main test', () => {
    const sentences = expandedExplanation(doc);
    const strictSentence = sentences.find((s) => s.includes('prewhitening sensitivity check'));
    // In this artifact both main (p=0.288) and strict (p=0.333) fail, so they agree
    expect(strictSentence).toContain('is not statistically significant at the 5% level');
  });

  it('handles missing inference gracefully', () => {
    const noInferenceDoc = {
      ...doc,
      trend: {
        ...doc.trend,
        inference: { status: 'unavailable' },
      },
    } as SeriesDoc;
    const sentences = expandedExplanation(noInferenceDoc);
    const slopeSentence = sentences.find((s) => s.includes('Sen slope'));
    expect(slopeSentence).toContain('did not record an inference result');
  });
});

describe('buildSuggestions', () => {
  const baseContext: SuggestionContext = {
    variable: 'temperature',
    season: 'DJF',
    regionId: 'alberta_prairies',
    regionLabel: 'Alberta / Prairies',
    catalog: [
      { regionId: 'alberta_prairies', label: 'Alberta / Prairies', variable: 'temperature', season: 'DJF' },
      { regionId: 'indonesia', label: 'Indonesia', variable: 'temperature', season: 'DJF' },
      { regionId: 'coastal_peru', label: 'Coastal Peru', variable: 'temperature', season: 'DJF' },
    ],
    hasTimelapse: true,
    checksOpen: false,
    inCompareMode: false,
  };

  it('suggests compare with another region in catalog', () => {
    const suggestions = buildSuggestions(baseContext);
    const compare = suggestions.find((s) => s.action === 'compare');
    expect(compare).toBeDefined();
    expect(compare?.label).toContain('Compare with Indonesia');
    expect(compare?.data?.regionId).toBe('indonesia');
  });

  it('does not suggest compare with self', () => {
    const suggestions = buildSuggestions(baseContext);
    const compare = suggestions.find((s) => s.action === 'compare');
    expect(compare?.data?.regionId).not.toBe('alberta_prairies');
  });

  it('suggests timelapse when available', () => {
    const suggestions = buildSuggestions(baseContext);
    const timelapse = suggestions.find((s) => s.action === 'timelapse');
    expect(timelapse).toBeDefined();
    expect(timelapse?.label).toBe('Watch this season as a timelapse');
    expect(timelapse?.data).toEqual({ variable: 'temperature', season: 'DJF' });
  });

  it('does not suggest timelapse when unavailable', () => {
    const ctx = { ...baseContext, hasTimelapse: false };
    const suggestions = buildSuggestions(ctx);
    const timelapse = suggestions.find((s) => s.action === 'timelapse');
    expect(timelapse).toBeUndefined();
  });

  it('suggests 1-lag sensitivity when checks not open', () => {
    const suggestions = buildSuggestions(baseContext);
    const lag1 = suggestions.find((s) => s.action === 'toggleChecks');
    expect(lag1).toBeDefined();
    expect(lag1?.label).toBe('Add the 1-lag sensitivity check');
    expect(lag1?.data?.showLag1).toBe(true);
  });

  it('does not suggest 1-lag sensitivity when checks already open', () => {
    const ctx = { ...baseContext, checksOpen: true };
    const suggestions = buildSuggestions(ctx);
    const lag1 = suggestions.find((s) => s.action === 'toggleChecks');
    expect(lag1).toBeUndefined();
  });

  it('always suggests save', () => {
    const suggestions = buildSuggestions(baseContext);
    const save = suggestions.find((s) => s.action === 'save');
    expect(save).toBeDefined();
    expect(save?.label).toBe('Save this investigation');
  });

  it('always suggests cite', () => {
    const suggestions = buildSuggestions(baseContext);
    const cite = suggestions.find((s) => s.action === 'cite');
    expect(cite).toBeDefined();
    expect(cite?.label).toBe('Cite these sources');
  });

  it('does not duplicate the plain-language expander as a button', () => {
    const suggestions = buildSuggestions(baseContext);
    expect(suggestions.some((s) => s.id === 'explain')).toBe(false);
  });

  it('returns at least 4 suggestions', () => {
    const suggestions = buildSuggestions(baseContext);
    expect(suggestions.length).toBeGreaterThanOrEqual(4);
  });
});

describe('lag1SensitivityExplanation', () => {
  it('explains it is a diagnostic, not a hypothesis test', () => {
    const sentences = lag1SensitivityExplanation(view);
    expect(sentences[0]).toContain('diagnostic');
    expect(sentences[0]).toContain('not a hypothesis test');
    expect(sentences[0]).toContain('lag-1 autocorrelation');
    expect(sentences[0]).toContain('0.30');
  });

  it('includes lag-1 value when present', () => {
    const sentences = lag1SensitivityExplanation(view);
    // Second sentence contains the lag-1 value
    expect(sentences[1]).toContain('-0.043');
  });

  it('shows caution when lag-1 >= 0.30', () => {
    const cautionView = { ...view, lag1: 0.41 } as typeof view;
    const sentences = lag1SensitivityExplanation(cautionView);
    expect(sentences[1]).toContain('caution');
    expect(sentences[1]).toContain('0.30');
  });

  it('states 3-lag Hamed-Rao autocorrelation correction remains headline', () => {
    const sentences = lag1SensitivityExplanation(view);
    const defaultSentence = sentences.find((s) => s.includes('3-lag Hamed-Rao'));
    expect(defaultSentence).toContain('never replaces it');
    expect(defaultSentence).toContain('never gets its own verdict banner');
  });

  it('handles missing lag-1 gracefully', () => {
    const noLag1View = { ...view, lag1: null } as typeof view;
    const sentences = lag1SensitivityExplanation(noLag1View);
    expect(sentences[1]).toContain('not recorded');
  });
});

describe('sampleSizeExplanation', () => {
  it('includes sample size from inference view', () => {
    const sentences = sampleSizeExplanation(doc, view);
    expect(sentences[0]).toContain('n = 46');
  });

  it('calculates coverage from doc.coverage', () => {
    const sentences = sampleSizeExplanation(doc, view);
    expect(sentences[1]).toContain('%');
  });

  it('handles missing n gracefully', () => {
    const noNView = { ...view, n: null } as typeof view;
    const sentences = sampleSizeExplanation(doc, noNView);
    expect(sentences[0]).toContain('not recorded');
  });
});

describe('strictCheckExplanation', () => {
  it('explains Yue-Wang prewhitening and why conservative', () => {
    const sentences = strictCheckExplanation(view);
    expect(sentences[0]).toContain('Yue-Wang classic prewhitening');
    expect(sentences[0]).toContain('can also remove a real trend');
  });

  it('reports pass/fail with p value when available', () => {
    const passView = { ...view, strictCheckPass: true, strictCheckP: 0.031 } as typeof view;
    const sentences = strictCheckExplanation(passView);
    const verdictSentence = sentences.find((s) => s.includes('statistically significant'));
    expect(verdictSentence).toContain('p = 0.031');
  });

  it('reports not available when missing', () => {
    const naView = { ...view, strictCheckPass: null, strictCheckP: null } as typeof view;
    const sentences = strictCheckExplanation(naView);
    expect(sentences[1]).toContain('not available');
  });

  it('includes calibration note', () => {
    const sentences = strictCheckExplanation(view);
    const calibrationSentence = sentences.find((s) => s.includes('calibration'));
    expect(calibrationSentence).toContain('0.066');
    expect(calibrationSentence).toContain('0.166');
  });
});
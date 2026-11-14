import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InferenceBlock from '../components/InferenceBlock';
import { CI_LABEL } from './inference';
import okCaution from './__fixtures__/inference/inference_ok_caution.json';
import okStrictFail from './__fixtures__/inference/inference_ok_strict_fail.json';
import unavailable from './__fixtures__/inference/inference_unavailable.json';
import unavailableCi from './__fixtures__/inference/inference_unavailable_ci.json';

function render(inference: unknown): string {
  return renderToStaticMarkup(
    <InferenceBlock inference={inference} slopeUnits="mm/day per decade" />,
  );
}

describe('InferenceBlock', () => {
  it('shows both tests, the interval label, lag-1 and the caution badge', () => {
    const html = render(okCaution.trend.inference);

    expect(html).toContain('Mann-Kendall with Hamed-Rao correction (3 lags)');
    expect(html).toContain('p = 0.042');
    expect(html).toContain('Yue-Wang prewhitening');
    expect(html).toContain('Also passes the strict check');
    expect(html).toContain('p = 0.031');
    expect(html).toContain(CI_LABEL);
    expect(html).toContain('-0.231 to -0.021 mm/day per decade');
    expect(html).toContain('0.410');
    expect(html).toContain('caution');
    const banned = ['pro' + 'ves', ['chance', 'this', 'is', 'luck'].join(' ')];
    for (const phrase of banned) {
      expect(html.toLowerCase()).not.toContain(phrase);
    }
  });

  it('says when the strict check does not pass', () => {
    const html = render(okStrictFail.trend.inference);

    expect(html).toContain('Does not pass the strict check');
    expect(html).not.toContain('tag-caution');
  });

  it('shows only the unavailable message when inference is missing', () => {
    const html = render(unavailable.trend.inference);

    expect(html).toContain('Inference unavailable');
    expect(html).not.toContain('p =');
    expect(html).toContain(CI_LABEL);
    expect(html).toContain('not available');
  });

  it('keeps the slope interval visible when the main test is unavailable', () => {
    const html = render(unavailableCi.trend.inference);

    expect(html).toContain('Inference unavailable');
    expect(html).not.toContain('p =');
    expect(html).toContain(CI_LABEL);
    expect(html).toContain('-0.048 to 0.276 mm/day per decade');
    expect(html).toContain('0.350');
    expect(html).toContain('caution');
  });
});

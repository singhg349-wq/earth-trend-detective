import {
  CI_LABEL,
  MAIN_TEST_LABEL,
  STRICT_CHECK_LABEL,
  cautionText,
  formatInterval,
  formatNumber,
  formatPValue,
  readInference,
  strictCheckVerdict,
} from '../data/inference';

interface InferenceBlockProps {
  /** The artifact's `trend.inference` object. Unknown shapes are read safely. */
  inference: unknown;
  /** Units for one decade of slope, e.g. `mm/day per decade`. */
  slopeUnits: string;
}

export default function InferenceBlock({
  inference,
  slopeUnits,
}: InferenceBlockProps) {
  const view = readInference(inference);

  if (view.status !== 'ok') {
    return (
      <section
        className="inference inference-unavailable"
        aria-label="Trend inference"
      >
        <h3>Trend inference</h3>
        <p>
          <strong>Inference unavailable.</strong> No p-value or significance
          verdict is shown for this result. The descriptive Sen slope above is
          still shown.
        </p>
        <div className="inference-interval">
          <p className="inference-interval-label">{CI_LABEL}</p>
          <p className="inference-interval-value">
            {formatInterval(view.ci, slopeUnits)}
          </p>
        </div>
        {(view.lag1 !== null || view.n !== null) && (
          <dl className="inference-facts">
            {view.lag1 !== null && (
              <div>
                <dt>Detrended lag-1 correlation</dt>
                <dd>
                  {formatNumber(view.lag1)}
                  {view.caution && (
                    <span className="tag tag-caution">caution</span>
                  )}
                </dd>
              </div>
            )}
            {view.n !== null && (
              <div>
                <dt>Valid years</dt>
                <dd>n = {view.n}</dd>
              </div>
            )}
          </dl>
        )}
        <p className="muted inference-note">
          Inference is shown only after the method passes the project checks.
        </p>
      </section>
    );
  }

  const caution = cautionText(view);
  const showCiNote = Boolean(
    view.ciNote && !/^95% slope interval/i.test(view.ciNote),
  );

  return (
    <section className="inference" aria-label="Trend inference">
      <div className="inference-head">
        <h3>Trend inference</h3>
        <span className="tag tag-inference-ok">inference ok</span>
      </div>

      <dl className="inference-facts">
        <div>
          <dt>{MAIN_TEST_LABEL}</dt>
          <dd>p = {formatPValue(view.pValue)}</dd>
        </div>
        <div>
          <dt>{STRICT_CHECK_LABEL}</dt>
          <dd>
            {strictCheckVerdict(view)}
            {view.strictCheckP !== null
              ? ` (p = ${formatPValue(view.strictCheckP)})`
              : ''}
          </dd>
        </div>
        <div>
          <dt>Detrended lag-1 correlation</dt>
          <dd>
            {formatNumber(view.lag1)}
            {view.caution && <span className="tag tag-caution">caution</span>}
          </dd>
        </div>
        <div>
          <dt>Valid years in the test</dt>
          <dd>{view.n === null ? 'not available' : `n = ${view.n}`}</dd>
        </div>
      </dl>

      <div className="inference-interval">
        <p className="inference-interval-label">{CI_LABEL}</p>
        <p className="inference-interval-value">
          {formatInterval(view.ci, slopeUnits)}
        </p>
      </div>

      {showCiNote && (
        <p className="muted inference-note">{view.ciNote}</p>
      )}

      <p className="muted inference-note">
        A small p-value means the observed slope is unusual under a no-trend
        model. It does not establish a cause. The strict check repeats the test
        after Yue-Wang prewhitening; both tests are reported so the result can be
        read either way.
      </p>

      {caution && (
        <p className="caution-note">
          <strong>Caution.</strong> {caution}
        </p>
      )}
    </section>
  );
}

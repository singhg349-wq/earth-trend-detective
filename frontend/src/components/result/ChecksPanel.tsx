import InfoTip from '../InfoTip';
import type { InspectItem } from '../Inspector';
import { readInference, strictCheckVerdict, formatPValue, formatInterval, formatNumber, CAUTION_LAG1 } from '../../data/inference';
import { strictStatusLine } from '../../data/explain';
import { coverageText } from '../../data/validation';

const slopeUnits = (doc: { units: string }) => `${doc.units} per decade`;

interface ChecksPanelProps {
  items: InspectItem[];
  expandedChecks: Record<string, boolean>;
  onToggleChecks: (id: string) => void;
}

export default function ChecksPanel({ items, expandedChecks, onToggleChecks }: ChecksPanelProps) {
  return (
    <section className="inspector-section checks">
      <h3>Statistical tests</h3>
      <>
        {items.map((item) => {
          const view = readInference(item.doc.trend?.inference);
          const checksOpenForCard = expandedChecks[item.id] ?? false;

          return (
            <div key={item.doc.id} className="check-block">
              <div className="check-block-header">
                <h4>
                  <span className="slot-chip" style={{ backgroundColor: item.color }}>
                    {item.slot}
                  </span>
                  {item.doc.region.label}
                </h4>
                <button
                  type="button"
                  className="section-toggle"
                  aria-expanded={checksOpenForCard}
                  onClick={() => onToggleChecks(item.id)}
                >
                  <span className="chevron">{checksOpenForCard ? '▼' : '▶'}</span>
                  {checksOpenForCard ? 'Hide checks' : 'Show checks'}
                </button>
              </div>

              {/* Always visible: prewhitening sensitivity check verdict line */}
              <div className="strict-verdict-line">
                {strictStatusLine(view)}
              </div>

              {checksOpenForCard && (
                <dl className="fact-grid">
                  <div>
                    <dt>Prewhitening sensitivity check (Yue–Wang)<InfoTip term="prewhitening" /></dt>
                    <dd>
                      {view.strictCheckP !== null
                        ? `p = ${formatPValue(view.strictCheckP)} — ${strictCheckVerdict(view)}`
                        : 'not available'}
                    </dd>
                  </div>
                  <div>
                    <dt>95% confidence interval<InfoTip term="confidence" /></dt>
                    <dd>{formatInterval(view.ci, slopeUnits(item.doc))}</dd>
                  </div>
                  <div>
                    <dt>Detrended lag-1 autocorrelation (r1)<InfoTip term="autocorrelation" /></dt>
                    <dd>
                      {view.lag1 !== null
                        ? `${formatNumber(view.lag1)} ${view.lag1 >= CAUTION_LAG1 ? '(caution: ≥ 0.30)' : ''}`
                        : 'not recorded'}
                    </dd>
                  </div>
                  <div>
                    <dt>Sample size / coverage</dt>
                    <dd>
                      n = {view.n ?? 'not recorded'} · coverage {coverageText(item.doc)}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          );
        })}
        <p>Mann–Kendall test<InfoTip term="mannKendall" /> · p-value<InfoTip term="pValue" /> · Hamed–Rao correction<InfoTip term="hamedRao" /></p>
      </>
    </section>
  );
}
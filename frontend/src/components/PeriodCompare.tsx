import { useMemo, useState } from 'react';
import { comparePeriods } from '../lib/period';

interface PeriodCompareProps {
  years: number[];
  values: Array<number | null>;
  units: string;
  label: string;
}

function toYear(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function slopeText(value: number | null, units: string): string {
  if (value === null || !Number.isFinite(value)) return 'not available';
  return `${value.toFixed(3)} ${units} per decade`;
}

export default function PeriodCompare({
  years,
  values,
  units,
  label,
}: PeriodCompareProps) {
  const firstYear = years[0] ?? 1984;
  const lastYear = years[years.length - 1] ?? firstYear;
  const middle = Math.floor((firstYear + lastYear) / 2);

  const [aStart, setAStart] = useState(String(firstYear));
  const [aEnd, setAEnd] = useState(String(middle));
  const [bStart, setBStart] = useState(String(middle + 1));
  const [bEnd, setBEnd] = useState(String(lastYear));

  const periodA = { startYear: toYear(aStart), endYear: toYear(aEnd) };
  const periodB = { startYear: toYear(bStart), endYear: toYear(bEnd) };
  const boundsValid =
    periodA.startYear !== null &&
    periodA.endYear !== null &&
    periodB.startYear !== null &&
    periodB.endYear !== null &&
    periodA.startYear <= periodA.endYear &&
    periodB.startYear <= periodB.endYear;

  const comparison = useMemo(() => {
    if (!boundsValid) return null;
    try {
      return comparePeriods(
        years,
        values,
        { startYear: periodA.startYear as number, endYear: periodA.endYear as number },
        { startYear: periodB.startYear as number, endYear: periodB.endYear as number },
      );
    } catch {
      return null;
    }
  }, [years, values, boundsValid, periodA.startYear, periodA.endYear, periodB.startYear, periodB.endYear]);

  return (
    <section className="period-compare" aria-label={`Period comparison for ${label}`}>
      <div className="period-head">
        <h3>Period comparison</h3>
        <span className="tag tag-unchecked">No inference</span>
      </div>
      <p className="muted period-intro">
        Descriptive Sen slopes for two sub-periods, computed in the browser from the
        stored series. Sub-periods get no p-value, slope interval, slope difference or
        other significance claim.
      </p>

      <div className="period-inputs">
        <fieldset>
          <legend>Period A</legend>
          <label>
            Start
            <input
              type="number"
              step="1"
              value={aStart}
              onChange={(event) => setAStart(event.target.value)}
              aria-label="Period A start year"
            />
          </label>
          <label>
            End
            <input
              type="number"
              step="1"
              value={aEnd}
              onChange={(event) => setAEnd(event.target.value)}
              aria-label="Period A end year"
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Period B</legend>
          <label>
            Start
            <input
              type="number"
              step="1"
              value={bStart}
              onChange={(event) => setBStart(event.target.value)}
              aria-label="Period B start year"
            />
          </label>
          <label>
            End
            <input
              type="number"
              step="1"
              value={bEnd}
              onChange={(event) => setBEnd(event.target.value)}
              aria-label="Period B end year"
            />
          </label>
        </fieldset>
      </div>

      {!boundsValid && (
        <p className="error">
          Enter whole calendar years with each period start on or before its end.
        </p>
      )}

      {comparison && (
        <>
          <div className="period-estimates">
            <div>
              <p className="period-name">
                A &middot; {comparison.periods.a[0]}-{comparison.periods.a[1]}
              </p>
              <p className="period-slope">
                {slopeText(comparison.a.estimate.slopePerDecade, units)}
              </p>
              <p className="muted">
                n = {comparison.a.n}
                {comparison.a.dataPeriod
                  ? ` · data ${comparison.a.dataPeriod[0]}-${comparison.a.dataPeriod[1]}`
                  : ' · no valid years'}
              </p>
            </div>
            <div>
              <p className="period-name">
                B &middot; {comparison.periods.b[0]}-{comparison.periods.b[1]}
              </p>
              <p className="period-slope">
                {slopeText(comparison.b.estimate.slopePerDecade, units)}
              </p>
              <p className="muted">
                n = {comparison.b.n}
                {comparison.b.dataPeriod
                  ? ` · data ${comparison.b.dataPeriod[0]}-${comparison.b.dataPeriod[1]}`
                  : ' · no valid years'}
              </p>
            </div>
          </div>
          <ul className="period-labels">
            {comparison.support.labels.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

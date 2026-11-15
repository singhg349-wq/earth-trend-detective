import type { ResolvedResult } from '../../data/exports';
import { RESULT_COLUMNS, resultTableCells, PERIOD_OPTIONS } from '../../data/exports';
import type { InspectItem } from '../Inspector';
import { SUB_PERIOD_SLOPE_NOTE, SUB_PERIOD_SIGNIFICANCE_NOTE } from '../../data/exports';

interface ResultTableProps {
  item: InspectItem;
  row: ResolvedResult;
  index: number;
}

export default function ResultTable({ item, row }: ResultTableProps) {
  const isSubPeriod = item.period !== 'full';
  const periodLabel = PERIOD_OPTIONS.find((option: { key: string; label: string }) => option.key === item.period)?.label ?? item.period;

  return (
    <details className="table-expander" open>
      <summary className="table-summary">Result table</summary>
      <div className="result-table-wrap">
        <table className="result-table">
          <caption className="visually-hidden">
            Resolved result for {periodLabel} window
          </caption>
          <thead>
            <tr>
              {RESULT_COLUMNS.map((column: { key: string; label: string }) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {RESULT_COLUMNS.map((column) => {
                const cells = resultTableCells(row);
                return <td key={column.key}>{cells[column.key]}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Mean and half-window slopes are calculated in the browser from the stored
        seasonal values. DJF years are labelled by January: DJF 2015 = Dec 2014 to
        Feb 2015.
      </p>
      {isSubPeriod && (
        <p className="muted small">
          {SUB_PERIOD_SLOPE_NOTE} {SUB_PERIOD_SIGNIFICANCE_NOTE}
        </p>
      )}
    </details>
  );
}
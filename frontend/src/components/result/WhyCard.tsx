import { useEffect, useState } from 'react';
import type { Diagnosis, NextStep } from '../../data/diagnose';

interface WhyCardProps {
  diagnosis: Diagnosis;
  onStep: (step: NextStep) => void;
  defaultOpen?: boolean;
}

function SignalNoiseBar({ total, sd, units }: { total: number; sd: number; units: string }) {
  const W = 260;
  const mid = W / 2;
  const max = Math.max(Math.abs(total), sd, 1e-9) * 1.15;
  const x = (val: number) => mid + (val / max) * (mid - 8);
  const sig = Math.abs(total);
  return (
    <svg className="why-bar" viewBox={`0 0 ${W} 64`} role="img"
      aria-label={`Signal ${sig.toFixed(2)} ${units} versus noise plus or minus ${sd.toFixed(2)} ${units}`}>
      <text x={0} y={10} className="why-bar-label">Noise (1 SD)</text>
      <rect x={x(-sd)} y={16} width={x(sd) - x(-sd)} height={10} className="why-bar-noise" />
      <text x={0} y={42} className="why-bar-label">Signal (total change)</text>
      <rect x={Math.min(mid, x(total))} y={48} width={Math.abs(x(total) - mid)} height={10} className="why-bar-signal" />
      <line x1={mid} x2={mid} y1={12} y2={62} className="why-bar-zero" />
    </svg>
  );
}

export default function WhyCard({ diagnosis, onStep, defaultOpen }: WhyCardProps) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const { votes, reasons, takeaway, nextSteps, total, sd, units } = diagnosis;
  return (
    <div className="why-card">
      <p className="why-takeaway" data-anchor="why-takeaway">{takeaway}</p>
      <button type="button" className="why-toggle" data-anchor="why" aria-expanded={open} onClick={() => setOpen(!open)}>
        Why? <span aria-hidden="true">(i)</span>
      </button>
      {open && (
        <div className="why-detail">
          <ul className="why-votes">
            {votes.map((vote) => (
              <li key={vote.id} className={`why-vote why-vote--${vote.pass === null ? 'na' : vote.pass ? 'pass' : 'fail'}`}>
                <strong>{vote.label}</strong> <span>{vote.pass === null ? '—' : vote.pass ? '✓' : '✗'} {vote.detail}</span>
              </li>
            ))}
          </ul>
          {reasons.length > 0 && <ul className="why-reasons">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          {sd > 0 && <SignalNoiseBar total={total} sd={sd} units={units} />}
          <p className="why-note muted small">Single-place p-value; see the global map for FDR-controlled (q = 0.10) results.</p>
        </div>
      )}
      {nextSteps.length > 0 && (
        <div className="why-steps">
          {nextSteps.map((step) => (
            <button key={step.id} type="button" className="suggestion-btn" onClick={() => onStep(step)}>{step.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

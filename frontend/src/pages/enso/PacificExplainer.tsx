import { useState } from 'react';
import InfoTip from '../../components/InfoTip';
const MODES = ['Normal', 'El Niño', 'La Niña'] as const;
/** `warmOnly` hides the cool-phase view while an El Niño impact map is on screen. */
export default function PacificExplainer({ warmOnly = false }: { warmOnly?: boolean }) {
  const [mode, setMode] = useState<typeof MODES[number]>('Normal');
  const warmEnd = mode === 'El Niño' ? 535 : mode === 'La Niña' ? 225 : 325;
  return <section><h2>01 — What El Niño is<InfoTip term="enso" /></h2>
    <div className="enso-toggle">{MODES.filter(m => !warmOnly || m !== 'La Niña').map(m => <button type="button" key={m} aria-pressed={m === mode} onClick={() => setMode(m)}>{m}</button>)}</div>
    <svg viewBox="0 0 620 250" role="img" aria-label={`${mode}: equatorial Pacific from Asia and Australia to South America. ${mode === 'El Niño' ? 'Weaker trade winds allow warm water and rising air to move east; the eastern thermocline deepens.' : 'Easterly trade winds push warm surface water west; cooler water rises in the east.'}`}>
      <defs><marker id="enso-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="currentColor" /></marker></defs>
      <path d="M30 115H590V220H30Z" fill="#193d58" />
      <path d={`M30 115H${warmEnd}L${warmEnd-40} 155L30 185Z`} fill="#c77845" style={{ transition: 'd 600ms' }} />
      <path d={`M30 185L${warmEnd-40} 155L590 ${mode === 'El Niño' ? 155 : 125}`} fill="none" stroke="#f2d4aa" strokeDasharray="5 4" />
      <path d={mode === 'El Niño' ? 'M400 70H285' : 'M515 70H155'} stroke="#c8d5dd" strokeWidth={mode === 'La Niña' ? 5 : 2} markerEnd="url(#enso-arrow)" />
      <path d={`M${warmEnd-110} 105V45`} stroke="#e1c6a2" strokeWidth="3" markerEnd="url(#enso-arrow)" />
      <text x="30" y="240">Asia / Australia</text><text x="590" y="240" textAnchor="end">South America</text>
      <text x="310" y="35" textAnchor="middle">{mode === 'El Niño' ? 'Weaker easterly trade winds' : mode === 'La Niña' ? 'Stronger easterly trade winds' : 'Easterly trade winds'}</text>
      <text x="55" y="145">Warm surface water</text><text x="365" y="205">Cool deep water</text>
      <text x={warmEnd-100} y="55">Rising air / rain</text>
    </svg>
    <p>{mode === 'El Niño' ? 'Trade winds weaken. Warm water and tropical rainfall shift toward the central and eastern Pacific; the eastern thermocline deepens.' : mode === 'La Niña' ? 'Stronger trade winds concentrate warm water and rainfall farther west. Upwelling strengthens in the eastern Pacific.' : 'Trade winds push warm surface water west. Cooler water rises near South America; the thermocline is deeper in the west.'}</p>
    <p className="muted">Schematic, not to scale. Each event differs.</p>
  </section>;
}

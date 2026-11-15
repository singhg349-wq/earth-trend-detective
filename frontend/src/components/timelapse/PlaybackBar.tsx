import { useEffect, useState } from 'react';
import type { TimelapseIndex } from '../../types';
import { METRICS, metricBySlug } from '../../lib/metrics';
import { timelapseFrameUrl } from '../../data/seriesSource';
import { colorGradient } from '../../data/ensoHistory';
import InfoTip from '../InfoTip';
import './playback.css';

export function frameAtElapsed(elapsed: number, count: number, speed: number, loop: boolean): number {
  const frame = Math.floor(elapsed * speed / 650);
  return loop ? frame % Math.max(1,count) : Math.min(frame, Math.max(0,count-1));
}
export default function PlaybackBar({ index, variable, season, year, playing, onAdvance, onYear, onToggle, onClose, onSet }: {
  index: TimelapseIndex; variable: string; season: string; year: number; playing: boolean;
  onSet?: (variable:string,season:string)=>void; onAdvance: () => void; onYear: (year: number) => void; onToggle: () => void; onClose: () => void;
}) {
  const [speed,setSpeed] = useState(1), [loop,setLoop] = useState(true), [loaded,setLoaded] = useState(0);
  useEffect(() => {
    let alive = true; setLoaded(0);
    void Promise.all(index.years.map(async y => {const image = new Image();image.src = timelapseFrameUrl(variable,season,y);try { await image.decode(); if(alive) setLoaded(n => n+1); } catch { /* Never report missing frames as loaded. */ }}));
    return () => {alive = false;};
  },[index,variable,season]);
  useEffect(() => {
    if (!playing || loaded < index.years.length) return;
    let raf = 0, last = performance.now();
    const tick = (now:number) => {
      if (now-last >= 650/speed) {
        if(!loop && year === index.years.at(-1)) {onToggle();return;}
        onAdvance();last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);return () => cancelAnimationFrame(raf);
  },[playing,loaded,index,year,speed,loop,onAdvance,onToggle]);
  const metric = metricBySlug(variable);
  const position = Math.max(0,index.years.indexOf(year));
  const cmap = typeof index.colormap === 'object' ? index.colormap : null;
  return <div className="timelapse-panel r4-playback">
    <div className="timelapse-row"><strong>{metric?.label ?? variable} anomaly · {season}<InfoTip term="seasons" /> · {year}</strong><button type="button" onClick={onClose}>Close</button></div>
    {onSet && <div className="timelapse-row"><label>Metric <select value={variable} onChange={e=>onSet(e.target.value,season)}>{METRICS.map(m=><option value={m.slug} key={m.id}>{m.label}</option>)}</select></label><label>Season <select value={season} onChange={e=>onSet(variable,e.target.value)}>{['ANN','DJF','MAM','JJA','SON'].map(s=><option key={s}>{s}</option>)}</select></label></div>}
    <div className="timelapse-row"><button type="button" onClick={onToggle}>{playing?'Pause':'Play'}</button><input type="range" min={0} max={index.years.length-1} value={position} aria-label="Timelapse year" aria-valuetext={`${year} ${season}`} onChange={e => onYear(index.years[Number(e.target.value)])}/><label>Speed <select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label><label><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)}/> Loop</label></div>
    <div className="r4-year-ticks">{index.years.filter((_,i) => i===0 || i===index.years.length-1 || i%10===0).map(y => <span key={y}>{y}</span>)}</div>
    {cmap ? <><div className="r4-color-ramp" style={{background:colorGradient(cmap)}}/><div className="r4-year-ticks">{cmap.stops.filter((_,i,a)=>i===0 || i===a.length-1 || i===Math.floor(a.length/2)).map(([v]) => <span key={v}>{v} {index.units}</span>)}</div></> : <p>Relative scale · {index.units}. Numeric colour stops were not supplied.</p>}
    <p className="muted">{index.fixture ? 'Interface fixture: placeholder frames, not observed climate data.' : index.source}{index.anomaly_baseline ? ` · vs ${index.anomaly_baseline} baseline` : ''}<InfoTip term="anomaly" />{loaded < index.years.length && ` · Loading ${loaded}/${index.years.length} frames`}</p>
  </div>;
}

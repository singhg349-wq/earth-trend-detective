import { useEffect, useMemo, useState } from 'react';
import InfoTip from '../components/InfoTip';
import { ENSO_ROOT, colorGradient, impactHeadline, loadEnsoData, monthLabel, validHistory, validImpacts, validSst, type EnsoHistory, type ImpactHistory, type SstHistory } from '../data/ensoHistory';
import PacificExplainer from './enso/PacificExplainer';
import './enso/enso-r4.css';

export interface EnsoOverlay { url: string; extent: [number, number, number, number]; significanceUrl?: string }
const WAIT = <p className="enso-wait" role="status">Data is being built. This section will refresh automatically.</p>;
export default function EnsoPage({ onOverlay }: { onOverlay?: (overlay: EnsoOverlay | null) => void }) {
  const [history, setHistory] = useState<EnsoHistory | null>(null);
  const [normal, setNormal] = useState<SstHistory | null>(null);
  const [oceanMode,setOceanMode] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('mode') ?? 'el-nino');
  const [sst, setSst] = useState<SstHistory | null>(null);
  const [impacts, setImpacts] = useState<ImpactHistory | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(() => !window.location.hash.includes('map=') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [speed, setSpeed] = useState(1);
  const [impactId, setImpactId] = useState<string | null>(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('map'));
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const [h, s, i, n] = await Promise.all([loadEnsoData('history.json', validHistory), loadEnsoData('sst_global/index.json', validSst), loadEnsoData('impacts/index.json', validImpacts),loadEnsoData('sst_climatology/index.json',validSst)]);
      if (!alive) return;
      if (h) setHistory(h); if (s) setSst(s); if (i) setImpacts(i); if(n) setNormal(n);
    };
    void refresh(); const timer = window.setInterval(refresh, 300000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const selected = oceanMode === 'normal' ? normal : sst;
  const frameRoot = oceanMode === 'normal' ? 'sst_climatology' : 'sst_global';
  const frames = useMemo(() => {
    const all=selected?.frames ?? selected?.months ?? [];
    if(oceanMode === 'el-nino') return all.filter(f=>f.ym >= '1997-03' && f.ym <= '1998-07');
    if(oceanMode === 'la-nina') return all.filter(f=>f.ym >= '2010-05' && f.ym <= '2011-05');
    return all;
  },[selected,oceanMode]);
  const focusedRegion=new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('region');
  const weights=useMemo(()=>frames.map(f=>(sst?.chapters ?? []).some(c=>f.ym >= (c.start_ym ?? c.start ?? '') && f.ym <= (c.end_ym ?? c.end ?? ''))?3:1),[frames,sst]);
  const totalWeight=weights.reduce((sum,w)=>sum+w,0);
  const current = frames[frame];
  const chapter = (sst?.chapters ?? []).find(c => current && current.ym >= (c.start_ym ?? c.start ?? '') && current.ym <= (c.end_ym ?? c.end ?? ''));
  useEffect(() => {
    let alive = true;
    setLoaded(0);
    // Decode a bounded number concurrently to avoid hundreds of simultaneous requests.
    let cursor = 0;
    const worker = async () => { while (cursor < frames.length && alive) { const f = frames[cursor++]; const image = new Image(); image.src = `${ENSO_ROOT}${frameRoot}/${f.file}`; try { await image.decode(); if (alive) setLoaded(n => n + 1); } catch { /* Frame remains unavailable; do not claim it loaded. */ } } };
    void Promise.all(Array.from({ length: 6 }, worker));
    return () => { alive = false; };
  }, [frames,frameRoot]);
  useEffect(() => {
    if (!playing || impactId || frames.length < 2 || loaded < frames.length) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const duration = (oceanMode === 'history' ? 60000*(weights[frame] ?? 1)/Math.max(1,totalWeight) : (oceanMode === 'el-nino' ? 15000 : 12000)/frames.length) / speed;
      if (now-last >= duration) { setFrame(f => (f + 1) % frames.length); last = now; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, speed, frames, chapter, impactId, loaded,oceanMode,weights,totalWeight,frame]);
  const impact = impacts?.maps.find(m => m.id === impactId);
  useEffect(() => {
    if (impact) {
      onOverlay?.({ url: `${ENSO_ROOT}impacts/${impact.overlay_file ?? `${impact.id}_overlay.png`}`, extent: impacts?.bbox ?? [-180,-90,180,90], significanceUrl: `${ENSO_ROOT}impacts/${impact.sig_file ?? `${impact.id}_sig.png`}` });
    } else if (current) onOverlay?.({ url: `${ENSO_ROOT}${frameRoot}/${current.file}`, extent: selected?.extent ?? selected?.bbox ?? [-180,-90,180,90] });
    else onOverlay?.(null);
  }, [current, impact, impacts, selected, frameRoot, onOverlay]);
  const seasons = history?.seasons ?? [];
  const jump = (ym: string) => { setOceanMode('history'); const all=sst?.frames ?? sst?.months ?? []; const i = all.findIndex(f => f.ym >= ym); if (i >= 0) { setFrame(i); setImpactId(null); setPlaying(false); } };
  const peaks=[...(history?.episodes ?? [])].filter(e=>e.phase==='el_nino').sort((a,b)=>b.peak_anom_c-a.peak_anom_c).slice(0,6);
  const palette = impact?.colormap ?? selected?.colormap;
  return <>
    <div className="enso-mode-tabs" role="group" aria-label="Ocean animation mode">{[['normal','Normal year'],['el-nino','El Niño 1997–98'],['la-nina','La Niña 2010–11'],['history','Full history 1979–2026']].map(([id,label])=><button type="button" key={id} aria-pressed={oceanMode===id && !impactId} onClick={()=>{setOceanMode(id);setFrame(0);setImpactId(null);setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);}}>{label}</button>)}</div>
    <div className="enso-date">
      <p>{impact ? impact.label : oceanMode === 'normal' ? 'ACTUAL SEA-SURFACE TEMPERATURE' : 'SEA-SURFACE TEMPERATURE ANOMALY'}<InfoTip term="anomaly" /></p>
      <h2>{impact ? 'El Niño minus La Niña' : current ? monthLabel(current.ym) : oceanMode === 'normal' ? 'Typical year (1991–2020 average)' : 'Ocean frames are being built'}</h2>
      {oceanMode === "normal" && <p>Typical year (1991–2020 average) · absolute temperature</p>}
      {!impact && oceanMode !== "normal" && chapter && <p className="enso-chapter" key={chapter.title}>{chapter.title}{typeof chapter.peak_anom_c === 'number' ? ` · RONI peak ${chapter.peak_anom_c.toFixed(2)} °C` : ''}</p>}
      {!impact && oceanMode !== 'normal' && current && <p>Niño-3.4: {current.nino34_anom_c == null ? 'unavailable' : `${current.nino34_anom_c.toFixed(2)} °C`}<InfoTip term="enso" /></p>}
      {!impact && oceanMode !== 'normal' && current?.nino34_anom_c != null && <meter aria-label="Niño-3.4 anomaly in degrees Celsius" min={-4} max={4} value={current.nino34_anom_c} />}
      {impact && impact.region_summaries.filter(r=>r.region_id===focusedRegion).map(r=><p className="enso-chapter" key={r.region_id}>{r.label}: {r.diff.toFixed(3)} {r.units}<br/>95% CI [{r.ci_low.toFixed(3)}, {r.ci_high.toFixed(3)}]<InfoTip term="confidence" /></p>)}
      {palette && <><div className="enso-legend" style={{ background: colorGradient(palette) }} /><div className="enso-legend-ticks">{palette.stops.filter((_,i,a)=>i===0 || i===a.length-1 || i===Math.floor(a.length/2) || i===Math.floor(a.length/4) || i===Math.floor(a.length*3/4)).map(([v]) => <span key={v}>{Number(v.toFixed(1))}</span>)}</div><p>{impact ? impact.units : oceanMode === 'normal' ? 'Absolute °C · Typical year (1991–2020 average)' : '°C vs 1991–2020'}<InfoTip term="baseline" /></p></>}
    </div>
    <aside className="enso-side" aria-label="El Niño history and science">
      <p className="ed-eyebrow">Ocean & atmosphere</p><h1>El Niño: a changing Pacific, a connected world.</h1>
      <p>Watch warm and cool waters evolve across the ocean. Explore the regional patterns associated with El Niño and La Niña.</p>
      {history && <p>Latest: {history.current.latest_season} · {history.current.anom_c.toFixed(2)} °C (RONI)<InfoTip term="roni" /></p>}
      <PacificExplainer />
      <section><h2>02 — Event history<InfoTip term="roni" /></h2>{history ? <><p>{history.index.episode_rule}</p><details><summary>Episode table</summary><table><thead><tr><th>Phase / period</th><th>Peak</th><th>Strength</th></tr></thead><tbody>{history.episodes.map(e => <tr key={`${e.phase}-${e.start_center_ym}`}><td><button type="button" onClick={() => jump(e.peak_center_ym)}>{e.phase === 'el_nino' ? 'El Niño' : 'La Niña'}<br />{e.start_season} – {e.end_season}</button></td><td>{e.peak_anom_c.toFixed(2)} °C</td><td>{e.strength}</td></tr>)}</tbody></table></details></> : WAIT}</section>
      <section><h2>03 — How it shows up in our data</h2><div className="enso-toggle"><button type="button" aria-pressed={!impactId} onClick={() => setImpactId(null)}>Monthly ocean</button>{impacts?.maps.map(m => <button type="button" key={m.id} aria-pressed={impactId === m.id} onClick={() => {setImpactId(m.id);setPlaying(false);}}>{m.label}</button>)}</div>
        {!impacts && WAIT}{impact && <><p>{impactHeadline(impact)}</p><p>{impact.n_el_nino} El Niño years · {impact.n_la_nina} La Niña years. Dots indicate false-discovery-rate-controlled cells.<InfoTip term="fdr" /></p><table><thead><tr><th>Region</th><th>Difference / 95% CI<InfoTip term="confidence" /></th><th>Significant</th></tr></thead><tbody>{impact.region_summaries.map(r => <tr key={r.region_id} className={focusedRegion===r.region_id ? "enso-region-focus" : undefined}><td>{r.label}</td><td>{r.diff.toFixed(3)} {r.units}<br />[{r.ci_low.toFixed(3)}, {r.ci_high.toFixed(3)}]</td><td>{r.significant ? 'Yes' : 'No'}</td></tr>)}</tbody></table></>}
      </section>
      <section><h2>04 — Sources & method</h2><p>NOAA CPC RONI; NOAA ERSST v6; NASA GPCP v3.3 and MERRA-2. Ocean anomalies use a 1991–2020 monthly baseline.</p><p>{impact?.method ?? 'Impact composites compare detrended seasonal values during El Niño and La Niña, with Benjamini–Hochberg false discovery rate control (q = 0.10).'}</p><p>Few events per phase limit precision. Regional associations do not establish causation. Reanalysis aerosols describe atmospheric optical depth, not direct surface exposure.<InfoTip term="aerosol" /></p><p>AI assisted the interface and implementation; numerical claims come from the supplied data.</p></section>
    </aside>
    <div className="enso-timeline" aria-label="RONI history and ocean playback">
      <div className="enso-controls"><button type="button" disabled={!frames.length} onClick={() => {setImpactId(null);setPlaying(!playing);}}>{playing ? 'Pause' : 'Play'}</button><label>Speed <select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label><input type="range" aria-label="Ocean month" min={0} max={Math.max(0,frames.length-1)} value={frame} disabled={!frames.length} aria-valuetext={current ? monthLabel(current.ym) : 'Data being built'} onChange={e => {setFrame(Number(e.target.value));setPlaying(false);setImpactId(null);}}/><output>{current ? monthLabel(current.ym) : 'Ocean data is being built'}{frames.length > loaded && ` · loaded ${loaded}/${frames.length}`}</output></div>
      {seasons.length ? <svg viewBox="0 0 1200 100" role="img" aria-label="RONI history: amber warm phases, blue cool phases. Use the episode table to jump to an event."><line x1="0" x2="1200" y1="44" y2="44" stroke="#536174" />{[-0.5,0.5].map(v => <g key={v}><line x1="0" x2="1200" y1={44-v*12} y2={44-v*12} stroke="#536174" strokeDasharray="4 4"/><text x="0" y={42-v*12}>{v > 0 ? '+' : ''}{v} °C</text></g>)}{seasons.map((s,i) => <rect key={s.center_ym} x={i/seasons.length*1200} y={s.anom_c >= 0 ? 44-s.anom_c*12 : 44} width={Math.max(1,1200/seasons.length)} height={Math.abs(s.anom_c*12)} fill={s.anom_c >= 0.5 ? '#dca35f' : s.anom_c <= -0.5 ? '#73b5dc' : '#708092'} onClick={() => jump(s.center_ym)}><title>{s.season} {s.year}: {s.anom_c} °C</title></rect>)}{peaks.map((e,i)=>{const at=seasons.findIndex(s=>s.center_ym===e.peak_center_ym);return at<0?null:<text key={e.start_center_ym} x={at/seasons.length*1200} y={i%2===0 ? 10 : 23} textAnchor="middle">{e.peak_center_ym.slice(0,4)} · {e.peak_anom_c.toFixed(1)} °C</text>;})}{seasons.filter(s => s.year%10 === 0 && s.season === 'DJF').map(s => <text key={s.center_ym} x={seasons.indexOf(s)/seasons.length*1200} y="95">{s.year}</text>)}</svg> : <p className="muted">RONI history is being built. Playback begins once verified frames are available.</p>}
    </div>
  </>;
}

import { useEffect, useState } from 'react';
import type { SeriesDoc } from '../../types';
import { loadEnsoData, validImpacts, type ImpactHistory } from '../../data/ensoHistory';
export default function EnsoConnection({ doc }: { doc: SeriesDoc }) {
  const [data,setData] = useState<ImpactHistory | null>(null);
  useEffect(() => {let alive=true; const refresh=()=>void loadEnsoData('impacts/index.json',validImpacts).then(d=>{if(alive)setData(d);});refresh();const timer=setInterval(refresh,300000);return()=>{alive=false;clearInterval(timer);};},[]);
  const map = data?.maps.find(m=>m.variable===doc.variable && m.id.endsWith(`_${doc.season.code}`) && m.region_summaries.some(r=>r.region_id===doc.region.id));
  if(!map)return null;
  return <a className="enso-connection" href={`#enso?region=${encodeURIComponent(doc.region.id)}&map=${encodeURIComponent(map.id)}`}>See how this may be connected to El Niño →</a>;
}

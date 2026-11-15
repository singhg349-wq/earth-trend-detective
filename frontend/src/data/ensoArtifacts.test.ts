import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { validHistory, validSst, validImpacts } from './ensoHistory';
const root=resolve('public/data/enso_history');
const read=(path:string)=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
it('accepts the supplied history, absolute SST and continuous anomaly contracts',()=>{
  const history=read('history.json'),sst=read('sst_global/index.json'),normal=read('sst_climatology/index.json');
  expect(validHistory(history)).toBe(true);expect(validSst(sst)).toBe(true);expect(validSst(normal)).toBe(true);
  expect(sst.frames[0].ym).toBe('1979-01');expect(sst.frames.at(-1).ym).toBe('2026-10');
  expect(sst.frames.filter((f:{ym:string})=>f.ym>='1997-03' && f.ym<='1998-07')).toHaveLength(17);
  expect(sst.frames.filter((f:{ym:string})=>f.ym>='2010-05' && f.ym<='2011-05')).toHaveLength(13);
  expect(normal.kind).toBe('absolute');expect(normal.frames).toHaveLength(12);
  for(const [directory,data] of [['sst_global',sst],['sst_climatology',normal]] as const) for(const frame of data.frames) expect(existsSync(resolve(root,directory,frame.file))).toBe(true);
});
it('has usable impact overlays, significance masks, and ordered regional intervals',()=>{
  const impacts=read('impacts/index.json');expect(validImpacts(impacts)).toBe(true);
  for(const map of impacts.maps){
    expect(existsSync(resolve(root,'impacts',map.overlay_file))).toBe(true);expect(existsSync(resolve(root,'impacts',map.sig_file))).toBe(true);
    for(const region of map.region_summaries){expect(Number.isFinite(region.diff)).toBe(true);expect(region.ci_low).toBeLessThanOrEqual(region.ci_high);}
  }
});

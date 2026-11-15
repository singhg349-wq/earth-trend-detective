import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { fetchCellSeries, type GridIndex } from '../lib/tiles';
import { metricById } from '../lib/metrics';
import { comparisonLabel } from './validation';
const basePath=resolve('public/data/grid');
const index=JSON.parse(readFileSync(resolve(basePath,'index.json'),'utf8')) as GridIndex;
const fetchImpl=async(url:string)=>{try {const body=readFileSync(url,'utf8');return {ok:true,status:200,json:async()=>JSON.parse(body)};}catch{return {ok:false,status:404,json:async()=>null};}};
it('loads soil land cells with inference and preserves ocean gaps',async()=>{
  for(const point of [{lat:53.55,lon:-113.49},{lat:-6.2,lon:106.8}]) {
    const outcome=await fetchCellSeries({...point,variable:'soil_moisture',season:'DJF'},{index,basePath,fetchImpl});
    expect(outcome.status).toBe('ok');if(outcome.status!=='ok')continue;
    expect(outcome.result.variable).toBe('soil_moisture');expect(outcome.result.trend.inference.status).toBe('ok');
    expect(outcome.result.trend.inference.p_value).toBeGreaterThanOrEqual(0);expect(outcome.result.trend.inference.p_value).toBeLessThanOrEqual(1);
    expect(comparisonLabel(outcome.result)).toContain('input reader not separately compared');
  }
  const ocean=await fetchCellSeries({lat:0,lon:-150,variable:'sm',season:'DJF'},{index,basePath,fetchImpl});
  expect(ocean.status).toBe('no-data');expect(metricById('soil_moisture')?.units).toBe('kg/m²');
});
it('uses the supplied soil anomaly baseline in all five seasonal sets',()=>{
  for(const season of ['ANN','DJF','MAM','JJA','SON']){
    const metadata=JSON.parse(readFileSync(resolve(`public/data/timelapse/sm_${season}/index.json`),'utf8'));
    expect(metadata.anomaly_baseline).toBe('2001–2020');expect(metadata.colormap.stops.length).toBeGreaterThan(2);
  }
});

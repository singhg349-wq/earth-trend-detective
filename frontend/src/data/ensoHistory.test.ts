import { describe, expect, it } from 'vitest';
import { colorGradient, impactHeadline, monthLabel, validHistory, validSst, type ImpactMap } from './ensoHistory';
describe('ENSO history contract', () => {
  it('rejects missing history and invalid numeric series', () => {
    expect(validHistory(null)).toBe(false);
    expect(validHistory({ index:{}, seasons:[{center_ym:'1997-12',anom_c:NaN}], episodes:[],current:{} })).toBe(false);
    expect(validHistory({ index:{}, seasons:[{center_ym:'1997-12',anom_c:2.4}], episodes:[],current:{} })).toBe(true);
  });
  it('accepts global monthly frames and rejects path traversal', () => {
    const fixture = { colormap:{stops:[[-3,'blue'],[3,'red']]}, frames:[{ym:'1997-12',file:'1997-12.png'}] };
    expect(validSst(fixture)).toBe(true);
    expect(validSst({...fixture,frames:[{ym:'1997-12',file:'../bad.png'}]})).toBe(false);
  });
  it('quotes only significant region summaries whose intervals exclude zero', () => {
    const map = {region_summaries:[{label:'Example',diff:-2,ci_low:-3,ci_high:1,significant:true,units:'mm/day'}]} as ImpactMap;
    expect(impactHeadline(map)).toBe('Regional differences are uncertain in this composite.');
    map.region_summaries[0].ci_high = -1;
    expect(impactHeadline(map)).toContain('associated with 2.00 mm/day lower');
    map.region_summaries[0].significant = false;
    expect(impactHeadline(map)).not.toContain('Example');
  });
  it('uses metadata stops and stable UTC month labels', () => {
    expect(monthLabel('1997-12')).toBe('December 1997');
    expect(monthLabel('01')).toBe('January');
    expect(colorGradient({name:'test',stops:[[-3,'blue'],[0,'white'],[3,'red']]})).toBe('linear-gradient(to right, blue 0%, white 50%, red 100%)');
  });
});

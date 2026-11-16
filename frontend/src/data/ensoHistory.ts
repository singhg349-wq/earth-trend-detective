export interface HistorySeason { season: string; year: number; center_ym: string; anom_c: number; phase: string }
export interface Episode { phase: string; start_season: string; end_season: string; start_center_ym: string; end_center_ym: string; peak_anom_c: number; peak_center_ym: string; strength: string }
export interface EnsoHistory { index: { name: string; episode_rule: string; url?: string }; seasons: HistorySeason[]; episodes: Episode[]; current: { latest_season: string; anom_c: number; phase: string } }
export interface SstFrame { ym: string; file: string; nino34_anom_c: number | null; nino34_sst_c?: number; label?: string }
export interface SstChapter { id?: string; title: string; start_ym?: string; end_ym?: string; peak_ym?: string; peak_anom_c?: number; start?: string; end?: string }
export interface ColorMap { name: string; stops: [number, string][] }
export interface SstHistory { units: string; baseline: string; colormap: ColorMap; frames?: SstFrame[]; months?: SstFrame[]; chapters: SstChapter[]; extent?: [number, number, number, number]; bbox?: [number, number, number, number] }
export interface RegionImpact { region_id: string; label: string; diff: number; ci_low: number; ci_high: number; significant: boolean; units: string }
export interface ImpactMap { id: string; variable: string; label: string; units: string; file: string; overlay_file?: string; sig_file?: string; colormap: ColorMap; n_el_nino: number; n_la_nina: number; method: string; region_summaries: RegionImpact[] }
export interface ImpactHistory { maps: ImpactMap[]; bbox: [number, number, number, number] }
export const ENSO_ROOT = `${import.meta.env.BASE_URL}data/enso_history/`;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
export function validHistory(v: unknown): v is EnsoHistory {
  if (!isObject(v) || !isObject(v.index) || !Array.isArray(v.seasons) || !Array.isArray(v.episodes) || !isObject(v.current)) return false;
  return v.seasons.every(s => isObject(s) && typeof s.center_ym === 'string' && typeof s.anom_c === 'number' && Number.isFinite(s.anom_c));
}
export function validSst(v: unknown): v is SstHistory {
  if (!isObject(v) || !isObject(v.colormap) || !Array.isArray(v.colormap.stops)) return false;
  const frames = v.frames ?? v.months;
  return Array.isArray(frames) && frames.length > 0 && frames.every(f => isObject(f) && typeof f.ym === 'string' && typeof f.file === 'string' && !f.file.includes('..'));
}
export async function loadEnsoData<T>(file: string, validate: (v: unknown) => v is T): Promise<T | null> {
  try { const response = await fetch(`${ENSO_ROOT}${file}`); if (!response.ok) return null; const body: unknown = await response.json(); return validate(body) ? body : null; } catch { return null; }
}
export function validImpacts(v: unknown): v is ImpactHistory { return isObject(v) && Array.isArray(v.maps) && v.maps.every(m => isObject(m) && typeof m.id === 'string' && Array.isArray(m.region_summaries) && isObject(m.colormap)); }
export function impactHeadline(map: ImpactMap): string {
  const region = map.region_summaries.filter(r => r.significant && Number.isFinite(r.diff) && r.ci_low * r.ci_high > 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
  return region ? `El Niño is associated with ${Math.abs(region.diff).toFixed(2)} ${region.units} ${region.diff < 0 ? 'lower' : 'higher'} values in ${region.label} than the cool (opposite) Pacific phase.` : 'Regional differences are uncertain in this composite.';
}
export function monthLabel(ym: string): string { return new Date(`${ym.length === 2 ? '2000-'+ym : ym}-15T12:00:00Z`).toLocaleDateString('en', { month: 'long', year: ym.length === 2 ? undefined : 'numeric', timeZone: 'UTC' }); }
export function colorGradient(map: ColorMap): string {
  const first = map.stops[0]?.[0] ?? 0, last = map.stops.at(-1)?.[0] ?? 1;
  return `linear-gradient(to right, ${map.stops.map(([value, color]) => `${color} ${(value-first)/(last-first || 1)*100}%`).join(', ')})`;
}

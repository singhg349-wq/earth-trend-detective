export type MetricId = 'precipitation' | 'temperature' | 'aerosol_optical_depth' | 'soil_moisture';
export interface MetricDef { id: MetricId; slug: 'precip' | 't2m' | 'aod' | 'sm'; label: string; shortLabel: string; units: string; trendUnits: string; decimals: number; source: string; sourceShort: string; doi: string | null; diverging: boolean }
export const METRICS: readonly MetricDef[] = [
  { id: 'precipitation', slug: 'precip', label: 'Rainfall', shortLabel: 'Rainfall', units: 'mm/day', trendUnits: 'mm/day per decade', decimals: 3, source: 'NASA GPCP v3.3', sourceShort: 'GPCP', doi: '10.5067/MEASURES/GPCP/DATA306', diverging: false },
  { id: 'temperature', slug: 't2m', label: 'Temperature', shortLabel: 'Temperature', units: '°C', trendUnits: '°C per decade', decimals: 3, source: 'NASA MERRA-2 T2M', sourceShort: 'MERRA-2', doi: '10.5067/AP1B0BA5PD2K', diverging: true },
  { id: 'aerosol_optical_depth', slug: 'aod', label: 'Aerosols (haze)', shortLabel: 'Aerosols', units: 'AOD (unitless, 550 nm)', trendUnits: 'AOD per decade', decimals: 4, source: 'NASA MERRA-2 aerosol optical depth at 550 nm', sourceShort: 'MERRA-2', doi: '10.5067/FH9A0MLJPC7N', diverging: false },
  { id: 'soil_moisture', slug: 'sm', label: 'Soil moisture (0–10 cm)', shortLabel: 'Soil moisture', units: 'kg/m²', trendUnits: 'kg/m² per decade', decimals: 2, source: 'NASA GLDAS Noah v2.1 (SoilMoi0_10cm_inst)', sourceShort: 'GLDAS v2.1', doi: '10.5067/LWTYSMP3VM5Z', diverging: false },
];
export function metricById(id: string): MetricDef | undefined { return METRICS.find(metric => metric.id === id); }
export function metricBySlug(slug: string): MetricDef | undefined { return METRICS.find(metric => metric.slug === slug); }

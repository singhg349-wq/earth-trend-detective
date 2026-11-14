export interface SeriesSourceInfo {
  product: string;
  version: string;
  var?: string;
  doi_or_url?: string;
}

export interface SeriesRegion {
  id: string;
  label: string;
  geometry?: string;
  bbox?: number[];
  cells_used: number;
  area_km2: number;
}

export interface SeriesSeason {
  code: string;
  year_label?: string;
  months?: number[];
  aggregation?: string;
}

export interface SeriesInference {
  status: string;
  p_value?: number | null;
  /** Slope interval per decade, `[low, high]`. */
  ci?: [number, number] | null;
  method?: string | null;
  strict_check_pass?: boolean | null;
  strict_check_p?: number | null;
  /** Detrended lag-1 correlation. */
  lag1?: number | null;
  caution?: boolean;
  ci_note?: string | null;
  n?: number | null;
}

export interface SeriesTrend {
  sen_slope_per_decade: number | null;
  intercept: number | null;
  method?: string;
  slope_units?: string;
  inference: SeriesInference;
}

export interface SeriesValidation {
  reference?: string;
  status: string;
  notes?: string;
}

export interface SeriesDoc {
  id: string;
  variable: string;
  units: string;
  source: SeriesSourceInfo;
  region: SeriesRegion;
  season: SeriesSeason;
  years: number[];
  values: Array<number | null>;
  coverage: number[];
  anomaly_baseline?: unknown;
  geometry_file?: string;
  template_summary: string;
  trend: SeriesTrend;
  validation: SeriesValidation;
  generated?: string;
  code_version?: string;
}

export interface SeriesSummary {
  id: string;
  label: string;
  variable: string;
  units: string;
  region_id: string;
  region_label: string;
  season: string;
  validation_status: string;
  inference_status?: string;
  fixture: boolean;
  source: {
    product: string;
    version: string;
  };
}

export interface TimelapseIndex {
  years: number[];
  units: string;
  vmin: number;
  vmax: number;
  colormap: string;
  extent: [number, number, number, number];
  source: string;
  fixture?: boolean;
}

export interface RegionFeature {
  type: 'Feature';
  properties: {
    id?: string;
    label?: string;
    label_point?: [number, number];
    [key: string]: unknown;
  };
  geometry: unknown;
}

export interface RegionsGeoJson {
  type: 'FeatureCollection';
  features: RegionFeature[];
}

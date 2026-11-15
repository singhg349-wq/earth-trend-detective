import { METHOD_CHECK } from '../data/validation';
export const GLOSSARY = {
  pValue: ['p-value', 'How unusual a trend this large would be if there were no real trend. It is not the probability that a trend is due to chance.'],
  mannKendall: ['Mann–Kendall test', 'Tests for a consistent increase or decrease across years without requiring normally distributed values. The main test uses the Hamed–Rao autocorrelation correction with three lags.'],
  hamedRao: ['Hamed–Rao correction', 'Adjusts the trend test variance using significant correlations in detrended ranks at the first three lags.'],
  senSlope: ["Sen's slope", 'The median of slopes between every pair of valid years; reported as change per decade. For example, +0.2 °C per decade describes warming over the fitted period.'],
  confidence: ['95% confidence interval', 'A range from a procedure that covers the true slope in 95% of repeated samples under its assumptions. This interval assumes independent years and can be too narrow when years correlate.'],
  prewhitening: ['Prewhitening sensitivity check', 'Mann–Kendall after classic Yue–Wang prewhitening removes estimated lag-1 dependence. It can also remove part of a real trend. We report it alongside the main test to show sensitivity to the method.'],
  autocorrelation: ['Autocorrelation', 'Similarity between values separated by a time lag. Lag-1 compares adjacent observations after removing the trend; values at or above 0.30 trigger a caution.'],
  fdr: ['False discovery rate', 'Benjamini–Hochberg control at q = 0.10 limits the expected proportion of false discoveries among selected map cells under the method’s assumptions. It is different from a single-cell 5% test.'],
  anomaly: ['Anomaly', 'The difference from a reference average, in the same units as the measured quantity. An anomaly of +1 °C means one degree warmer than that reference, not an absolute temperature of one degree.'],
  baseline: ['1991–2020 baseline', 'The average for each calendar month over 1991–2020, used as the reference for sea-surface-temperature anomalies.'],
  grid: ['1° grid cell', 'A one-degree latitude by one-degree longitude area. Values describe its area average, not a weather station or an exact street address.'],
  seasons: ['Season codes', 'DJF: December–February, labelled by January’s year; MAM: March–May; JJA: June–August; SON: September–November; ANN: January–December. Seasonal names refer to the Northern Hemisphere.'],
  aerosol: ['Aerosol optical depth', 'How much airborne particles attenuate light through the atmospheric column at 550 nm. Unitless; it is not a direct measurement of surface pollution or health exposure.'],
  soil: ['Soil moisture (0–10 cm)', 'Water mass per unit area in the upper 10 cm of soil, expressed in kg/m². These are NASA GLDAS Noah v2.1 model estimates over land, not direct measurements at an individual field. The soil-moisture timelapse baseline is 2001–2020.'],
  enso: ['El Niño / La Niña', 'Warm / cool phases of tropical Pacific ocean–atmosphere variability. Associated regional patterns vary between events and do not establish causation for a particular year.'],
  roni: ['RONI', 'NOAA’s Relative Oceanic Niño Index: a three-month tropical Pacific temperature index adjusted for the tropical ocean mean. Episodes require at least five consecutive overlapping seasons beyond ±0.5 °C.'],
  validation: ['Method check', METHOD_CHECK + ' Aerosols and soil moisture: input reader not separately compared.'],
} as const;
export type GlossaryTerm = keyof typeof GLOSSARY;

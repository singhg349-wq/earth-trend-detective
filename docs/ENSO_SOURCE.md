# ENSO index source decision

## Decision

The saved `nina34.anom.data` is labeled by its own footer as a monthly Niño 3.4 sea-surface-temperature anomaly series based on NOAA ERSST V6, using 1981–2010 as the anomaly baseline. It reports degrees Celsius. Its month columns are calendar months; each annual row has January through December in order. It is not a 3-month running mean. The local inventory says values use `-99.90` for unavailable months; these codes are missing data, never observations.

There is a provenance conflict that prevents treating those labels as fully reconciled identity. The NOAA PSL URL named by the file footer and the `INDICES.md` inventory identify this snapshot as ERSST V6 / 1981–2010. The separately saved `knmi_nino34_page.html` is a KNMI Climate Explorer start page, not a Niño 3.4 dataset specification; it does not establish the input SST product or baseline. The morning shortlist records that the separate NOAA PSL Niño 3.4 specification describes HadISST1.1 / 1981–2010, conflicting with the saved file's ERSST V6 label. The local evidence does not resolve whether the mismatch reflects a changed NOAA page, a changed series behind the URL, or a stale/misidentified saved snapshot. Do not claim independent verification of the underlying SST calculation from the filename or footer alone.

## Evidence inspected

- `D:\trend-detective-data\indices\nina34.anom.data`: header spans 1950–2026; annual rows place 12 values after each year. The footer says `NINA34`, `5N-5S 170W-120W`, `ERSST V6`, `Anomaly from 1981-2010`, `units=degC`, and points to NOAA PSL's Niño 3.4 page. The 2026 row ends with `-99.90` values, and the file ends with the same missing sentinel. The source label therefore supports the series definition above, while not independently resolving the source conflict.
- `D:\trend-detective-data\indices\INDICES.md`: inventory repeats ERSST V6, the 1981–2010 base, Celsius units, and `-99.90` missing-value handling; records 946 valid months from 1948-01 through 2026-10 and 2026-11/12 missing. This is useful saved-snapshot bookkeeping, not independent evidence for the upstream SST method.
- `D:\trend-detective-data\indices\knmi_nino34_page.html`: the saved page is the Climate Explorer general start page. It discusses general analysis tools and mentions other datasets, but contains no Niño 3.4 dataset metadata that could identify this index. The inventory explicitly says KNMI returned its start page and uses NOAA as fallback.
- `D:\trend-detective-data\indices\oni.data`: the footer identifies CPC ONI, sourced from NOAA PSL, as a three-month running mean of ERSST V6 SST anomalies in Niño 3.4; it says updated 2026-09-07. ONI is a distinct index definition, not another filename for the monthly anomaly series. The inventory records overlapping seasons labeled by their central month.
- `C:\dev\planner\projects\trend-detective\docs\planning\night-research\MORNING_SHORTLIST.md`, item 10: records the ERSST V6 versus HadISST1.1 identity conflict and recommends resolving it before use. This private note is cited here as review context only; no private planning material is copied into the public repository.

## Recommendation

For a predeclared ENSO association, use the saved CPC ONI series (`oni.data`) rather than `nina34.anom.data` while the latter's upstream identity remains unresolved. Name it CPC ONI, not “monthly Niño 3.4 anomalies.” Its 3-month values overlap and are serially dependent; use the season-center month explicitly and account for dependence in inference. Retain `nina34.anom.data` only as an unresolved candidate until the upstream product and baseline discrepancy is reconciled against an authoritative NOAA record. Exclude all `-99.9` / `-99.90` values as missing.

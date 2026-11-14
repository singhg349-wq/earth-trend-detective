# Data Sources

This project uses the following public datasets. All raw files remain outside the repository. Entries marked "to verify" need confirmation before publication.

---

## GPCP Monthly Version 3.3 (Primary)

- **Product**: Global Precipitation Climatology Project (GPCP) Monthly Analysis
- **Version**: 3.3
- **Variable**: `sat_gauge_precip` (satellite-gauge combined precipitation estimate)
- **Resolution**: 0.5° × 0.5° latitude–longitude grid
- **Record period**: January 1983 – December 2025 (we use DJF seasons 1984–2025, labelled by the January year)
- **License / Citation**: Adler, R. F., et al. (2018). *The Global Precipitation Climatology Project (GPCP) Monthly Analysis (Version 3.3)*. NASA GES DISC. **DOI: to verify**
- **Access URL**: <https://disc.gsfc.nasa.gov/datasets/GPCPMON_3.3/summary>
- **What we use it for**: Primary rainfall data for DJF (December–January–February) seasonal totals over Indonesia and coastal Peru regions.

---

## Natural Earth Admin 0 Countries Version 5.1.1

- **Product**: Natural Earth Cultural Vectors – Admin 0 Countries
- **Version**: 5.1.1
- **Variable**: Country polygons (admin-0 boundaries)
- **Resolution**: 1:10 million scale (suitable for regional masking at 0.5°)
- **Record period**: Static dataset (country boundaries as of release)
- **License / Citation**: Natural Earth. *Admin 0 – Countries*. Public domain. **Citation to verify**
- **Access URL**: <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/>
- **What we use it for**: Polygon masks to define "Indonesia" and "Peru" (coastal subset) regions for spatial averaging of GPCP grid cells.

---

## MERRA-2 M2TMNXSLV Version 5.12.4 (Temperature)

- **Product**: Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2)
- **Version**: 5.12.4
- **Variable**: `T2M` (2-meter air temperature), `TS` (surface skin temperature)
- **Resolution**: 0.5° × 0.625° (native); regridded to 0.5° × 0.5° for this project
- **Record period**: January 1980 – present (we use DJF 1984–2025 to match GPCP)
- **License / Citation**: Gelaro, R., et al. (2017). *The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2)*. **DOI: to verify**
- **Access URL**: <https://disc.gsfc.nasa.gov/datasets/M2TMNXSLV_5.12.4/summary>
- **What we use it for**: Supplemental temperature context (T2M) for the same regions and seasons; not used for the primary rainfall trend comparison.

---

## NOAA Niño 3.4 Index (ERSSTv5)

- **Product**: NOAA Physical Sciences Laboratory (PSL) – Niño 3.4 SST Anomaly Index
- **Version**: Source snapshot (ERSSTv5 basis)
- **Variable**: `nina34.anom.data` – monthly Niño 3.4 region SST anomaly (°C)
- **Resolution**: Monthly time series (single index value per month)
- **Record period**: January 1948 – present (we use DJF 1984–2025)
- **License / Citation**: NOAA PSL. *Niño 3.4 SST Anomaly Index (ERSSTv5)*. Public domain. **Citation to verify**
- **Access URL**: <https://psl.noaa.gov/data/correlation/nina34.anom.data>
- **What we use it for**: ENSO phase context (El Niño / La Niña years) for interpreting rainfall anomalies in the two regions.

---

## Notes

- DOIs and formal citations for GPCP v3.3 and MERRA-2 M2TMNXSLV 5.12.4 are marked "to verify" and must be confirmed from the GES DISC landing pages or the cited publications before any public release.
- Natural Earth data are public domain; the specific citation format should follow Natural Earth's recommended attribution.
- NOAA PSL indices are U.S. government works (public domain); the recommended citation format should be confirmed from the PSL website.
- No local file paths or internal data layouts are recorded here.
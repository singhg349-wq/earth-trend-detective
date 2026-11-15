# TrendTrace — Full Presentation Script, Demo Flow & Judge Q&A

> **2026 NASA Space Apps Challenge — *Be An Earth System Trend Detective!***  

> **Present Mode:** `https://trendtrace.earth-trend-detective-frontend.workers.dev/?present=1`  

> **Normal App (Judges / Q&A):** `https://trendtrace.earth-trend-detective-frontend.workers.dev`  

---


## SLIDE 1 — Opening & Challenge Hook (Taps 1–2 | ~25 sec)

### Tap 1 (Slide 1, Reveal 1/2 — Headline + Bullet 1):
> Good afternoon everyone. For the 2026 NASA Space Apps Challenge — Be An Earth System Trend Detective — we built TrendTrace. Earth's climate system is deeply interconnected, yet local trends often move in opposite directions. A single global driver, like El Niño, can warm or dry one region while pushing another the exact opposite way.

### Tap 2 (Slide 1, Reveal 2/2 — Bullet 2 / Segue):
> Our challenge was to take raw NASA mission and model archives and build a tool anyone can use to answer three questions for any place on Earth: what is changing, where and by how much, and whether it is actually statistically significant.


#### Potential Judge Q&A

- **Q: How does TrendTrace directly address the 'Be An Earth System Trend Detective!' challenge?**  
  A: The challenge specifically asks for a tool that selects variables measured by Earth science missions or produced by Earth science models, visualizes how they change over time, and determines what is changing, where, how much, and whether scientists call it 'significant.' TrendTrace implements all four of those steps across 64,800 global 1-degree cells.

- **Q: Doesn't NASA Giovanni or Climate Reanalyzer already let you plot a time series?**  
  A: They give you a raw time-series plot or a coloured map, often without autocorrelation correction or multiple-testing control. TrendTrace gives you an uncertainty-first verdict right beside the number — including explicitly saying 'No clear trend' when a visual slope is just noise — plus one-click El Niño context, with zero login or server.

- **Q: Why start with 'opposite local trends'?**  
  A: Because global averages hide local reality. Even when the same Pacific oscillation drives both, Alberta winters warm during El Niño while Indonesia gets drier and hazier. You need local spatial resolution and honest significance testing to see both.


## SLIDE 2 — The Problem & 231.3 GB Raw NASA/NOAA Archives (Taps 3–5 | ~35 sec)

### Tap 3 (Slide 2, Reveal 1/3 — Rainfall & Temperature):
> The data to answer those questions already exists — we downloaded 231.3 gigabytes of raw NASA and NOAA archives onto disk. That includes NASA GPCP v3.3 satellite-and-gauge rainfall from 1983 to 2025, and NASA MERRA-2 2-metre air temperature from 1980 to 2026.

### Tap 4 (Slide 2, Reveal 2/3 — Aerosols & Soil Moisture + v2.0 Audit):
> We also pulled MERRA-2 550 nm aerosol optical depth for haze, and NASA GLDAS Noah v2.1 topsoil moisture from 2000 onward. Crucially, we audited the older GLDAS v2.0 archive — 804 files — against v2.1 over their 2000–2014 overlap, found a +0.469 kg/m² step jump between forcing datasets, and deliberately withheld v2.0 so we wouldn't create fake trends.

### Tap 5 (Slide 2, Reveal 3/3 — Why It's Locked):
> In total, 8,970 raw files sat on disk — locked in gridded NetCDF formats that are unreadable without writing custom code, seasonal weighting, and statistical tests.


#### Potential Judge Q&A

- **Q: Why did you download 231.3 GB if you only processed 2,534 files?**  
  A: We pulled broader raw NASA GES DISC and NOAA collections during data discovery, including multi-variable archives and the 804 GLDAS v2.0 files we audited and excluded. From that 231.3 GB raw store, our production pipeline selected and processed the exact 2,534 monthly NetCDF and reference files needed for the four metrics and El Niño atlas.

- **Q: Why not splice GLDAS v2.0 (1948–2014) with v2.1 (2000–2026) to get a longer soil-moisture record?**  
  A: When we compared cosine-weighted land means over the 2000–2014 overlap, v2.1 was +0.469 kg/m² higher than v2.0 (with a 3.75 kg/m² spatial RMSE). Per NASA GES DISC guidance, stitching across forcing changes injects an artificial positive trend, so we kept pure v2.1 (319 files) and state the shorter 2000–2026 coverage openly.

- **Q: Are MERRA-2 and GLDAS direct satellite measurements?**  
  A: No — GPCP v3.3 is a merged satellite-gauge rainfall product, whereas MERRA-2 is an atmospheric reanalysis and GLDAS Noah is a land-surface model forced by observations. We explicitly label them as reanalysis and model estimates rather than raw station records.

- **Q: Is there any caveat with MERRA-2 aerosol optical depth (AOD) starting in 1980?**  
  A: Yes — MERRA-2 began assimilating MODIS aerosol retrievals around 2000, so pre-2000 AOD over land is largely model-driven. We disclose that observing-system transition right in the Sources tab and caution against over-interpreting pre-2000 AOD slopes.


## SLIDE 3 — What We Built: The Python Pipeline & Browser Engine (Taps 6–7 | ~30 sec)

### Tap 6 (Slide 3, Reveal 1/2 — Files → Tiles → Cells):
> So we wrote a Python pipeline using xarray, NumPy, and SciPy to distill those 2,534 raw NetCDF and index files from our 231.3 GB archive into 11,055 compact JSON map tiles — just 250.65 megabytes total — covering all 64,800 1-degree cells on Earth across 5 seasons and 4 metrics.

### Tap 7 (Slide 3, Reveal 2/2 — Static Architecture & Speed):
> Because everything is pre-tiled into static JSON and 809 timelapse PNGs, there is zero backend server. You can click any cell on the globe or search over 25,000 cities offline, and your browser computes the full trend statistics in under a millisecond.


#### Potential Judge Q&A

- **Q: How can the browser run full Mann–Kendall and Sen's slope in under 1 millisecond?**  
  A: Each 10°×10° JSON tile stores compact int16 seasonal values (42 to 46 numbers per cell). We ported our Python statistical engine to TypeScript, and on a warmed tile it runs Sen's slope, the 95% confidence interval, Hamed–Rao, and Yue–Wang in ~0.3 to 1.0 ms — verified against Python on all 26 parity test cases within 1e-9 / 1e-6 relative tolerance.

- **Q: How did you handle seasonal averaging from monthly files?**  
  A: We used calendar day-weighted seasonal means (for example DJF = Dec/Jan/Feb weighted by 31/31/28 days, labeled by the January year) so leap years and unequal month lengths don't bias seasonal totals.

- **Q: How do you regrid GPCP (0.5°) and MERRA-2 (0.5° × 0.625°) to 1° × 1°?**  
  A: Area-weighted (cosine-latitude) spatial averaging onto a uniform 1°×1° global grid (64,800 cells), matching standard climate aggregation.

- **Q: Where does the offline city search data come from?**  
  A: From GeoNames (cities with population >= 15,000, CC BY 4.0), trimmed to the top 25,000 cities (~1.5 MB JSON) loaded lazily on first keystroke, so place search works instantaneously even on shaky conference Wi-Fi.


## SLIDE 4 — How Do We See If a Trend Is Statistically Significant? (Taps 8–11 | ~40 sec)

### Tap 8 (Slide 4, Reveal 1/4 — Mann–Kendall + Hamed–Rao):
> Before I show the live demo, here is how TrendTrace decides whether a trend is statistically significant. First, we run a Mann–Kendall test with Hamed–Rao 3-lag autocorrelation correction, checking at the p < 0.05 (5% significance) level so year-to-year climate persistence doesn't trigger false positives.

### Tap 9 (Slide 4, Reveal 2/4 — Sen's Slope + 95% CI):
> Second, we compute Sen's slope — the median of all pairwise slopes — paired with a 95% confidence interval, which resists extreme El Niño or La Niña outlier years.

### Tap 10 (Slide 4, Reveal 3/4 — Yue–Wang Prewhitening):
> Third, we run a stricter Yue–Wang prewhitening sensitivity check and flag a caution whenever the two tests disagree.

### Tap 11 (Slide 4, Reveal 4/4 — Benjamini–Hochberg FDR + NASA Giovanni):
> Fourth, on global maps where 64,800 cells are tested at once, we apply Benjamini–Hochberg false discovery rate control at q = 0.10. And we validated our aggregation and trend-testing pipeline directly against NASA Giovanni reference series before applying that same code path across every dataset.


#### Potential Judge Q&A

- **Q: What does p < 0.05 actually mean — does it mean there's a 95% chance the trend is real?**  
  A: No, and our UI explicitly warns against that misconception. A p-value < 0.05 means that if there were truly no long-term trend, seeing a shift this consistent by random year-to-year variability would be unusual (under 5%).

- **Q: Isn't your 95% Sen confidence interval calculated assuming independent years, while your p-value is Hamed–Rao corrected?**  
  A: Yes — great catch. Standard Sen confidence intervals assume independent observations, which can make the interval slightly narrower when years correlate. We disclose that exact note right under the CI in the app, and pair it with the Hamed–Rao p-value and a lag-1 >= 0.30 caution badge.

- **Q: Why didn't you run NASA Giovanni checks on all 40 regional series one by one?**  
  A: We validated the exact regridding, day-weighted seasonal averaging, and Mann–Kendall/Sen pipeline against NASA Giovanni exports on reference rainfall series (Coastal Peru and Indonesia DJF) to prove our math matches NASA's own tool, then applied that identical pipeline across all metrics. Any series can also be exported as CSV or JSON for individual verification.

- **Q: Why do sub-period slices (first half / second half) hide p-values?**  
  A: To prevent p-hacking. Slicing a 46-year series into 20-year windows inflates false positives, so sub-periods show descriptive Sen slopes only without inferential p-values.

- **Q: Why does the right-hand ranking list use raw p-values while maps use Benjamini–Hochberg FDR?**  
  A: The ranking list is for quick navigation across 10 pre-selected study regions and carries an explicit footnote stating it shows raw p-values without multiple-testing correction, whereas the global 64,800-cell maps control family-wise false discoveries at q = 0.10.


## LIVE DEMO PART 1 — Step-by-Step Alberta Investigation (Taps 12–17 | ~50 sec)

### Tap 12 (Demo 1/10 — Live 3D Globe):
> Let's walk through it live. We open on the 3D globe with 64,800 clickable cells and the regional ranking bar.

### Tap 13 (Demo 2/10 — Open Investigation Builder):
> I'll start an investigation step by step.

### Tap 14 (Demo 3/10 — Select Alberta / Prairies):
> First, I pick our home region: Alberta and the Prairies.

### Tap 15 (Demo 4/10 — Select 2 m Temperature & Dec–Feb):
> Next, I select 2-metre Air Temperature from NASA MERRA-2, and the winter Dec–Feb season.

### Tap 16 (Demo 5/10 — Run Analysis → Alberta Result):
> When we run it, look at the verdict: Alberta winters show +0.18 °C per decade — it looks like a warming slope — but right next to it, our model says 'No clear trend, p = 0.29.'

### Tap 17 (Demo 6/10 — Scroll Down to Graph & Statistical Checks):
> Scrolling down, you can see all 46 winters from 1981 to 2026, with big year-to-year swings from −20 °C to −11 °C, and the full Hamed–Rao and prewhitening checks right underneath.


#### Potential Judge Q&A

- **Q: What happens if someone clicks the North Pole on the globe?**  
  A: Clicking a high-latitude cell (|lat| >= 80°) still computes the 1° MERRA-2 trend, and our UI explicitly displays a caution banner: 'Single 1° polar cell — small area and polar-night coverage' so nobody over-interprets a single polar pixel.

- **Q: Wait — does TrendTrace say Alberta isn't warming?**  
  A: No! In our Dec–Feb winter temperature series (1981–2026), the Sen slope is +0.18 °C/decade, which is positive, but winter-to-winter variability in Alberta is huge (spanning nearly 10 °C), so p = 0.29 is not statistically significant at the 5% level. Meanwhile, Alberta's GLDAS winter topsoil moisture DOES show a significant −1.80 kg/m²/decade drying trend (p = 0.003). Being honest about what is and isn't significant is the whole point.


## MID-DEMO CARD 1 — Annotated Alberta Result (Taps 18–20 | ~25 sec)

### Tap 18 (Card 1, Reveal 1/3 — Apparent Slope):
> To break down what you just saw in Alberta: first, the apparent Sen's slope is +0.18 °C per decade — visually it looks like a warming line.

### Tap 19 (Card 1, Reveal 2/3 — 95% Confidence Interval):
> Second, the 95% confidence interval runs from −0.33 to +0.73 °C per decade — it crosses zero, meaning the uncertainty spans both cooling and warming.

### Tap 20 (Card 1, Reveal 3/3 — Significance Verdict):
> Third, the Hamed–Rao p-value is 0.29 (and prewhitening is 0.33), which fails the 5% significance level. So there IS a visual trend line, but it is NOT statistically significant.


#### Potential Judge Q&A

- **Q: Why show a 'not significant' result first instead of your strongest trend?**  
  A: Because anyone can colour a map red. The hardest — and most honest — thing in climate communication is telling a user when a noisy 46-year series does NOT cross the threshold for statistical significance.


## LIVE DEMO PART 2 — Compare Alberta vs Amazon & Card 2 (Taps 21–23 | ~40 sec)

### Tap 21 (Demo 7/10 — Compare Alberta vs Amazon Temperature):
> Now let's click Compare and add the Amazon using the exact same metric — Dec–Feb 2-metre Temperature — so both share one axis.

### Tap 22 (Demo 8/10 — Scroll Down to Compare Both Graphs):
> Scrolling down to the two charts side by side: if you just eyeball the two lines, both regions appear to trend upward.

### Tap 23 (Mid-Demo Card 2 — Graphs, p-values & Significance Compared):
> Here is why our statistical engine matters. Both graphs slope upward — Alberta at +0.18 °C per decade and the Amazon at +0.25 °C per decade. But Alberta's 95% CI crosses zero with p = 0.29 (not significant), whereas the Amazon's 95% CI is +0.14 to +0.37 with p < 0.001 — statistically significant at the 5% level.


#### Potential Judge Q&A

- **Q: How does Compare handle two metrics with different units, like Soil Moisture vs Temperature?**  
  A: When units match (like Temperature vs Temperature), they share one axis. When units differ, Compare automatically renders independent axes and explicitly states that no direct slope-difference claim is made.


## LIVE DEMO PART 3 — Library & El Niño Segue (Taps 24–25 | ~35 sec)

### Tap 24 (Demo 9/10 — Library):
> From any investigation you can save results to the Library, reopen them, or jump straight to regional presets. Now — why do Alberta winters swing by 10 degrees while the Amazon warms?

### Tap 25 (Demo 10/10 — El Niño Impact Map, Alberta +1.51 °C):
> One Pacific driver connects both places. Switching to our El Niño atlas — built from 921 NOAA RONI seasons and 574 ERSST v6 ocean frames — here is the detrended difference between El Niño and La Niña winters. Alberta winters are +1.51 °C warmer in El Niño years, and Amazon winters are +0.82 °C warmer and −0.95 mm/day drier — with dots marking cells that pass false discovery rate control.


#### Potential Judge Q&A

- **Q: Why didn't you include an El Niño forecasting / prediction model?**  
  A: We actually built an El Niño forecast model early in the hackathon and tested it honestly on historical data. It worked 3 months ahead, was borderline at 6, and failed at 9 and 12 months. Rather than show a weak forecast, we deleted all prediction code and focused on verifiable historical composites framed strictly as associations, not causation.

- **Q: How were the El Niño impact maps tested for significance?**  
  A: We linearly detrended each season (so long-term warming doesn't masquerade as an El Niño signal), took El Niño minus La Niña winters, ran 2,000 permutation tests per cell, and applied Benjamini–Hochberg FDR at q = 0.10, plus 2,000-resample bootstrap CIs for the regional averages.

- **Q: Why RONI instead of ONI?**  
  A: NOAA CPC's Relative Oceanic Niño Index (RONI) removes the background tropical ocean warming trend so modern El Niño events aren't artificially inflated by global ocean warming.


## SLIDE 6 & SLIDE 7 — Impact, Audience & Closing (Taps 26–28 | ~30 sec)

### Tap 26 (Slide 6, Reveal 1/2 — Who It's For):
> TrendTrace is built for researchers, water and agricultural planners, science journalists, and students — giving anyone accessible scientific rigor in seconds with plain-language verdicts, uncertainty bounds, and inline glossary definitions.

### Tap 27 (Slide 6, Reveal 2/2 — Export, DOIs & What's Next):
> Every result can be exported as CSV or JSON with full NASA source DOIs for reproducibility. Next, we want to expand individual Giovanni comparisons across temperature, aerosols, and soil moisture, add all five seasons to named regions, and explore sub-period significance.

### Tap 28 (Slide 7 — Closing Slide):
> Try it live right now at trendtrace.earth-trend-detective-frontend.workers.dev or scan the QR code. Click anywhere on Earth, quantify change, and verify significance. Thank you — we're ready for your questions.


#### Potential Judge Q&A

- **Q: Who has actually used this outside your team?**  
  A: It is a 48-hour hackathon build, so it hasn't been deployed into an operational agency decision yet. Our immediate next step is putting it in front of Alberta agricultural extension specialists, journalism students, and educators.

- **Q: Your footer says 'Built with AI coding assistance.' What did your team personally do?**  
  A: We chose the NASA datasets, designed the statistical methodology (Hamed–Rao, Sen+CI, Yue–Wang, BH-FDR), audited and withheld GLDAS v2.0 after finding the +0.469 kg/m² jump, ran the Giovanni comparisons, deleted our own El Niño forecast model when hindcasts failed at 9–12 months, and verified every number on screen against the raw data files.

- **Q: How much does it cost to host?**  
  A: $0 — all 12,599 static assets build into a static Cloudflare Workers/Pages bundle with zero runtime server or database.

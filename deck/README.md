# TrendTrace — Presentation Decks (`deck/`)

This folder holds the generator script and exported 7-slide presentation deliverables for **TrendTrace** (`https://trendtrace.earth-trend-detective-frontend.workers.dev`, `trendtrace.earth` custom domain coming):

- **`build_decks.py`**: Python (`python-pptx 1.0.2`) script that builds both PPTX files deterministically on a 16:9 dark theme (`13.333 × 7.5 in`, every text run `>= 20 pt`, alt text on shapes/images, full presenter notes on all 7 slides).
- **`TrendTrace.pptx`**: Animated edition with PowerPoint 2010+ OpenXML timelines on every slide (`TimeLine.MainSequence.Count`: Slide 1 = 99, Slide 2 = 25, Slide 3 = 21, Slide 4 = 57, Slide 5 = 16, Slide 6 = 12, Slide 7 = 8) plus slide fade transitions.
- **`TrendTrace_safe.pptx`**: Static fallback edition without OpenXML animation blocks (identical layout and presenter notes).
- **`TrendTrace.pdf`**: 7-page PDF exported directly from `TrendTrace.pptx` via Microsoft PowerPoint COM (`SaveAs(..., 32)`).
- **`assets/slide6_sst_1997_12.png`**: 1440×720 composite of real ERSST v6 December 1997 SST anomalies (`data/artifacts/enso_history/sst_global/1997-12.png`, transparent land) composited over Natural Earth 5.1.1 10m land/coastlines for crisp PPTX embedding on Slide 6 alongside `data/artifacts/enso_history/impacts/precip_DJF.png`.
- **`preview/slide_01.png` .. `preview/slide_07.png`**: 1920×1080 PNG exports from PowerPoint COM used for visual inspection (zero clipping or overlapping text verified).
- **`CHEAT_SHEET.pdf`**: Printable 2-page presenter reference exported from [docs/submission/00_CHEAT_SHEET.md](../docs/submission/00_CHEAT_SHEET.md).

## Regenerate

```powershell
python deck/build_decks.py
```

To verify animations and re-export PDF + PNGs in Windows PowerPoint COM:

```powershell
$pp = New-Object -ComObject PowerPoint.Application
$anim = $pp.Presentations.Open((Resolve-Path 'deck\TrendTrace.pptx').Path, $true, $false, $false)
$anim.SaveAs((Join-Path (Resolve-Path 'deck').Path 'TrendTrace.pdf'), 32)
```

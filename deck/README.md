# TrendTrace — Presentation Decks (`deck/`)

This folder holds the R5 Present-twin generator script and exported 7-slide presentation deliverables for **TrendTrace** (`https://trendtrace.earth-trend-detective-frontend.workers.dev`, `trendtrace.earth` custom domain coming):

- **`build_decks.py`**: Python (`python-pptx`) script mirroring the website Present mode visual system (`frontend/src/present/blobs.ts`, `steps.ts`, `scenes.tsx`, `present.css`, `docs/workers/R5_PRESENT_HANDOFF.md`): 16:9 pure black `#000000` stage with `frontend/public/assets/present/grain.png` texture, persistent grainy gradient blobs (`!!b0`–`!!b3`) in Earth colors (`#0b3d91`, `#1fb5c9`, `#f2a541`, `#ff5a3c`, `#8fe3c3`), `Instrument Serif` display typography + `Segoe UI` metadata, letter-weave wordmarks (`TRENDTRACE`, `EL NIÑO`), native Amazon Dec–Feb 1981–2026 vector chart, and `qr-live.svg` card.
- **`fonts/`**: Open Font License `InstrumentSerif-Regular.ttf`, `InstrumentSerif-Italic.ttf`, and `OFL.txt` (installed per-user on Windows and embedded in both PPTX files via PowerPoint COM).
- **`TrendTrace.pptx`**: Primary Morph deck (`EntryEffect = 3954`, `0.72 s` on Slides 2–7 across persistent `!!b0`–`!!b3` blobs) plus click-free staggered fade-in entrances (`TimeLine.MainSequence.Count`: `6, 8, 8, 47, 71, 11, 18`).
- **`TrendTrace_safe.pptx`**: Fade-only fallback edition (`320 ms` fade transitions, `MainSequence.Count = 0`, identical 7 slides, embedded fonts, and speaker notes).
- **`TrendTrace.pdf`**: 7-page PDF exported directly from `TrendTrace.pptx` via Microsoft PowerPoint 16.0 COM (`SaveAs(..., 32)`).
- **`preview/slide_01.png` .. `preview/slide_07.png`**: 1920×1080 PNG exports from PowerPoint COM used for visual inspection (zero clipping or overlapping text verified).
- **`CHEAT_SHEET.pdf`**: Printable 2-page presenter reference exported from [docs/submission/00_CHEAT_SHEET.md](../docs/submission/00_CHEAT_SHEET.md).

## Regenerate

```powershell
python deck/build_decks.py
```

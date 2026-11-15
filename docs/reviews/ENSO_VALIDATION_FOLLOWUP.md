# ENSO validation recovery — 2026-11-15

Argon's validation dispatch failed after quota exhaustion and terminal loss. Its earlier completion report is not evidence of completion of this follow-up.

Direct checks against the current integrate checkout:

- All 11 NOAA reference SHA-256 values match MANIFEST.json.
- A temporary copy of the reference bundle was modified by appending bytes to RONI.ascii.txt. The integrity checker rejected it (10/11 matching). Original references were untouched.
- The model package backend/enso_outlook, evaluation script, test_enso_outlook.py, and data/artifacts/enso_outlook.json were missing on inspection, despite earlier reports. Cause is unknown.
- Recovered the missing artifact from the surviving frontend/dist/data/enso_outlook.json, after checking the four required top-level keys. This preserves an earlier build's output; it does not rerun or independently validate the model.
- After recovery, python scripts/check_data_integrity.py passed all four checks (20 series; matching lengths; outlook keys; 11 reference hashes).

Still unresolved: recover model/evaluation/test source, verify probability normalization and optimizer convergence, and reproduce the hindcast. Do not claim the original model's own loader passed a tamper test: the test above exercises scripts/check_data_integrity.py.

Interpretation remains qualified by the existing bootstrap report: strongest evidence at 3 months, borderline at 6, no demonstrated skill at 9, negative at 12. Extra predictors have not demonstrated improvement over SST-only. Evaluation uses revised historical archives, not historical real-time data vintages. No new scientific validation or browser QA is claimed here.

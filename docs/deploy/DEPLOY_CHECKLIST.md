# Deploy checklist (written by the Watchdog, 15 Nov 2026 ~06:00; NOTHING has been deployed)

Luna (the engineering agent) never ran overnight, so this checklist was written by the Watchdog from commands it ran. See `docs/DEPLOY.md` for the Vercel limits research.

## Measured facts (verified 15 Nov)
- Build: `cd frontend && npm run build` -> output `frontend/dist`, built OK in ~26 s.
- `dist` total = **198 MB**; `dist/data` = **195 MB** (the 6,480 grid tiles + artifacts); `dist/assets` = 3.4 MB (largest: `earth-blue-marble.jpg`, JS bundle ~1.4 MB, gzip ~393 kB).
- The app is a static site: no Python API is needed. (Backend tests pass but the site does not call it.)
- `frontend/vercel.json`: `buildCommand: npm run build`, `outputDirectory: dist`, `framework: vite`. Fine. There is no root `vercel.json`, so set **Root Directory = `frontend`** in Vercel.
- Secrets scan of `frontend/src` and `frontend/dist` for `sk-...`, `AKIA...`, `api_key=` patterns: no hits. No `.env*` files exist in the repo root (not opened).

## Biggest risk: the 195 MB data folder
`npm run build` runs `scripts/copy-data.mjs`, which copies `data/artifacts/**` into `public/data`. So the data must be present in whatever Vercel builds from.
- **Git-based deploy (recommended in `docs/DEPLOY.md`)**: you must commit `data/artifacts/` (including `grid/`) and push. This is a commit/push, which nobody did overnight.
- **CLI deploy of the prebuilt folder**: `cd frontend && npx vercel deploy --prebuilt` is not applicable without `vercel build`; simplest is `npx vercel deploy frontend/dist --prod` after `npm run build`. The Hobby CLI upload limit is 100 MB (per `docs/DEPLOY.md`), and `dist` is 198 MB, so this may be refused. If refused, use Git-based deploy or host `dist/data` on Cloudflare Pages (25 MiB per file, 20k files) as described in `docs/DEPLOY.md`.
- Limits NOT re-verified tonight; re-check vercel.com/docs/limits.

## Steps
1. Check the date/time against Edmonton local time (PC clock may be 1 h off). Deadline 15 Nov 23:59 America/Edmonton.
2. `cd frontend; npm run build` (must end "built in ...").
3. Exclude from anything public: `.env*`, `docs/workers/`, `docs/overnight/`, backups, `.claude/`.
4. Deploy on Vercel (Git import with Root Directory `frontend`, or CLI). Copy the production URL.
5. Domain: in Vercel -> Project -> Settings -> Domains, add the GoDaddy domain. Vercel shows the exact A / CNAME records: copy those exact values into GoDaddy DNS. Do not guess values. DNS can take minutes to hours, so keep the vercel.app URL as the fallback in the submission.
6. **Logged-out test**: open the public URL in a private window with no sign-in. Click Try an investigation -> Indonesia vs Coastal Peru; click Edmonton on the globe; open the El Niño page; confirm no console errors and that tiles load (Network tab shows 200s for `/data/grid/...`).
7. Only then paste the URL into the submission form and click **Submit for Judging**.

## Rollback
Vercel -> Deployments -> pick the last good deployment -> "Promote to Production" (or Instant Rollback). Domain DNS can stay unchanged.

## Not verified
Actual Vercel deploy, DNS, upload-size acceptance, browser rendering of the site (no browser QA ran overnight; see cheat sheet).

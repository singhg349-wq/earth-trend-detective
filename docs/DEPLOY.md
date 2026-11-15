# DEPLOYMENT GUIDE

Current deployment information for **TrendTrace** (`https://trendtrace.earth-trend-detective-frontend.workers.dev`, `trendtrace.earth` custom domain coming).

## Live Production Hosting — Cloudflare Workers (Static Assets via `frontend/wrangler.jsonc`)

Cloudflare Pages now deploys static sites as Cloudflare Workers using `frontend/wrangler.jsonc`.

1. Build the static frontend bundle (`frontend/dist/`, `12,592` files, `297,944,548` bytes).
2. Deploy via Wrangler (supervisor deploys):
   ```powershell
   npx wrangler deploy
   ```
   *(Configured via `frontend/wrangler.jsonc` — Pages now deploys as Workers.)*
3. Live URL: `https://trendtrace.earth-trend-detective-frontend.workers.dev` (`trendtrace.earth` custom domain coming).

---

## Legacy Notes (Pre-Rename Reference)

Previously considered fallback deployment notes for the earlier prototype:

## Online Build (Static Only - Recommended)

### Vercel (Frontend - Static)

**Vercel Hobby (free) plan limits that matter for a static site with a large data folder (verified 2026-11-14 from vercel.com/docs/limits and vercel.com/pricing):**

| Limit | Hobby Value | Notes |
|-------|-------------|-------|
| **Max deployment size (source upload via CLI)** | 100 MB | Applies only to `vercel deploy` CLI uploads; Git-based deployments clone the repo instead |
| **Max files per deployment (source via CLI)** | 15,000 | Applies only to CLI uploads; Git-based deployments not explicitly limited but large repos slow cloning |
| **Per-file size limit** | No explicit limit | GitHub limits files to 100 MB; Vercel has no separate per-file limit for static output |
| **Bandwidth per month (Fast Data Transfer)** | 100 GB | Included on Hobby; then paid on Pro |
| **CDN Requests per month** | 1M | Included on Hobby |
| **Build time per deployment** | 45 minutes | Hard limit; fails if exceeded |
| **Disk size** | 64 GB | Total disk available |
| **Deployment storage** | 10 GB | Keeps previous deployments for instant rollback |
| **Blob storage** | 1 GB/month | Separate object store; not used for static build output |
| **Concurrent builds** | 1 | One at a time on Hobby |

**Sources:**
- https://vercel.com/docs/limits (last updated 2026-09-16)
- https://vercel.com/pricing (read 2026-11-14)
- https://vercel.com/docs/limits/fair-use-guidelines (last updated 2026-11-12)

**Our data payload:** ~260 MB uncompressed JSON tiles, ~11,000 files, each < 300 KB, gzipped on the host.

**Does this fit the free limits?**

**Mostly yes, with caveats:**
- ✅ File count (11,000) < 15,000 CLI limit; Git deployments have no published file-count limit
- ✅ Bandwidth (100 GB/mo) is ample for JSON tiles
- ✅ Deployment storage (10 GB) >> 260 MB
- ✅ Build time (45 min) should handle 11k static files
- ⚠️ **Source upload limit (100 MB) is exceeded by 260 MB payload** — this limit applies to `vercel deploy` CLI uploads. For Git-based deployments (recommended), Vercel clones the repo, so the 100 MB CLI limit does **not** directly apply. However, a 260 MB+ Git repo is large; GitHub recommends < 1 GB and warns at 2 GB. Vercel has no published max repo size for Git imports, but very large repos slow builds and may hit the 45-min build timeout.
- ⚠️ **No explicit output-size limit**, but output files count toward deployment storage (10 GB) and build time.

**Verdict:** A Git-based Vercel deployment *can* work, but the 260 MB data folder pushes against practical limits (repo size, clone time, build time). It is safer to keep the data off Vercel.

---

### Fallback Option 1: Separate Static Host for Data (Cloudflare Pages or GitHub Pages)

Host the ~11,000 JSON tiles on a separate static host; the Vercel frontend fetches them via absolute URLs.

| Host | Free Tier Limits | CORS Notes |
|------|------------------|------------|
| **Cloudflare Pages** | Unlimited bandwidth, 20k files/deploy, 25 MiB/file, 500 builds/mo, custom domains | ✅ CORS headers configurable via `_headers` file; add `Access-Control-Allow-Origin: *` for public JSON |
| **GitHub Pages** | 1 GB storage, 100 GB bandwidth/mo, 10 builds/mo, Jekyll or static | ✅ CORS: GitHub Pages serves `Access-Control-Allow-Origin: *` by default for static files |
| **Netlify** | 100 GB bandwidth, 300 build min/mo, 500 sites, 10 GB storage | ✅ CORS configurable via `_headers` or `netlify.toml` |

**Implementation:**
1. Build step copies `data/artifacts/**/*.json` to a separate repo/branch (e.g., `gh-pages` or a dedicated data repo)
2. Deploy that repo to Cloudflare Pages / GitHub Pages / Netlify
3. Frontend reads `NEXT_PUBLIC_DATA_BASE_URL` (e.g., `https://data.example.com/`) and fetches tiles from there
4. Ensure the data host returns `Access-Control-Allow-Origin: *` (or your Vercel domain) so browser fetches succeed

**Pros:** Vercel deployment stays tiny (< 10 MB), fast builds, unlimited bandwidth on Cloudflare Pages.
**Cons:** Two deployments to manage; CORS must be correct; data URLs are absolute (cache-busting via query param or immutable filenames recommended).

---

### Fallback Option 2: Binary Tile Format (e.g., FlatGeobuf / PMTiles / Zarr)

Convert the 11,000 JSON tiles (~260 MB) to a single binary tile archive (~94 MB estimated) served as one file or a small tile pyramid.

| Format | Typical Size Reduction | Client Library | Notes |
|--------|------------------------|----------------|-------|
| **FlatGeobuf** | ~60-70% | `flatgeobuf` (JS/WASM) | Random-access via HTTP Range; single file |
| **PMTiles** | ~60-70% | `pmtiles` (JS) | Single file, byte-range reads, designed for map tiles |
| **Zarr / Parquet** | ~50-70% | `zarr-python`, `parquet-wasm` | Columnar; good for time-series slicing |

**Estimated total:** ~94 MB (single file or < 100 tiles) — well under Vercel's 100 MB CLI upload limit and 15k file limit.

**Implementation:**
1. Offline conversion script (Python) reads `data/artifacts/*.json`, writes FlatGeobuf/PMTiles to `public/data/tiles.fgb`
2. Commit the binary file(s) to the repo (now ~94 MB total repo size)
3. Frontend uses WASM client to query byte ranges — no CORS issues (same origin)
4. Vercel deployment size ~100 MB → fits Hobby CLI limit if ever needed; Git deploy works easily

**Pros:** Single deployment, no CORS, fast random access, smaller total size, simpler architecture.
**Cons:** Requires WASM client in browser; conversion step; less human-readable than JSON.

---

### Vercel Configuration for Static JSON Serving (if keeping JSON on Vercel)

```json
{
  "version": 2,
  "static": [
    {
      "source": "/data/artifacts/**/*.json",
      "headers": {
        "cache-control": "public, max-age=3600, immutable",
        "access-control-allow-origin": "*"
      }
    }
  ]
}
```

### Steps for Vercel Deployment (Static Build):
1. Create a Vercel account at vercel.com
2. Connect your Git repository
3. Set build command: `npm run build` (or create one if needed)
4. Set output directory: `dist` (or `./` for single-page app)
5. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_API_URL`: `/api` (if using API routes)
   - `NEXT_PUBLIC_DATA_BASE_URL`: `/data/artifacts` (or external CDN URL if using Fallback 1)
6. Configure `vercel.json` for static JSON serving (see above)
7. Deploy

**CORS Considerations:**
- Vercel automatically handles CORS for static files
- For API routes, Vercel automatically sets CORS headers
- Static JSON files served from `public/data/` are accessible from any origin when `access-control-allow-origin: *` is set

### Data Preparation for Static Build:
1. Copy all `data/artifacts/*.json` files to `frontend/public/data/`
2. Create `frontend/public/index.html` that loads the React app
3. Configure the app to read JSON from relative paths (not from backend)
4. Ensure the app gracefully handles missing data

---

## Alternative: Streamlit on Hugging Face Spaces (Optional)

**Hugging Face Spaces free tier includes:**
- 900 seconds of "space time" per day
- 512 MB RAM
- 200 MB storage

**Steps for Hugging Face Spaces deployment:**
1. Create a Hugging Face account
2. Go to "New Space" and select "Streamlit"
3. Upload your Streamlit app files
4. Add requirements.txt (Streamlit dependencies)
5. Configure space settings
6. Deploy

**CORS Considerations:**
- Hugging Face Spaces automatically configures CORS
- Static JSON serving works out of the box
- No additional CORS configuration needed

---

## Alternative: FastAPI Backend on Render (Optional)

**Render free tier provides:**
- 750 MB RAM
- 2 GB storage
- 550 MB bandwidth
- 1 custom domain

**Steps for Render deployment:**
1. Create a Render account
2. Select "Web Service"
3. Connect your Git repository
4. Set build command: `pip install -r requirements.txt`
5. Set start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
6. Set environment variables in Render dashboard
7. Deploy

**CORS Considerations:**
- Render automatically configures CORS
- Add CORS middleware in FastAPI if needed
- Configure `ALLOWED_ORIGINS` environment variable

---

## Current Status
This project uses Streamlit as a fallback to the main React/FastAPI implementation. For the online build, only the static frontend is deployed to Vercel with JSON data baked in at build time — **but the 260 MB / 11k-file payload exceeds the practical free-tier comfort zone**. Use **Fallback Option 1 (Cloudflare Pages for data)** or **Fallback Option 2 (binary tiles)** to stay safely within limits.

## Testing
- Python syntax check: `python -c "import ast;ast.parse(open('streamlit_app.py').read())"`
- Streamlit check: `python -m streamlit run streamlit_app.py --server.headless true`

## Notes
- No paid plans or accounts required for static build
- All deployments use free tier options
- CORS configuration handled by hosting platforms
- Static JSON serving as primary option for online build
- Streamlit fallback maintains core functionality for local testing
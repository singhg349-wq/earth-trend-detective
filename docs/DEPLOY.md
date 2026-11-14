# DEPLOYMENT GUIDE

Current deployment information for Earth System Trend Detective (NASA Space Apps 2026)

## Overview
This project provides a fallback deployment using Streamlit for comparing DJF rainfall trends between Indonesia and Coastal Peru. For the online build, only the frontend is deployed to Vercel as a static site.

## Online Build (Static Only - Recommended)

### Vercel (Frontend - Static)
**Vercel free tier includes:
- 100 GB bandwidth monthly
- 100 GB storage
- 2 GB output (excluding build cache)
- Custom domains
- Unlimited redirects and rewrites
- 45 minutes max build time per deployment

**Steps for Vercel deployment (static build):**
1. Create a Vercel account at vercel.com
2. Connect your Git repository
3. Set build command: `npm run build` (or create one if needed)
4. Set output directory: `dist` (or `./` for single-page app)
5. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_API_URL`: `/api` (if using API routes)
6. Configure `vercel.json` for static JSON serving:
   ```json
   {
     "version": 2,
     "static": [
       {
         "source": "/data/artifacts/**/*.json",
         "headers": {
           "cache-control": "public, max-age=3600, immutable"
         }
       }
     ]
   }
   ```
7. Deploy

**CORS Considerations:**
- Vercel automatically handles CORS for static files
- For API routes, Vercel automatically sets CORS headers
- Static JSON files served from `public/data/` are accessible from any origin

**Data Preparation for Static Build:**
1. Copy all `data/artifacts/*.json` files to `frontend/public/data/`
2. Create `frontend/public/index.html` that loads the React app
3. Configure the app to read JSON from relative paths (not from backend)
4. Ensure the app gracefully handles missing data

### Hugging Face Spaces (Streamlit) - Optional
**Hugging Face Spaces free tier includes:
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

### Render (FastAPI Backend) - Optional
**Render free tier provides:
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

## Alternative: Static JSON Only
As an alternative to dynamic APIs, you can serve static JSON files directly:

**Steps:**
1. Deploy JSON files to Vercel blob storage or GitHub Pages
2. Configure CDN for fast delivery
3. Update app to fetch from static URLs

**Advantages:**
- No server-side processing
- Faster load times
- Cheaper hosting
- Offline capability

**Limitations:**
- Cannot update data in real-time
- Requires manual file updates
- Less interactive than dynamic APIs

## Current Status
This project uses Streamlit as a fallback to the main React/FastAPI implementation. For the online build, only the static frontend is deployed to Vercel with JSON data baked in at build time.

## Testing
- Python syntax check: `python -c "import ast;ast.parse(open('streamlit_app.py').read())"`
- Streamlit check: `python -m streamlit run streamlit_app.py --server.headless true`

## Notes
- No paid plans or accounts required for static build
- All deployments use free tier options
- CORS configuration handled by hosting platforms
- Static JSON serving as primary option for online build
- Streamlit fallback maintains core functionality for local testing
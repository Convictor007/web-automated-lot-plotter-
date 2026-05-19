# Automated Lot Plotter

GIS lot plotter with an internal API for document scan.
LIVE-DEMO : https://web-automated-lot-plotter.vercel.app
## Scan pipeline

Same as **iAssess** lot plotter:

1. **POST /api/ocr-interpret** — **Gemini vision** reads the uploaded image and returns structured lots  
2. If AI fails (local dev only) → **POST /api/ocr** — Tesseract + rule-based line parsing  

On **Vercel**, only the vision step runs (Tesseract fallback is skipped — too slow on serverless).

## Quick start

```bash
npm install
cp .env.example .env   # set GEMINI_API_KEY and VITE_GOOGLE_MAPS_API_KEY
npm run dev
```

## Environment

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | **Required** for AI scan |
| `GEMINI_MODEL` | Primary model (default `gemini-2.5-flash`) |
| `GEMINI_MODEL_FALLBACKS` | Optional comma-separated list; built-in fallbacks if omitted |
| `GEMINI_MAX_RETRIES` | Retries per model on 429/503 (default 4) |
| `VITE_GOOGLE_MAPS_API_KEY` | Map tiles + PDF static map |

## API

- `POST /api/ocr-interpret` — Tesseract + Gemini (main scan)
- `POST /api/ocr` — Tesseract rule-based parse only
- `GET /api/health`

## Security

The API applies:

- **Helmet** security headers (CSP tuned separately for Google Maps if needed)
- **CORS** — set `CORS_ORIGINS` in production (comma-separated app URLs)
- **Rate limiting** — global `/api` cap + stricter OCR limits (`RATE_LIMIT_*`, `OCR_RATE_LIMIT_MAX`)
- **Upload validation** — JPEG/PNG/WebP/GIF only, 15 MB max, magic-byte check
- **Safe errors** — generic messages to clients; details logged server-side
- **Request timeout** — `REQUEST_TIMEOUT_MS` (default 120s) on scan routes

Restrict `GEMINI_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY` in Google Cloud (never commit `.env`).

## Deploy on Vercel

This repo is configured for **Vite (static) + Express API (serverless)** on one Vercel project.

### 1. Push to GitHub and import in Vercel

Vercel detects `vercel.json` — build output is `dist/`, API is `api/index.ts`.

### 2. Environment variables (Vercel → Settings → Environment Variables)

| Variable | Where | Required |
|----------|--------|----------|
| `GEMINI_API_KEY` | Server | Yes (AI scan) |
| `VITE_GOOGLE_MAPS_API_KEY` | Build + client | Yes (maps) |
| `GEMINI_MODEL` | Server | Optional |
| `GEMINI_MAX_RETRIES` | Server | Optional |
| `CORS_ORIGINS` | Server | Optional — Vercel URLs are added automatically |
| `RATE_LIMIT_MAX` / `OCR_RATE_LIMIT_MAX` | Server | Optional |

Do **not** set `VITE_API_BASE_URL` on Vercel — the app calls `/api` on the same domain.

Add your production domain to **Google Maps API key** HTTP referrer restrictions (e.g. `https://your-app.vercel.app/*`).

### 3. Plan limits (important)

| Topic | Vercel note |
|-------|-------------|
| **Function timeout** | `maxDuration: 60` in `vercel.json` — needs **Pro** for 60s; Hobby max is 10s (scan may fail on Hobby) |
| **Upload size** | **4 MB** max on serverless (not 15 MB) |
| **Cold starts** | First OCR scan may be slow (Tesseract + lang data download) |
| **Tesseract** | Bundled via `includeFiles`; first run may fetch `eng.traineddata` from CDN |

### 4. Custom domain

After adding a domain in Vercel, add `https://your-domain.com` to Maps referrer allowlist and optionally `CORS_ORIGINS`.

### 5. Local vs Vercel

| | Local (`npm run dev`) | Vercel |
|--|----------------------|--------|
| Frontend | Vite `:5173` | Static `dist/` |
| API | Express `:5175` | Serverless `api/index.ts` |
| Max upload | 15 MB | 4 MB |

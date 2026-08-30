# CoolCity AI — FortyGuard-Powered Urban Cooling Policy Intelligence

> CoolCity AI turns FortyGuard heat intelligence into targeted cooling policies, modeled temperature impact, and incentives.

Built for **FortyGuard Hackathon '26** · Primary track: **Government & Environment** · Coverage: **United States** · Prepared demonstration area: **Phoenix, Arizona**

## What it does

CoolCity helps a planner move from observed neighborhood heat to an explainable intervention decision:

1. Draw a United States area of interest and choose a date, time, and resolution.
2. Request observed thermal intelligence from the FortyGuard Temperature API.
3. Label and rank stable `FG-*` cells using thermal evidence only.
4. Add historical ESA WorldCover 2021 land-cover context.
5. Select a hotspot and set a government cooling target and feasibility limits.
6. Compare low-intervention, balanced, and maximum-cooling portfolios of trees, cool roofs, and cool pavement.
7. Review the modeled temperature reduction, uncertainty range, target gap, annual mature-canopy CO2 sequestration, and an illustrative Heat Mitigation Incentive tier.
8. Generate a printable decision report with source and verification status.

The analysis-area safety ceiling is **5 km²**, enforced in both the browser and backend. FortyGuard cell-size choices are **100 m, 250 m, and 500 m**; finer cells produce more features and larger provider responses.

## Who it is for

CoolCity is designed for city and state governments, urban planners, sustainability teams, public-works agencies, campuses, and researchers. It changes decisions about which heat hotspots to prioritize, which interventions merit field review, and whether a proposed portfolio can plausibly reach a stated cooling target.

## Place and time

The product is scoped to the United States. Phoenix, Arizona is the prepared hot-arid demonstration context and species catalog; the planner selects the FortyGuard analysis date and time in the interface. ESA WorldCover is explicitly presented as a historical **2021** land-cover baseline, not current vegetation.

## How FortyGuard is used

FortyGuard is the primary observed-temperature source. CoolCity supports:

- temperature (`tcm`);
- peak heat time (`time_of_measure`);
- hours above a planner-selected threshold (`exceedance`); and
- longest continuous period above that threshold (`persistence`).

The FastAPI backend submits the selected polygon, polls one provider activity, reuses matching in-progress or completed work, and normalizes returned GeoJSON while preserving original provider properties. Cells receive deterministic IDs in north-to-south, west-to-east order. The current `temperature_c` always remains the observed FortyGuard value.

Each user pastes their own FortyGuard key into the password field in the CoolCity interface. React keeps it only in the current page's memory and sends it in the dedicated `X-FortyGuard-API-Key` request header when submitting or polling an analysis. It is never put in a request body or URL, saved to local/session storage, included in a planner report, copied into a `NEXT_PUBLIC_*` variable, embedded in the browser bundle, logged, returned by an endpoint, or included in a test fixture. The FastAPI backend forwards it to FortyGuard's required `api-key` header and discards it after request handling. Automated tests use local fakes and make zero provider calls.

For operators and direct backend clients, `FORTYGUARD_API_KEY` in the process environment or root `.env` remains an optional server-managed fallback. A user-provided browser key takes precedence for that request. Public deployments must use HTTPS because the backend necessarily receives the user's key in transit to call FortyGuard.

### FortyGuard API-key status

The team tested the integration with a free FortyGuard API key, but that test credential is currently inactive. It is intentionally **not included** in this public repository. Consequently, live temperature analysis will not work until the person running CoolCity supplies their own active FortyGuard Temperature API key. The interface, policy model, reports, and automated tests can still be inspected without exposing or sharing a credential.

To obtain and configure your own key:

1. Review the official [FortyGuard API plans and trial access](https://www.fortyguard.com/api-pricing), then register or request the appropriate API access. FortyGuard states that a key is provided upon registration or through an organization's admin console.
2. If a free, trial, or hackathon key was issued but does not activate, contact FortyGuard at [`support@fortyguard.com`](mailto:support@fortyguard.com). Do not post the key in a GitHub issue.
3. Start CoolCity, paste the active key into **Your FortyGuard API key** in the interface, draw a supported US area, and explicitly start an analysis. The field is intentionally cleared when the page reloads.
4. Optional operator fallback: copy `.env.example` to `.env`, set `FORTYGUARD_API_KEY`, and restart the backend. Never commit `.env` or use a `NEXT_PUBLIC_*` variable for a key.

FortyGuard's [authentication guide](https://docs-api.fortyguard.com/docs/authentication) documents the provider-side `api-key` request header; CoolCity adds it only in the backend-to-FortyGuard request. A `401` response normally means the key is missing or invalid, `403` means the key's plan does not allow the request, and `429` means the request or credit limit has been reached. See the official [API quickstart](https://docs-api.fortyguard.com/docs/quickstart) for the current provider workflow.

## Architecture

```text
Browser (Next.js + MapLibre)
  ├─ user key in transient request header ──> FastAPI backend
  ├─ explicit analysis action ───────────────> FastAPI backend
  │                                             └─ FortyGuard Temperature API
  ├─ land-cover request ─────────────────────> Next.js server route
  │                                             └─ Planetary Computer / WorldCover
  └─ policy scenario ────────────────────────> deterministic TypeScript model
                                                ├─ curated US air-temperature evidence
                                                ├─ Phoenix/AMWUA species metadata
                                                └─ urban-tree carbon evidence
```

- **Backend:** transient user-key handling, optional environment fallback, provider payloads, credential-scoped polling/cache, safe errors, normalization, and health check.
- **Frontend server:** WorldCover retrieval and exact-AOI processing, evidence files, policy evaluation, and optimization.
- **Browser:** map workflow, thermal diagnosis, scenario controls, incentive screening, and printable report.
- **Pure model code:** deterministic thermal scoring, response model, bounded optional calibration, canopy/carbon calculations, optimization, and incentive scoring.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data flow and trust boundaries.

## AI and policy model

CoolCity does not use a generative model to invent forecasts. Its cooling-response model is transparent and deterministic:

```text
CoolCity modeled post-intervention temperature
  = FortyGuard observed temperature
  - CoolCity estimated intervention reduction
```

Trees, cool roofs, and cool pavement are evaluated separately from published United States **air-temperature** evidence. When interventions are combined, a conservative diminishing-return factor reduces double counting. The model reports lower, central, and upper reductions, confidence, and extrapolation warnings.

An optional local AOI regression can adjust the tree coefficient only when there are at least 10 valid cells, adequate temperature and tree-cover variation, a cooling sign, and `R² ≥ 0.20`. Any accepted multiplier is bounded to `0.8–1.2`; otherwise the published-evidence model is used unchanged. Coefficients are never tuned to force the government target.

The optimizer returns:

- **Low Intervention:** maximizes predicted cooling within a centralized 25% normalized intervention-intensity cap;
- **Balanced:** chooses the lowest-intensity portfolio that reaches the target, or, when the target is unreachable, the lowest-intensity portfolio that delivers at least 80% of maximum feasible cooling; and
- **Maximum Cooling:** maximizes predicted temperature reduction within planner-set feasibility limits.

Normalized intervention intensity is the average fraction of the enabled tree, roof, and pavement limits. Balanced and Maximum can match only when no lower-intensity candidate satisfies the applicable Balanced requirement.

If a target is unreachable, CoolCity shows the remaining gap instead of claiming success. Counterfactual results are CoolCity screening estimates, never FortyGuard forecasts or guaranteed cooling.

## CO2 and incentive layer

Tree carbon is estimated from effective mature-canopy area and reported in `kg CO2/year`. It is an annual mature-canopy sequestration estimate—not avoided emissions, a lifetime total, or an immediate benefit from a new planting.

The illustrative Cooling Incentive Score combines FortyGuard thermal burden (50%), normalized modeled cooling benefit (30%), and intervention durability (20%). Government-configurable tier values are policy parameters, not official tax rates. High heat can increase assistance priority but never tax liability. The model uses no protected personal attributes, requires an explicit proposed/installed/verified/maintained state, and does not make official funding, tax, or payment decisions.

## Evidence, data, and uncertainty

| Source | Role | Important boundary |
|---|---|---|
| FortyGuard Temperature API | Observed temperature and temporal heat analytics | Provider observation; counterfactuals are not attributed to FortyGuard |
| [ESA WorldCover 2021 v2.0](https://planetarycomputer.microsoft.com/dataset/esa-worldcover) | Historical tree, vegetation, built, bare, and other land-cover context | 2021 baseline; does not prove present-day plantability |
| [`data/research/us_cooling_evidence.json`](data/research/us_cooling_evidence.json) | Curated US air-temperature bounds for trees, cool roofs, and cool pavement | Screening transfer across climates and scales is uncertain |
| [City of Phoenix](https://www.phoenix.gov/administration/departments/streets/initiatives/cool-corridors.html) and [AMWUA](https://www.amwua.org/plant-category/trees) | Phoenix tree names, mature dimensions, and descriptive water-use metadata | Mature-canopy concepts require site and horticultural review |
| [Nowak et al. urban-tree carbon methodology](https://doi.org/10.1016/j.envpol.2013.03.019) | Annual net carbon factor | Mature-canopy sequestration only |
| [OpenFreeMap](https://openfreemap.org/) | Attributed visual basemap | Visual context, not analytical evidence |

The evidence database records each source, US location, climate context, metric, units, and modeling role. It contains no fabricated study rows or synthetic training observations. Source-specific model parameters are reviewable in the repository.

## Quick start

### Exact tested versions

| Layer | Release baseline | How it is reproduced |
|---|---:|---|
| Python | `3.12.13` | `.python-version` |
| pip | `26.2.1` | Windows setup and backend Docker image |
| Node.js | `24.19.0` | `.nvmrc` and frontend Docker image |
| npm | `11.17.0` | `packageManager` metadata and frontend Docker image |
| Python libraries | Every direct and transitive version pinned | `backend/requirements*.lock.txt` |
| Frontend libraries | Every direct and transitive version plus integrity hashes locked | `frontend/package-lock.json` |

The release was validated with this exact toolchain. Python 3.12 and Node.js 20.9 or newer remain supported for local use, but use the versions above when you need the closest possible reproduction of the judged build. See [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) for the dependency-file contract and update process.

### One-click Windows start

Prerequisites: **Python 3.12** and **Node.js 20.9+**. The exact tested versions are **Python 3.12.13** and **Node.js 24.19.0**.

1. Download or clone this repository.
2. Double-click `start_coolcity.cmd`.
3. The launcher checks the Python version, required backend imports, `pip check`, both dependency-lock fingerprints, the Node.js version, and the installed npm graph. If anything is missing, broken, or outdated, it automatically calls `setup_coolcity.cmd`, creates `.venv` only if missing, installs pip `26.2.1` and the fully locked Python graph, runs `npm ci` from the npm lockfile, and verifies the installation before continuing.
4. At [http://localhost:3000](http://localhost:3000), paste your own active FortyGuard key into **Your FortyGuard API key**. The team's inactive free test key is not bundled; follow the [API-key procedure](#fortyguard-api-key-status) above.

That is the complete one-click installation and start flow. The launcher reuses a healthy root `.venv`, never installs Python packages globally, repairs incomplete environments, verifies both HTTP services, and opens the browser. The Windows scripts support repository paths containing spaces and apostrophes, including OneDrive folders such as `FortyGuard Hackathon '26`. You can also double-click `setup_coolcity.cmd` separately to force a dependency refresh after pulling changes. `check_coolcity_dependencies.cmd` performs a read-only environment check and returns a failure code when automatic repair is required.

### Manual install and run

```powershell
Copy-Item .env.example .env
# .env is safe as copied. FORTYGUARD_API_KEY is an optional server fallback.

py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install "pip==26.2.1"
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.lock.txt

Set-Location frontend
npm.cmd ci
Set-Location ..
```

Start the backend in one terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```powershell
Set-Location frontend
npm.cmd run dev -- --hostname 127.0.0.1
```

## Live and demo mode

There is no mock or synthetic temperature mode in the product. A temperature analysis is available only after an explicit user action and requires the user's valid FortyGuard key in the interface (or an optional server-managed fallback); it may consume that key's provider quota. Provider cache entries are scoped by a one-way key fingerprint so one credential cannot resume another credential's activity. The raw key is never cached. Completed provider and WorldCover results may be cached locally for efficient repeat use, but `data/cache/` is runtime data and is not committed.

The team's free test key is currently inactive and is not published. A reviewer or new user must paste their own active key for live provider calls; CoolCity does not silently substitute synthetic temperature data when authentication fails.

- **Live demo:** [https://coolcity-ai-ashen.vercel.app](https://coolcity-ai-ashen.vercel.app) — public, HTTPS, and no login or installation required
- **Demo video:** _add the public YouTube or Loom URL (maximum 3 minutes)_
- **Screenshot:** add `docs/screenshots/dashboard.png`; see [`docs/screenshots/README.md`](docs/screenshots/README.md) for the privacy checklist.

## Methodology summary

- Thermal priority uses thermal evidence only; land cover and policy feasibility never enter the heat score.
- Stable cell IDs use deterministic spatial ordering, and provider properties are preserved.
- WorldCover is clipped to the exact AOI, nodata is excluded, and successful results are cached by geometry.
- Mature canopy uses a circular crown proxy, a `0.85` overlap factor, and an available-cell-area cap.
- Roof and pavement percentages are planner scenarios, not measured eligible areas.
- The target is an objective, not a promised result; every output retains uncertainty and any target gap.
- Source provenance and live/cached/calculated status remain visible in the interface and report.

## Tests and release checks

Run from the repository root. Tests make no FortyGuard or external-provider calls.

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -v
.\.venv\Scripts\python.exe -m pip check

Set-Location frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

## Deployment

CoolCity is a two-service application: FastAPI runs on Render and Next.js runs on Vercel. The checked-in [`render.yaml`](render.yaml) and [`frontend/vercel.json`](frontend/vercel.json) keep the build and start commands reproducible. Neither deployment configuration contains a FortyGuard key.

### 1. Deploy FastAPI on Render

1. Sign in to [Render](https://dashboard.render.com/) with the GitHub account that can read this repository.
2. Choose **New → Blueprint**, select `shayan19/coolcity-ai`, keep the Blueprint path as `render.yaml`, and continue.
3. When Render asks for `COOLCITY_ALLOWED_ORIGINS`, temporarily enter `https://example.invalid`. This is replaced with the real Vercel origin in step 3 below.
4. Apply the Blueprint and wait for `coolcity-ai-backend` to report **Live**.
5. Copy the assigned HTTPS URL. The hackathon deployment uses `https://coolcity-ai-backend.onrender.com`; open [`/health`](https://coolcity-ai-backend.onrender.com/health) and confirm it returns `{"status":"ok", ...}`.

The cost-safe Blueprint default is Render's `free` plan. Render documents that free web services spin down after 15 minutes without inbound traffic and can take about one minute to wake, so it is suitable for staging but not a reliable judging window. Before the submission deadline, change the backend to Render's smallest always-on web-service plan (`0.5c-512mb` at the time this README was prepared), after reviewing the current price in the dashboard. No database or persistent disk is required. The cache uses `/tmp/coolcity-cache`; losing cached provider results after a restart affects performance only, not correctness.

Do **not** add `FORTYGUARD_API_KEY` to Render for the public bring-your-own-key demo. It remains an optional operator-only fallback. If it is ever added, it belongs only in Render's secret environment settings, never in Vercel.

### 2. Deploy Next.js on Vercel

1. In [Vercel](https://vercel.com/new), import `shayan19/coolcity-ai` from GitHub.
2. Set **Root Directory** to `frontend`. Keep **Include source files outside of the Root Directory in the Build Step** enabled; the server-side policy route bundles the reviewed evidence JSON from `data/`.
3. Vercel should detect **Next.js**. The repository configuration runs exact `npm ci` and `npm run build`; do not set an Output Directory.
4. Add `NEXT_PUBLIC_BACKEND_URL` for **Production, Preview, and Development**, using the Render HTTPS URL with no trailing slash. This value is a public service address, not a credential.
5. Deploy, wait for all checks to pass, and copy the stable production URL shown under **Domains**. Do not use a commit-specific preview URL for the hackathon form.

Vercel environment-variable changes apply only to new deployments. If the backend URL is changed later, redeploy the frontend so the new public value is included in its build.

### 3. Lock CORS to the production frontend

1. In Render, open `coolcity-ai-backend` → **Environment**.
2. Replace `COOLCITY_ALLOWED_ORIGINS` with the exact Vercel production origin. The hackathon deployment uses `https://coolcity-ai-ashen.vercel.app`. Include no path and no trailing slash. Multiple intentional production domains can be comma-separated.
3. Save and deploy the backend. CoolCity allows only `GET`/`POST` requests and the explicit `X-FortyGuard-API-Key` browser header; wildcard origins are rejected by the application configuration.

### 4. End-to-end release verification

Run these checks after both deployments finish:

```powershell
$backendUrl = "https://coolcity-ai-backend.onrender.com"
$frontendUrl = "https://coolcity-ai-ashen.vercel.app"

Invoke-RestMethod "$backendUrl/health"
Invoke-WebRequest "$frontendUrl" -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest "$frontendUrl/api/policy/evaluate" -UseBasicParsing | Select-Object StatusCode

$headers = @{
  Origin = $frontendUrl
  "Access-Control-Request-Method" = "POST"
  "Access-Control-Request-Headers" = "content-type,x-fortyguard-api-key"
}
Invoke-WebRequest "$backendUrl/api/temperature/submit" -Method Options -Headers $headers -UseBasicParsing |
  Select-Object StatusCode, Headers
```

Then open the stable frontend URL in a fresh private/incognito window. Confirm that it loads without login, the policy-resource request succeeds, a Phoenix AOI can be drawn, 100/250/500 m are the only resolution choices, and the 5 km² limit is enforced. Paste an active personal FortyGuard key only into the in-app password field and run one real temperature analysis. Confirm the browser Network panel sends the key only in `X-FortyGuard-API-Key`, the backend returns a provider result, WorldCover loads, and policy evaluation/report generation complete. Finally, reload the page and confirm the key field is empty.

The public deployment must use HTTPS. Never place `FORTYGUARD_API_KEY` in frontend environment settings, Docker build arguments, GitHub Actions logs, URLs, or any `NEXT_PUBLIC_*` variable.

### Local Docker alternative

Docker remains useful for a two-service local production build:

```powershell
Copy-Item .env.example .env
# FORTYGUARD_API_KEY may remain blank when users enter keys in the interface.
docker compose up --build
```

## Limitations

CoolCity is a policy-screening tool, not engineering design, tax advice, a causal field experiment, or proof of intervention feasibility. Published effects vary by climate, scale, time, and implementation. Canopy maturity, survival, ownership, utilities, soil, costs, maintenance, eligible roof/pavement area, and future climate require field and professional review. FortyGuard/provider validation determines whether a selected US location and time are supported.

## Hackathon compliance

- FortyGuard is the primary observed thermal source and is called server-side.
- No API key is committed or bundled. A user-entered key exists only in that page's memory, transits to FastAPI in a header for explicit analysis requests, and is never saved in browser storage, request bodies, URLs, reports, logs, or caches.
- Tests use controlled fixtures and consume zero FortyGuard credits.
- Live analysis requires an explicit user action; there is no demo-temperature source.
- Counterfactuals and uncertainty are labeled as CoolCity modeled estimates, not FortyGuard forecasts.
- The model uses published US air-temperature evidence and does not fabricate training data or tune coefficients to hit a target.
- CO2 means annual mature-canopy sequestration, not avoided emissions.
- Incentives are illustrative, explainable, non-punitive, and require government verification.
- Quantitative water, shade/solar, Open-Meteo, and the removed OSM/Overpass building pipeline are intentionally absent.
- OpenAI Codex assisted with release packaging, documentation, and validation; the project runtime itself uses deterministic analytical models rather than generative AI.

Additional project contracts are documented in [`docs/PRODUCT.md`](docs/PRODUCT.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

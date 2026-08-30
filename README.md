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

The FortyGuard key is read only by the Python backend from the process environment or root `.env`. It is never returned by an endpoint, logged, copied into a `NEXT_PUBLIC_*` variable, embedded in the browser bundle, or included in a test fixture. Automated tests use local fakes and make zero provider calls.

### FortyGuard API-key status

The team tested the integration with a free FortyGuard API key, but that test credential is currently inactive. It is intentionally **not included** in this public repository. Consequently, live temperature analysis will not work until the person running CoolCity supplies their own active FortyGuard Temperature API key. The interface, policy model, reports, and automated tests can still be inspected without exposing or sharing a credential.

To obtain and configure your own key:

1. Review the official [FortyGuard API plans and trial access](https://www.fortyguard.com/api-pricing), then register or request the appropriate API access. FortyGuard states that a key is provided upon registration or through an organization's admin console.
2. If a free, trial, or hackathon key was issued but does not activate, contact FortyGuard at [`support@fortyguard.com`](mailto:support@fortyguard.com). Do not post the key in a GitHub issue.
3. Copy the safe template with `Copy-Item .env.example .env` from the repository root.
4. Open the new local `.env` file and set `FORTYGUARD_API_KEY=your_own_active_key`. Leave `FORTYGUARD_BASE_URL=https://api.fortyguard.com` unchanged unless FortyGuard instructs you otherwise.
5. Save `.env`, restart the CoolCity backend or rerun `start_coolcity.cmd`, draw a supported US area, and explicitly start a FortyGuard analysis.

FortyGuard's [authentication guide](https://docs-api.fortyguard.com/docs/authentication) documents the required `api-key` request header; CoolCity adds it on the backend. A `401` response normally means the key is missing or invalid, `403` means the key's plan does not allow the request, and `429` means the request or credit limit has been reached. See the official [API quickstart](https://docs-api.fortyguard.com/docs/quickstart) for the current provider workflow.

## Architecture

```text
Browser (Next.js + MapLibre)
  ├─ explicit analysis action ───────────────> FastAPI backend
  │                                             └─ FortyGuard Temperature API
  ├─ land-cover request ─────────────────────> Next.js server route
  │                                             └─ Planetary Computer / WorldCover
  └─ policy scenario ────────────────────────> deterministic TypeScript model
                                                ├─ curated US air-temperature evidence
                                                ├─ Phoenix/AMWUA species metadata
                                                └─ urban-tree carbon evidence
```

- **Backend:** credential isolation, provider payloads, polling, caching, safe errors, normalization, and health check.
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

- **Low Intervention:** a restrained reference portfolio;
- **Balanced:** the lowest modeled intervention intensity that reaches the target when feasible; and
- **Maximum Cooling:** the strongest portfolio within planner-set limits.

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
3. On the first run, it calls `setup_coolcity.cmd`, creates `.venv` only if missing, installs pip `26.2.1` and the fully locked Python graph, runs `npm ci` from the npm lockfile, and creates a safe local `.env` template if needed.
4. Add your own active FortyGuard key to `.env`, restart if necessary, and open [http://localhost:3000](http://localhost:3000). The team's inactive free test key is not bundled; follow the [API-key procedure](#fortyguard-api-key-status) above.

The launcher reuses an existing root `.venv`, never installs Python packages globally, verifies both HTTP services, and opens the browser. You can also double-click `setup_coolcity.cmd` separately to refresh all dependencies after pulling changes.

### Manual install and run

```powershell
Copy-Item .env.example .env
# Edit .env and set FORTYGUARD_API_KEY. Never commit this file.

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

There is no mock or synthetic temperature mode in the product. A temperature analysis is available only after an explicit user action and requires a valid server-side FortyGuard key; it may consume provider quota. Completed provider and WorldCover results may be cached locally for efficient repeat use, but `data/cache/` is runtime data and is not committed.

The team's free test key is currently inactive and is not published. A reviewer or new user must configure their own active key for live provider calls; CoolCity does not silently substitute synthetic temperature data when authentication fails.

- **Live demo:** _add the public no-login deployment URL before submission_
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

CoolCity is a two-service application. Deploy the Python backend and Next.js frontend separately, or use the included Docker files.

```powershell
Copy-Item .env.example .env
# Set FORTYGUARD_API_KEY in .env, then:
docker compose up --build
```

For a public deployment:

1. Set `FORTYGUARD_API_KEY` and `FORTYGUARD_BASE_URL` **only on the backend service**.
2. Set backend `COOLCITY_ALLOWED_ORIGINS` to the exact public frontend origin.
3. Build the frontend with `NEXT_PUBLIC_BACKEND_URL` set to the public backend URL. This URL is public configuration, not a secret.
4. Give `data/cache/` persistent writable storage if cross-restart caching is desired.
5. Expose backend health at `/health` and test the frontend in a private/incognito window with no login.

Never place `FORTYGUARD_API_KEY` in frontend environment settings, Docker build arguments, GitHub Actions logs, or any `NEXT_PUBLIC_*` variable.

## Limitations

CoolCity is a policy-screening tool, not engineering design, tax advice, a causal field experiment, or proof of intervention feasibility. Published effects vary by climate, scale, time, and implementation. Canopy maturity, survival, ownership, utilities, soil, costs, maintenance, eligible roof/pavement area, and future climate require field and professional review. FortyGuard/provider validation determines whether a selected US location and time are supported.

## Hackathon compliance

- FortyGuard is the primary observed thermal source and is called server-side.
- The API key is ignored by Git, absent from the example file, and never exposed to the browser.
- Tests use controlled fixtures and consume zero FortyGuard credits.
- Live analysis requires an explicit user action; there is no demo-temperature source.
- Counterfactuals and uncertainty are labeled as CoolCity modeled estimates, not FortyGuard forecasts.
- The model uses published US air-temperature evidence and does not fabricate training data or tune coefficients to hit a target.
- CO2 means annual mature-canopy sequestration, not avoided emissions.
- Incentives are illustrative, explainable, non-punitive, and require government verification.
- Quantitative water, shade/solar, Open-Meteo, and the removed OSM/Overpass building pipeline are intentionally absent.
- OpenAI Codex assisted with release packaging, documentation, and validation; the project runtime itself uses deterministic analytical models rather than generative AI.

Additional project contracts are documented in [`docs/PRODUCT.md`](docs/PRODUCT.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

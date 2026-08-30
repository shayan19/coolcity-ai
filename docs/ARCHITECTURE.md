# Architecture

## Runtime providers

The final analytical runtime uses only:

- FortyGuard Temperature AI for observed heat
- Microsoft Planetary Computer / ESA WorldCover 2021 for historical land-cover context on cache misses
- Local curated species, evidence, and carbon files
- OpenFreeMap only as an attributed visual basemap

The unused OSM/Overpass building pipeline was removed. Quantitative water, Open-Meteo, solar, shade, and shadow systems are intentionally absent.

## Boundaries

- FastAPI: FortyGuard API-key isolation, payload construction, explicit submission, one-activity polling, completed-result cache, normalization, stable provider-cell IDs, and health.
- Next.js server routes: WorldCover retrieval/cache/normalization and policy-model evaluation/optimization with local evidence files.
- Browser: MapLibre thermal/land-cover presentation, thermal analytics controls, cell selection, target and portfolio controls, illustrative incentive policy configuration, explicit verification state, and printable report.
- Pure TypeScript: thermal priority, temporal merge, evidence response model, optional bounded OLS calibration, canopy/carbon calculation, deterministic portfolio search, incentive scoring, and multi-site budget screening.

## Data flow

```text
FortyGuard observed temperature cells
  -> stable FG IDs + thermal-only ranking/profile
  + optional FortyGuard temporal analytic joined by FG ID
  + ESA WorldCover 2021 historical cell context
  -> planner target and feasible intervention maximums
  -> evidence-constrained response model
  -> deterministic low / balanced / maximum portfolios
  -> modeled CoolCity counterfactual + uncertainty + target gap
  -> mature-tree annual CO2 co-benefit
  -> FortyGuard-led Cooling Incentive Score + verification eligibility
  -> optional allocation across multiple real assessed sites
  -> printable report
```

The selected `temperature_c` remains immutable. The model estimates only `estimated_temperature_reduction_c`; the post-policy value is baseline minus that delta.

## Safety and caching

Provider credentials remain backend-only. Automated tests use fixtures, synthetic cells, and controlled local caches with zero external provider requests. A live FortyGuard submit is explicit; polling stays attached to its activity ID, and matching completed/in-progress work is reused. WorldCover caches successful exact-AOI results and fetches arbitrary new AOIs rather than requiring a Phoenix fixture.

The incentive layer uses no personal or protected attributes. Higher thermal burden can increase assistance priority but never tax liability. Credit values, verification rules, and allocation results are illustrative policy-screening parameters requiring government review; they are not legal tax or payment decisions.

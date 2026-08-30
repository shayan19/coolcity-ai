# CoolCity AI Development Rules

CoolCity AI is a FortyGuard-first urban temperature intelligence product for FortyGuard Hackathon ’26.

1. FortyGuard is the observed temperature baseline and primary thermal source.
2. Counterfactual temperatures must never be attributed to FortyGuard.
3. Temperature reduction must include methodology, an evidence-constrained range, and uncertainty.
4. Literature bounds must use air-temperature evidence when modeling air temperature.
5. Weak local model fits must not be presented as reliable causal estimates.
6. Tree-canopy changes are conceptual mature-canopy scenarios requiring field verification.
7. Carbon results are annual sequestration estimates, not automatically avoided emissions.
8. Deleted shade and quantitative water features must not be reintroduced without an explicit product decision.
9. Never commit `.env`, hard-code a key, persist a user-entered key, or place credentials in a frontend bundle or public environment variable.
10. FortyGuard provider calls stay server-side. The browser may send a user-entered key only in the dedicated request header; never log, cache, return, or print its raw value.
11. Automated tests must make zero external-provider calls and consume zero FortyGuard credits.
12. FortyGuard work requires an explicit analysis action. There is no demo-temperature source or browser-side live toggle; a user-entered credential remains only in page memory and backend request memory.
13. Reuse matching in-progress and cached completed FortyGuard work; do not duplicate submissions.
14. Normalize provider responses server-side, preserve original feature properties, and expose `temperature_c`.
15. Use the root `.venv`; do not create another environment or install Python packages globally.
16. Keep backend and frontend responsibilities separated and prefer lightweight, deterministic calculations.
17. Add tests for scientific calculations and run the full validation suite before completion.
18. Stable cell IDs use deterministic top-to-bottom, left-to-right spatial ordering.
19. Thermal priority uses thermal evidence only; vegetation and policy feasibility never enter the score.
20. The reported current temperature always remains the observed FortyGuard `temperature_c`; models estimate only the intervention delta.
21. A local cooling model requires at least 10 valid cells, finite predictors, and variation in temperature and tree cover.
22. A local tree coefficient that does not support cooling must be reported honestly and replaced by the literature screening fallback.
23. Flag projections outside the AOI’s observed tree-cover range and lower confidence.
24. Treat ESA WorldCover 2021 as a historical baseline, never current or live vegetation.
25. Process WorldCover server-side, clip to the exact AOI, exclude nodata, and cache successful results.
26. WorldCover tests use synthetic data or caches and never contact Planetary Computer.
27. Preserve all thermal properties while attaching land-cover context.
28. WorldCover open land does not prove plantability; utilities, ownership, soil, and field conditions are outside the dataset.
29. Species dimensions and descriptive `water_use` must come from authoritative Phoenix/AMWUA metadata; never guess missing botanical values.
30. Canopy calculations must state the circular mature-crown proxy, overlap factor, available-area cap, and units.
31. Annual net CO₂ calculations must state the canopy-area factor, units, source, and mature-canopy limitation.
32. OSM/Overpass buildings, shade/solar systems, and quantitative water/Open-Meteo systems were intentionally removed; do not reintroduce them without explicit approval.
33. Preserve source provenance and live/cached/calculated status in the interface and report.
34. Report generation must work without external network access.
35. Never claim guaranteed cooling, exact cooling, or CO₂ emissions avoided.
36. Product scope is United States only; provider validation handles unsupported locations without an invented rectangular boundary.
37. Cooling coefficients must be traceable to published evidence.
38. Never mix surface-temperature evidence into an air-temperature prediction without explicit separation.
39. Never fabricate training data or represent synthetic study rows as observations.
40. Never tune coefficients to hit a requested government target; the target is an objective, not a guaranteed outcome.
41. Weak local FortyGuard regressions fall back to the published evidence model, and any accepted local calibration remains bounded.
42. Every cooling output must include uncertainty and disclose extrapolation.
43. CO₂ output means annual mature-canopy sequestration, not avoided emissions.
44. CoolCity counterfactual temperatures are never FortyGuard forecasts.
45. High heat may increase incentive eligibility, never tax liability.
46. FortyGuard thermal burden is the primary incentive-priority signal.
47. Tax-credit amounts are government-configurable policy parameters, not official rates.
48. CoolCity does not make official tax, payment, or funding decisions.
49. Incentive models must not use protected personal attributes or personal demographics.
50. Every incentive recommendation requires an explanation tied to its actual score components.
51. Verification state must be explicit; never claim proposed work is installed, verified, or maintained.
52. Budget optimization is policy screening, not complete economic welfare optimization.
53. The selected geometry is a policy assessment area, not a claimed legal parcel or tax account.
54. The analysis-area safety ceiling is 5 km² and must be enforced by both frontend and backend validation.
55. Supported FortyGuard cell sizes are 100 m, 250 m, and 500 m.
56. Low Intervention maximizes cooling within the centralized low-intensity cap.
57. Balanced minimizes intensity while meeting the target, or at least 80% of maximum feasible cooling when the target is unreachable.
58. Maximum Cooling maximizes predicted temperature reduction; optimizer objectives must not alter the cooling-response equations.

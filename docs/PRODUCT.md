# Product

CoolCity AI is US Urban Cooling Policy Intelligence powered by FortyGuard Temperature AI.

Current coverage: United States. Provider coverage validation handles unsupported locations.

## Decision workflow

1. Select a US area of interest no larger than 10 km² and choose a 50 m, 100 m, 250 m, or 500 m FortyGuard cell size.
2. Use FortyGuard to diagnose temperature, peak heat time, exceedance, or persistence.
3. Inspect stable `FG-*` labels, the thermal ranking, and a selected cell's FortyGuard Thermal Profile.
4. Attach ESA WorldCover 2021 historical land-cover context.
5. Enter a government cooling target and feasible intervention limits.
6. Use the CoolCity Cooling Response Model and policy optimizer.
7. Compare low-intervention, balanced, and maximum-cooling plans.
8. Compare the FortyGuard observed temperature with the CoolCity modeled post-intervention temperature, uncertainty range, and remaining target gap.
9. Review annual mature-tree CO2 sequestration.
10. Screen the selected site for a government-configurable Heat Mitigation Credit using FortyGuard thermal burden as the primary priority signal.
11. Set an explicit Proposed, Installed, Verified, or Maintained status and generate a planner report.

## Scientific contract

- FortyGuard supplies the immutable observed-temperature baseline.
- CoolCity estimates an intervention delta; the counterfactual is never described as a FortyGuard forecast.
- Thermal priority is thermal-only and uses centralized planning weights, not trained causal coefficients.
- Only verified US air-temperature evidence informs air-temperature response coefficients.
- No fabricated training data are created, and no coefficient is tuned to reach a requested target.
- Local regression is optional, diagnostic, quality-gated, and bounded.
- Every cooling result includes lower, central, and upper estimates, confidence, and extrapolation warnings when applicable.
- A target is an objective. Unreachable targets retain an explicit positive gap.
- Carbon is annual net sequestration at effective mature canopy, not avoided emissions.
- WorldCover is historical context. Intervention feasibility requires site review.
- The Cooling Incentive Score uses centralized prototype weights: 50% FortyGuard Thermal Priority, 30% normalized modeled cooling benefit, and 20% intervention durability.
- Illustrative credit amounts and tier thresholds are policy configuration, not law or an official determination.
- Higher heat can increase assistance eligibility but never tax liability.
- Incentive screening uses no personal demographics or protected characteristics and always requires municipal review.
- Budget allocation compares only real assessed sites and is not a complete social-welfare model.
- Low Intervention maximizes modeled cooling under a 25% normalized-intensity cap.
- Balanced minimizes normalized intervention intensity while meeting the target; if unreachable, it must deliver at least 80% of maximum feasible cooling.
- Maximum Cooling maximizes the unchanged cooling-response model's predicted temperature reduction within configured feasibility limits.

## Users

Municipal and state planners, public agencies, campuses, researchers, and other US urban-heat decision makers.

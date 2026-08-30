import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { Feature, FeatureCollection, Polygon } from "geojson";

import {
  evaluateCoolingResponse,
  fitLocalCalibration,
  type CarbonEvidence,
  type CoolingEvidence,
} from "../lib/cooling-response-model.ts";
import { optimizePolicyPortfolio } from "../lib/policy-optimizer.ts";
import type { TreeSpecies } from "../lib/species-core.ts";

const evidence = JSON.parse(readFileSync(new URL("../../data/research/us_cooling_evidence.json", import.meta.url), "utf8")) as CoolingEvidence;
const carbon = JSON.parse(readFileSync(new URL("../../data/research/urban_tree_carbon_evidence.json", import.meta.url), "utf8")) as CarbonEvidence;
const species: TreeSpecies = { id: "blue", common_name: "Blue Palo Verde", scientific_name_source: "Parkinsonia florida", native_status: "Native", water_use: "Very Low", mature_height_ft: 30, mature_width_ft: 30, desert_adapted: true, phoenix_recommended: true, amwua_listed: true, source_urls: [] };

function cells(coefficient = -0.012, n = 12): FeatureCollection<Polygon, Record<string, unknown>> {
  return { type: "FeatureCollection", features: Array.from({ length: n }, (_, index) => {
    const tree = index * 2;
    const built = (index % 4) * 5;
    return { type: "Feature", properties: { cell_id: `FG-${index + 1}`, temperature_c: 44 + coefficient * tree + 0.03 * built, tree_cover_pct: tree, built_up_pct: built }, geometry: { type: "Polygon", coordinates: [[[index * 0.002, 0], [0.001 + index * 0.002, 0], [0.001 + index * 0.002, 0.001], [index * 0.002, 0.001], [index * 0.002, 0]]] } };
  }) };
}

const evaluate = (overrides: Partial<{ treeCount: number; coolRoofPct: number; coolPavementPct: number; targetTemperatureC: number }> = {}) => {
  const allCells = cells();
  return evaluateCoolingResponse({ selectedCell: allCells.features[0] as Feature<Polygon, Record<string, unknown>>, allCells, species, treeCount: 12, coolRoofPct: 40, coolPavementPct: 30, targetTemperatureC: 42, evidence, carbonEvidence: carbon, ...overrides });
};

test("local calibration is only used after sample, variance, sign, and fit gates", () => {
  const good = fitLocalCalibration(cells(), evidence);
  assert.equal(good.local_calibration_used, true);
  assert.ok(good.multiplier >= 0.8 && good.multiplier <= 1.2);
  assert.equal(fitLocalCalibration(cells(-0.012, 8), evidence).local_calibration_used, false);
  assert.equal(fitLocalCalibration(cells(0.012), evidence).local_calibration_used, false);
  const flat = cells(); flat.features.forEach((cell, index) => { cell.properties.temperature_c = 42 + index * 0.001; });
  assert.match(fitLocalCalibration(flat, evidence).reason, /Temperature range/);
});

test("tree, roof, and pavement contributions each respond independently", () => {
  const trees = evaluate({ treeCount: 12, coolRoofPct: 0, coolPavementPct: 0 });
  const roofs = evaluate({ treeCount: 0, coolRoofPct: 50, coolPavementPct: 0 });
  const pavement = evaluate({ treeCount: 0, coolRoofPct: 0, coolPavementPct: 50 });
  assert.ok(trees.tree_cooling_c > 0 && trees.cool_roof_cooling_c === 0 && trees.cool_pavement_cooling_c === 0);
  assert.ok(roofs.cool_roof_cooling_c > 0 && roofs.tree_cooling_c === 0 && roofs.cool_pavement_cooling_c === 0);
  assert.ok(pavement.cool_pavement_cooling_c > 0 && pavement.tree_cooling_c === 0 && pavement.cool_roof_cooling_c === 0);
});

test("portfolio preserves FortyGuard observation and conservatively combines interventions", () => {
  const result = evaluate();
  assert.equal(result.fortyguard_observed_temperature_c, 44);
  assert.equal(result.modeled_post_intervention_temperature_c, result.fortyguard_observed_temperature_c - result.central_estimate_c);
  assert.ok(result.central_estimate_c < result.tree_cooling_c + result.cool_roof_cooling_c + result.cool_pavement_cooling_c);
  assert.ok(result.lower_estimate_c <= result.central_estimate_c && result.central_estimate_c <= result.upper_estimate_c);
});

test("canopy is circular, overlap-adjusted, capped, and CO2 is mature-canopy only", () => {
  const result = evaluate({ treeCount: 500, coolRoofPct: 0, coolPavementPct: 0 });
  assert.ok(Math.abs(result.canopy_area_per_tree_m2 - 65.7) < 0.2);
  assert.equal(result.canopy_cap_applied, true);
  assert.ok(result.effective_added_canopy_m2 <= result.cell_area_m2);
  assert.ok(result.estimated_annual_co2_sequestration_kg > 0);
  assert.match(result.carbon_disclaimer, /Mature-canopy/);
});

test("inputs are bounded and extrapolation is disclosed", () => {
  const result = evaluate({ treeCount: 900, coolRoofPct: 140, coolPavementPct: 125 });
  assert.equal(result.tree_count, 500);
  assert.equal(result.cool_roof_pct, 100);
  assert.equal(result.cool_pavement_pct, 100);
  assert.equal(result.confidence, "Low");
  assert.ok(result.extrapolation_warnings.some((warning) => /AOI observed maximum/.test(warning)));
});

test("optimizer returns low, balanced, and exact maximum portfolios without forcing target success", () => {
  const allCells = cells();
  const optimized = optimizePolicyPortfolio({ selectedCell: allCells.features[0] as Feature<Polygon, Record<string, unknown>>, allCells, species, targetTemperatureC: 35, allowedTreeCountMax: 20, coolRoofMaximumPct: 40, coolPavementMaximumPct: 30, evidence, carbonEvidence: carbon });
  assert.deepEqual(optimized.plans.map((plan) => plan.plan_type), ["low_intervention", "balanced", "maximum_cooling"]);
  assert.equal(optimized.target_achievable, false);
  assert.ok(optimized.plans[1].remaining_target_gap_c > 0);
  assert.equal(optimized.plans[2].tree_count, 20);
  assert.equal(optimized.plans[2].cool_roof_pct, 40);
  assert.equal(optimized.plans[2].cool_pavement_pct, 30);
});

test("optimizer uses zero intervention when target is already satisfied", () => {
  const allCells = cells();
  const optimized = optimizePolicyPortfolio({ selectedCell: allCells.features[0] as Feature<Polygon, Record<string, unknown>>, allCells, species, targetTemperatureC: 45, allowedTreeCountMax: 20, coolRoofMaximumPct: 40, coolPavementMaximumPct: 30, evidence, carbonEvidence: carbon });
  assert.equal(optimized.required_reduction_c, 0);
  assert.ok(optimized.plans.slice(0, 2).every((plan) => plan.tree_count === 0 && plan.cool_roof_pct === 0 && plan.cool_pavement_pct === 0));
});

test("balanced plan reaches a small feasible target with no negative or over-limit inputs", () => {
  const allCells = cells();
  const optimized = optimizePolicyPortfolio({ selectedCell: allCells.features[0] as Feature<Polygon, Record<string, unknown>>, allCells, species, targetTemperatureC: 43.8, allowedTreeCountMax: 40, coolRoofMaximumPct: 60, coolPavementMaximumPct: 40, evidence, carbonEvidence: carbon });
  const balanced = optimized.plans[1];
  assert.equal(optimized.target_achievable, true);
  assert.equal(balanced.target_achieved, true);
  assert.ok(balanced.tree_count >= 0 && balanced.cool_roof_pct >= 0 && balanced.cool_roof_pct <= 60 && balanced.cool_pavement_pct >= 0 && balanced.cool_pavement_pct <= 40);
});

test("evidence database contains US air-temperature evidence and no fabricated training rows", () => {
  assert.ok(evidence.entries.length >= 6);
  assert.ok(evidence.entries.every((entry) => entry.air_temperature_or_surface_temperature === "air_temperature"));
  assert.equal("training_rows" in evidence, false);
});

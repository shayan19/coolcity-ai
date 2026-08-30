import { area } from "@turf/area";
import type { Feature, FeatureCollection, Polygon } from "geojson";

import type { TreeSpecies } from "./species-core.ts";

export const DEFAULT_CANOPY_OVERLAP_FACTOR = 0.85;
export const MIN_LOCAL_SAMPLES = 10;
export const MIN_TEMPERATURE_RANGE_C = 0.1;
export const LOCAL_CALIBRATION_BOUNDS: [number, number] = [0.8, 1.2];

export type CoolingEvidence = {
  database_id: string;
  model_parameters: {
    tree_canopy: { lower_c_per_tree_cover_percentage_point: number; central_c_per_tree_cover_percentage_point: number; upper_c_per_tree_cover_percentage_point: number; supported_maximum_increase_percentage_points: number };
    cool_roof: { lower_c_at_100_pct: number; central_c_at_100_pct: number; upper_c_at_100_pct: number; supported_maximum_pct: number };
    cool_pavement: { lower_c_at_100_pct: number; central_c_at_100_pct: number; upper_c_at_100_pct: number; supported_maximum_pct: number };
    combination: { additional_intervention_factor: number; description: string };
    local_calibration: { minimum_samples: number; minimum_temperature_range_c: number; minimum_tree_cover_range_percentage_points: number; minimum_r_squared: number; minimum_multiplier: number; maximum_multiplier: number };
  };
  entries: Array<{ id: string; intervention_type: string; air_temperature_or_surface_temperature: string; source_url: string }>;
};

export type CarbonEvidence = { net_co2_kg_per_m2_tree_cover_year: number; source: { label: string; url: string }; disclaimer: string };
export type LocalCalibration = {
  sample_count: number; temperature_range_c: number; tree_cover_range_pct: number;
  intercept_c: number | null; tree_cover_coefficient_c_per_pct_point: number | null;
  built_up_coefficient_c_per_pct_point: number | null; r_squared: number | null; rmse_c: number | null;
  local_calibration_used: boolean; multiplier: number; reason: string;
};
export type CoolingResponse = {
  cell_id: string; species: TreeSpecies; tree_count: number; cool_roof_pct: number; cool_pavement_pct: number;
  government_target_temperature_c: number; required_reduction_c: number; target_achieved: boolean; remaining_target_gap_c: number;
  fortyguard_observed_temperature_c: number; estimated_temperature_reduction_c: number; modeled_post_intervention_temperature_c: number;
  tree_cooling_c: number; cool_roof_cooling_c: number; cool_pavement_cooling_c: number;
  lower_estimate_c: number; central_estimate_c: number; upper_estimate_c: number; confidence: "Low" | "Medium" | "High";
  canopy_overlap_factor: number; cell_area_m2: number; canopy_area_per_tree_m2: number; gross_added_canopy_m2: number;
  effective_added_canopy_m2: number; canopy_cap_applied: boolean; existing_tree_cover_pct: number; projected_tree_cover_pct: number; tree_cover_increase_pp: number;
  estimated_annual_co2_sequestration_kg: number; carbon_factor_kg_per_m2_year: number;
  local_calibration: LocalCalibration; extrapolation_warnings: string[]; interaction_method: string; evidence_database_id: string;
  disclaimer: string; carbon_disclaimer: string;
};

type Row = { temperature: number; tree: number; built: number };
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));
const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

function solve3(matrix: number[][], vector: number[]): number[] | null {
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    if (Math.abs(a[pivot][column]) < 1e-10) return null;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    for (let item = column; item < 4; item += 1) a[column][item] /= divisor;
    for (let row = 0; row < 3; row += 1) if (row !== column) {
      const factor = a[row][column];
      for (let item = column; item < 4; item += 1) a[row][item] -= factor * a[column][item];
    }
  }
  return a.map((row) => row[3]);
}

export function fitLocalCalibration(
  cells: FeatureCollection<Polygon, Record<string, unknown>>,
  evidence: CoolingEvidence,
): LocalCalibration {
  const rows: Row[] = cells.features.flatMap((feature) => {
    const temperature = finite(feature.properties?.temperature_c);
    const tree = finite(feature.properties?.tree_cover_pct);
    const built = finite(feature.properties?.built_up_pct);
    return temperature === null || tree === null || built === null ? [] : [{ temperature, tree, built }];
  });
  const temperatures = rows.map((row) => row.temperature);
  const trees = rows.map((row) => row.tree);
  const temperatureRange = rows.length ? Math.max(...temperatures) - Math.min(...temperatures) : 0;
  const treeRange = rows.length ? Math.max(...trees) - Math.min(...trees) : 0;
  const base = (reason: string): LocalCalibration => ({ sample_count: rows.length, temperature_range_c: round(temperatureRange, 4), tree_cover_range_pct: round(treeRange, 2), intercept_c: null, tree_cover_coefficient_c_per_pct_point: null, built_up_coefficient_c_per_pct_point: null, r_squared: null, rmse_c: null, local_calibration_used: false, multiplier: 1, reason });
  const gate = evidence.model_parameters.local_calibration;
  if (rows.length < gate.minimum_samples) return base(`Requires at least ${gate.minimum_samples} complete cells.`);
  if (temperatureRange < gate.minimum_temperature_range_c) return base(`Temperature range is below the ${gate.minimum_temperature_range_c} C quality gate.`);
  if (treeRange < gate.minimum_tree_cover_range_percentage_points) return base(`Tree-cover range is below the ${gate.minimum_tree_cover_range_percentage_points} percentage-point quality gate.`);
  const x = rows.map((row) => [1, row.tree, row.built]);
  const xtx = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => x.reduce((sum, row) => sum + row[i] * row[j], 0)));
  const xty = Array.from({ length: 3 }, (_, i) => x.reduce((sum, row, index) => sum + row[i] * temperatures[index], 0));
  const coefficients = solve3(xtx, xty);
  if (!coefficients) return base("Local predictors are singular.");
  const predictions = x.map((row) => row.reduce((sum, value, index) => sum + value * coefficients[index], 0));
  const mean = temperatures.reduce((sum, value) => sum + value, 0) / rows.length;
  const residual = temperatures.reduce((sum, value, index) => sum + (value - predictions[index]) ** 2, 0);
  const total = temperatures.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const r2 = 1 - residual / total;
  const treeCoefficient = coefficients[1];
  const usable = r2 >= gate.minimum_r_squared && treeCoefficient < 0;
  const rawMultiplier = Math.abs(treeCoefficient) / evidence.model_parameters.tree_canopy.central_c_per_tree_cover_percentage_point;
  return {
    sample_count: rows.length, temperature_range_c: round(temperatureRange, 4), tree_cover_range_pct: round(treeRange, 2),
    intercept_c: round(coefficients[0]), tree_cover_coefficient_c_per_pct_point: round(treeCoefficient, 5), built_up_coefficient_c_per_pct_point: round(coefficients[2], 5),
    r_squared: round(r2), rmse_c: round(Math.sqrt(residual / rows.length)), local_calibration_used: usable,
    multiplier: usable ? round(clamp(rawMultiplier, gate.minimum_multiplier, gate.maximum_multiplier), 3) : 1,
    reason: usable ? "Local relationship passed all gates and provides a bounded calibration." : treeCoefficient >= 0 ? "Local tree coefficient does not support cooling; evidence model used." : `Local R2 is below the ${gate.minimum_r_squared} gate; evidence model used.`,
  };
}

function combine(values: number[], factor: number): number {
  const ordered = [...values].filter((value) => value > 0).sort((a, b) => b - a);
  return ordered.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : factor), 0);
}

export function evaluateCoolingResponse(input: {
  selectedCell: Feature<Polygon, Record<string, unknown>>; allCells: FeatureCollection<Polygon, Record<string, unknown>>;
  species: TreeSpecies; treeCount: number; coolRoofPct: number; coolPavementPct: number; targetTemperatureC: number;
  evidence: CoolingEvidence; carbonEvidence: CarbonEvidence; overlapFactor?: number;
}): CoolingResponse {
  const treeCount = clamp(Math.round(input.treeCount), 0, 500);
  const roofPct = clamp(input.coolRoofPct, 0, 100);
  const pavementPct = clamp(input.coolPavementPct, 0, 100);
  const baseline = finite(input.selectedCell.properties?.temperature_c);
  if (baseline === null) throw new Error("Selected cell has no numeric FortyGuard temperature.");
  if (input.species.mature_width_ft === null || input.species.mature_width_ft <= 0) throw new Error("Selected species has no supported mature canopy width.");
  const cellArea = area(input.selectedCell);
  const existingTreePct = clamp(finite(input.selectedCell.properties?.tree_cover_pct) ?? 0, 0, 100);
  const existingCanopy = cellArea * existingTreePct / 100;
  const canopyPerTree = Math.PI * ((input.species.mature_width_ft * 0.3048) / 2) ** 2;
  const grossCanopy = canopyPerTree * treeCount;
  const overlap = input.overlapFactor ?? DEFAULT_CANOPY_OVERLAP_FACTOR;
  const effectiveCanopy = Math.min(grossCanopy * overlap, Math.max(0, cellArea - existingCanopy));
  const addedPct = cellArea > 0 ? effectiveCanopy / cellArea * 100 : 0;
  const projectedTreePct = Math.min(100, existingTreePct + addedPct);
  const calibration = fitLocalCalibration(input.allCells, input.evidence);
  const parameters = input.evidence.model_parameters;
  const treeCentral = addedPct * parameters.tree_canopy.central_c_per_tree_cover_percentage_point * calibration.multiplier;
  const roofCentral = roofPct / 100 * parameters.cool_roof.central_c_at_100_pct;
  const pavementCentral = pavementPct / 100 * parameters.cool_pavement.central_c_at_100_pct;
  const interaction = parameters.combination.additional_intervention_factor;
  const lower = combine([addedPct * parameters.tree_canopy.lower_c_per_tree_cover_percentage_point * calibration.multiplier, roofPct / 100 * parameters.cool_roof.lower_c_at_100_pct, pavementPct / 100 * parameters.cool_pavement.lower_c_at_100_pct], interaction);
  const central = combine([treeCentral, roofCentral, pavementCentral], interaction);
  const upper = combine([addedPct * parameters.tree_canopy.upper_c_per_tree_cover_percentage_point * calibration.multiplier, roofPct / 100 * parameters.cool_roof.upper_c_at_100_pct, pavementPct / 100 * parameters.cool_pavement.upper_c_at_100_pct], interaction);
  const warnings: string[] = [];
  const observedTreeCover = input.allCells.features
    .map((feature) => finite(feature.properties?.tree_cover_pct))
    .filter((value): value is number => value !== null);
  const observedTreeMaximum = observedTreeCover.length ? Math.max(...observedTreeCover) : null;
  if (observedTreeMaximum !== null && projectedTreePct > observedTreeMaximum + 1) warnings.push(`Projected tree cover exceeds the AOI observed maximum of ${round(observedTreeMaximum, 1)}%.`);
  if (addedPct > parameters.tree_canopy.supported_maximum_increase_percentage_points) warnings.push("Tree-cover increase exceeds the evidence-supported screening range.");
  if (roofPct > parameters.cool_roof.supported_maximum_pct) warnings.push("Cool-roof coverage exceeds the evidence-supported range.");
  if (pavementPct > parameters.cool_pavement.supported_maximum_pct) warnings.push("Cool-pavement coverage exceeds the evidence-supported range.");
  const highMagnitude = roofPct > 80 || pavementPct > 80 || addedPct > 30;
  const confidence: CoolingResponse["confidence"] = warnings.length || highMagnitude ? "Low" : calibration.local_calibration_used ? "High" : "Medium";
  const required = Math.max(0, baseline - input.targetTemperatureC);
  const post = baseline - central;
  const gap = Math.max(0, post - input.targetTemperatureC);
  const carbon = effectiveCanopy * input.carbonEvidence.net_co2_kg_per_m2_tree_cover_year;
  return {
    cell_id: String(input.selectedCell.properties?.cell_id ?? "Selected cell"), species: input.species, tree_count: treeCount, cool_roof_pct: round(roofPct, 1), cool_pavement_pct: round(pavementPct, 1),
    government_target_temperature_c: round(input.targetTemperatureC), required_reduction_c: round(required), target_achieved: gap <= 0.001, remaining_target_gap_c: round(gap),
    fortyguard_observed_temperature_c: round(baseline), estimated_temperature_reduction_c: round(central), modeled_post_intervention_temperature_c: round(post),
    tree_cooling_c: round(treeCentral), cool_roof_cooling_c: round(roofCentral), cool_pavement_cooling_c: round(pavementCentral),
    lower_estimate_c: round(lower), central_estimate_c: round(central), upper_estimate_c: round(Math.max(upper, central)), confidence,
    canopy_overlap_factor: overlap, cell_area_m2: round(cellArea, 1), canopy_area_per_tree_m2: round(canopyPerTree, 1), gross_added_canopy_m2: round(grossCanopy, 1),
    effective_added_canopy_m2: round(effectiveCanopy, 1), canopy_cap_applied: grossCanopy * overlap > Math.max(0, cellArea - existingCanopy), existing_tree_cover_pct: round(existingTreePct, 1), projected_tree_cover_pct: round(projectedTreePct, 1), tree_cover_increase_pp: round(addedPct, 1),
    estimated_annual_co2_sequestration_kg: round(carbon, 1), carbon_factor_kg_per_m2_year: input.carbonEvidence.net_co2_kg_per_m2_tree_cover_year,
    local_calibration: calibration, extrapolation_warnings: warnings, interaction_method: parameters.combination.description, evidence_database_id: input.evidence.database_id,
    disclaimer: "Evidence-constrained planning prediction, not a guaranteed outcome or a FortyGuard intervention forecast.",
    carbon_disclaimer: "Mature-canopy screening estimate. Newly planted trees will not immediately provide mature-canopy sequestration.",
  };
}

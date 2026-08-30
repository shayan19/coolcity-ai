import type { Feature, FeatureCollection, Polygon } from "geojson";

import {
  evaluateCoolingResponse,
  type CarbonEvidence,
  type CoolingEvidence,
  type CoolingResponse,
} from "./cooling-response-model.ts";
import type { TreeSpecies } from "./species-core.ts";

export type PolicyPlan = CoolingResponse & { plan_type: "low_intervention" | "balanced" | "maximum_cooling" };
export type PolicyOptimization = {
  target_achievable: boolean;
  required_reduction_c: number;
  plans: [PolicyPlan, PolicyPlan, PolicyPlan];
};

function withType(response: CoolingResponse, plan_type: PolicyPlan["plan_type"]): PolicyPlan {
  return { ...response, plan_type };
}

export function optimizePolicyPortfolio(input: {
  selectedCell: Feature<Polygon, Record<string, unknown>>;
  allCells: FeatureCollection<Polygon, Record<string, unknown>>;
  species: TreeSpecies;
  targetTemperatureC: number;
  allowedTreeCountMax: number;
  coolRoofMaximumPct: number;
  coolPavementMaximumPct: number;
  evidence: CoolingEvidence;
  carbonEvidence: CarbonEvidence;
}): PolicyOptimization {
  const treeMax = Math.max(0, Math.min(500, Math.round(input.allowedTreeCountMax)));
  const roofMax = Math.max(0, Math.min(100, input.coolRoofMaximumPct));
  const pavementMax = Math.max(0, Math.min(100, input.coolPavementMaximumPct));
  const treeStep = Math.max(1, Math.ceil(treeMax / 20));
  const candidates: Array<{ response: CoolingResponse; intensity: number }> = [];
  const treeValues = Array.from(new Set([0, ...Array.from({ length: Math.ceil(treeMax / treeStep) }, (_, index) => Math.min(treeMax, (index + 1) * treeStep)), treeMax]));
  const coverageValues = (maximum: number) => Array.from(new Set([0, ...Array.from({ length: Math.ceil(maximum / 10) }, (_, index) => Math.min(maximum, (index + 1) * 10)), maximum]));
  for (const trees of treeValues) for (const roofs of coverageValues(roofMax)) for (const pavement of coverageValues(pavementMax)) {
    const response = evaluateCoolingResponse({
      selectedCell: input.selectedCell, allCells: input.allCells, species: input.species,
      treeCount: trees, coolRoofPct: roofs, coolPavementPct: pavement,
      targetTemperatureC: input.targetTemperatureC, evidence: input.evidence, carbonEvidence: input.carbonEvidence,
    });
    const intensity = (treeMax ? trees / treeMax : 0) + (roofMax ? roofs / roofMax : 0) + (pavementMax ? pavement / pavementMax : 0);
    candidates.push({ response, intensity });
  }
  const maximum = evaluateCoolingResponse({
    selectedCell: input.selectedCell, allCells: input.allCells, species: input.species,
    treeCount: treeMax, coolRoofPct: roofMax, coolPavementPct: pavementMax,
    targetTemperatureC: input.targetTemperatureC, evidence: input.evidence, carbonEvidence: input.carbonEvidence,
  });
  const required = maximum.required_reduction_c;
  const sortIntensity = (a: typeof candidates[number], b: typeof candidates[number]) => a.intensity - b.intensity || b.response.central_estimate_c - a.response.central_estimate_c;
  const zero = candidates.find((candidate) => candidate.intensity === 0)!.response;
  const lowThreshold = Math.min(required * 0.25, maximum.central_estimate_c * 0.25);
  const low = required <= 0 ? zero : [...candidates].filter((candidate) => candidate.intensity > 0 && candidate.response.central_estimate_c >= lowThreshold).sort(sortIntensity)[0]?.response ?? maximum;
  const achievers = [...candidates].filter((candidate) => candidate.response.central_estimate_c >= required).sort(sortIntensity);
  const balanced = required <= 0 ? zero : achievers[0]?.response ?? maximum;
  return {
    target_achievable: maximum.central_estimate_c >= required,
    required_reduction_c: required,
    plans: [withType(low, "low_intervention"), withType(balanced, "balanced"), withType(maximum, "maximum_cooling")],
  };
}

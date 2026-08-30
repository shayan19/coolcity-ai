import type { Feature, FeatureCollection, Polygon } from "geojson";

import {
  evaluateCoolingResponse,
  type CarbonEvidence,
  type CoolingEvidence,
  type CoolingResponse,
} from "./cooling-response-model.ts";
import type { TreeSpecies } from "./species-core.ts";

export const LOW_INTERVENTION_INTENSITY_CAP = 0.25;
export const BALANCED_UNREACHABLE_COOLING_FRACTION = 0.8;

export type PolicyPlanType = "low_intervention" | "balanced" | "maximum_cooling";
export type BalancedRule = "target" | "eighty_percent_of_maximum" | "no_intervention_needed";
export type PolicyPlan = CoolingResponse & {
  plan_type: PolicyPlanType;
  intervention_intensity: number;
  objective: string;
  objective_cooling_requirement_c: number | null;
};
export type PolicyOptimization = {
  target_achievable: boolean;
  required_reduction_c: number;
  maximum_feasible_cooling_c: number;
  balanced_cooling_requirement_c: number;
  balanced_rule: BalancedRule;
  low_intervention_intensity_cap: number;
  plans: [PolicyPlan, PolicyPlan, PolicyPlan];
};

type Candidate = { response: CoolingResponse; intensity: number };
const EPSILON = 1e-9;

function compareInputs(a: Candidate, b: Candidate): number {
  return a.response.tree_count - b.response.tree_count
    || a.response.cool_roof_pct - b.response.cool_roof_pct
    || a.response.cool_pavement_pct - b.response.cool_pavement_pct;
}

function compareCoolingThenIntensity(a: Candidate, b: Candidate): number {
  return b.response.central_estimate_c - a.response.central_estimate_c
    || a.intensity - b.intensity
    || compareInputs(a, b);
}

function compareIntensityThenCooling(a: Candidate, b: Candidate): number {
  return a.intensity - b.intensity
    || b.response.central_estimate_c - a.response.central_estimate_c
    || compareInputs(a, b);
}

function withObjective(
  candidate: Candidate,
  planType: PolicyPlanType,
  objective: string,
  coolingRequirement: number | null,
): PolicyPlan {
  return {
    ...candidate.response,
    plan_type: planType,
    intervention_intensity: candidate.intensity,
    objective,
    objective_cooling_requirement_c: coolingRequirement,
  };
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
  const enabledInterventions = Number(treeMax > 0) + Number(roofMax > 0) + Number(pavementMax > 0);
  const treeStep = Math.max(1, Math.ceil(treeMax / 20));
  const candidates: Candidate[] = [];
  const treeValues = Array.from(new Set([0, ...Array.from({ length: Math.ceil(treeMax / treeStep) }, (_, index) => Math.min(treeMax, (index + 1) * treeStep)), treeMax]));
  const coverageValues = (maximum: number) => Array.from(new Set([0, ...Array.from({ length: Math.ceil(maximum / 10) }, (_, index) => Math.min(maximum, (index + 1) * 10)), maximum]));

  for (const trees of treeValues) for (const roofs of coverageValues(roofMax)) for (const pavement of coverageValues(pavementMax)) {
    const response = evaluateCoolingResponse({
      selectedCell: input.selectedCell,
      allCells: input.allCells,
      species: input.species,
      treeCount: trees,
      coolRoofPct: roofs,
      coolPavementPct: pavement,
      targetTemperatureC: input.targetTemperatureC,
      evidence: input.evidence,
      carbonEvidence: input.carbonEvidence,
    });
    const intensityTotal = (treeMax ? trees / treeMax : 0)
      + (roofMax ? roofs / roofMax : 0)
      + (pavementMax ? pavement / pavementMax : 0);
    const intensity = enabledInterventions ? intensityTotal / enabledInterventions : 0;
    candidates.push({ response, intensity });
  }

  const maximum = [...candidates].sort(compareCoolingThenIntensity)[0];
  const maximumCooling = maximum.response.central_estimate_c;
  const required = maximum.response.required_reduction_c;
  const targetAchievable = maximumCooling + EPSILON >= required;
  const balancedRule: BalancedRule = required <= EPSILON
    ? "no_intervention_needed"
    : targetAchievable
      ? "target"
      : "eighty_percent_of_maximum";
  const balancedRequirement = balancedRule === "no_intervention_needed"
    ? 0
    : balancedRule === "target"
      ? required
      : maximumCooling * BALANCED_UNREACHABLE_COOLING_FRACTION;
  const balanced = [...candidates]
    .filter((candidate) => candidate.response.central_estimate_c + EPSILON >= balancedRequirement)
    .sort(compareIntensityThenCooling)[0] ?? maximum;
  const low = [...candidates]
    .filter((candidate) => candidate.intensity <= LOW_INTERVENTION_INTENSITY_CAP + EPSILON)
    .sort(compareCoolingThenIntensity)[0];

  return {
    target_achievable: targetAchievable,
    required_reduction_c: required,
    maximum_feasible_cooling_c: maximumCooling,
    balanced_cooling_requirement_c: balancedRequirement,
    balanced_rule: balancedRule,
    low_intervention_intensity_cap: LOW_INTERVENTION_INTENSITY_CAP,
    plans: [
      withObjective(low, "low_intervention", `Maximize predicted cooling at or below ${(LOW_INTERVENTION_INTENSITY_CAP * 100).toFixed(0)}% normalized intervention intensity.`, null),
      withObjective(balanced, "balanced", balancedRule === "target"
        ? "Minimize intervention intensity while achieving the government cooling target."
        : balancedRule === "eighty_percent_of_maximum"
          ? `Minimize intervention intensity while achieving at least ${(BALANCED_UNREACHABLE_COOLING_FRACTION * 100).toFixed(0)}% of maximum feasible cooling.`
          : "Use no intervention because the observed temperature already meets the government target.", balancedRequirement),
      withObjective(maximum, "maximum_cooling", "Maximize predicted temperature reduction within the configured feasibility limits.", maximumCooling),
    ],
  };
}

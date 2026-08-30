export const INCENTIVE_WEIGHTS = {
  thermalBurden: 0.5,
  coolingBenefit: 0.3,
  durability: 0.2,
} as const;

export const REFERENCE_COOLING_C = 2;

export type DurabilityCategory = "Low" | "Medium" | "High";
export type InterventionType = "tree_planting" | "cool_roof" | "cool_pavement" | "combined_intervention";
export type IncentiveTier = "standard" | "priority" | "high_priority" | "critical_heat_zone";
export type VerificationStatus = "Proposed" | "Installed" | "Verified" | "Maintained";

export const DURABILITY_SCORES: Record<DurabilityCategory, number> = {
  Low: 35,
  Medium: 65,
  High: 90,
};

export const INTERVENTION_DURABILITY: Record<InterventionType, DurabilityCategory> = {
  tree_planting: "Medium",
  cool_roof: "High",
  cool_pavement: "Medium",
  combined_intervention: "High",
};

export const INCENTIVE_TIER_THRESHOLDS: ReadonlyArray<{
  tier: IncentiveTier;
  label: string;
  minimumScore: number;
}> = [
  { tier: "critical_heat_zone", label: "Critical Heat Zone", minimumScore: 85 },
  { tier: "high_priority", label: "High Priority", minimumScore: 70 },
  { tier: "priority", label: "Priority", minimumScore: 40 },
  { tier: "standard", label: "Standard", minimumScore: 0 },
];

export type IncentiveCreditConfiguration = Record<IncentiveTier, number>;

export const DEFAULT_INCENTIVE_CREDIT_CONFIGURATION: IncentiveCreditConfiguration = {
  standard: 500,
  priority: 1_500,
  high_priority: 3_000,
  critical_heat_zone: 5_000,
};

export const VERIFICATION_POLICY: Record<VerificationStatus, {
  eligibleForCredit: boolean;
  eligibleForPartialCredit: boolean;
  eligibleForFullCredit: boolean;
  eligibleForRenewalOrBonus: boolean;
  explanation: string;
}> = {
  Proposed: {
    eligibleForCredit: false,
    eligibleForPartialCredit: false,
    eligibleForFullCredit: false,
    eligibleForRenewalOrBonus: false,
    explanation: "Proposed work requires installation and agency review before any illustrative credit can be considered.",
  },
  Installed: {
    eligibleForCredit: true,
    eligibleForPartialCredit: true,
    eligibleForFullCredit: false,
    eligibleForRenewalOrBonus: false,
    explanation: "Installed work may be screened for a partial credit, subject to government verification.",
  },
  Verified: {
    eligibleForCredit: true,
    eligibleForPartialCredit: false,
    eligibleForFullCredit: true,
    eligibleForRenewalOrBonus: false,
    explanation: "Verified work may be screened for the full configured credit, subject to agency rules.",
  },
  Maintained: {
    eligibleForCredit: true,
    eligibleForPartialCredit: false,
    eligibleForFullCredit: true,
    eligibleForRenewalOrBonus: true,
    explanation: "Maintained and verified work may be screened for renewal or a configured bonus, subject to agency rules.",
  },
};

export type IncentivePolicyConfiguration = {
  weights: { thermalBurden: number; coolingBenefit: number; durability: number };
  referenceCoolingC: number;
  durabilityScores: Record<DurabilityCategory, number>;
  tierThresholds: typeof INCENTIVE_TIER_THRESHOLDS;
};

export const DEFAULT_INCENTIVE_POLICY_CONFIGURATION: IncentivePolicyConfiguration = {
  weights: INCENTIVE_WEIGHTS,
  referenceCoolingC: REFERENCE_COOLING_C,
  durabilityScores: DURABILITY_SCORES,
  tierThresholds: INCENTIVE_TIER_THRESHOLDS,
};

export type IncentiveAssessment = {
  policyType: "Heat Mitigation Credit";
  selectedSiteId: string;
  fortyGuardThermalPriority: number;
  fortyGuardThermalPercentile: number;
  modeledCoolingBenefitC: number;
  coolingBenefitScore: number;
  interventionType: InterventionType;
  durability: DurabilityCategory;
  durabilityScore: number;
  coolingIncentiveScore: number;
  tier: IncentiveTier;
  tierLabel: string;
  illustrativeMaximumCredit: number;
  verificationStatus: VerificationStatus;
  eligibility: (typeof VERIFICATION_POLICY)[VerificationStatus];
  componentPoints: { thermalBurden: number; coolingBenefit: number; durability: number };
  explanation: string[];
  estimatedAnnualCo2SequestrationKg: number;
  increasesTaxLiability: false;
  decisionSupportOnly: true;
  disclaimer: string;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

export function inferInterventionType(input: {
  treeCount: number;
  coolRoofPct: number;
  coolPavementPct: number;
}): InterventionType | null {
  const active: InterventionType[] = [];
  if (input.treeCount > 0) active.push("tree_planting");
  if (input.coolRoofPct > 0) active.push("cool_roof");
  if (input.coolPavementPct > 0) active.push("cool_pavement");
  if (active.length > 1) return "combined_intervention";
  return active[0] ?? null;
}

export function tierForIncentiveScore(
  score: number,
  thresholds = INCENTIVE_TIER_THRESHOLDS,
): { tier: IncentiveTier; label: string } {
  const bounded = clamp(requireFinite(score, "Cooling Incentive Score"), 0, 100);
  const match = [...thresholds]
    .sort((a, b) => b.minimumScore - a.minimumScore)
    .find((threshold) => bounded >= threshold.minimumScore);
  if (!match) throw new Error("Incentive tier configuration must include a zero-score tier.");
  return { tier: match.tier, label: match.label };
}

const interventionLabel = (type: InterventionType) => type.replaceAll("_", " ");

export function calculateCoolingIncentive(input: {
  selectedSiteId: string;
  fortyGuardThermalPriority: number;
  fortyGuardThermalPercentile: number;
  modeledCoolingBenefitC: number;
  interventionType: InterventionType;
  durability: DurabilityCategory;
  verificationStatus: VerificationStatus;
  estimatedAnnualCo2SequestrationKg?: number;
  creditConfiguration?: IncentiveCreditConfiguration;
  policyConfiguration?: IncentivePolicyConfiguration;
}): IncentiveAssessment {
  const policy = input.policyConfiguration ?? DEFAULT_INCENTIVE_POLICY_CONFIGURATION;
  const credits = input.creditConfiguration ?? DEFAULT_INCENTIVE_CREDIT_CONFIGURATION;
  const thermal = clamp(requireFinite(input.fortyGuardThermalPriority, "FortyGuard Thermal Priority"), 0, 100);
  const percentile = clamp(requireFinite(input.fortyGuardThermalPercentile, "FortyGuard thermal percentile"), 0, 100);
  const cooling = requireFinite(input.modeledCoolingBenefitC, "Modeled cooling benefit");
  if (cooling <= 0) throw new Error("A positive modeled cooling result is required for incentive screening.");
  if (policy.referenceCoolingC <= 0 || !Number.isFinite(policy.referenceCoolingC)) throw new Error("Cooling policy reference must be positive.");
  const weights = policy.weights;
  const weightTotal = weights.thermalBurden + weights.coolingBenefit + weights.durability;
  if (weightTotal <= 0 || Object.values(weights).some((value) => value < 0 || !Number.isFinite(value))) throw new Error("Incentive weights must be finite, non-negative, and have a positive total.");
  const coolingScore = clamp(cooling / policy.referenceCoolingC * 100, 0, 100);
  const durabilityScore = clamp(requireFinite(policy.durabilityScores[input.durability], "Durability score"), 0, 100);
  const componentPoints = {
    thermalBurden: thermal * weights.thermalBurden / weightTotal,
    coolingBenefit: coolingScore * weights.coolingBenefit / weightTotal,
    durability: durabilityScore * weights.durability / weightTotal,
  };
  const incentiveScore = clamp(componentPoints.thermalBurden + componentPoints.coolingBenefit + componentPoints.durability, 0, 100);
  const tier = tierForIncentiveScore(incentiveScore, policy.tierThresholds);
  const illustrativeCredit = Math.max(0, requireFinite(credits[tier.tier], "Illustrative maximum credit"));
  const eligibility = VERIFICATION_POLICY[input.verificationStatus];
  const co2 = Math.max(0, requireFinite(input.estimatedAnnualCo2SequestrationKg ?? 0, "Annual CO2 sequestration"));
  const score = round(incentiveScore);
  const explanation = [
    `${input.selectedSiteId} has a FortyGuard Thermal Priority of ${round(thermal)} / 100 and is in the ${round(percentile)}th thermal percentile; thermal burden contributes ${round(componentPoints.thermalBurden)} score points.`,
    `The ${interventionLabel(input.interventionType)} portfolio is modeled by CoolCity to reduce local air temperature by ${round(cooling, 2)} C; against the ${round(policy.referenceCoolingC, 2)} C policy reference, cooling benefit contributes ${round(componentPoints.coolingBenefit)} score points.`,
    `The configured ${input.durability.toLowerCase()} durability category contributes ${round(componentPoints.durability)} score points; this category is a policy-screening assumption, not a claimed service life.`,
    `The resulting Cooling Incentive Score is ${score} / 100, placing the selected site in the ${tier.label} government-configurable policy tier.`,
    `Verification status is ${input.verificationStatus}. ${eligibility.explanation}`,
  ];
  return {
    policyType: "Heat Mitigation Credit",
    selectedSiteId: input.selectedSiteId,
    fortyGuardThermalPriority: round(thermal),
    fortyGuardThermalPercentile: round(percentile),
    modeledCoolingBenefitC: round(cooling, 2),
    coolingBenefitScore: round(coolingScore),
    interventionType: input.interventionType,
    durability: input.durability,
    durabilityScore: round(durabilityScore),
    coolingIncentiveScore: score,
    tier: tier.tier,
    tierLabel: tier.label,
    illustrativeMaximumCredit: round(illustrativeCredit, 2),
    verificationStatus: input.verificationStatus,
    eligibility,
    componentPoints: {
      thermalBurden: round(componentPoints.thermalBurden),
      coolingBenefit: round(componentPoints.coolingBenefit),
      durability: round(componentPoints.durability),
    },
    explanation,
    estimatedAnnualCo2SequestrationKg: round(co2, 1),
    increasesTaxLiability: false,
    decisionSupportOnly: true,
    disclaimer: "This incentive result is a policy-screening recommendation. Actual tax credits, eligibility rules, funding levels, and verification requirements must be established by the responsible government agency.",
  };
}

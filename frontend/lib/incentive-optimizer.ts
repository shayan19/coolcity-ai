import type { IncentiveAssessment } from "./incentive-core.ts";

export type IncentiveCandidate = {
  siteId: string;
  assessment: IncentiveAssessment;
};

export type RankedIncentiveCandidate = IncentiveCandidate & {
  rank: number;
  policyValueScore: number;
  thermalValuePerDollar: number;
  recommendedForFunding: boolean;
  allocatedCredit: number;
  fundingReason: string;
};

export type IncentiveBudgetAllocation = {
  totalBudget: number;
  allocatedBudget: number;
  remainingBudget: number;
  sitesEvaluated: number;
  sitesFunded: number;
  criticalHeatZones: number;
  estimatedAggregateModeledCoolingC: number;
  estimatedAggregateAnnualCo2SequestrationKg: number;
  candidates: RankedIncentiveCandidate[];
  disclaimer: string;
};

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export function allocateIncentiveBudget(
  totalBudget: number,
  candidates: IncentiveCandidate[],
): IncentiveBudgetAllocation {
  if (!Number.isFinite(totalBudget) || totalBudget < 0) throw new Error("City incentive budget must be a finite, non-negative number.");
  const scored = candidates.map((candidate) => {
    const cost = candidate.assessment.illustrativeMaximumCredit;
    const cooling = candidate.assessment.modeledCoolingBenefitC;
    if (!Number.isFinite(cost) || cost < 0) throw new Error("Illustrative incentive cost must be finite and non-negative.");
    if (!Number.isFinite(cooling) || cooling < 0) throw new Error("Modeled cooling benefit must be finite and non-negative.");
    const policyValueScore = candidate.assessment.coolingIncentiveScore * cooling;
    const thermalValuePerDollar = cost === 0 ? policyValueScore : policyValueScore / cost;
    return { ...candidate, policyValueScore, thermalValuePerDollar };
  }).sort((a, b) =>
    Number(b.assessment.eligibility.eligibleForCredit) - Number(a.assessment.eligibility.eligibleForCredit)
      || b.thermalValuePerDollar - a.thermalValuePerDollar
      || b.policyValueScore - a.policyValueScore
      || a.siteId.localeCompare(b.siteId),
  );

  let remaining = totalBudget;
  const ranked = scored.map((candidate, index): RankedIncentiveCandidate => {
    const cost = candidate.assessment.illustrativeMaximumCredit;
    const eligible = candidate.assessment.eligibility.eligibleForCredit;
    const funded = eligible && cost <= remaining;
    if (funded) remaining -= cost;
    return {
      ...candidate,
      rank: index + 1,
      policyValueScore: round(candidate.policyValueScore),
      thermalValuePerDollar: round(candidate.thermalValuePerDollar, 6),
      recommendedForFunding: funded,
      allocatedCredit: funded ? cost : 0,
      fundingReason: !eligible
        ? `Verification status ${candidate.assessment.verificationStatus} is not currently eligible under the example policy configuration.`
        : funded
          ? "Recommended within the available illustrative budget based on policy value per dollar."
          : "Not recommended in this allocation because the remaining illustrative budget is insufficient.",
    };
  });
  const funded = ranked.filter((candidate) => candidate.recommendedForFunding);
  return {
    totalBudget: round(totalBudget),
    allocatedBudget: round(totalBudget - remaining),
    remainingBudget: round(remaining),
    sitesEvaluated: ranked.length,
    sitesFunded: funded.length,
    criticalHeatZones: ranked.filter((candidate) => candidate.assessment.tier === "critical_heat_zone").length,
    estimatedAggregateModeledCoolingC: round(funded.reduce((sum, candidate) => sum + candidate.assessment.modeledCoolingBenefitC, 0)),
    estimatedAggregateAnnualCo2SequestrationKg: round(funded.reduce((sum, candidate) => sum + candidate.assessment.estimatedAnnualCo2SequestrationKg, 0), 1),
    candidates: ranked,
    disclaimer: "This deterministic allocation is a policy-screening comparison, not a complete measure of social welfare or an official funding decision. Aggregate cooling is the sum of modeled site-level reductions, not a citywide temperature forecast.",
  };
}

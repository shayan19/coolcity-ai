import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_INCENTIVE_CREDIT_CONFIGURATION,
  INCENTIVE_TIER_THRESHOLDS,
  INCENTIVE_WEIGHTS,
  INTERVENTION_DURABILITY,
  VERIFICATION_POLICY,
  calculateCoolingIncentive,
  inferInterventionType,
  tierForIncentiveScore,
  type VerificationStatus,
} from "../lib/incentive-core.ts";
import { allocateIncentiveBudget } from "../lib/incentive-optimizer.ts";

const assessment = (overrides: Partial<Parameters<typeof calculateCoolingIncentive>[0]> = {}) => calculateCoolingIncentive({
  selectedSiteId: "FG-16",
  fortyGuardThermalPriority: 94,
  fortyGuardThermalPercentile: 98,
  modeledCoolingBenefitC: 1.4,
  interventionType: "combined_intervention",
  durability: "High",
  verificationStatus: "Verified",
  estimatedAnnualCo2SequestrationKg: 120,
  ...overrides,
});

test("incentive score uses centralized 50/30/20 prototype weights and remains bounded", () => {
  assert.deepEqual(INCENTIVE_WEIGHTS, { thermalBurden: 0.5, coolingBenefit: 0.3, durability: 0.2 });
  const result = assessment();
  assert.equal(result.coolingIncentiveScore, 86);
  assert.ok(result.coolingIncentiveScore >= 0 && result.coolingIncentiveScore <= 100);
  assert.equal(assessment({ fortyGuardThermalPriority: 500, modeledCoolingBenefitC: 20 }).coolingIncentiveScore, 98);
  assert.equal(assessment({ fortyGuardThermalPriority: -20, modeledCoolingBenefitC: 0.01, durability: "Low" }).coolingIncentiveScore, 7.2);
});

test("FortyGuard thermal burden is the dominant score component", () => {
  const lowThermal = assessment({ fortyGuardThermalPriority: 0 });
  const highThermal = assessment({ fortyGuardThermalPriority: 100 });
  const lowCooling = assessment({ modeledCoolingBenefitC: 0.01 });
  const highCooling = assessment({ modeledCoolingBenefitC: 2 });
  assert.equal(highThermal.coolingIncentiveScore - lowThermal.coolingIncentiveScore, 50);
  assert.ok(highCooling.coolingIncentiveScore - lowCooling.coolingIncentiveScore < 30);
});

test("cooling benefit normalization is capped and a modeled result is required", () => {
  assert.equal(assessment({ modeledCoolingBenefitC: 1 }).coolingBenefitScore, 50);
  assert.equal(assessment({ modeledCoolingBenefitC: 4 }).coolingBenefitScore, 100);
  assert.throws(() => assessment({ modeledCoolingBenefitC: 0 }), /positive modeled cooling result/);
  assert.throws(() => assessment({ modeledCoolingBenefitC: Number.NaN }), /finite number/);
});

test("durability categories and intervention inference are centralized", () => {
  assert.equal(INTERVENTION_DURABILITY.tree_planting, "Medium");
  assert.equal(INTERVENTION_DURABILITY.cool_roof, "High");
  assert.equal(INTERVENTION_DURABILITY.cool_pavement, "Medium");
  assert.equal(inferInterventionType({ treeCount: 4, coolRoofPct: 0, coolPavementPct: 0 }), "tree_planting");
  assert.equal(inferInterventionType({ treeCount: 4, coolRoofPct: 20, coolPavementPct: 0 }), "combined_intervention");
  assert.equal(inferInterventionType({ treeCount: 0, coolRoofPct: 0, coolPavementPct: 0 }), null);
});

test("tier thresholds and illustrative credits are centralized", () => {
  assert.deepEqual(INCENTIVE_TIER_THRESHOLDS.map((entry) => entry.minimumScore), [85, 70, 40, 0]);
  assert.equal(tierForIncentiveScore(39.9).tier, "standard");
  assert.equal(tierForIncentiveScore(40).tier, "priority");
  assert.equal(tierForIncentiveScore(70).tier, "high_priority");
  assert.equal(tierForIncentiveScore(85).tier, "critical_heat_zone");
  assert.equal(assessment().illustrativeMaximumCredit, DEFAULT_INCENTIVE_CREDIT_CONFIGURATION.critical_heat_zone);
});

test("verification stages produce explicit conceptual eligibility", () => {
  const statuses: VerificationStatus[] = ["Proposed", "Installed", "Verified", "Maintained"];
  assert.deepEqual(statuses.map((status) => VERIFICATION_POLICY[status].eligibleForCredit), [false, true, true, true]);
  assert.equal(VERIFICATION_POLICY.Proposed.eligibleForPartialCredit, false);
  assert.equal(VERIFICATION_POLICY.Installed.eligibleForPartialCredit, true);
  assert.equal(VERIFICATION_POLICY.Verified.eligibleForFullCredit, true);
  assert.equal(VERIFICATION_POLICY.Maintained.eligibleForRenewalOrBonus, true);
});

test("explanations correspond to actual FortyGuard, cooling, durability, tier, and verification components", () => {
  const result = assessment();
  const text = result.explanation.join(" ");
  assert.match(text, /FG-16/);
  assert.match(text, /94 \/ 100/);
  assert.match(text, /98th thermal percentile/);
  assert.match(text, /1.4 C/);
  assert.match(text, /high durability/);
  assert.match(text, /Critical Heat Zone/);
  assert.match(text, /Verification status is Verified/);
});

test("assessment contains no sensitive attributes and cannot impose a punitive tax outcome", () => {
  const result = assessment();
  const prohibitedAttributes = ["income", "race", "religion", "health", "political_affiliation"];
  assert.ok(prohibitedAttributes.every((attribute) => !(attribute in result)));
  assert.equal(result.policyType, "Heat Mitigation Credit");
  assert.equal(result.increasesTaxLiability, false);
  assert.equal(result.decisionSupportOnly, true);
});

test("budget allocation ranks eligible sites, exhausts safely, and never allocates negatively", () => {
  const first = assessment({ selectedSiteId: "FG-01", modeledCoolingBenefitC: 1.8, verificationStatus: "Verified" });
  const second = assessment({ selectedSiteId: "FG-02", modeledCoolingBenefitC: 1, verificationStatus: "Installed" });
  const proposed = assessment({ selectedSiteId: "FG-03", modeledCoolingBenefitC: 2, verificationStatus: "Proposed" });
  const result = allocateIncentiveBudget(7_000, [second, proposed, first].map((item) => ({ siteId: item.selectedSiteId, assessment: item })));
  assert.equal(result.sitesEvaluated, 3);
  assert.equal(result.sitesFunded, 1);
  assert.equal(result.allocatedBudget, 5_000);
  assert.equal(result.remainingBudget, 2_000);
  assert.equal(result.candidates[0].siteId, "FG-01");
  assert.ok(result.candidates.every((candidate) => candidate.allocatedCredit >= 0));
  assert.ok(result.estimatedAggregateModeledCoolingC > 0);
  assert.throws(() => allocateIncentiveBudget(-1, []), /non-negative/);
});

test("budget with no assessed sites invents no candidates", () => {
  const result = allocateIncentiveBudget(1_000_000, []);
  assert.equal(result.sitesEvaluated, 0);
  assert.equal(result.sitesFunded, 0);
  assert.equal(result.allocatedBudget, 0);
  assert.equal(result.remainingBudget, 1_000_000);
});

test("user-facing source avoids prohibited policy promises", () => {
  const files = [
    new URL("../components/AnalysisSidebar.tsx", import.meta.url),
    new URL("../components/IncentivePolicyPanel.tsx", import.meta.url),
    new URL("../app/report/page.tsx", import.meta.url),
  ];
  const source = files.map((file) => readFileSync(file, "utf8").toLowerCase()).join("\n");
  assert.equal(source.includes("automatic tax penalty"), false);
  assert.equal(source.includes("guaranteed tax credit"), false);
  assert.equal(source.includes("official tax eligibility"), false);
});

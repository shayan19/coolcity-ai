import type { Feature, Polygon } from "geojson";

import type { LandCoverAnalysisResult, TemperatureAnalysisResult } from "./api";
import type { IncentiveAssessment, IncentiveCreditConfiguration, IncentivePolicyConfiguration } from "./incentive-core";
import type { IncentiveBudgetAllocation } from "./incentive-optimizer";
import type { PolicyOptimization, PolicyPlan } from "./policy-optimizer";
import type { ThermalCellProperties } from "./thermal-core";

export type CoolingActionReport = {
  generated_at: string; area_m2: number;
  analysis: TemperatureAnalysisResult; selected_cell: Feature<Polygon, ThermalCellProperties>;
  land_cover: LandCoverAnalysisResult; government_target_temperature_c: number;
  optimization: PolicyOptimization; selected_plan: PolicyPlan;
  incentive: IncentiveAssessment | null;
  incentive_policy: {
    creditConfiguration: IncentiveCreditConfiguration;
    scoreConfiguration: IncentivePolicyConfiguration;
  };
  budget_allocation: IncentiveBudgetAllocation | null;
};

export function parseReportSnapshot(value: unknown): CoolingActionReport {
  if (!value || typeof value !== "object") throw new Error("Report data are unavailable.");
  const report = value as Partial<CoolingActionReport>;
  if (!report.analysis || !report.selected_cell || !report.land_cover || !report.optimization || !report.selected_plan || !("incentive" in report) || !report.incentive_policy || typeof report.area_m2 !== "number" || typeof report.government_target_temperature_c !== "number") throw new Error("Report data are incomplete.");
  return report as CoolingActionReport;
}

export function topThermalCells(report: CoolingActionReport, limit = 5) {
  return [...report.analysis.heatmap.features].sort((a, b) => a.properties.heat_rank - b.properties.heat_rank).slice(0, limit);
}

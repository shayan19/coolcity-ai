import assert from "node:assert/strict";
import test from "node:test";
import { parseReportSnapshot } from "../lib/report-core.ts";
test("report requires thermal diagnosis, policy target, selected plan, and incentive policy", () => {
  assert.throws(() => parseReportSnapshot({}), /incomplete/);
  const report = parseReportSnapshot({ area_m2: 10000, analysis: {}, selected_cell: {}, land_cover: {}, government_target_temperature_c: 40, optimization: {}, selected_plan: {}, incentive: null, incentive_policy: {}, budget_allocation: null });
  assert.equal(report.area_m2, 10000);
  assert.equal(report.government_target_temperature_c, 40);
});

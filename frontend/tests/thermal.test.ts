import assert from "node:assert/strict";
import test from "node:test";
import type { FeatureCollection, Polygon } from "geojson";
import { labelAndRankThermalCells, mergeTemporalAnalysis } from "../lib/thermal-core.ts";

function grid(): FeatureCollection<Polygon, Record<string, unknown>> {
  return { type: "FeatureCollection", features: [
    { type: "Feature", properties: { temperature_c: 41 }, geometry: { type: "Polygon", coordinates: [[[1,0],[2,0],[2,1],[1,1],[1,0]]] } },
    { type: "Feature", properties: { temperature_c: 43 }, geometry: { type: "Polygon", coordinates: [[[0,1],[1,1],[1,2],[0,2],[0,1]]] } },
    { type: "Feature", properties: { temperature_c: 42 }, geometry: { type: "Polygon", coordinates: [[[1,1],[2,1],[2,2],[1,2],[1,1]]] } },
    { type: "Feature", properties: { temperature_c: 40 }, geometry: { type: "Polygon", coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] } },
  ] };
}
test("cell IDs are stable top-to-bottom then left-to-right", () => { const result = labelAndRankThermalCells(grid()); assert.deepEqual(result.features.map((cell) => cell.properties.cell_id), ["FG-04", "FG-01", "FG-02", "FG-03"]); });
test("thermal rank and score use temperature", () => { const result = labelAndRankThermalCells(grid()); const hottest = result.features.find((cell) => cell.properties.temperature_c === 43)!; assert.equal(hottest.properties.heat_rank, 1); assert.equal(hottest.properties.thermal_priority_score, 100); assert.equal(hottest.properties.thermal_percentile, 100); assert.equal(hottest.properties.peak_heat_time, null); });
test("IDs are unique and anomaly is measured from the AOI mean", () => { const result = labelAndRankThermalCells(grid()); assert.equal(new Set(result.features.map((cell) => cell.properties.cell_id)).size, 4); const hottest = result.features.find((cell) => cell.properties.heat_rank === 1)!; assert.equal(hottest.properties.thermal_delta_c, 1.5); assert.equal(result.features.find((cell) => cell.properties.cell_id === "FG-01")?.properties.temperature_c, 43); });
test("temporal evidence merges by stable cell ID and changes only its weighted factor", () => {
  const current = labelAndRankThermalCells(grid());
  const temporal = { type: "FeatureCollection" as const, features: current.features.map((feature, index) => ({ ...feature, properties: { cell_id: feature.properties.cell_id, analysis_value: index + 1 } })) };
  const merged = mergeTemporalAnalysis(current, temporal, "exceedance");
  assert.deepEqual(merged.features.map((cell) => cell.properties.exceedance_hours), [1, 2, 3, 4]);
  assert.ok(merged.features.every((cell) => cell.properties.persistence_hours === null));
});

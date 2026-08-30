import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysisResult } from "../lib/analysis-contract.ts";
import { buildFortyGuardSubmitRequest } from "../lib/fortyguard-key.ts";
const response = { analysis_id: "cached", source: "fortyguard", is_mock: false, cached: true, summary: { cell_count: 1, mean_temperature_c: 42, min_temperature_c: 42, max_temperature_c: 42 }, heatmap: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] }, properties: { average_temperature: 42, temperature_c: 42, source: "fortyguard" } }] } };
test("provider response is labeled and keeps original properties", () => { const parsed = parseAnalysisResult(response); assert.equal(parsed.heatmap.features[0].properties.cell_id, "FG-01"); assert.equal(parsed.heatmap.features[0].properties.average_temperature, 42); });
test("missing normalized temperature is rejected", () => { const malformed = structuredClone(response); delete (malformed.heatmap.features[0].properties as { temperature_c?: number }).temperature_c; assert.throws(() => parseAnalysisResult(malformed), /malformed/); });

test("FortyGuard key is kept out of the JSON request body", () => {
  const request = buildFortyGuardSubmitRequest("  user-secret-key  ", { geometry: { type: "Polygon" }, date: "2026-08-25" });
  assert.equal(request.headers["X-FortyGuard-API-Key"], "user-secret-key");
  assert.equal(request.body.includes("user-secret-key"), false);
});

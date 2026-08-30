import type { FeatureCollection, Polygon } from "geojson";

export type FortyGuardTemporalAnalytic = "time_of_measure" | "exceedance" | "persistence";

export type TemporalAnalysisResult = {
  analysis_id: string;
  source: "fortyguard";
  is_mock: false;
  cached: boolean;
  analytic_type: FortyGuardTemporalAnalytic;
  threshold_c: number | null;
  units: "hour";
  summary: { cell_count: number; minimum: number; maximum: number; mean: number };
  heatmap: FeatureCollection<Polygon, Record<string, unknown>>;
};

export function parseTemporalAnalysisResult(value: unknown): TemporalAnalysisResult {
  if (!value || typeof value !== "object") throw new Error("Backend returned a malformed temporal analysis response.");
  const result = value as Partial<TemporalAnalysisResult>;
  if (
    result.source !== "fortyguard" || result.is_mock !== false || result.units !== "hour" ||
    !["time_of_measure", "exceedance", "persistence"].includes(String(result.analytic_type)) ||
    !result.heatmap || result.heatmap.type !== "FeatureCollection" || !Array.isArray(result.heatmap.features)
  ) {
    throw new Error("Backend returned a malformed temporal analysis response.");
  }
  for (const feature of result.heatmap.features) {
    if (typeof feature.properties?.cell_id !== "string" || typeof feature.properties?.analysis_value !== "number") {
      throw new Error("Backend returned a malformed temporal analysis response.");
    }
  }
  return result as TemporalAnalysisResult;
}

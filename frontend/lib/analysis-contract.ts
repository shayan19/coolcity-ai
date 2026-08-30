import type { FeatureCollection, Polygon } from "geojson";

import { labelAndRankThermalCells, type ThermalCellCollection } from "./thermal-core.ts";

export type TemperatureAnalysisResult = {
  analysis_id: string;
  source: "fortyguard";
  is_mock: false;
  cached: boolean;
  summary: { cell_count: number; mean_temperature_c: number; min_temperature_c: number; max_temperature_c: number };
  heatmap: ThermalCellCollection;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseAnalysisResult(value: unknown): TemperatureAnalysisResult {
  if (!isRecord(value) || value.source !== "fortyguard" || value.is_mock !== false || typeof value.analysis_id !== "string" || !isRecord(value.summary) || !isRecord(value.heatmap)) {
    throw new Error("Backend returned a malformed analysis response.");
  }
  const heatmap = value.heatmap as unknown as FeatureCollection<Polygon, Record<string, unknown>>;
  if (heatmap.type !== "FeatureCollection" || !Array.isArray(heatmap.features)) throw new Error("Backend returned a malformed analysis response.");
  try {
    const ranked = labelAndRankThermalCells(heatmap);
    return { ...(value as unknown as TemperatureAnalysisResult), heatmap: ranked };
  } catch {
    throw new Error("Backend returned a malformed analysis response.");
  }
}

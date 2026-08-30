import type { Feature, FeatureCollection, Polygon } from "geojson";

import { parseAnalysisResult, type TemperatureAnalysisResult } from "./analysis-contract";
import type { CoolingResponse } from "./cooling-response-model";
import type { PolicyOptimization } from "./policy-optimizer";
import type { TreeCatalog } from "./species-core";
import { parseTemporalAnalysisResult, type FortyGuardTemporalAnalytic, type TemporalAnalysisResult } from "./temporal-contract";
import { buildFortyGuardSubmitRequest, fortyGuardHeaders } from "./fortyguard-key";

export type { TemperatureAnalysisResult };
export type LiveAnalysisOptions = { date: string; time: string; granularity: 60 | 80 | 100; threshold_c: number };
export type SiteGeometry = Polygon;

export type LandCoverAnalysisResult = {
  source: "esa_worldcover_2021";
  dataset_year: 2021;
  product_version: string;
  resolution_m: number;
  display_resolution_m: number;
  cached: boolean;
  summary: {
    tree_cover_pct: number; tree_cover_area_m2: number; shrubland_pct: number; grassland_pct: number;
    green_vegetation_pct: number; built_up_pct: number; bare_sparse_pct: number; water_pct: number; other_pct: number;
  };
  classes: Array<{ code: number; name: string; count: number; percentage: number }>;
  landcover: FeatureCollection<Polygon, Record<string, unknown>>;
};

export type PolicyResources = { catalog: TreeCatalog; cooling_evidence: unknown; carbon_evidence: unknown };

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

class BackendRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function detail(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { detail?: unknown };
    return typeof payload.detail === "string" ? payload.detail : fallback;
  } catch { return fallback; }
}

async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error(await detail(response, `Request failed with HTTP ${response.status}.`));
  return response.json();
}

export async function submitFortyGuardAnalysis(
  geometry: Polygon, options: LiveAnalysisOptions, apiKey: string,
  analyticType: "tcm" | FortyGuardTemporalAnalytic = "tcm", signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const request = buildFortyGuardSubmitRequest(apiKey, { geometry, ...options, analytic_type: analyticType });
  const response = await fetch(`${BACKEND_URL}/api/temperature/submit`, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal,
  });
  if (!response.ok) throw new BackendRequestError(await detail(response, `Request failed with HTTP ${response.status}.`), response.status);
  return await response.json() as Record<string, unknown>;
}

export async function getFortyGuardStatus(activityId: string, apiKey: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${BACKEND_URL}/api/temperature/status/${encodeURIComponent(activityId)}`, { headers: fortyGuardHeaders(apiKey), signal });
  if (!response.ok) throw new BackendRequestError(await detail(response, `FortyGuard status failed with HTTP ${response.status}.`), response.status);
  return response.json();
}

export async function pollFortyGuardAnalysis(
  geometry: Polygon, options: LiveAnalysisOptions, apiKey: string,
  onStatus?: (stage: "submitting" | "processing") => void, signal?: AbortSignal,
): Promise<TemperatureAnalysisResult> {
  onStatus?.("submitting");
  const submission = await submitFortyGuardAnalysis(geometry, options, apiKey, "tcm", signal);
  if (submission.status === "Completed") return parseAnalysisResult(submission.result);
  const activityId = typeof submission.activity_id === "string" ? submission.activity_id : null;
  if (!activityId) throw new Error("FortyGuard did not return an activity ID.");
  onStatus?.("processing");
  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 2500));
    let status: Record<string, unknown>;
    try { status = await getFortyGuardStatus(activityId, apiKey, signal); }
    catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof BackendRequestError && (error.status === 404 || error.status >= 500)) continue;
      throw error;
    }
    if (status.status === "Completed") return parseAnalysisResult(status.result);
    if (status.status === "Failed") throw new Error(typeof status.error === "string" ? status.error : "FortyGuard analysis failed.");
  }
}

export async function pollFortyGuardTemporalAnalysis(
  geometry: Polygon, options: LiveAnalysisOptions, apiKey: string, analyticType: FortyGuardTemporalAnalytic,
  onStatus?: (stage: "submitting" | "processing") => void, signal?: AbortSignal,
): Promise<TemporalAnalysisResult> {
  onStatus?.("submitting");
  const submission = await submitFortyGuardAnalysis(geometry, options, apiKey, analyticType, signal);
  if (submission.status === "Completed") return parseTemporalAnalysisResult(submission.result);
  const activityId = typeof submission.activity_id === "string" ? submission.activity_id : null;
  if (!activityId) throw new Error("FortyGuard did not return an activity ID.");
  onStatus?.("processing");
  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 2500));
    let status: Record<string, unknown>;
    try { status = await getFortyGuardStatus(activityId, apiKey, signal); }
    catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof BackendRequestError && (error.status === 404 || error.status >= 500)) continue;
      throw error;
    }
    if (status.status === "Completed") return parseTemporalAnalysisResult(status.result);
    if (status.status === "Failed") throw new Error(typeof status.error === "string" ? status.error : "FortyGuard analysis failed.");
  }
}

export async function analyzeLandCover(geometry: Polygon, signal?: AbortSignal): Promise<LandCoverAnalysisResult> {
  return await postJson("/api/landcover/analyze", { geometry }, signal) as LandCoverAnalysisResult;
}

export async function attachLandCoverContext(
  geometry: Polygon, heatmap: FeatureCollection<Polygon, Record<string, unknown>>, signal?: AbortSignal,
): Promise<FeatureCollection<Polygon, Record<string, unknown>>> {
  const result = await postJson("/api/landcover/thermal-context", { geometry, heatmap }, signal) as { heatmap: FeatureCollection<Polygon, Record<string, unknown>> };
  return result.heatmap;
}

export async function getPolicyResources(signal?: AbortSignal): Promise<PolicyResources> {
  const response = await fetch("/api/policy/evaluate", { signal });
  if (!response.ok) throw new Error(await detail(response, "Policy-model resources could not be loaded."));
  return response.json();
}

export async function evaluatePolicyScenario(input: {
  selectedCell: Feature<Polygon, Record<string, unknown>>;
  allCells: FeatureCollection<Polygon, Record<string, unknown>>;
  speciesId: string;
  treeCount: number;
  coolRoofPct: number;
  coolPavementPct: number;
  targetTemperatureC: number;
}, signal?: AbortSignal): Promise<CoolingResponse> {
  return await postJson("/api/policy/evaluate", {
    selected_cell: input.selectedCell, all_cells: input.allCells, species_id: input.speciesId,
    tree_count: input.treeCount, cool_roof_pct: input.coolRoofPct, cool_pavement_pct: input.coolPavementPct,
    target_temperature_c: input.targetTemperatureC,
  }, signal) as CoolingResponse;
}

export async function optimizePolicyScenario(input: {
  selectedCell: Feature<Polygon, Record<string, unknown>>;
  allCells: FeatureCollection<Polygon, Record<string, unknown>>;
  speciesId: string;
  targetTemperatureC: number;
  treeCountMax: number;
  coolRoofMaximumPct: number;
  coolPavementMaximumPct: number;
}, signal?: AbortSignal): Promise<PolicyOptimization> {
  return await postJson("/api/policy/evaluate", {
    mode: "optimize", selected_cell: input.selectedCell, all_cells: input.allCells, species_id: input.speciesId,
    target_temperature_c: input.targetTemperatureC, tree_count_max: input.treeCountMax,
    cool_roof_maximum_pct: input.coolRoofMaximumPct, cool_pavement_maximum_pct: input.coolPavementMaximumPct,
  }, signal) as PolicyOptimization;
}

import { area } from "@turf/area";
import type { Feature, Polygon } from "geojson";

import { MAX_ANALYSIS_AREA_M2, MIN_ANALYSIS_AREA_M2 } from "./config";

export type SitePolygonFeature = Feature<Polygon, { mode?: "polygon" }>;

export function calculateSiteArea(feature: SitePolygonFeature): number {
  return area(feature);
}

export function getAreaValidationMessage(areaM2: number): string | null {
  if (areaM2 < MIN_ANALYSIS_AREA_M2) {
    return "Area is too small for this prototype.";
  }

  if (areaM2 > MAX_ANALYSIS_AREA_M2) {
    return "Please select an area smaller than 2 km².";
  }

  return null;
}

export function formatSquareMeters(areaM2: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(areaM2);
}

export function formatHectares(areaM2: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(areaM2 / 10_000);
}

import { NextResponse } from "next/server";
import type { FeatureCollection, Polygon } from "geojson";

import {
  attachWorldCoverToThermalCells,
  validatePolygon,
  WorldCoverServerError,
} from "../../../../lib/server/worldcover";
import type { ThermalProperties } from "../../../../lib/worldcover-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const geometry = validatePolygon(payload.geometry);
    const heatmap = payload.heatmap as FeatureCollection<Polygon, ThermalProperties>;

    if (
      !heatmap ||
      heatmap.type !== "FeatureCollection" ||
      !Array.isArray(heatmap.features)
    ) {
      throw new WorldCoverServerError(
        "A valid thermal FeatureCollection is required.",
        400,
      );
    }

    return NextResponse.json(
      await attachWorldCoverToThermalCells(geometry, heatmap),
    );
  } catch (error) {
    if (error instanceof WorldCoverServerError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { detail: "Land-cover context could not be attached to thermal cells." },
      { status: 500 },
    );
  }
}

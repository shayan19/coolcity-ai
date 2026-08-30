import { NextResponse } from "next/server";

import {
  analyzeWorldCover,
  validatePolygon,
  WorldCoverServerError,
} from "../../../../lib/server/worldcover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    const record = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : null;
    const geometry = validatePolygon(
      record && "geometry" in record
        ? record.geometry
        : null,
    );
    return NextResponse.json(
      await analyzeWorldCover(geometry),
    );
  } catch (error) {
    if (error instanceof WorldCoverServerError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { detail: "ESA WorldCover data could not be loaded for this area." },
      { status: 500 },
    );
  }
}

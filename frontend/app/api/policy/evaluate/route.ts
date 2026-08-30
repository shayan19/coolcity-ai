import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import type { CarbonEvidence, CoolingEvidence } from "../../../../lib/cooling-response-model";
import { evaluateCoolingResponse } from "../../../../lib/cooling-response-model";
import { optimizePolicyPortfolio } from "../../../../lib/policy-optimizer";
import { parseSpeciesCatalog } from "../../../../lib/species-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resources() {
  const dataRoot = path.resolve(process.cwd(), "..", "data");
  const [catalogText, evidenceText, carbonText] = await Promise.all([
    readFile(path.join(dataRoot, "species", "phoenix_tree_catalog.json"), "utf8"),
    readFile(path.join(dataRoot, "research", "us_cooling_evidence.json"), "utf8"),
    readFile(path.join(dataRoot, "research", "urban_tree_carbon_evidence.json"), "utf8"),
  ]);
  return {
    catalog: parseSpeciesCatalog(JSON.parse(catalogText)),
    evidence: JSON.parse(evidenceText) as CoolingEvidence,
    carbon: JSON.parse(carbonText) as CarbonEvidence,
  };
}

export async function GET() {
  try {
    const { catalog, evidence, carbon } = await resources();
    return NextResponse.json({ catalog, cooling_evidence: evidence, carbon_evidence: carbon });
  } catch {
    return NextResponse.json({ detail: "Policy-model resources could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const { catalog, evidence, carbon } = await resources();
    const species = catalog.species.find((candidate) => candidate.id === payload.species_id);
    if (!species) return NextResponse.json({ detail: "Select a supported Phoenix tree species." }, { status: 400 });
    if (!payload.selected_cell || !payload.all_cells || typeof payload.target_temperature_c !== "number") {
      return NextResponse.json({ detail: "Selected cell, AOI cells, and government target are required." }, { status: 400 });
    }
    if (payload.mode === "optimize") {
      return NextResponse.json(optimizePolicyPortfolio({
        selectedCell: payload.selected_cell as never, allCells: payload.all_cells as never, species,
        targetTemperatureC: payload.target_temperature_c,
        allowedTreeCountMax: typeof payload.tree_count_max === "number" ? payload.tree_count_max : 100,
        coolRoofMaximumPct: typeof payload.cool_roof_maximum_pct === "number" ? payload.cool_roof_maximum_pct : 100,
        coolPavementMaximumPct: typeof payload.cool_pavement_maximum_pct === "number" ? payload.cool_pavement_maximum_pct : 100,
        evidence, carbonEvidence: carbon,
      }));
    }
    return NextResponse.json(evaluateCoolingResponse({
      selectedCell: payload.selected_cell as never, allCells: payload.all_cells as never, species,
      treeCount: typeof payload.tree_count === "number" ? payload.tree_count : 0,
      coolRoofPct: typeof payload.cool_roof_pct === "number" ? payload.cool_roof_pct : 0,
      coolPavementPct: typeof payload.cool_pavement_pct === "number" ? payload.cool_pavement_pct : 0,
      targetTemperatureC: payload.target_temperature_c, evidence, carbonEvidence: carbon,
    }));
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Policy scenario could not be evaluated." }, { status: 400 });
  }
}

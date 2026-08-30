import { NextResponse } from "next/server";

import carbonResource from "../../../../../data/research/urban_tree_carbon_evidence.json";
import evidenceResource from "../../../../../data/research/us_cooling_evidence.json";
import catalogResource from "../../../../../data/species/phoenix_tree_catalog.json";
import type { CarbonEvidence, CoolingEvidence } from "../../../../lib/cooling-response-model";
import { evaluateCoolingResponse } from "../../../../lib/cooling-response-model";
import { optimizePolicyPortfolio } from "../../../../lib/policy-optimizer";
import { parseSpeciesCatalog } from "../../../../lib/species-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resources() {
  return {
    catalog: parseSpeciesCatalog(catalogResource),
    evidence: evidenceResource as CoolingEvidence,
    carbon: carbonResource as CarbonEvidence,
  };
}

export async function GET() {
  try {
    const { catalog, evidence, carbon } = resources();
    return NextResponse.json({ catalog, cooling_evidence: evidence, carbon_evidence: carbon });
  } catch {
    return NextResponse.json({ detail: "Policy-model resources could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const { catalog, evidence, carbon } = resources();
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

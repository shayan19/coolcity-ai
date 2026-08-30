export type TreeSpecies = {
  id: string;
  common_name: string;
  scientific_name_source: string;
  native_status: string;
  water_use: string;
  mature_height_ft: number | null;
  mature_width_ft: number | null;
  desert_adapted: boolean;
  phoenix_recommended: boolean;
  amwua_listed: boolean;
  source_urls: string[];
};

export type TreeCatalog = { catalog_id: string; catalog_label: string; source_urls: string[]; species: TreeSpecies[] };

export function parseSpeciesCatalog(value: unknown): TreeCatalog {
  if (!value || typeof value !== "object") throw new Error("Tree catalog is malformed.");
  const catalog = value as Record<string, unknown>;
  if (!Array.isArray(catalog.species)) throw new Error("Tree catalog has no species array.");
  const species = catalog.species.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Tree species entry is malformed.");
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== "string" || typeof entry.common_name !== "string" || typeof entry.scientific_name_source !== "string") {
      throw new Error("Tree species identity is malformed.");
    }
    return {
      id: entry.id,
      common_name: entry.common_name,
      scientific_name_source: entry.scientific_name_source,
      native_status: typeof entry.native_status === "string" ? entry.native_status : "Not specified",
      water_use: typeof entry.water_use === "string" ? entry.water_use : "Not specified",
      mature_height_ft: typeof entry.mature_height_ft === "number" ? entry.mature_height_ft : null,
      mature_width_ft: typeof entry.mature_width_ft === "number" ? entry.mature_width_ft : null,
      desert_adapted: entry.desert_adapted === true,
      phoenix_recommended: entry.phoenix_recommended === true,
      amwua_listed: entry.amwua_listed === true,
      source_urls: Array.isArray(entry.source_urls) ? entry.source_urls.filter((url): url is string => typeof url === "string") : [],
    };
  });
  return {
    catalog_id: typeof catalog.catalog_id === "string" ? catalog.catalog_id : "tree-catalog",
    catalog_label: typeof catalog.catalog_label === "string" ? catalog.catalog_label : "Tree candidates",
    source_urls: Array.isArray(catalog.source_urls) ? catalog.source_urls.filter((url): url is string => typeof url === "string") : [],
    species,
  };
}

export function speciesSuitability(species: TreeSpecies): number {
  return (species.desert_adapted ? 40 : 0) + (species.phoenix_recommended ? 35 : 0) + (species.amwua_listed ? 25 : 0);
}

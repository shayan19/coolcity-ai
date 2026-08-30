import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import "server-only";

import { fromUrl, type GeoTIFF, type GeoTIFFImage } from "geotiff";
import type { FeatureCollection, Polygon } from "geojson";

import {
  enrichThermalCells,
  samplesAndDisplayFromRaster,
  summarizeSamples,
  type LandCoverFeatureCollection,
  type ThermalProperties,
  type WorldCoverClassSummary,
  type WorldCoverSample,
  type WorldCoverSummary,
} from "../worldcover-core.ts";

export const STAC_ENDPOINT = "https://planetarycomputer.microsoft.com/api/stac/v1";
export const STAC_SEARCH_ENDPOINT = `${STAC_ENDPOINT}/search`;
export const SAS_TOKEN_ENDPOINT =
  "https://planetarycomputer.microsoft.com/api/sas/v1/token";
export const WORLDCOVER_COLLECTION = "esa-worldcover";
export const WORLDCOVER_ASSET_KEY = "map";
export const WORLDCOVER_PRODUCT_VERSION = "2.0.0";
export const WORLDCOVER_SOURCE = "esa_worldcover_2021";
export const WORLDCOVER_ATTRIBUTION =
  "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium";

const configuredCacheRoot = process.env.COOLCITY_CACHE_ROOT?.trim();
const defaultCacheRoot = process.env.VERCEL
  ? path.join(os.tmpdir(), "coolcity-cache")
  : path.resolve(process.cwd(), "..", "data", "cache");
const DEFAULT_CACHE_DIRECTORY = path.join(
  configuredCacheRoot ? path.resolve(configuredCacheRoot) : defaultCacheRoot,
  "worldcover",
);

type StacAsset = { href?: unknown };
type StacItem = {
  id: string;
  properties: Record<string, unknown>;
  assets: Record<string, StacAsset>;
};

type RasterMetadata = {
  item_id: string;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  resolution: [number, number];
};

export type WorldCoverResult = {
  source: "esa_worldcover_2021";
  dataset_year: 2021;
  product_version: "2.0.0";
  resolution_m: 10;
  display_resolution_m: number;
  cached: boolean;
  summary: WorldCoverSummary;
  classes: WorldCoverClassSummary[];
  landcover: LandCoverFeatureCollection;
  metadata: {
    stac_endpoint: string;
    collection_id: string;
    item_count: number;
    item_ids: string[];
    asset_key: string;
    crs: "EPSG:4326";
    nodata: 0;
    data_type: "uint8";
    rasters: RasterMetadata[];
    class_codes_encountered: number[];
    attribution: string;
  };
};

type CacheEnvelope = {
  result: WorldCoverResult;
  samples: WorldCoverSample[];
};

type TiffLike = Pick<GeoTIFF, "getImage">;
type ImageLike = Pick<
  GeoTIFFImage,
  "getBoundingBox" | "getWidth" | "getHeight" | "getResolution" | "readRasters"
>;

export type WorldCoverRuntime = {
  cacheDirectory?: string;
  searchItems?: (geometry: Polygon) => Promise<StacItem[]>;
  signAsset?: (href: string) => Promise<string>;
  openTiff?: (href: string) => Promise<TiffLike>;
};

const sasCache = new Map<string, { token: string; expiresAt: number }>();

export class WorldCoverServerError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validatePolygon(value: unknown): Polygon {
  if (!isRecord(value) || value.type !== "Polygon" || !Array.isArray(value.coordinates)) {
    throw new WorldCoverServerError("A valid GeoJSON Polygon is required.", 400);
  }

  const coordinates = value.coordinates;

  if (coordinates.length === 0) {
    throw new WorldCoverServerError("A valid GeoJSON Polygon is required.", 400);
  }

  for (const ring of coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new WorldCoverServerError("A valid GeoJSON Polygon is required.", 400);
    }

    for (const position of ring) {
      if (
        !Array.isArray(position) ||
        position.length < 2 ||
        typeof position[0] !== "number" ||
        typeof position[1] !== "number" ||
        !Number.isFinite(position[0]) ||
        !Number.isFinite(position[1]) ||
        position[0] < -180 ||
        position[0] > 180 ||
        position[1] < -90 ||
        position[1] > 90
      ) {
        throw new WorldCoverServerError("A valid GeoJSON Polygon is required.", 400);
      }
    }
  }

  return value as unknown as Polygon;
}

function polygonBbox(polygon: Polygon): [number, number, number, number] {
  const positions = polygon.coordinates.flat();
  return [
    Math.min(...positions.map((position) => position[0])),
    Math.min(...positions.map((position) => position[1])),
    Math.max(...positions.map((position) => position[0])),
    Math.max(...positions.map((position) => position[1])),
  ];
}

function aoiHash(polygon: Polygon): string {
  return createHash("sha256").update(JSON.stringify(polygon)).digest("hex");
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new WorldCoverServerError(
      "ESA WorldCover data could not be loaded for this area.",
      503,
    );
  }

  if (!response.ok) {
    throw new WorldCoverServerError(
      "ESA WorldCover data could not be loaded for this area.",
      response.status === 429 ? 503 : 502,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new WorldCoverServerError(
      "ESA WorldCover returned an invalid response.",
      502,
    );
  }
}

async function searchItems(polygon: Polygon): Promise<StacItem[]> {
  const payload = await fetchJson(STAC_SEARCH_ENDPOINT, {
    method: "POST",
    headers: { Accept: "application/geo+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: [WORLDCOVER_COLLECTION],
      intersects: polygon,
      datetime: "2021-01-01T00:00:00Z/2021-12-31T23:59:59Z",
      limit: 20,
    }),
  });

  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    throw new WorldCoverServerError("ESA WorldCover returned an invalid response.");
  }

  return payload.features.filter((item): item is StacItem => {
    return (
      isRecord(item) &&
      typeof item.id === "string" &&
      isRecord(item.properties) &&
      isRecord(item.assets) &&
      item.properties["esa_worldcover:product_version"] === WORLDCOVER_PRODUCT_VERSION
    );
  });
}

async function signAsset(href: string): Promise<string> {
  const assetUrl = new URL(href);

  if (
    !assetUrl.hostname.endsWith(".blob.core.windows.net") ||
    assetUrl.searchParams.has("st") ||
    assetUrl.searchParams.has("se") ||
    assetUrl.searchParams.has("sp")
  ) {
    return href;
  }

  const account = assetUrl.hostname.slice(0, -".blob.core.windows.net".length);
  const container = assetUrl.pathname.split("/").filter(Boolean)[0];

  if (!account || !container) {
    throw new WorldCoverServerError("ESA WorldCover raster asset is unavailable.");
  }

  const tokenUrl = `${SAS_TOKEN_ENDPOINT}/${encodeURIComponent(account)}/${encodeURIComponent(container)}`;
  const cached = sasCache.get(tokenUrl);

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return `${href}?${cached.token}`;
  }

  const payload = await fetchJson(tokenUrl);

  if (
    !isRecord(payload) ||
    typeof payload.token !== "string" ||
    typeof payload["msft:expiry"] !== "string"
  ) {
    throw new WorldCoverServerError("ESA WorldCover raster signing failed.");
  }

  const expiresAt = Date.parse(payload["msft:expiry"]);
  sasCache.set(tokenUrl, { token: payload.token, expiresAt });
  return `${href}?${payload.token}`;
}

function rasterWindow(
  imageBbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
  aoiBbox: [number, number, number, number],
): [number, number, number, number] | null {
  const [imageWest, imageSouth, imageEast, imageNorth] = imageBbox;
  const [aoiWest, aoiSouth, aoiEast, aoiNorth] = aoiBbox;
  const west = Math.max(imageWest, aoiWest);
  const south = Math.max(imageSouth, aoiSouth);
  const east = Math.min(imageEast, aoiEast);
  const north = Math.min(imageNorth, aoiNorth);

  if (west >= east || south >= north) {
    return null;
  }

  const pixelWidth = (imageEast - imageWest) / imageWidth;
  const pixelHeight = (imageNorth - imageSouth) / imageHeight;
  return [
    Math.max(0, Math.floor((west - imageWest) / pixelWidth)),
    Math.max(0, Math.floor((imageNorth - north) / pixelHeight)),
    Math.min(imageWidth, Math.ceil((east - imageWest) / pixelWidth)),
    Math.min(imageHeight, Math.ceil((imageNorth - south) / pixelHeight)),
  ];
}

async function processImage(
  image: ImageLike,
  itemId: string,
  polygon: Polygon,
): Promise<{
  samples: WorldCoverSample[];
  landcover: LandCoverFeatureCollection;
  metadata: RasterMetadata;
}> {
  const imageBbox = image.getBoundingBox() as [number, number, number, number];
  const imageWidth = image.getWidth();
  const imageHeight = image.getHeight();
  const resolution = image.getResolution() as [number, number];
  const window = rasterWindow(
    imageBbox,
    imageWidth,
    imageHeight,
    polygonBbox(polygon),
  );

  if (!window) {
    return {
      samples: [],
      landcover: { type: "FeatureCollection", features: [] },
      metadata: {
        item_id: itemId,
        width: imageWidth,
        height: imageHeight,
        bbox: imageBbox,
        resolution,
      },
    };
  }

  const width = window[2] - window[0];
  const height = window[3] - window[1];
  const raster = await image.readRasters({
    window,
    samples: [0],
    interleave: true,
    resampleMethod: "nearest",
  });

  if (raster.length !== width * height) {
    throw new WorldCoverServerError("ESA WorldCover returned an invalid raster.");
  }

  const processed = samplesAndDisplayFromRaster(
    {
      values: raster,
      width,
      height,
      window,
      imageBbox,
      imageWidth,
      imageHeight,
    },
    polygon,
  );

  return {
    samples: processed.samples,
    landcover: processed.display,
    metadata: {
      item_id: itemId,
      width: imageWidth,
      height: imageHeight,
      bbox: imageBbox,
      resolution,
    },
  };
}

function cachePath(cacheDirectory: string, polygon: Polygon): string {
  return path.join(cacheDirectory, `${aoiHash(polygon)}.json`);
}

async function readCache(
  cacheDirectory: string,
  polygon: Polygon,
): Promise<CacheEnvelope | null> {
  try {
    const payload = JSON.parse(
      await readFile(cachePath(cacheDirectory, polygon), "utf8"),
    ) as unknown;

    if (
      !isRecord(payload) ||
      !isRecord(payload.result) ||
      payload.result.source !== WORLDCOVER_SOURCE ||
      !Array.isArray(payload.samples)
    ) {
      return null;
    }

    return payload as unknown as CacheEnvelope;
  } catch {
    return null;
  }
}

async function writeCache(
  cacheDirectory: string,
  polygon: Polygon,
  envelope: CacheEnvelope,
): Promise<void> {
  await mkdir(cacheDirectory, { recursive: true });
  const destination = cachePath(cacheDirectory, polygon);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(envelope), "utf8");
  await rename(temporary, destination);
}

export async function analyzeWorldCoverInternal(
  polygon: Polygon,
  runtime: WorldCoverRuntime = {},
): Promise<CacheEnvelope> {
  const cacheDirectory = runtime.cacheDirectory ?? DEFAULT_CACHE_DIRECTORY;
  const cached = await readCache(cacheDirectory, polygon);

  if (cached) {
    return { ...cached, result: { ...cached.result, cached: true } };
  }

  const items = await (runtime.searchItems ?? searchItems)(polygon);

  if (items.length === 0) {
    throw new WorldCoverServerError(
      "No ESA WorldCover 2021 data intersects this area.",
      404,
    );
  }

  const allSamples: WorldCoverSample[] = [];
  const allFeatures: LandCoverFeatureCollection["features"] = [];
  const rasterMetadata: RasterMetadata[] = [];
  const signer = runtime.signAsset ?? signAsset;
  const openTiff = runtime.openTiff ?? fromUrl;

  for (const item of items) {
    const asset = item.assets[WORLDCOVER_ASSET_KEY];

    if (!asset || typeof asset.href !== "string") {
      throw new WorldCoverServerError("ESA WorldCover raster asset is unavailable.");
    }

    let imageResult;

    try {
      const signedHref = await signer(asset.href);
      const tiff = await openTiff(signedHref);
      const image = await tiff.getImage();
      imageResult = await processImage(image, item.id, polygon);
    } catch (error) {
      if (error instanceof WorldCoverServerError) {
        throw error;
      }

      throw new WorldCoverServerError(
        "ESA WorldCover data could not be loaded for this area.",
      );
    }

    allSamples.push(...imageResult.samples);
    allFeatures.push(...imageResult.landcover.features);
    rasterMetadata.push(imageResult.metadata);
  }

  let statistics;

  try {
    statistics = summarizeSamples(allSamples);
  } catch {
    throw new WorldCoverServerError(
      "ESA WorldCover contains no valid land-cover pixels for this area.",
    );
  }

  const displayResolutionM = Math.max(
    10,
    ...allFeatures.map((feature) => feature.properties.display_resolution_m),
  );
  const result: WorldCoverResult = {
    source: WORLDCOVER_SOURCE,
    dataset_year: 2021,
    product_version: WORLDCOVER_PRODUCT_VERSION,
    resolution_m: 10,
    display_resolution_m: displayResolutionM,
    cached: false,
    summary: statistics.summary,
    classes: statistics.classes,
    landcover: { type: "FeatureCollection", features: allFeatures },
    metadata: {
      stac_endpoint: STAC_ENDPOINT,
      collection_id: WORLDCOVER_COLLECTION,
      item_count: items.length,
      item_ids: items.map((item) => item.id),
      asset_key: WORLDCOVER_ASSET_KEY,
      crs: "EPSG:4326",
      nodata: 0,
      data_type: "uint8",
      rasters: rasterMetadata,
      class_codes_encountered: statistics.classes.map((entry) => entry.code),
      attribution: WORLDCOVER_ATTRIBUTION,
    },
  };
  const envelope = { result, samples: allSamples };
  await writeCache(cacheDirectory, polygon, envelope);
  return envelope;
}

export async function analyzeWorldCover(
  polygon: Polygon,
  runtime: WorldCoverRuntime = {},
): Promise<WorldCoverResult> {
  return (await analyzeWorldCoverInternal(polygon, runtime)).result;
}

export async function attachWorldCoverToThermalCells(
  polygon: Polygon,
  heatmap: FeatureCollection<Polygon, ThermalProperties>,
  runtime: WorldCoverRuntime = {},
): Promise<{
  source: "esa_worldcover_2021";
  dataset_year: 2021;
  cached: boolean;
  thresholds: {
    high_heat: string;
    low_green_vegetation_pct: number;
  };
  heatmap: FeatureCollection<Polygon, ThermalProperties>;
}> {
  const envelope = await analyzeWorldCoverInternal(polygon, runtime);
  return {
    source: WORLDCOVER_SOURCE,
    dataset_year: 2021,
    cached: envelope.result.cached,
    thresholds: {
      high_heat: "temperature_c > AOI mean temperature",
      low_green_vegetation_pct: 10,
    },
    heatmap: enrichThermalCells(heatmap, envelope.samples),
  };
}

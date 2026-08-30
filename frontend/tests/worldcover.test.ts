import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { FeatureCollection, Polygon } from "geojson";

import {
  enrichThermalCells,
  pointInPolygon,
  samplesAndDisplayFromRaster,
  summarizeSamples,
  WORLDCOVER_CLASSES,
  type ThermalProperties,
  type WorldCoverSample,
} from "../lib/worldcover-core.ts";
import { analyzeWorldCoverInternal } from "../lib/server/worldcover.ts";

const SQUARE: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0.04, 0],
      [0.04, 0.04],
      [0, 0.04],
      [0, 0],
    ],
  ],
};

const VALUES = new Uint8Array([
  10, 10, 20, 0,
  30, 40, 50, 60,
  80, 90, 95, 100,
  50, 60, 10, 30,
]);

function syntheticRaster(polygon: Polygon = SQUARE) {
  return samplesAndDisplayFromRaster(
    {
      values: VALUES,
      width: 4,
      height: 4,
      window: [0, 0, 4, 4],
      imageBbox: [0, 0, 0.04, 0.04],
      imageWidth: 4,
      imageHeight: 4,
    },
    polygon,
  );
}

test("official WorldCover class mapping is centralized and complete", () => {
  assert.deepEqual(Object.keys(WORLDCOVER_CLASSES).map(Number), [
    10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100,
  ]);
  assert.equal(WORLDCOVER_CLASSES[10], "Tree cover");
  assert.equal(WORLDCOVER_CLASSES[60], "Bare / sparse vegetation");
});

test("point-in-polygon honors polygon holes", () => {
  const polygonWithHole: Polygon = {
    type: "Polygon",
    coordinates: [
      SQUARE.coordinates[0],
      [
        [0.01, 0.01],
        [0.03, 0.01],
        [0.03, 0.03],
        [0.01, 0.03],
        [0.01, 0.01],
      ],
    ],
  };

  assert.equal(pointInPolygon([0.005, 0.005], polygonWithHole), true);
  assert.equal(pointInPolygon([0.02, 0.02], polygonWithHole), false);
  assert.equal(pointInPolygon([0.05, 0.05], polygonWithHole), false);
});

test("raster masking excludes nodata and bbox pixels outside the polygon", () => {
  const triangle: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [0.04, 0],
        [0, 0.04],
        [0, 0],
      ],
    ],
  };
  const full = syntheticRaster();
  const masked = syntheticRaster(triangle);

  assert.equal(full.samples.length, 15);
  assert.ok(masked.samples.length > 0);
  assert.ok(masked.samples.length < full.samples.length);
  assert.equal(masked.samples.some((sample) => sample.classCode === 0), false);
  assert.ok(masked.display.features.length > 0);
});

test("statistics exclude nodata and calculate documented vegetation aggregate", () => {
  const { summary, classes } = summarizeSamples(syntheticRaster().samples);

  assert.equal(classes.reduce((total, item) => total + item.pixel_count, 0), 15);
  assert.ok(Math.abs(classes.reduce((total, item) => total + item.percentage, 0) - 100) < 0.05);
  assert.equal(summary.tree_cover_pct, 20);
  assert.equal(summary.shrubland_pct, 6.67);
  assert.equal(summary.grassland_pct, 13.33);
  assert.equal(summary.green_vegetation_pct, 40);
  assert.equal(summary.built_up_pct, 13.33);
  assert.equal(summary.bare_sparse_pct, 13.33);
  assert.equal(summary.water_pct, 6.67);
  assert.equal(summary.other_pct, 26.67);
  assert.ok(summary.tree_cover_area_m2 > 0);
  assert.ok(classes.every((item) => item.area_m2 >= 0));
});

test("thermal enrichment preserves heat properties and flags hot low-green cells", () => {
  const heatmap: FeatureCollection<Polygon, ThermalProperties> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [0.02, 0], [0.02, 0.04], [0, 0.04], [0, 0]]],
        },
        properties: {
          temperature_c: 40,
          average_temperature: 40,
          source: "fortyguard",
        },
      },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[0.02, 0], [0.04, 0], [0.04, 0.04], [0.02, 0.04], [0.02, 0]]],
        },
        properties: {
          temperature_c: 44,
          average_temperature: 44,
          source: "fortyguard",
        },
      },
    ],
  };
  const samples: WorldCoverSample[] = [
    { longitude: 0.005, latitude: 0.01, classCode: 10, areaM2: 100 },
    { longitude: 0.015, latitude: 0.02, classCode: 30, areaM2: 100 },
    { longitude: 0.025, latitude: 0.01, classCode: 50, areaM2: 100 },
    { longitude: 0.035, latitude: 0.02, classCode: 60, areaM2: 100 },
  ];
  const enriched = enrichThermalCells(heatmap, samples);
  const cool = enriched.features[0].properties;
  const hot = enriched.features[1].properties;

  assert.equal(cool.average_temperature, 40);
  assert.equal(hot.average_temperature, 44);
  assert.equal(cool.temperature_c, 40);
  assert.equal(hot.temperature_c, 44);
  assert.equal(cool.green_vegetation_pct, 100);
  assert.equal(hot.green_vegetation_pct, 0);
  assert.equal(hot.built_up_pct, 50);
  assert.equal(hot.bare_sparse_pct, 50);
  assert.equal(cool.high_heat_low_green, false);
  assert.equal(hot.high_heat_low_green, true);
});

test("server cache prevents repeated STAC and raster reads", async () => {
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "coolcity-worldcover-test-"));
  let searchCalls = 0;
  let rasterCalls = 0;
  const runtime = {
    cacheDirectory,
    searchItems: async () => {
      searchCalls += 1;
      return [
        {
          id: "synthetic-worldcover-item",
          properties: { "esa_worldcover:product_version": "2.0.0" },
          assets: { map: { href: "https://example.test/worldcover.tif" } },
        },
      ];
    },
    signAsset: async (href: string) => href,
    openTiff: async () => {
      rasterCalls += 1;
      return {
        getImage: async () => ({
          getBoundingBox: () => [0, 0, 0.04, 0.04],
          getWidth: () => 4,
          getHeight: () => 4,
          getResolution: () => [0.01, -0.01],
          readRasters: async () => VALUES,
        }),
      } as never;
    },
  };

  const first = await analyzeWorldCoverInternal(SQUARE, runtime);
  const second = await analyzeWorldCoverInternal(SQUARE, runtime);

  assert.equal(first.result.cached, false);
  assert.equal(second.result.cached, true);
  assert.equal(first.result.metadata.item_ids[0], "synthetic-worldcover-item");
  assert.equal(searchCalls, 1);
  assert.equal(rasterCalls, 1);
});

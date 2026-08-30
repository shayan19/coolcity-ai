import type { Feature, FeatureCollection, Polygon } from "geojson";

export const WORLDCOVER_CLASSES = {
  10: "Tree cover",
  20: "Shrubland",
  30: "Grassland",
  40: "Cropland",
  50: "Built-up",
  60: "Bare / sparse vegetation",
  70: "Snow and ice",
  80: "Permanent water",
  90: "Herbaceous wetland",
  95: "Mangroves",
  100: "Moss and lichen",
} as const;

export const WORLDCOVER_NODATA = 0;
export const GREEN_VEGETATION_CODES = new Set([10, 20, 30]);
export const LOW_GREEN_VEGETATION_THRESHOLD_PCT = 10;
export const MAX_DISPLAY_FEATURES_PER_ITEM = 1_500;

export type WorldCoverClassCode = keyof typeof WORLDCOVER_CLASSES;

export type LandCoverProperties = {
  class_code: number;
  class_name: string;
  source: "esa_worldcover_2021";
  dataset_year: 2021;
  analysis_resolution_m: 10;
  display_resolution_m: number;
};

export type LandCoverFeatureCollection = FeatureCollection<
  Polygon,
  LandCoverProperties
>;

export type WorldCoverSample = {
  longitude: number;
  latitude: number;
  classCode: number;
  areaM2: number;
};

export type RasterWindowInput = {
  values: ArrayLike<number>;
  width: number;
  height: number;
  window: [number, number, number, number];
  imageBbox: [number, number, number, number];
  imageWidth: number;
  imageHeight: number;
};

export type WorldCoverSummary = {
  tree_cover_pct: number;
  tree_cover_area_m2: number;
  shrubland_pct: number;
  grassland_pct: number;
  green_vegetation_pct: number;
  built_up_pct: number;
  bare_sparse_pct: number;
  water_pct: number;
  other_pct: number;
};

export type WorldCoverClassSummary = {
  code: number;
  name: string;
  pixel_count: number;
  area_m2: number;
  percentage: number;
};

function pointOnSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): boolean {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);

  if (Math.abs(cross) > 1e-12) {
    return false;
  }

  return (
    x >= Math.min(x1, x2) - 1e-12 &&
    x <= Math.max(x1, x2) + 1e-12 &&
    y >= Math.min(y1, y2) - 1e-12 &&
    y <= Math.max(y1, y2) + 1e-12
  );
}

function pointInRing(
  point: [number, number],
  ring: number[][],
): { inside: boolean; boundary: boolean } {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index] as [number, number];
    const previousPoint = ring[previous] as [number, number];

    if (pointOnSegment(point, previousPoint, currentPoint)) {
      return { inside: true, boundary: true };
    }

    const intersects =
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) *
          (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];

    if (intersects) {
      inside = !inside;
    }
  }

  return { inside, boundary: false };
}

export function pointInPolygon(
  point: [number, number],
  polygon: Polygon,
): boolean {
  const outer = pointInRing(point, polygon.coordinates[0]);

  if (!outer.inside) {
    return false;
  }

  for (const hole of polygon.coordinates.slice(1)) {
    const holeResult = pointInRing(point, hole);

    if (holeResult.inside && !holeResult.boundary) {
      return false;
    }
  }

  return true;
}

export function geographicPixelAreaM2(
  west: number,
  south: number,
  east: number,
  north: number,
): number {
  const earthRadiusM = 6_371_008.8;
  const toRadians = Math.PI / 180;
  return (
    earthRadiusM ** 2 *
    Math.abs(Math.sin(north * toRadians) - Math.sin(south * toRadians)) *
    Math.abs((east - west) * toRadians)
  );
}

function className(code: number): string {
  return WORLDCOVER_CLASSES[code as WorldCoverClassCode] ?? `Unknown class ${code}`;
}

function displayFeature(
  west: number,
  south: number,
  east: number,
  north: number,
  code: number,
  displayResolutionM: number,
): Feature<Polygon, LandCoverProperties> {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
    properties: {
      class_code: code,
      class_name: className(code),
      source: "esa_worldcover_2021",
      dataset_year: 2021,
      analysis_resolution_m: 10,
      display_resolution_m: displayResolutionM,
    },
  };
}

export function samplesAndDisplayFromRaster(
  input: RasterWindowInput,
  polygon: Polygon,
): { samples: WorldCoverSample[]; display: LandCoverFeatureCollection } {
  const [imageWest, imageSouth, imageEast, imageNorth] = input.imageBbox;
  const [left, top] = input.window;
  const pixelWidth = (imageEast - imageWest) / input.imageWidth;
  const pixelHeight = (imageNorth - imageSouth) / input.imageHeight;
  const samples: WorldCoverSample[] = [];
  const validCodes = new Int16Array(input.width * input.height);
  let validPixelCount = 0;

  for (let row = 0; row < input.height; row += 1) {
    for (let column = 0; column < input.width; column += 1) {
      const index = row * input.width + column;
      const code = Number(input.values[index]);

      if (code === WORLDCOVER_NODATA || !Number.isFinite(code)) {
        continue;
      }

      const sourceColumn = left + column;
      const sourceRow = top + row;
      const west = imageWest + sourceColumn * pixelWidth;
      const east = west + pixelWidth;
      const north = imageNorth - sourceRow * pixelHeight;
      const south = north - pixelHeight;
      const longitude = (west + east) / 2;
      const latitude = (south + north) / 2;

      if (!pointInPolygon([longitude, latitude], polygon)) {
        continue;
      }

      validCodes[index] = code;
      validPixelCount += 1;
      samples.push({
        longitude,
        latitude,
        classCode: code,
        areaM2: geographicPixelAreaM2(west, south, east, north),
      });
    }
  }

  const blockSize = Math.max(
    1,
    Math.ceil(Math.sqrt(validPixelCount / MAX_DISPLAY_FEATURES_PER_ITEM)),
  );
  const features: Array<Feature<Polygon, LandCoverProperties>> = [];

  for (let row = 0; row < input.height; row += blockSize) {
    for (let column = 0; column < input.width; column += blockSize) {
      const counts = new Map<number, number>();

      for (
        let blockRow = row;
        blockRow < Math.min(row + blockSize, input.height);
        blockRow += 1
      ) {
        for (
          let blockColumn = column;
          blockColumn < Math.min(column + blockSize, input.width);
          blockColumn += 1
        ) {
          const code = validCodes[blockRow * input.width + blockColumn];

          if (code !== 0) {
            counts.set(code, (counts.get(code) ?? 0) + 1);
          }
        }
      }

      if (counts.size === 0) {
        continue;
      }

      const [majorityCode] = [...counts.entries()].sort(
        (leftEntry, rightEntry) =>
          rightEntry[1] - leftEntry[1] || leftEntry[0] - rightEntry[0],
      )[0];
      const sourceLeft = left + column;
      const sourceTop = top + row;
      const sourceRight = left + Math.min(column + blockSize, input.width);
      const sourceBottom = top + Math.min(row + blockSize, input.height);
      const west = imageWest + sourceLeft * pixelWidth;
      const east = imageWest + sourceRight * pixelWidth;
      const north = imageNorth - sourceTop * pixelHeight;
      const south = imageNorth - sourceBottom * pixelHeight;

      features.push(
        displayFeature(
          west,
          south,
          east,
          north,
          majorityCode,
          10 * blockSize,
        ),
      );
    }
  }

  return {
    samples,
    display: { type: "FeatureCollection", features },
  };
}

function percentage(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 10_000) / 100 : 0;
}

export function summarizeSamples(samples: WorldCoverSample[]): {
  summary: WorldCoverSummary;
  classes: WorldCoverClassSummary[];
} {
  if (samples.length === 0) {
    throw new Error("No valid WorldCover pixels intersect the selected area.");
  }

  const counts = new Map<number, number>();
  const areas = new Map<number, number>();

  for (const sample of samples) {
    counts.set(sample.classCode, (counts.get(sample.classCode) ?? 0) + 1);
    areas.set(sample.classCode, (areas.get(sample.classCode) ?? 0) + sample.areaM2);
  }

  const classes = [...counts.entries()]
    .sort(([leftCode], [rightCode]) => leftCode - rightCode)
    .map(([code, count]) => ({
      code,
      name: className(code),
      pixel_count: count,
      area_m2: Math.round((areas.get(code) ?? 0) * 100) / 100,
      percentage: percentage(count, samples.length),
    }));
  const count = (code: number) => counts.get(code) ?? 0;
  const reportedCodes = new Set([10, 20, 30, 50, 60, 80]);
  const otherCount = [...counts.entries()]
    .filter(([code]) => !reportedCodes.has(code))
    .reduce((total, [, classCount]) => total + classCount, 0);

  return {
    summary: {
      tree_cover_pct: percentage(count(10), samples.length),
      tree_cover_area_m2: Math.round((areas.get(10) ?? 0) * 100) / 100,
      shrubland_pct: percentage(count(20), samples.length),
      grassland_pct: percentage(count(30), samples.length),
      green_vegetation_pct: percentage(
        count(10) + count(20) + count(30),
        samples.length,
      ),
      built_up_pct: percentage(count(50), samples.length),
      bare_sparse_pct: percentage(count(60), samples.length),
      water_pct: percentage(count(80), samples.length),
      other_pct: percentage(otherCount, samples.length),
    },
    classes,
  };
}

export type ThermalProperties = Record<string, unknown> & {
  temperature_c: number;
};

export function enrichThermalCells(
  heatmap: FeatureCollection<Polygon, ThermalProperties>,
  samples: WorldCoverSample[],
): FeatureCollection<Polygon, ThermalProperties> {
  if (heatmap.features.length === 0) {
    throw new Error("At least one thermal cell is required.");
  }

  const temperatures = heatmap.features.map((feature) => {
    const temperature = feature.properties?.temperature_c;

    if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
      throw new Error("Each thermal cell must contain a numeric temperature_c.");
    }

    return temperature;
  });
  const meanTemperature =
    temperatures.reduce((total, temperature) => total + temperature, 0) /
    temperatures.length;

  return {
    type: "FeatureCollection",
    features: heatmap.features.map((feature, featureIndex) => {
      const cellSamples = samples.filter((sample) =>
        pointInPolygon([sample.longitude, sample.latitude], feature.geometry),
      );
      const { summary } =
        cellSamples.length > 0
          ? summarizeSamples(cellSamples)
          : {
              summary: {
                tree_cover_pct: 0,
                tree_cover_area_m2: 0,
                shrubland_pct: 0,
                grassland_pct: 0,
                green_vegetation_pct: 0,
                built_up_pct: 0,
                bare_sparse_pct: 0,
                water_pct: 0,
                other_pct: 0,
              },
            };
      const temperature = temperatures[featureIndex];

      return {
        ...feature,
        properties: {
          ...feature.properties,
          tree_cover_pct: summary.tree_cover_pct,
          green_vegetation_pct: summary.green_vegetation_pct,
          built_up_pct: summary.built_up_pct,
          bare_sparse_pct: summary.bare_sparse_pct,
          high_heat_low_green:
            temperature > meanTemperature &&
            summary.green_vegetation_pct < LOW_GREEN_VEGETATION_THRESHOLD_PCT,
        },
      };
    }),
  };
}

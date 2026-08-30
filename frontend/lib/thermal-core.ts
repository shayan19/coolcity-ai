import type { FeatureCollection, Polygon } from "geojson";

export type ThermalPriorityLevel = "Extreme" | "High" | "Moderate" | "Lower";

export type ThermalCellProperties = Record<string, unknown> & {
  cell_id: string;
  temperature_c: number;
  thermal_delta_c: number;
  thermal_percentile: number;
  heat_rank: number;
  heat_rank_total: number;
  thermal_priority_score: number;
  thermal_priority_level: ThermalPriorityLevel;
  peak_heat_time: string | null;
  exceedance_hours: number | null;
  persistence_hours: number | null;
};

export type ThermalCellCollection = FeatureCollection<Polygon, ThermalCellProperties>;

export const THERMAL_PRIORITY_WEIGHTS = {
  temperature_severity: 30,
  aoi_anomaly: 20,
  thermal_percentile: 15,
  exceedance: 15,
  persistence: 15,
  peak_time_severity: 5,
} as const;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function centroid(geometry: Polygon): [number, number] {
  const ring = geometry.coordinates[0] ?? [];
  const points = ring.length > 1 ? ring.slice(0, -1) : ring;
  const divisor = Math.max(1, points.length);
  return [
    points.reduce((sum, point) => sum + point[0], 0) / divisor,
    points.reduce((sum, point) => sum + point[1], 0) / divisor,
  ];
}

function temporalText(properties: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function temporalNumber(properties: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = finite(properties[key]);
    if (value !== null) return value;
  }
  return null;
}

export function labelAndRankThermalCells(
  heatmap: FeatureCollection<Polygon, Record<string, unknown>>,
): ThermalCellCollection {
  if (!heatmap.features.length) throw new Error("At least one thermal cell is required.");
  const ordered = heatmap.features
    .map((feature, originalIndex) => ({ feature, originalIndex, center: centroid(feature.geometry) }))
    .sort((a, b) => b.center[1] - a.center[1] || a.center[0] - b.center[0] || a.originalIndex - b.originalIndex);
  const digits = Math.max(2, String(ordered.length).length);
  const ids = new Map(ordered.map((entry, index) => [entry.originalIndex, `FG-${String(index + 1).padStart(digits, "0")}`]));
  const temperatures = heatmap.features.map((feature) => finite(feature.properties?.temperature_c));
  if (temperatures.some((value) => value === null)) throw new Error("Each thermal cell must contain a numeric temperature_c.");
  const values = temperatures as number[];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const ranked = values.map((temperature, index) => ({ temperature, index, id: ids.get(index)! }))
    .sort((a, b) => b.temperature - a.temperature || a.id.localeCompare(b.id));
  const ranks = new Map(ranked.map((entry, index) => [entry.index, index + 1]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;
  const maximumExceedance = Math.max(0, ...heatmap.features.map((feature) => temporalNumber(feature.properties ?? {}, ["exceedance_hours", "exceedance"]) ?? 0));
  const maximumPersistence = Math.max(0, ...heatmap.features.map((feature) => temporalNumber(feature.properties ?? {}, ["persistence_hours", "persistence"]) ?? 0));

  return {
    type: "FeatureCollection",
    features: heatmap.features.map((feature, index) => {
      const temperature = values[index];
      const percentile = (values.filter((value) => value <= temperature).length / values.length) * 100;
      const source = feature.properties ?? {};
      const exceedance = temporalNumber(source, ["exceedance_hours", "exceedance"]);
      const persistence = temporalNumber(source, ["persistence_hours", "persistence"]);
      const peakRaw = temporalNumber(source, ["peak_heat_hour_utc", "time_of_measure"]);
      const factors = [
        { weight: THERMAL_PRIORITY_WEIGHTS.temperature_severity, value: spread === 0 ? 0.5 : (temperature - min) / spread },
        { weight: THERMAL_PRIORITY_WEIGHTS.aoi_anomaly, value: spread === 0 ? 0.5 : (temperature - min) / spread },
        { weight: THERMAL_PRIORITY_WEIGHTS.thermal_percentile, value: percentile / 100 },
        ...(exceedance === null ? [] : [{ weight: THERMAL_PRIORITY_WEIGHTS.exceedance, value: maximumExceedance > 0 ? exceedance / maximumExceedance : 0 }]),
        ...(persistence === null ? [] : [{ weight: THERMAL_PRIORITY_WEIGHTS.persistence, value: maximumPersistence > 0 ? persistence / maximumPersistence : 0 }]),
        ...(peakRaw === null ? [] : [{ weight: THERMAL_PRIORITY_WEIGHTS.peak_time_severity, value: Math.max(0, 1 - Math.abs(peakRaw - 15) / 9) }]),
      ];
      const availableWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
      const score = factors.reduce((sum, factor) => sum + factor.weight * factor.value, 0) / availableWeight * 100;
      const level: ThermalPriorityLevel = score >= 85 ? "Extreme" : score >= 65 ? "High" : score >= 35 ? "Moderate" : "Lower";
      return {
        ...feature,
        properties: {
          ...source,
          cell_id: ids.get(index)!,
          temperature_c: temperature,
          thermal_delta_c: Number((temperature - mean).toFixed(4)),
          thermal_percentile: Number(percentile.toFixed(1)),
          heat_rank: ranks.get(index)!,
          heat_rank_total: values.length,
          thermal_priority_score: Number(score.toFixed(1)),
          thermal_priority_level: level,
          peak_heat_time: temporalText(source, ["peak_heat_time", "peak_time", "max_temperature_time"])
            ?? (peakRaw === null ? null : `${String(Math.round(peakRaw)).padStart(2, "0")}:00 UTC`),
          exceedance_hours: exceedance,
          persistence_hours: persistence,
        },
      };
    }),
  };
}

export function mergeTemporalAnalysis(
  current: ThermalCellCollection,
  temporal: FeatureCollection<Polygon, Record<string, unknown>>,
  analyticType: "time_of_measure" | "exceedance" | "persistence",
): ThermalCellCollection {
  const values = new Map(
    temporal.features.map((feature) => [String(feature.properties?.cell_id ?? ""), finite(feature.properties?.analysis_value)]),
  );
  const merged: FeatureCollection<Polygon, Record<string, unknown>> = {
    type: "FeatureCollection",
    features: current.features.map((feature) => {
      const value = values.get(feature.properties.cell_id);
      if (value === null || value === undefined) return feature;
      const property = analyticType === "time_of_measure"
        ? "peak_heat_hour_utc"
        : analyticType === "exceedance"
          ? "exceedance_hours"
          : "persistence_hours";
      return { ...feature, properties: { ...feature.properties, [property]: value } };
    }),
  };
  return labelAndRankThermalCells(merged);
}

export function hottestCell(cells: ThermalCellCollection) {
  return [...cells.features].sort((a, b) => a.properties.heat_rank - b.properties.heat_rank)[0] ?? null;
}

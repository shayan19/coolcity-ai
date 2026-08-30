from datetime import datetime
from math import pi, sin
from typing import Any, Literal

from pydantic import BaseModel, field_validator

Position = tuple[float, float]
EARTH_RADIUS_M = 6_371_008.8
MAX_ANALYSIS_AREA_M2 = 5_000_000


def _ring_area_m2(ring: list[Position]) -> float:
    area = 0.0
    for index, point in enumerate(ring):
        lower = ring[index - 1]
        upper = ring[(index + 1) % len(ring)]
        area += (upper[0] - lower[0]) * pi / 180 * (
            2 + sin(point[1] * pi / 180)
        )
    return area * EARTH_RADIUS_M * EARTH_RADIUS_M / 2


def _polygon_area_m2(rings: list[list[Position]]) -> float:
    outer_area = abs(_ring_area_m2(rings[0]))
    hole_area = sum(abs(_ring_area_m2(ring)) for ring in rings[1:])
    return max(0.0, outer_area - hole_area)


class PolygonGeometry(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[Position]]

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(
        cls, coordinates: list[list[Position]]
    ) -> list[list[Position]]:
        if not coordinates:
            raise ValueError("Polygon must contain at least one ring.")
        normalized: list[list[Position]] = []
        for submitted_ring in coordinates:
            ring = list(submitted_ring)
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])
            if len(ring) < 4:
                raise ValueError("Each polygon ring must contain at least four positions.")
            for longitude, latitude in ring:
                if not -180 <= longitude <= 180:
                    raise ValueError("Longitude must be between -180 and 180.")
                if not -90 <= latitude <= 90:
                    raise ValueError("Latitude must be between -90 and 90.")
            normalized.append(ring)
        outer = normalized[0]
        if len({point[0] for point in outer}) < 2 or len({point[1] for point in outer}) < 2:
            raise ValueError("Polygon must enclose a non-zero bounding area.")
        if _polygon_area_m2(normalized) > MAX_ANALYSIS_AREA_M2:
            raise ValueError("Analysis area must be no larger than 5 square kilometers.")
        return normalized


def _validated_date(value: str) -> str:
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Date must use YYYY-MM-DD format.") from exc
    if parsed.strftime("%Y-%m-%d") != value:
        raise ValueError("Date must use YYYY-MM-DD format.")
    return value


def _validated_time(value: str) -> str:
    try:
        parsed = datetime.strptime(value, "%H:%M")
    except ValueError as exc:
        raise ValueError("Time must use HH:MM format.") from exc
    if parsed.strftime("%H:%M") != value:
        raise ValueError("Time must use HH:MM format.")
    return value


class FortyGuardSubmitRequest(BaseModel):
    geometry: PolygonGeometry
    date: str
    time: str
    granularity: Literal[100, 250, 500] = 100
    analytic_type: Literal["tcm", "time_of_measure", "exceedance", "persistence"] = "tcm"
    threshold_c: float = 40.0

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        return _validated_date(value)

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        return _validated_time(value)

    @field_validator("threshold_c")
    @classmethod
    def validate_threshold(cls, value: float) -> float:
        if not -30 <= value <= 70:
            raise ValueError("Threshold must be between -30 and 70 degrees C.")
        return value


class TemperatureSummary(BaseModel):
    cell_count: int
    mean_temperature_c: float
    min_temperature_c: float
    max_temperature_c: float


class NormalizedHeatFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PolygonGeometry
    properties: dict[str, Any]


class NormalizedHeatFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[NormalizedHeatFeature]


class NormalizedTemperatureResult(BaseModel):
    analysis_id: str
    source: Literal["fortyguard"] = "fortyguard"
    is_mock: Literal[False] = False
    cached: bool
    summary: TemperatureSummary
    heatmap: NormalizedHeatFeatureCollection

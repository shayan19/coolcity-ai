"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import { TerraDraw, TerraDrawPolygonMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { FeatureCollection, Polygon } from "geojson";

import { DEFAULT_MAP_VIEW, OPENFREE_MAP_STYLE } from "../lib/config";
import type { SitePolygonFeature } from "../lib/geo";
import type { ThermalCellCollection } from "../lib/thermal-core";

const HEAT_SOURCE = "fortyguard-cells";
const HEAT_FILL = "fortyguard-temperature";
const HEAT_OUTLINE = "fortyguard-outline";
const HEAT_LABEL = "fortyguard-cell-labels";
const LAND_SOURCE = "worldcover";
const LAND_FILL = "worldcover-fill";
const EMPTY: FeatureCollection<Polygon, Record<string, unknown>> = { type: "FeatureCollection", features: [] };
const OFFLINE_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: "offline", type: "background", paint: { "background-color": "#e7eee9" } }] };

export type Map3DHandle = {
  startDrawing: () => void;
  clearArea: () => void;
  focusCell: (cellId: string) => void;
};

type Props = {
  heatmap: ThermalCellCollection | null;
  landCover: FeatureCollection<Polygon, Record<string, unknown>> | null;
  temperatureVisible: boolean;
  landCoverVisible: boolean;
  selectedCellId: string | null;
  onCellSelect: (cellId: string) => void;
  onAreaChange: (area: SitePolygonFeature | null) => void;
  onReadyChange: (ready: boolean) => void;
};

function polygonBounds(geometry: Polygon): [[number, number], [number, number]] {
  const ring = geometry.coordinates[0];
  return [
    [Math.min(...ring.map((point) => point[0])), Math.min(...ring.map((point) => point[1]))],
    [Math.max(...ring.map((point) => point[0])), Math.max(...ring.map((point) => point[1]))],
  ];
}

const Map3D = forwardRef<Map3DHandle, Props>(function Map3D(props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const heatRef = useRef(props.heatmap);
  const landRef = useRef(props.landCover);
  const onAreaRef = useRef(props.onAreaChange);
  const onCellRef = useRef(props.onCellSelect);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => { onAreaRef.current = props.onAreaChange; }, [props.onAreaChange]);
  useEffect(() => { onCellRef.current = props.onCellSelect; }, [props.onCellSelect]);
  useEffect(() => {
    heatRef.current = props.heatmap;
    const source = mapRef.current?.getSource(HEAT_SOURCE);
    if (source instanceof GeoJSONSource) source.setData(props.heatmap ?? EMPTY);
  }, [props.heatmap]);
  useEffect(() => {
    landRef.current = props.landCover;
    const source = mapRef.current?.getSource(LAND_SOURCE);
    if (source instanceof GeoJSONSource) source.setData(props.landCover ?? EMPTY);
  }, [props.landCover]);
  useEffect(() => {
    const map = mapRef.current;
    [HEAT_FILL, HEAT_OUTLINE, HEAT_LABEL].forEach((id) => {
      if (map?.getLayer(id)) map.setLayoutProperty(id, "visibility", props.temperatureVisible ? "visible" : "none");
    });
  }, [props.temperatureVisible]);
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer(LAND_FILL)) map.setLayoutProperty(LAND_FILL, "visibility", props.landCoverVisible ? "visible" : "none");
  }, [props.landCoverVisible]);
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer(HEAT_OUTLINE)) {
      map.setPaintProperty(HEAT_OUTLINE, "line-width", ["case", ["==", ["get", "cell_id"], props.selectedCellId ?? ""], 4, 1.2]);
      map.setPaintProperty(HEAT_OUTLINE, "line-color", ["case", ["==", ["get", "cell_id"], props.selectedCellId ?? ""], "#ffffff", "#6f2b22"]);
    }
  }, [props.selectedCellId]);

  useImperativeHandle(ref, () => ({
    startDrawing() { drawRef.current?.clear(); onAreaRef.current(null); drawRef.current?.setMode("polygon"); },
    clearArea() { drawRef.current?.clear(); onAreaRef.current(null); },
    focusCell(cellId) {
      const feature = heatRef.current?.features.find((candidate) => candidate.properties.cell_id === cellId);
      if (feature && mapRef.current) mapRef.current.fitBounds(polygonBounds(feature.geometry), { padding: 110, duration: 450, maxZoom: 17 });
    },
  }), []);

  useEffect(() => {
    if (!containerRef.current) return;
    let loaded = false;
    let fallback = false;
    let draw: TerraDraw | null = null;
    const map = new maplibregl.Map({ container: containerRef.current, style: OPENFREE_MAP_STYLE, ...DEFAULT_MAP_VIEW, attributionControl: false });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "FortyGuard · ESA WorldCover · OpenStreetMap" }));
    map.on("load", () => {
      loaded = true;
      const before = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      map.addSource(LAND_SOURCE, { type: "geojson", data: landRef.current ?? EMPTY });
      map.addLayer({ id: LAND_FILL, type: "fill", source: LAND_SOURCE, layout: { visibility: props.landCoverVisible ? "visible" : "none" }, paint: { "fill-color": ["match", ["get", "class_code"], 10, "#147a42", 20, "#78964b", 30, "#a8c95f", 50, "#8b8f94", 60, "#b99a6b", 80, "#3b82c4", "#9aa39e"], "fill-opacity": 0.48 } }, before);
      map.addSource(HEAT_SOURCE, { type: "geojson", data: heatRef.current ?? EMPTY });
      map.addLayer({ id: HEAT_FILL, type: "fill", source: HEAT_SOURCE, layout: { visibility: props.temperatureVisible ? "visible" : "none" }, paint: { "fill-color": ["interpolate", ["linear"], ["get", "thermal_priority_score"], 0, "#42b7c8", 35, "#f4d35e", 65, "#f28c28", 85, "#c53d2f", 100, "#731d1d"], "fill-opacity": 0.68 } }, before);
      map.addLayer({ id: HEAT_OUTLINE, type: "line", source: HEAT_SOURCE, layout: { visibility: props.temperatureVisible ? "visible" : "none" }, paint: { "line-color": "#6f2b22", "line-width": 1.2, "line-opacity": 0.9 } }, before);
      map.addLayer({ id: HEAT_LABEL, type: "symbol", source: HEAT_SOURCE, layout: { visibility: props.temperatureVisible ? "visible" : "none", "text-field": ["get", "cell_id"], "text-size": 11, "text-font": ["Open Sans Semibold"], "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": "#ffffff", "text-halo-color": "#53231e", "text-halo-width": 1.4 } });
      draw = new TerraDraw({ adapter: new TerraDrawMapLibreGLAdapter({ map }), modes: [new TerraDrawPolygonMode({ styles: { fillColor: "#12805c", fillOpacity: 0.18, outlineColor: "#0b6147", outlineWidth: 3, closingPointColor: "#ffffff", closingPointOutlineColor: "#0b6147" } })] });
      draw.start();
      draw.on("finish", (id) => {
        const feature = draw?.getSnapshotFeature(id); if (!feature || feature.geometry.type !== "Polygon") return;
        for (const candidate of draw?.getSnapshot() ?? []) if (candidate.id !== id && candidate.id !== undefined) draw?.removeFeatures([candidate.id]);
        draw?.setMode("static"); onAreaRef.current({ type: "Feature", id: feature.id, properties: { mode: "polygon" }, geometry: feature.geometry });
      });
      drawRef.current = draw;
      map.on("click", HEAT_FILL, (event) => {
        const properties = event.features?.[0]?.properties as Record<string, unknown> | undefined;
        const cellId = typeof properties?.cell_id === "string" ? properties.cell_id : null; if (!cellId) return;
        onCellRef.current(cellId);
        const node = document.createElement("div"); node.className = "thermal-popup";
        const title = document.createElement("strong"); title.textContent = `${cellId} · ${Number(properties?.temperature_c).toFixed(3)} °C`; node.append(title);
        const note = document.createElement("p"); note.textContent = `Thermal rank ${properties?.heat_rank} of ${properties?.heat_rank_total}`; node.append(note);
        new maplibregl.Popup({ offset: 12 }).setLngLat(event.lngLat).setDOMContent(node).addTo(map);
      });
      map.on("mouseenter", HEAT_FILL, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", HEAT_FILL, () => { map.getCanvas().style.cursor = ""; });
      setLoading(false); setError(null); props.onReadyChange(true);
    });
    map.on("error", () => {
      if (!loaded && !fallback) { fallback = true; setOffline(true); map.setStyle(OFFLINE_STYLE); return; }
      if (!loaded) { setLoading(false); setError("The map could not load in this browser."); props.onReadyChange(false); }
    });
    return () => { props.onReadyChange(false); draw?.stop(); drawRef.current = null; mapRef.current = null; map.remove(); };
    // Map lifecycle is intentionally mounted once; current callbacks/data are held in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="map-shell"><div ref={containerRef} className="map-container" />{loading ? <div className="map-state">Loading map…</div> : null}{error ? <div className="map-state is-error">{error}</div> : null}{offline ? <span className="offline-badge">Offline basemap</span> : null}<div className="map-legend"><strong>FortyGuard thermal priority</strong><span><i className="cool" />Lower</span><span><i className="hot" />Extreme</span></div></div>;
});

export default Map3D;

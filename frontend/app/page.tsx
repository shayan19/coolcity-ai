"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import AnalysisSidebar from "../components/AnalysisSidebar";
import type { FortyGuardAnalytic } from "../components/DataSourceSelector";
import LayerControls from "../components/LayerControls";
import Map3D, { type Map3DHandle } from "../components/Map3D";
import WorkflowProgress from "../components/WorkflowProgress";
import {
  analyzeLandCover, attachLandCoverContext, getPolicyResources,
  optimizePolicyScenario, pollFortyGuardAnalysis, pollFortyGuardTemporalAnalysis,
  type LandCoverAnalysisResult, type LiveAnalysisOptions,
  type PolicyResources, type TemperatureAnalysisResult,
} from "../lib/api";
import { calculateSiteArea, getAreaValidationMessage, type SitePolygonFeature } from "../lib/geo";
import {
  DEFAULT_INCENTIVE_CREDIT_CONFIGURATION,
  DEFAULT_INCENTIVE_POLICY_CONFIGURATION,
  INTERVENTION_DURABILITY,
  calculateCoolingIncentive,
  inferInterventionType,
  type IncentiveCreditConfiguration,
  type VerificationStatus,
} from "../lib/incentive-core";
import type { PolicyOptimization, PolicyPlan } from "../lib/policy-optimizer";
import { hottestCell, mergeTemporalAnalysis, type ThermalCellCollection } from "../lib/thermal-core";

export default function Home() {
  const router = useRouter();
  const mapRef = useRef<Map3DHandle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [site, setSite] = useState<SitePolygonFeature | null>(null);
  const [analytic, setAnalytic] = useState<FortyGuardAnalytic>("tcm");
  const [liveOptions, setLiveOptions] = useState<LiveAnalysisOptions>({ date: "2026-08-25", time: "14:00", granularity: 100, threshold_c: 40 });
  const [fortyGuardApiKey, setFortyGuardApiKey] = useState("");
  const [analysis, setAnalysis] = useState<TemperatureAnalysisResult | null>(null);
  const [analysisStage, setAnalysisStage] = useState<"idle" | "submitting" | "processing">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [landCover, setLandCover] = useState<LandCoverAnalysisResult | null>(null);
  const [landBusy, setLandBusy] = useState(false);
  const [landError, setLandError] = useState<string | null>(null);
  const [resources, setResources] = useState<PolicyResources | null>(null);
  const [speciesId, setSpeciesId] = useState("blue-palo-verde");
  const [targetTemperatureC, setTargetTemperatureC] = useState(38);
  const [treeCountMax, setTreeCountMax] = useState(100);
  const [coolRoofMaximumPct, setCoolRoofMaximumPct] = useState(100);
  const [coolPavementMaximumPct, setCoolPavementMaximumPct] = useState(100);
  const [optimization, setOptimization] = useState<PolicyOptimization | null>(null);
  const [selectedPlanType, setSelectedPlanType] = useState<PolicyPlan["plan_type"]>("balanced");
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [incentiveCreditConfiguration, setIncentiveCreditConfiguration] = useState<IncentiveCreditConfiguration>({ ...DEFAULT_INCENTIVE_CREDIT_CONFIGURATION });
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("Proposed");
  const [temperatureVisible, setTemperatureVisible] = useState(true);
  const [landCoverVisible, setLandCoverVisible] = useState(false);

  const areaM2 = site ? calculateSiteArea(site) : null;
  const validationMessage = areaM2 === null ? null : getAreaValidationMessage(areaM2);
  const selectedCell = useMemo(() => analysis?.heatmap.features.find((cell) => cell.properties.cell_id === selectedCellId) ?? null, [analysis, selectedCellId]);
  const selectedPlan = useMemo(() => optimization?.plans.find((plan) => plan.plan_type === selectedPlanType) ?? null, [optimization, selectedPlanType]);
  const incentiveAssessment = useMemo(() => {
    if (!selectedCell || !selectedPlan) return null;
    const interventionType = inferInterventionType({ treeCount: selectedPlan.tree_count, coolRoofPct: selectedPlan.cool_roof_pct, coolPavementPct: selectedPlan.cool_pavement_pct });
    if (!interventionType || selectedPlan.estimated_temperature_reduction_c <= 0) return null;
    return calculateCoolingIncentive({
      selectedSiteId: selectedCell.properties.cell_id,
      fortyGuardThermalPriority: selectedCell.properties.thermal_priority_score,
      fortyGuardThermalPercentile: selectedCell.properties.thermal_percentile,
      modeledCoolingBenefitC: selectedPlan.estimated_temperature_reduction_c,
      interventionType,
      durability: INTERVENTION_DURABILITY[interventionType],
      verificationStatus,
      estimatedAnnualCo2SequestrationKg: selectedPlan.estimated_annual_co2_sequestration_kg,
      creditConfiguration: incentiveCreditConfiguration,
    });
  }, [incentiveCreditConfiguration, selectedCell, selectedPlan, verificationStatus]);
  const currentStage = optimization ? 9 : landCover ? 5 : analysis ? 3 : site ? 2 : 1;

  useEffect(() => { getPolicyResources().then((value) => { setResources(value); if (value.catalog.species[0]) setSpeciesId(value.catalog.species[0].id); }).catch(() => setPolicyError("Policy-model resources could not be loaded.")); }, []);

  const resetPolicy = useCallback(() => { setOptimization(null); setPolicyError(null); setSelectedPlanType("balanced"); setVerificationStatus("Proposed"); }, []);
  const resetOutputs = useCallback(() => {
    setAnalysis(null); setAnalysisError(null); setSelectedCellId(null); setLandCover(null); setLandError(null); resetPolicy(); setAnalysisStage("idle");
  }, [resetPolicy]);
  const handleAreaChange = useCallback((area: SitePolygonFeature | null) => { setSite(area); resetOutputs(); }, [resetOutputs]);
  const handleCellSelect = useCallback((cellId: string) => { setSelectedCellId(cellId); resetPolicy(); mapRef.current?.focusCell(cellId); }, [resetPolicy]);

  async function runTemperature() {
    if (!site || validationMessage) return;
    if (!fortyGuardApiKey.trim()) { setAnalysisError("Enter your FortyGuard API key before running an analysis."); return; }
    if (analytic !== "tcm" && !analysis) { setAnalysisError("Analyze FortyGuard Temperature first"); return; }
    setAnalysisError(null); resetPolicy();
    setAnalysisStage("submitting");
    try {
      if (analytic === "tcm") {
        setLandCover(null); setSelectedCellId(null);
        const result = await pollFortyGuardAnalysis(site.geometry, liveOptions, fortyGuardApiKey, (stage) => setAnalysisStage(stage));
        setAnalysis(result); setTemperatureVisible(true);
        const hottest = hottestCell(result.heatmap);
        if (hottest) { setSelectedCellId(hottest.properties.cell_id); setTimeout(() => mapRef.current?.focusCell(hottest.properties.cell_id), 50); }
      } else {
        const temporalResult = await pollFortyGuardTemporalAnalysis(site.geometry, liveOptions, fortyGuardApiKey, analytic, (stage) => setAnalysisStage(stage));
        setAnalysis((current) => current ? { ...current, heatmap: mergeTemporalAnalysis(current.heatmap, temporalResult.heatmap, analytic) } : current);
      }
    } catch (error) { setAnalysisError(error instanceof Error ? error.message : "FortyGuard analysis failed."); }
    finally { setAnalysisStage("idle"); }
  }

  async function runLandCover() {
    if (!site || !analysis) { setLandError("Run FortyGuard temperature analysis first."); return; }
    setLandBusy(true); setLandError(null); resetPolicy();
    try {
      const land = await analyzeLandCover(site.geometry);
      const enriched = await attachLandCoverContext(site.geometry, analysis.heatmap);
      setLandCover(land); setLandCoverVisible(true); setAnalysis({ ...analysis, heatmap: enriched as ThermalCellCollection });
    } catch (error) { setLandError(error instanceof Error ? error.message : "Land-cover analysis failed."); }
    finally { setLandBusy(false); }
  }

  async function optimizePolicy() {
    if (!selectedCell || !analysis || !landCover || !Number.isFinite(targetTemperatureC)) return;
    setPolicyBusy(true); setPolicyError(null);
    try {
      const result = await optimizePolicyScenario({ selectedCell, allCells: analysis.heatmap, speciesId, targetTemperatureC, treeCountMax, coolRoofMaximumPct, coolPavementMaximumPct });
      setOptimization(result); setSelectedPlanType("balanced");
    } catch (error) { setPolicyError(error instanceof Error ? error.message : "Policy optimization failed."); }
    finally { setPolicyBusy(false); }
  }

  function openReport() {
    if (!site || !analysis || !selectedCell || !landCover || !optimization) return;
    const selectedPlan = optimization.plans.find((plan) => plan.plan_type === selectedPlanType);
    if (!selectedPlan) return;
    sessionStorage.setItem("coolcity-report-v4", JSON.stringify({ generated_at: new Date().toISOString(), area_m2: areaM2, analysis, selected_cell: selectedCell, land_cover: landCover, government_target_temperature_c: targetTemperatureC, optimization, selected_plan: selectedPlan, incentive: incentiveAssessment, incentive_policy: { creditConfiguration: incentiveCreditConfiguration, scoreConfiguration: DEFAULT_INCENTIVE_POLICY_CONFIGURATION }, budget_allocation: null }));
    router.push("/report");
  }

  return <main className="app-shell">
    <header className="top-bar"><div className="brand-lockup"><strong>CoolCity AI</strong><span>US Urban Cooling Policy Intelligence</span></div><div className="provider-lockup"><small>Powered primarily by</small><strong>FortyGuard Temperature AI</strong></div></header>
    <div className="hero-explanation"><strong>FortyGuard diagnoses the urban heat problem.</strong> CoolCity AI determines what policy intervention is required to reduce it. <span>Current coverage: United States</span></div>
    <WorkflowProgress current={currentStage} />
    <div className="dashboard-grid"><section className="map-panel"><Map3D ref={mapRef} heatmap={analysis?.heatmap ?? null} landCover={landCover?.landcover ?? null} temperatureVisible={temperatureVisible} landCoverVisible={landCoverVisible} selectedCellId={selectedCellId} onCellSelect={handleCellSelect} onAreaChange={handleAreaChange} onReadyChange={setMapReady} /><LayerControls temperature={temperatureVisible} landCover={landCoverVisible} onTemperature={setTemperatureVisible} onLandCover={setLandCoverVisible} /></section>
      <AnalysisSidebar areaM2={areaM2} validationMessage={validationMessage} mapReady={mapReady} analytic={analytic} liveOptions={liveOptions} apiKey={fortyGuardApiKey} analysis={analysis} analysisBusy={analysisStage !== "idle"} analysisStage={analysisStage} analysisError={analysisError} selectedCell={selectedCell} landCover={landCover} landBusy={landBusy} landError={landError} resources={resources} speciesId={speciesId} targetTemperatureC={targetTemperatureC} treeCountMax={treeCountMax} coolRoofMaximumPct={coolRoofMaximumPct} coolPavementMaximumPct={coolPavementMaximumPct} optimization={optimization} selectedPlanType={selectedPlanType} policyBusy={policyBusy} policyError={policyError} incentiveAssessment={incentiveAssessment} incentiveCreditConfiguration={incentiveCreditConfiguration} verificationStatus={verificationStatus} onDraw={() => mapRef.current?.startDrawing()} onClear={() => mapRef.current?.clearArea()} onAnalyze={runTemperature} onAnalytic={setAnalytic} onLiveOptions={setLiveOptions} onApiKey={setFortyGuardApiKey} onSelectCell={handleCellSelect} onAnalyzeLand={runLandCover} onSpecies={(id) => { setSpeciesId(id); resetPolicy(); }} onTarget={(value) => { setTargetTemperatureC(value); resetPolicy(); }} onTreeMax={(value) => { setTreeCountMax(value); resetPolicy(); }} onRoofMax={(value) => { setCoolRoofMaximumPct(value); resetPolicy(); }} onPavementMax={(value) => { setCoolPavementMaximumPct(value); resetPolicy(); }} onOptimize={optimizePolicy} onPlan={(type) => { setSelectedPlanType(type); setVerificationStatus("Proposed"); }} onIncentiveCreditConfiguration={setIncentiveCreditConfiguration} onVerificationStatus={setVerificationStatus} onOpenReport={openReport} />
    </div>
  </main>;
}

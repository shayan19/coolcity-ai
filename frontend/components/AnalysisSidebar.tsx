"use client";

import { useMemo, useState } from "react";
import type { Feature, Polygon } from "geojson";

import type { LandCoverAnalysisResult, LiveAnalysisOptions, PolicyResources, TemperatureAnalysisResult } from "../lib/api";
import type { IncentiveAssessment, IncentiveCreditConfiguration, VerificationStatus } from "../lib/incentive-core";
import type { PolicyOptimization, PolicyPlan } from "../lib/policy-optimizer";
import type { ThermalCellProperties } from "../lib/thermal-core";
import DataSourceSelector, { type FortyGuardAnalytic } from "./DataSourceSelector";
import IncentivePolicyPanel from "./IncentivePolicyPanel";
import LandCoverPanel from "./LandCoverPanel";
import SiteControls from "./SiteControls";

type SelectedCell = Feature<Polygon, ThermalCellProperties> | null;
const temporal = (value: string | number | null, suffix = "") => value === null ? "Not analyzed" : `${value}${suffix}`;
const planLabel = (plan: PolicyPlan) => plan.plan_type === "low_intervention" ? "Low intervention" : plan.plan_type === "balanced" ? "Balanced" : "Maximum cooling";

export default function AnalysisSidebar(props: {
  areaM2: number | null; validationMessage: string | null; mapReady: boolean;
  analytic: FortyGuardAnalytic; liveOptions: LiveAnalysisOptions; analysis: TemperatureAnalysisResult | null;
  analysisBusy: boolean; analysisStage: "idle" | "submitting" | "processing"; analysisError: string | null;
  selectedCell: SelectedCell; landCover: LandCoverAnalysisResult | null; landBusy: boolean; landError: string | null;
  resources: PolicyResources | null; speciesId: string; targetTemperatureC: number; treeCountMax: number; coolRoofMaximumPct: number; coolPavementMaximumPct: number;
  optimization: PolicyOptimization | null; selectedPlanType: PolicyPlan["plan_type"]; policyBusy: boolean; policyError: string | null;
  incentiveAssessment: IncentiveAssessment | null; incentiveCreditConfiguration: IncentiveCreditConfiguration; verificationStatus: VerificationStatus;
  onDraw: () => void; onClear: () => void; onAnalyze: () => void;
  onAnalytic: (analytic: FortyGuardAnalytic) => void; onLiveOptions: (options: LiveAnalysisOptions) => void;
  onSelectCell: (cellId: string) => void; onAnalyzeLand: () => void; onSpecies: (id: string) => void; onTarget: (value: number) => void;
  onTreeMax: (value: number) => void; onRoofMax: (value: number) => void; onPavementMax: (value: number) => void; onOptimize: () => void; onPlan: (type: PolicyPlan["plan_type"]) => void;
  onIncentiveCreditConfiguration: (configuration: IncentiveCreditConfiguration) => void; onVerificationStatus: (status: VerificationStatus) => void; onOpenReport: () => void;
}) {
  const [sort, setSort] = useState<"rank" | "temperature" | "id">("rank");
  const cells = useMemo(() => [...(props.analysis?.heatmap.features ?? [])].sort((a, b) => sort === "temperature" ? b.properties.temperature_c - a.properties.temperature_c : sort === "id" ? a.properties.cell_id.localeCompare(b.properties.cell_id) : a.properties.heat_rank - b.properties.heat_rank), [props.analysis, sort]);
  const selected = props.selectedCell?.properties;
  const selectedPlan = props.optimization?.plans.find((plan) => plan.plan_type === props.selectedPlanType) ?? null;
  const temporalNeedsBaseline = props.analytic !== "tcm" && !props.analysis;
  const analyzeLabel = props.analytic === "tcm" ? "Analyze FortyGuard Temperature" : props.analytic === "time_of_measure" ? "Analyze Peak Heat Time" : props.analytic === "exceedance" ? "Analyze Heat Exceedance" : "Analyze Heat Persistence";
  return <aside className="analysis-sidebar">
    <SiteControls areaM2={props.areaM2} validationMessage={props.validationMessage} mapReady={props.mapReady} isAnalyzing={props.analysisBusy} progressStage={props.analysisStage} liveInputValid={Boolean(props.liveOptions.date && props.liveOptions.time && !temporalNeedsBaseline)} liveDisabledReason={temporalNeedsBaseline ? "Analyze FortyGuard Temperature first" : null} analyzeLabel={analyzeLabel} onDraw={props.onDraw} onClear={props.onClear} onAnalyze={props.onAnalyze} />
    <DataSourceSelector analytic={props.analytic} liveOptions={props.liveOptions} disabled={props.analysisBusy} onAnalyticChange={props.onAnalytic} onLiveOptionsChange={props.onLiveOptions} />
    {props.analysisError ? <p className="analysis-error" role="alert">{props.analysisError}</p> : null}

    <section className="sidebar-section thermal-diagnosis"><div className="section-heading"><div><p className="section-kicker">3 · Selected hotspot</p><h2>FORTYGUARD THERMAL PROFILE</h2></div>{props.analysis ? <span className="source-badge">{props.analysis.cached ? "Cached provider result" : "Live provider result"}</span> : null}</div>
      {selected ? <><div className="profile-hero"><div><small>{selected.cell_id}</small><strong>{selected.temperature_c.toFixed(2)} °C</strong><small>FortyGuard observed temperature</small></div><span>{selected.thermal_priority_level}</span></div><dl className="metric-grid">
        <div><dt>AOI mean</dt><dd>{props.analysis?.summary.mean_temperature_c.toFixed(2)} °C</dd></div><div><dt>Thermal anomaly</dt><dd>{selected.thermal_delta_c >= 0 ? "+" : ""}{selected.thermal_delta_c.toFixed(2)} °C</dd></div>
        <div><dt>Percentile</dt><dd>{selected.thermal_percentile.toFixed(1)}th</dd></div><div><dt>Heat rank</dt><dd>{selected.heat_rank} / {selected.heat_rank_total}</dd></div>
        <div><dt>Peak heat time</dt><dd>{temporal(selected.peak_heat_time)}</dd></div><div><dt>Threshold exceedance</dt><dd>{temporal(selected.exceedance_hours, " h")}</dd></div>
        <div><dt>Heat persistence</dt><dd>{temporal(selected.persistence_hours, " h")}</dd></div><div><dt>FortyGuard Thermal Priority</dt><dd>{selected.thermal_priority_score.toFixed(1)} / 100</dd></div>
      </dl></> : <p className="empty-summary">Analyze temperature to select and inspect a FortyGuard cell.</p>}
    </section>

    <section className="sidebar-section"><div className="section-heading"><div><p className="section-kicker">FortyGuard comparison</p><h2>Thermal Ranking</h2></div></div>
      {cells.length ? <><label className="sort-control">Sort <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="rank">Hottest first</option><option value="temperature">Temperature</option><option value="id">Cell ID</option></select></label><div className="thermal-table-wrap"><table className="thermal-table"><thead><tr><th>Cell</th><th>Temperature</th><th>Anomaly</th><th>Percentile</th><th>Rank</th><th>Peak time</th><th>Exceedance</th><th>Persistence</th></tr></thead><tbody>{cells.map((cell) => <tr key={cell.properties.cell_id} className={selected?.cell_id === cell.properties.cell_id ? "selected" : ""} onClick={() => props.onSelectCell(cell.properties.cell_id)}><td>{cell.properties.cell_id}</td><td>{cell.properties.temperature_c.toFixed(2)} °C</td><td>{cell.properties.thermal_delta_c.toFixed(2)} °C</td><td>{cell.properties.thermal_percentile.toFixed(1)}th</td><td>{cell.properties.heat_rank}/{cell.properties.heat_rank_total}</td><td>{cell.properties.peak_heat_time ?? "Not analyzed"}</td><td>{cell.properties.exceedance_hours === null ? "Not analyzed" : `${cell.properties.exceedance_hours} h`}</td><td>{cell.properties.persistence_hours === null ? "Not analyzed" : `${cell.properties.persistence_hours} h`}</td></tr>)}</tbody></table></div></> : <p className="empty-summary">No thermal cells yet.</p>}
    </section>

    <LandCoverPanel areaReady={props.areaM2 !== null && !props.validationMessage && Boolean(props.analysis)} mapReady={props.mapReady} isLoading={props.landBusy} result={props.landCover} error={props.landError} onAnalyze={props.onAnalyzeLand} />

    <section className="sidebar-section policy-section"><div className="section-heading"><div><p className="section-kicker">5 · Government objective</p><h2>Government Cooling Target</h2></div></div>
      <div className="target-equation"><span>Current FortyGuard<strong>{selected ? `${selected.temperature_c.toFixed(2)} °C` : "Select hotspot"}</strong></span><span>Government target<label><input type="number" step={0.5} value={props.targetTemperatureC} onChange={(event) => props.onTarget(Number(event.target.value))} /> °C</label></span><span>Required reduction<strong>{selected ? `${Math.max(0, selected.temperature_c - props.targetTemperatureC).toFixed(2)} °C` : "—"}</strong></span></div>
      <p className="method-note">The target is a planning objective, not a guaranteed outcome.</p>
    </section>

    <section className="sidebar-section policy-section"><div className="section-heading"><div><p className="section-kicker">6 · CoolCity Policy AI</p><h2>Policy Optimization</h2></div></div>
      <p className="model-statement"><strong>FortyGuard</strong> diagnoses where and how severe urban heat is. <strong>CoolCity AI</strong> searches evidence-constrained policy combinations that approach the government target.</p>
      <div className="policy-inputs"><label><span>Tree species</span><select value={props.speciesId} onChange={(event) => props.onSpecies(event.target.value)}>{props.resources?.catalog.species.map((species) => <option key={species.id} value={species.id}>{species.common_name}</option>)}</select></label><label><span>Maximum trees</span><input type="number" min={0} max={500} value={props.treeCountMax} onChange={(event) => props.onTreeMax(Number(event.target.value))} /></label><label><span>Eligible roofs treated max</span><input type="number" min={0} max={100} value={props.coolRoofMaximumPct} onChange={(event) => props.onRoofMax(Number(event.target.value))} /> <small>Policy scenario percentage</small></label><label><span>Eligible pavement treated max</span><input type="number" min={0} max={100} value={props.coolPavementMaximumPct} onChange={(event) => props.onPavementMax(Number(event.target.value))} /> <small>Policy scenario percentage</small></label></div>
      <button type="button" className="primary-button" disabled={!selected || !props.landCover || !props.resources || props.policyBusy} onClick={props.onOptimize}>{props.policyBusy ? "Optimizing policy…" : "Generate Policy Portfolios"}</button>
      {!props.landCover ? <p className="field-note">Analyze the historical land-cover baseline before policy optimization.</p> : null}{props.policyError ? <p className="analysis-error" role="alert">{props.policyError}</p> : null}
      {props.optimization ? <div className="plan-grid">{props.optimization.plans.map((plan) => <button type="button" key={plan.plan_type} className={plan.plan_type === props.selectedPlanType ? "plan-card selected" : "plan-card"} onClick={() => props.onPlan(plan.plan_type)}><strong>{planLabel(plan)}</strong><span>{plan.tree_count} trees · {plan.cool_roof_pct}% roofs · {plan.cool_pavement_pct}% pavement</span><b>−{plan.central_estimate_c.toFixed(2)} °C</b><small>Target gap {plan.remaining_target_gap_c.toFixed(2)} °C</small></button>)}</div> : null}
    </section>

    <section className="sidebar-section"><div className="section-heading"><div><p className="section-kicker">7 · Evidence-constrained prediction</p><h2>Modeled Impact</h2></div>{selectedPlan ? <span className="source-badge modeled">CoolCity model</span> : null}</div>
      {selectedPlan ? <><div className="before-after"><div><small>CURRENT · FortyGuard observed</small><strong>{selectedPlan.fortyguard_observed_temperature_c.toFixed(2)} °C</strong></div><b>→</b><div><small>AFTER POLICY · CoolCity estimate</small><strong>{selectedPlan.modeled_post_intervention_temperature_c.toFixed(2)} °C</strong></div></div><dl className="metric-grid"><div><dt>Estimated reduction</dt><dd>{selectedPlan.central_estimate_c.toFixed(2)} °C</dd></div><div><dt>Uncertainty range</dt><dd>{selectedPlan.lower_estimate_c.toFixed(2)}–{selectedPlan.upper_estimate_c.toFixed(2)} °C</dd></div><div><dt>Remaining target gap</dt><dd>{selectedPlan.remaining_target_gap_c.toFixed(2)} °C</dd></div><div><dt>Confidence</dt><dd>{selectedPlan.confidence}</dd></div><div><dt>Tree contribution</dt><dd>{selectedPlan.tree_cooling_c.toFixed(2)} °C</dd></div><div><dt>Cool roof contribution</dt><dd>{selectedPlan.cool_roof_cooling_c.toFixed(2)} °C</dd></div><div><dt>Cool pavement contribution</dt><dd>{selectedPlan.cool_pavement_cooling_c.toFixed(2)} °C</dd></div><div><dt>Local calibration</dt><dd>{selectedPlan.local_calibration.local_calibration_used ? `Used · ${selectedPlan.local_calibration.multiplier}×` : "Not used"}</dd></div></dl><p className={selectedPlan.target_achieved ? "target-status achieved" : "target-status"}>{selectedPlan.target_achieved ? "Target achieved by this screening estimate." : `Target not fully achieved. Remaining gap: ${selectedPlan.remaining_target_gap_c.toFixed(2)} °C.`}</p>{selectedPlan.extrapolation_warnings.map((warning) => <p className="model-warning" key={warning}>{warning}</p>)}<p className="method-note">{selectedPlan.disclaimer}</p></> : <p className="empty-summary">Generate and select a policy portfolio.</p>}
    </section>

    <section className="sidebar-section"><div className="section-heading"><div><p className="section-kicker">8 · Tree co-benefit</p><h2>Estimated Annual CO2 Sequestration</h2></div></div>{selectedPlan ? <><div className="carbon-result"><strong>{selectedPlan.estimated_annual_co2_sequestration_kg.toLocaleString()} kg CO2/year</strong><span>effective mature canopy: {selectedPlan.effective_added_canopy_m2.toLocaleString()} m²</span></div><p className="method-note">{selectedPlan.carbon_disclaimer}</p></> : <p className="empty-summary">No sequestration estimate until a portfolio is selected.</p>}</section>
    <IncentivePolicyPanel assessment={props.incentiveAssessment} creditConfiguration={props.incentiveCreditConfiguration} verificationStatus={props.verificationStatus} onCreditConfigurationChange={props.onIncentiveCreditConfiguration} onVerificationStatusChange={props.onVerificationStatus} />
    <section className="sidebar-section"><div className="section-heading"><div><p className="section-kicker">10 · Decision output</p><h2>Planner Report</h2></div></div><button type="button" className="primary-button" disabled={!selectedPlan} onClick={props.onOpenReport}>Open Planner Report</button></section>
  </aside>;
}

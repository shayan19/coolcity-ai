"use client";

import { useState } from "react";
import type { LiveAnalysisOptions } from "../lib/api";
import type { FortyGuardTemporalAnalytic } from "../lib/temporal-contract";

export type FortyGuardAnalytic = "tcm" | FortyGuardTemporalAnalytic;

export default function DataSourceSelector(props: {
  liveOptions: LiveAnalysisOptions; disabled: boolean;
  apiKey: string;
  analytic: FortyGuardAnalytic;
  onApiKeyChange: (apiKey: string) => void;
  onLiveOptionsChange: (options: LiveAnalysisOptions) => void;
  onAnalyticChange: (analytic: FortyGuardAnalytic) => void;
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const analytics: Array<[FortyGuardAnalytic, string]> = [["tcm", "Temperature"], ["time_of_measure", "Peak Heat Time"], ["exceedance", "Heat Exceedance"], ["persistence", "Heat Persistence"]];
  return <section className="sidebar-section fortyguard-section"><div className="section-heading"><div><p className="section-kicker">2 · Primary intelligence</p><h2>FORTYGUARD TEMPERATURE AI</h2></div><span className="coverage-badge">Current coverage: United States</span></div>
    <p className="field-note"><strong>Original FortyGuard provider data only.</strong> Analysis begins only when you click the analysis button; a matching original provider result may be safely reused to avoid duplicate requests.</p>
    <div className="api-key-field">
      <label htmlFor="fortyguard-api-key">Your FortyGuard API key</label>
      <div className="api-key-input-row"><input id="fortyguard-api-key" type={showApiKey ? "text" : "password"} value={props.apiKey} disabled={props.disabled} autoComplete="off" spellCheck={false} placeholder="Paste your own active key" onChange={(event) => props.onApiKeyChange(event.target.value)} /><button type="button" className="key-toggle" aria-pressed={showApiKey} disabled={props.disabled} onClick={() => setShowApiKey((value) => !value)}>{showApiKey ? "Hide" : "Show"}</button></div>
      <p className="credential-note">Kept only in this tab&apos;s memory. It is sent to the CoolCity backend only when you run an analysis and is never placed in the request body, URL, report, browser storage, or frontend bundle. <a href="https://www.fortyguard.com/api-pricing" target="_blank" rel="noreferrer">Get FortyGuard API access</a>.</p>
    </div>
    <div className="analytic-tabs" role="tablist" aria-label="FortyGuard analytics">{analytics.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={props.analytic === value} className={props.analytic === value ? "active" : ""} disabled={props.disabled} onClick={() => props.onAnalyticChange(value)}>{label}</button>)}</div>
    <div className="live-controls">
      <label><span>Date</span><input type="date" value={props.liveOptions.date} onChange={(event) => props.onLiveOptionsChange({ ...props.liveOptions, date: event.target.value })} /></label>
      <label><span>Time</span><input type="time" value={props.liveOptions.time} onChange={(event) => props.onLiveOptionsChange({ ...props.liveOptions, time: event.target.value })} /></label>
      <label><span>Cell size</span><select value={props.liveOptions.granularity} onChange={(event) => props.onLiveOptionsChange({ ...props.liveOptions, granularity: Number(event.target.value) as 60 | 80 | 100 })}><option value={100}>100 m</option><option value={80}>80 m</option><option value={60}>60 m</option></select></label>
      {props.analytic === "exceedance" || props.analytic === "persistence" ? <label><span>Heat threshold (°C)</span><input type="number" min={-30} max={70} step={0.5} value={props.liveOptions.threshold_c} onChange={(event) => props.onLiveOptionsChange({ ...props.liveOptions, threshold_c: Number(event.target.value) })} /></label> : null}
    </div>
  </section>;
}

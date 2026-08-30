"use client";

import {
  INCENTIVE_WEIGHTS,
  REFERENCE_COOLING_C,
  type IncentiveAssessment,
  type IncentiveCreditConfiguration,
  type IncentiveTier,
  type VerificationStatus,
} from "../lib/incentive-core";

const creditFields: Array<{ tier: IncentiveTier; label: string }> = [
  { tier: "standard", label: "Standard" },
  { tier: "priority", label: "Priority" },
  { tier: "high_priority", label: "High Priority" },
  { tier: "critical_heat_zone", label: "Critical Heat Zone" },
];

const verificationStatuses: VerificationStatus[] = ["Proposed", "Installed", "Verified", "Maintained"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

export default function IncentivePolicyPanel(props: {
  assessment: IncentiveAssessment | null;
  creditConfiguration: IncentiveCreditConfiguration;
  verificationStatus: VerificationStatus;
  onCreditConfigurationChange: (configuration: IncentiveCreditConfiguration) => void;
  onVerificationStatusChange: (status: VerificationStatus) => void;
}) {
  const eligibilityLabel = props.assessment?.eligibility.eligibleForRenewalOrBonus
    ? "Renewal or bonus screening"
    : props.assessment?.eligibility.eligibleForFullCredit
      ? "Full-credit screening"
      : props.assessment?.eligibility.eligibleForPartialCredit
        ? "Partial-credit screening"
        : "Not yet eligible for payment";

  return <section className="sidebar-section incentive-section">
    <div className="section-heading"><div><p className="section-kicker">9 · Government incentive</p><h2>Cooling Incentive</h2></div><span className="source-badge modeled">Policy screening</span></div>
    <p className="model-statement"><strong>FortyGuard thermal burden remains the primary signal.</strong> CoolCity combines it with modeled cooling benefit and a transparent intervention-durability category.</p>

    <details className="policy-configuration">
      <summary>Illustrative government policy configuration</summary>
      <p className="field-note">These example maximum credit values are adjustable planning inputs. They are not an official tax schedule.</p>
      <div className="credit-inputs">{creditFields.map(({ tier, label }) => <label key={tier}><span>{label}</span><span className="money-input">$<input type="number" min={0} step={100} value={props.creditConfiguration[tier]} onChange={(event) => props.onCreditConfigurationChange({ ...props.creditConfiguration, [tier]: Math.max(0, Number(event.target.value) || 0) })} /></span></label>)}</div>
      <p className="method-note">Prototype score weights: thermal burden {INCENTIVE_WEIGHTS.thermalBurden * 100}%, modeled cooling {INCENTIVE_WEIGHTS.coolingBenefit * 100}%, durability {INCENTIVE_WEIGHTS.durability * 100}%. The {REFERENCE_COOLING_C.toFixed(1)} C cooling reference is a configurable policy normalization value, not a universal scientific threshold.</p>
    </details>

    <label className="verification-control"><span>Verification status</span><select value={props.verificationStatus} onChange={(event) => props.onVerificationStatusChange(event.target.value as VerificationStatus)}>{verificationStatuses.map((status) => <option key={status}>{status}</option>)}</select><small>User/admin-selected for this prototype; CoolCity does not verify physical work automatically.</small></label>

    {props.assessment ? <>
      <div className="incentive-hero"><div><small>Thermal Performance Credit</small><strong>{props.assessment.coolingIncentiveScore.toFixed(1)} / 100</strong><span>{props.assessment.tierLabel}</span></div><div><small>Illustrative maximum credit</small><strong>Up to {money(props.assessment.illustrativeMaximumCredit)}</strong><span>{eligibilityLabel}</span></div></div>
      <dl className="metric-grid">
        <div><dt>FortyGuard Thermal Priority</dt><dd>{props.assessment.fortyGuardThermalPriority.toFixed(1)} / 100</dd></div>
        <div><dt>Thermal percentile</dt><dd>{props.assessment.fortyGuardThermalPercentile.toFixed(1)}th</dd></div>
        <div><dt>Modeled cooling</dt><dd>{props.assessment.modeledCoolingBenefitC.toFixed(2)} C</dd></div>
        <div><dt>Durability</dt><dd>{props.assessment.durability}</dd></div>
        <div><dt>Policy type</dt><dd>{props.assessment.policyType}</dd></div>
        <div><dt>Verification</dt><dd>{props.assessment.verificationStatus}</dd></div>
      </dl>
      <div className="policy-explanation"><strong>Why this selected site receives this priority</strong><ul>{props.assessment.explanation.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
      <p className="safeguard-note">Higher observed heat can increase assistance priority; it never increases tax liability. This tool uses no protected personal attributes and makes no legal tax or payment decision.</p>
      <p className="method-note">{props.assessment.disclaimer}</p>
    </> : <p className="empty-summary">Select a portfolio with a positive modeled cooling benefit to calculate incentive eligibility.</p>}

    <p className="field-note">City budget allocation activates only when multiple real assessed sites are available. CoolCity does not invent comparison sites.</p>
  </section>;
}

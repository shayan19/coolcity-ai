import { formatHectares, formatSquareMeters } from "../lib/geo";

type SiteControlsProps = {
  areaM2: number | null;
  validationMessage: string | null;
  mapReady: boolean;
  isAnalyzing: boolean;
  progressStage: "idle" | "submitting" | "processing";
  liveInputValid: boolean;
  liveDisabledReason: string | null;
  analyzeLabel: string;
  onDraw: () => void;
  onClear: () => void;
  onAnalyze: () => void;
};

export default function SiteControls({
  areaM2,
  validationMessage,
  mapReady,
  isAnalyzing,
  progressStage,
  liveInputValid,
  liveDisabledReason,
  analyzeLabel,
  onDraw,
  onClear,
  onAnalyze,
}: SiteControlsProps) {
  const hasArea = areaM2 !== null;
  const canAnalyze =
    hasArea && validationMessage === null && !isAnalyzing && liveInputValid;
  const status = isAnalyzing
    ? progressStage === "submitting"
      ? "Submitting to FortyGuard..."
      : "FortyGuard is processing temperature data..."
    : validationMessage
      ? "Area invalid"
      : liveDisabledReason
        ? liveDisabledReason
      : hasArea
        ? "Ready for analysis"
        : "No area selected";

  return (
    <section className="sidebar-section" aria-labelledby="site-heading">
      <div className="section-heading">
        <p className="section-kicker">Site</p>
        <h2 id="site-heading">Analysis area</h2>
      </div>

      <div className="area-readout">
        <span>Selected area</span>
        {areaM2 === null ? (
          <strong>Not selected</strong>
        ) : (
          <>
            <strong>{formatSquareMeters(areaM2)} m²</strong>
            <small>{formatHectares(areaM2)} ha</small>
          </>
        )}
      </div>
      <p className="area-limit-note">Maximum analysis area: 10 km²</p>

      <div className={`analysis-status ${validationMessage ? "is-invalid" : ""}`}>
        <span>Status</span>
        <strong>{status}</strong>
      </div>

      {validationMessage ? (
        <p className="validation-message">{validationMessage}</p>
      ) : null}

      <div className="site-buttons">
        <button
          type="button"
          className="secondary-button"
          onClick={onDraw}
          disabled={!mapReady || isAnalyzing}
        >
          Draw Area
        </button>
        <button
          type="button"
          className="text-button"
          onClick={onClear}
          disabled={!hasArea || isAnalyzing}
        >
          Clear Area
        </button>
      </div>

      <button
        type="button"
        className="primary-button"
        onClick={onAnalyze}
        disabled={!canAnalyze}
      >
        {progressStage === "submitting"
          ? "Submitting..."
          : progressStage === "processing"
            ? "Processing..."
            : liveDisabledReason ?? analyzeLabel}
      </button>
    </section>
  );
}

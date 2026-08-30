import type { LandCoverAnalysisResult } from "../lib/api";

type LandCoverPanelProps = {
  areaReady: boolean;
  mapReady: boolean;
  isLoading: boolean;
  result: LandCoverAnalysisResult | null;
  error: string | null;
  onAnalyze: () => void;
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function LandCoverPanel(props: LandCoverPanelProps) {
  return (
    <section className="sidebar-section" aria-labelledby="landcover-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Land cover</p>
          <h2 id="landcover-heading">ESA WorldCover</h2>
        </div>
        {props.result?.cached ? (
          <span className="source-badge is-cached">Cached</span>
        ) : null}
      </div>

      <p className="landcover-baseline-note">
        Historical 2021 baseline. This is not live or current vegetation data.
      </p>

      <button
        type="button"
        className="primary-button"
        disabled={!props.areaReady || !props.mapReady || props.isLoading}
        onClick={props.onAnalyze}
      >
        {props.isLoading ? "Analyzing Land Cover..." : "Analyze Land Cover"}
      </button>

      {props.error ? (
        <p className="analysis-error" role="alert">
          {props.error}
        </p>
      ) : null}

      {props.result ? (
        <>
          <dl className="landcover-summary-grid">
            <div>
              <dt>Tree cover</dt>
              <dd>{formatPercent(props.result.summary.tree_cover_pct)}</dd>
            </div>
            <div>
              <dt>Green vegetation</dt>
              <dd>{formatPercent(props.result.summary.green_vegetation_pct)}</dd>
            </div>
            <div>
              <dt>Built-up</dt>
              <dd>{formatPercent(props.result.summary.built_up_pct)}</dd>
            </div>
            <div>
              <dt>Bare / sparse</dt>
              <dd>{formatPercent(props.result.summary.bare_sparse_pct)}</dd>
            </div>
          </dl>
          <div className="data-source">
            <span>Dataset</span>
            <strong>ESA WorldCover 2021 v2.0</strong>
            <small>
              {props.result.resolution_m} m analysis; approximately{" "}
              {props.result.display_resolution_m} m map cells. ESA WorldCover
              project 2021 / Microsoft Planetary Computer.
            </small>
          </div>
        </>
      ) : (
        <p className="empty-summary">
          Select a valid area, then run this historical land-cover analysis
          intentionally.
        </p>
      )}
    </section>
  );
}

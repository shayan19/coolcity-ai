const stages = ["US area", "FortyGuard", "Hotspot", "Urban context", "Government target", "Policy optimization", "Modeled impact", "CO2", "Cooling incentive", "Report"];
export default function WorkflowProgress({ current }: { current: number }) {
  return <nav className="workflow-progress" aria-label="Analysis workflow">{stages.map((stage, index) => <span key={stage} className={index + 1 < current ? "done" : index + 1 === current ? "active" : ""}><i>{index + 1}</i>{stage}</span>)}</nav>;
}

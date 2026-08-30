export default function LayerControls(props: { temperature: boolean; landCover: boolean; onTemperature: (value: boolean) => void; onLandCover: (value: boolean) => void }) {
  return <div className="layer-controls" aria-label="Map layers"><strong>Map layers</strong><label><input type="checkbox" checked={props.temperature} onChange={(event) => props.onTemperature(event.target.checked)} /> FortyGuard cells + labels</label><label><input type="checkbox" checked={props.landCover} onChange={(event) => props.onLandCover(event.target.checked)} /> ESA WorldCover</label></div>;
}

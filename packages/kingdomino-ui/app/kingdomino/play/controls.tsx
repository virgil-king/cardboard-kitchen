import { ifDefined, s_spacing } from "@/components";

type ControlProps = {
  autoAdvanceEnabled: boolean;
  onAutoAdvanceChanged: () => void;

  simulationCount: number;
  onSimulationCountChanged: (it: number) => void;

  inferenceBatchSize: number;
  onInferenceBatchSizeChanged: (it: number) => void;

  explorationBias: number;
  onExplorationBiasChanged: (it: number) => void;

  onAdvance?: () => void;
};

export function Controls(props: ControlProps): JSX.Element {
  return (
    <div
      style={{
        padding: s_spacing,
        display: "flex",
        flexDirection: "column",
        gap: s_spacing,
        width: "16em",
        minWidth: "16em",
      }}
    >
      <label>
        Auto-advance
        <input
          type="checkbox"
          checked={props.autoAdvanceEnabled}
          onChange={() => {
            props.onAutoAdvanceChanged();
          }}
        />
      </label>

      <div>
        <button
          onClick={ifDefined(props.onAdvance, (it) => () => it())}
          style={{ opacity: props.onAdvance == undefined ? 0.5 : 1 }}
        >
          Advance
        </button>
      </div>

      <label>
        Simulation count
        <input
          type="text"
          value={props.simulationCount}
          onChange={(target) => {
            const newValue = parseInt(target.target.value);
            props.onSimulationCountChanged(newValue);
          }}
        />
      </label>

      <label>
        Inference batch size
        <input
          type="text"
          value={props.inferenceBatchSize}
          onChange={(target) => {
            const newValue = parseInt(target.target.value);
            props.onInferenceBatchSizeChanged(newValue);
          }}
        />
      </label>


      <label>
        Exploration bias
        <input
          type="text"
          value={props.explorationBias}
          onChange={(target) => {
            const newValue = parseFloat(target.target.value);
            props.onExplorationBiasChanged(newValue);
          }}
        />
      </label>

    </div>
  );
}

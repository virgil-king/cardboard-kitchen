import { ifDefined, s_spacing } from "@/components";

type ControlProps = {
  autoAdvanceEnabled: boolean;
  onAutoAdvanceChanged: () => void;
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
        minWidth: "16em"
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
    </div>
  );
}

"use client";

import { GameComponent } from "@/components";
import { KingdominoModel } from "kingdomino";
import { useState, useSyncExternalStore } from "react";
import * as tf from "@tensorflow/tfjs";
import { SinglePlayerEpisodeController } from "./controller";
import { Controls } from "./controls";

export default function SinglePlayerEpisodePage(): JSX.Element {
  // TODO use useQuery
  const [model, setModel] = useState<KingdominoModel | undefined>(() => {
    tf.setBackend("webgl");
    console.log(tf.backend());
    async function fetch() {
      console.log("Loading model...");
      const modelUrl = `http://${window.location.host}/kingdomino/model`;
      const result = await KingdominoModel.loadFromUrl(modelUrl, tf);
      console.log(`Loaded model`);
      setModel(result);
    }
    fetch();
    return undefined;
  });

  const modelSnapshot = model;

  return (
    <>
      {modelSnapshot == undefined ? (
        <>Loading...</>
      ) : (
        <WithModel model={modelSnapshot} />
      )}
    </>
  );
}

function WithModel(props: { model: KingdominoModel }): JSX.Element {
  const [autoAdvance, setAutoAdvance] = useState(false);

  const [controller] = useState(() => {
    return new SinglePlayerEpisodeController(props.model, false);
  });

  const controllerState = useSyncExternalStore(
    (it) => controller.subscribe(it),
    () => controller.state
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        textAlign: "center",
        minHeight: "100vh",
        minWidth: "100vh",
      }}
    >
      <Controls
        autoAdvanceEnabled={autoAdvance}
        onAutoAdvanceChanged={() => {
          setAutoAdvance(!autoAdvance);
          controller.setAutoAdvance(!autoAdvance);
        }}
        onAdvance={
          !autoAdvance && controllerState.pendingAction != undefined
            ? () => controller.advance()
            : undefined
        }
      />
      <div style={{ flex: 1 }}>{GameComponent(controllerState.viewData)}</div>
    </div>
  );
}

"use client";

import { GameComponent } from "@/components";
import {
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoModel,
  KingdominoState,
} from "kingdomino";
import { useEffect, useState, useSyncExternalStore } from "react";
import * as tf from "@tensorflow/tfjs";
import { SinglePlayerEpisodeController } from "./controller";
import { Controls } from "./controls";
import { mcts2 } from "mcts";

export default function SinglePlayerEpisodePage(): JSX.Element {
  const [model, setModel] = useState<KingdominoModel | undefined>(undefined);

  useEffect(() => {
    tf.setBackend("webgl");
    console.log(`Using TensorFlow backend ${tf.getBackend()}`);
    async function fetch() {
      const modelUrl = `http://${window.location.host}/kingdomino/model`;
      const result = await KingdominoModel.loadFromUrl(modelUrl, tf);
      console.log(`Loaded model`);
      setModel(result);
    }
    fetch();
    return undefined;
  }, []);

  const modelSnapshot = model;

  return (
    <>
      {modelSnapshot == undefined ? (
        // TODO center this loading state like the other one
        <>Loading...</>
      ) : (
        <WithModel model={modelSnapshot} />
      )}
    </>
  );
}

function WithModel(props: { model: KingdominoModel }): JSX.Element {
  const [autoAdvance, setAutoAdvance] = useState(false);

  let [mctsConfig, setMctsConfig] = useState(
    new mcts2.MctsConfig<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >({
      simulationCount: 512,
      modelValueWeight: 1,
    })
  );

  let [mctsBatchSize, setMctsBatchSize] = useState(64);

  const [controller] = useState(() => {
    return new SinglePlayerEpisodeController(
      props.model,
      false,
      mctsConfig,
      mctsBatchSize
    );
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
        simulationCount={mctsConfig.simulationCount}
        onSimulationCountChanged={(simulationCount: number) => {
          const newConfig = new mcts2.MctsConfig({
            ...mctsConfig,
            simulationCount: simulationCount,
          });
          setMctsConfig(newConfig);
          controller.mctsConfig = newConfig;
        }}
        inferenceBatchSize={mctsBatchSize}
        onInferenceBatchSizeChanged={(batchSize: number) => {
          setMctsBatchSize(batchSize);
          controller.mctsBatchSize = batchSize;
        }}
        explorationBias={mctsConfig.explorationBias}
        onExplorationBiasChanged={(explorationBias: number) => {
          const newConfig = new mcts2.MctsConfig({
            ...mctsConfig,
            explorationBias: explorationBias,
          });
          setMctsConfig(newConfig);
          controller.mctsConfig = newConfig;
        }}
      />
      <div style={{ flex: 1 }}>{GameComponent(controllerState.viewData)}</div>
    </div>
  );
}

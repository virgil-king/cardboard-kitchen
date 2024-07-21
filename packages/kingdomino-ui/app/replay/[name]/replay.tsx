"use client";

import { GameComponent } from "@/components";
import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
} from "kingdomino";
import { useState } from "react";
import { EpisodeTrainingData, StateTrainingData } from "training-data";

type ReplayProps = {
  episodeJsonString: string;
};

export function Replay(props: ReplayProps) {
  const episodeJson = JSON.parse(props.episodeJsonString);
  const episode = EpisodeTrainingData.decode(Kingdomino.INSTANCE, episodeJson);

  const lastStateIndex = episode.dataPoints.length - 1;
  let [stateIndex, setStateIndex] = useState(0);

  function back() {
    if (stateIndex > 0) {
      setStateIndex(stateIndex - 1);
    }
  }

  function forward() {
    if (stateIndex < lastStateIndex) {
      setStateIndex(stateIndex + 1);
    }
  }

  const trainingData = episode.get(stateIndex);

  console.log(trainingData.predictedValues);

  return (
    <>
      <button onClick={back} disabled={stateIndex == 0}>
        Back
      </button>
      <br></br>
      <button onClick={forward} disabled={stateIndex == lastStateIndex}>
        Forward
      </button>
      <br></br>
      <GameComponent
        snapshot={trainingData.snapshot}
        predictedValues={trainingData.predictedValues}
        terminalValues={trainingData.terminalValues}
      ></GameComponent>
    </>
  );
}

function ActionInfoComponent() {

}

// type TrainingInfoProps = {
//   trainingData: StateTrainingData<
//     KingdominoConfiguration,
//     KingdominoState,
//     KingdominoAction
//   >;
// };

// function TrainingInfoComponent(props: TrainingInfoProps) {
//     return <div
// }

"use client";

import { GameComponent } from "@/components";
import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
} from "kingdomino";
import { EpisodeSnapshot } from "game";
import { useState } from "react";
import { EpisodeTrainingData, StateTrainingData } from "training-data";

type ReplayProps = {
  episodeJsonString: string;
};

export function Replay(props: ReplayProps): JSX.Element {
  const episodeJson = JSON.parse(props.episodeJsonString);
  const episode = EpisodeTrainingData.decode(Kingdomino.INSTANCE, episodeJson);

  const frames = new Array<() => JSX.Element>();
  for (let i = 0; i < episode.dataPoints.length; i++) {
    const dataPoint = episode.get(i);
    frames.push(() => {
      return (
        <GameComponent
          snapshot={dataPoint.snapshot}
          modelValues={dataPoint.predictedValues}
          terminalValues={dataPoint.terminalValues}
          actionToStatistics={dataPoint.actionToStatistics}
        ></GameComponent>
      );
    });
  }

  // Last frame
  frames.push(() => {
    return (
      <GameComponent
        snapshot={
          new EpisodeSnapshot(
            episode.episodeConfig,
            episode.gameConfig,
            episode.terminalState
          )
        }
      ></GameComponent>
    );
  });

  const lastFrameIndex = frames.length - 1;
  let [frameIndex, setFrameIndex] = useState(0);

  function back() {
    if (frameIndex > 0) {
      setFrameIndex(frameIndex - 1);
    }
  }

  function forward() {
    if (frameIndex < lastFrameIndex) {
      setFrameIndex(frameIndex + 1);
    }
  }

  const gameElement = frames[frameIndex]();

  // console.log(trainingData.predictedValues);

  return (
    <>
      <button onClick={back} disabled={frameIndex == 0}>
        Back
      </button>
      <br></br>
      <button onClick={forward} disabled={frameIndex == lastFrameIndex}>
        Forward
      </button>
      <br></br>
      {gameElement}
    </>
  );
}

function ActionInfoComponent() {}

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

"use client";

import _ from "lodash";
import {
  EpisodeConfiguration,
  EpisodeSnapshot,
  Player,
  Players,
  generateEpisode,
} from "game";
import {
  Kingdomino,
  RandomKingdominoAgent,
  KingdominoState,
} from "kingdomino";
import { KingdominoConfiguration } from "kingdomino";
import { Map } from "immutable";

import { useEffect, useState } from "react";
import { createScope, Operation, sleep, Task } from "effection";
import { GameComponent, s_spacing } from "@/components";

const kingdomino: Kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const carol = new Player("carol", "Carol");
const players = new Players(alice, bob);
const randomAgent = new RandomKingdominoAgent();
const agents = Map([
  [alice.id, randomAgent],
  [bob.id, randomAgent],
  [carol.id, randomAgent],
]);

let startCount = 0;

export default function Home(): JSX.Element {
  let [gameState, setGameState] = useState<
    EpisodeSnapshot<KingdominoConfiguration, KingdominoState> | undefined
  >(); 
  let [[scope, destroyScope], _] = useState(createScope());
  let [task, setTask] = useState<Task<void> | undefined>();
  useEffect(() => {
    return () => {
      destroyScope();
    };
  });

  // async function* play(): AsyncGenerator<Operation<void>> {
  //   console.log(`play`);
  //   startCount++;
  //   let myStartCount = startCount;
  //   for await (let snapshot of generateEpisode(
  //     kingdomino,
  //     new EpisodeConfiguration(players),
  //     agents
  //   )) {
  //     console.log(`Updating state from ${myStartCount}`);
  //     setGameState(snapshot);
  //     yield* sleep(20);
  //   }
  // }

  function start() {
    // const previousTask = task;
    // const newTask = scope.run(function* () {
    //   if (previousTask != undefined) {
    //     yield* previousTask.halt();
    //   }
    //   yield* play();
    // });
    // setTask(newTask);
  }

  let content: JSX.Element;
  if (gameState == undefined) {
    content = <></>;
  } else {
    content = <GameComponent snapshot={gameState} />;
  }

  return (
    <div style={{ textAlign: "center" }}>
      <button onClick={start} style={{ margin: s_spacing }}>
        Start
      </button>
      {content}
    </div>
  );
}

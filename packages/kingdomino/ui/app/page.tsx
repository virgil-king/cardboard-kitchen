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
  Terrain,
} from "kingdomino";
import { KingdominoConfiguration, playAreaRadius } from "kingdomino/out/base";
import { Vector2 } from "kingdomino/out/util";
import { Map } from "immutable";

import styles from "./page.module.css";
import { PlayerBoard } from "kingdomino/out/board";
import { KingdominoPlayerState } from "kingdomino/out/state";
import { useEffect, useState } from "react";
import { createScope, Operation, sleep, Task } from "effection";
import { requireDefined } from "studio-util";

const s_spacing = "9pt";
const m_spacing = "18pt";
const l_spacing = "36pt";

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

export default function Home() {
  let [gameState, setGameState] = useState<KingdominoState | undefined>();
  let [[scope, destroyScope], _] = useState(createScope());
  let [task, setTask] = useState<Task<void> | undefined>();
  useEffect(() => {
    return () => {
      destroyScope();
    };
  });

  function* play(): Operation<void> {
    console.log(`play`);
    startCount++;
    let myStartCount = startCount;
    for (let state of generateEpisode(
      kingdomino,
      new EpisodeConfiguration(players),
      agents
    )) {
      console.log(`Updating state from ${myStartCount}`);
      setGameState(state);
      yield* sleep(20);
    }
  }

  function start() {
    const previousTask = task;
    const newTask = scope.run(function* () {
      if (previousTask != undefined) {
        yield* previousTask.halt();
      }
      yield* play();
    });
    setTask(newTask);
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

type GameProps = {
  snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>;
};

function GameComponent(props: GameProps) {
  const playerComponents =
    props.snapshot?.episodeConfiguration.players.players.map((player) => {
      return (
        <PlayerComponent
          key={player.id}
          playerState={props.snapshot.requirePlayerState(player)}
        />
      );
    });
  return <div className={styles.horizontalFlex}>{playerComponents}</div>;
}

type PlayerProps = {
  playerState: KingdominoPlayerState;
};

function PlayerComponent(props: PlayerProps) {
  return (
    <div className={styles.verticalFlex} style={{ padding: s_spacing }}>
      <div style={{ textAlign: "center" }}>{props.playerState.player.name}</div>
      <div style={{ textAlign: "center" }}>
        Score: {props.playerState.gameState.score}
      </div>
      <div style={{ height: s_spacing }} />
      <div>
        <BoardComponent board={props.playerState.board} />
      </div>
    </div>
  );
}

type BoardProps = {
  board: PlayerBoard;
};

function BoardComponent(props: BoardProps) {
  const rows = _.range(-playAreaRadius, playAreaRadius + 1).map((row) => {
    const cells = _.range(-playAreaRadius, playAreaRadius + 1).map((column) => {
      const locationState = props.board.getLocationState(
        new Vector2(column, row)
      );
      return (
        <Square
          key={column.toString()}
          terrain={locationState.terrain}
          crowns={locationState.crowns}
        />
      );
    });
    return <tr key={row}>{cells}</tr>;
  });

  return (
    <table
      className={styles.center}
      style={{ border: "1pt solid gray", padding: s_spacing }}
    >
      <tbody>{rows}</tbody>
    </table>
  );
}

type SquareProps = {
  key: string;
  terrain: Terrain;
  crowns: number;
};

type TerrainRenderingInfo = {
  styleName: string;
  textContent?: string;
};

const terrainToRenderingInfo = Map<Terrain, TerrainRenderingInfo>([
  [
    Terrain.TERRAIN_CENTER,
    { styleName: styles.center, textContent: String.fromCodePoint(0x1f3f0) },
  ],
  [Terrain.TERRAIN_EMPTY, { styleName: styles.empty }],
  [Terrain.TERRAIN_HAY, { styleName: styles.hay }],
  [Terrain.TERRAIN_WATER, { styleName: styles.water }],
  [Terrain.TERRAIN_FOREST, { styleName: styles.forest }],
  [Terrain.TERRAIN_PASTURE, { styleName: styles.pasture }],
  [Terrain.TERRAIN_SWAMP, { styleName: styles.swamp }],
  [Terrain.TERRAIN_MINE, { styleName: styles.mine }],
]);

function Square(props: SquareProps) {
  let renderingInfo = requireDefined(terrainToRenderingInfo.get(props.terrain));
  const classNames = `${styles.boardsquare} ${renderingInfo.styleName}`;
  let text: string;
  if (renderingInfo.textContent != undefined) {
    text = renderingInfo.textContent;
  } else if (props.crowns > 0) {
    text = Array(props.crowns).fill(String.fromCodePoint(0x1f451)).join("");
  } else {
    text = "";
  }
  return <td className={classNames}>{text}</td>;
}

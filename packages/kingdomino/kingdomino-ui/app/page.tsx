"use client";

import _ from "lodash";
import { Episode, Player, Players, runEpisode } from "game";
import {
  Kingdomino,
  RandomKingdominoAgent,
  KingdominoState,
  KingdominoAction,
  Terrain,
} from "kingdomino";
import { playAreaRadius } from "kingdomino/out/base";
import { Vector2, requireDefined } from "kingdomino/out/util";

import styles from "./page.module.css";
import { PlayerBoard } from "kingdomino/out/board";
import { KingdominoPlayerState } from "kingdomino/out/state";
import { useState } from "react";

const s_spacing = "9pt";
const m_spacing = "18pt";
const l_spacing = "36pt";

const kingdomino: Kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const players = new Players([alice, bob, cecile]);
const randomAgent = new RandomKingdominoAgent();
const agents = new Map([
  [alice.id, randomAgent],
  [bob.id, randomAgent],
  [cecile.id, randomAgent],
]);

// function intersperse<T>(array: Array<T>, value: T) {
//   return array.flatMap((item, index, array) => {
//     if (index == array.length - 1) {
//       return [item];
//     }
//     return [item, value];
//   });
// }

export default function Home() {
  const [episode, setEpisode] = useState<
    Episode<KingdominoState, KingdominoAction> | undefined
  >(undefined);
  function play() {
    setEpisode(runEpisode(kingdomino, players, agents));
  }

  let content: JSX.Element;
  if (episode == undefined) {
    content = <></>;
  } else {
    content = <GameComponent episode={episode} />;
  }

  return (
    <div style={{ textAlign: "center" }}>
      <button onClick={play} style={{ margin: s_spacing }}>
        Start
      </button>
      {content}
    </div>
  );
}

type GameProps = {
  episode: Episode<KingdominoState, KingdominoAction>;
};

function GameComponent(props: GameProps) {
  const state = props.episode.currentState;
  const playerComponents = state?.props.players.players.map((player) => {
    return <PlayerComponent playerState={state.requirePlayerState(player)}/>;
  });
  return <div className={styles.horizontalFlex}>{playerComponents}</div>;
}

type PlayerProps = {
  playerState: KingdominoPlayerState;
};

function PlayerComponent(props: PlayerProps) {
  return (
    <div className={styles.verticalFlex} style={{padding: s_spacing}}>
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
        <Square terrain={locationState.terrain} crowns={locationState.crowns} />
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
  terrain: Terrain;
  crowns: number;
};

type TerrainRenderingInfo = {
  styleName: string;
  textContent?: string;
};

const terrainToRenderingInfo = new Map<Terrain, TerrainRenderingInfo>([
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

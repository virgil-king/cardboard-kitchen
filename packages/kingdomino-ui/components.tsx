"use client";

import _ from "lodash";
import { EpisodeSnapshot, Player, PlayerValues } from "game";
import { KingdominoAction, KingdominoState, Terrain } from "kingdomino";
import { KingdominoConfiguration, playAreaRadius } from "kingdomino";
import { Vector2 } from "kingdomino";
import { Map } from "immutable";

import styles from "@/app/page.module.css";
import { PlayerBoard } from "kingdomino/out/board";
import { KingdominoPlayerState } from "kingdomino/out/state";
import { requireDefined } from "studio-util";

export const s_spacing = "9pt";
export const m_spacing = "18pt";
export const l_spacing = "36pt";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

type GameProps = {
  snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>;
  predictedValues?: PlayerValues;
  terminalValues?: PlayerValues;
};

export function GameComponent(props: GameProps) {
  const playerComponents =
    props.snapshot.episodeConfiguration.players.players.map((player) => {
      return (
        <PlayerComponent
          key={player.id}
          player={player}
          playerState={props.snapshot.state.requirePlayerState(player.id)}
          expectedValue={props.predictedValues?.playerIdToValue?.get(player.id)}
          terminalValue={props.terminalValues?.playerIdToValue?.get(player.id)}
        />
      );
    });
  return <div className={styles.horizontalFlex}>{playerComponents}</div>;
}

type PlayerProps = {
  player: Player;
  playerState: KingdominoPlayerState;
  expectedValue?: number;
  terminalValue?: number;
};

function PlayerComponent(props: PlayerProps) {
  const expectedValueElement =
    props.expectedValue != undefined ? (
      <div style={{ textAlign: "center" }}>
        Expected value: {decimalFormat.format(props.expectedValue)}
      </div>
    ) : (
      <></>
    );
  const terminalValueElement =
    props.terminalValue != undefined ? (
      <div style={{ textAlign: "center" }}>
        Final value: {decimalFormat.format(props.terminalValue)}
      </div>
    ) : (
      <></>
    );
  return (
    <div className={styles.verticalFlex} style={{ padding: s_spacing }}>
      <div style={{ textAlign: "center" }}>{props.player.name}</div>
      <div style={{ textAlign: "center" }}>
        Score: {props.playerState.score}
      </div>
      {expectedValueElement}
      {terminalValueElement}
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

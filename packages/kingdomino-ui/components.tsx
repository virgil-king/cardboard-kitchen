"use client";

import _ from "lodash";
import {
  Action,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Player,
  PlayerValues,
} from "game";
import {
  ActionCase,
  ClaimTile,
  defaultLocationProperties,
  Kingdomino,
  KingdominoAction,
  KingdominoState,
  LocationProperties,
  Terrain,
  Tile,
  TileOffer,
  TileOffers,
} from "kingdomino";
import { KingdominoConfiguration, playAreaRadius } from "kingdomino";
import { Vector2 } from "kingdomino";
import { Map } from "immutable";

import styles from "@/app/page.module.css";
import { PlayerBoard } from "kingdomino/out/board";
import { KingdominoPlayerState } from "kingdomino/out/state";
import { requireDefined } from "studio-util";
import { CSSProperties } from "react";
import { ActionStatistics } from "training-data";

export const s_spacing = "9pt";
export const m_spacing = "18pt";
export const l_spacing = "36pt";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

type GameProps = {
  snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>;
  predictedValues?: PlayerValues;
  terminalValues?: PlayerValues;
  actionToStatistics?: Map<KingdominoAction, ActionStatistics>;
};

export function GameComponent(props: GameProps) {
  const state = props.snapshot.state;
  function offersElement(
    title: string,
    offers?: TileOffers,
    stats?: Map<KingdominoAction, ActionStatistics>
  ) {
    if (offers == undefined) {
      return <></>;
    }
    return (
      <div style={{ padding: s_spacing }}>
        <TileOffersComponent
          title={title}
          episodeConfig={props.snapshot.episodeConfiguration}
          offers={offers}
          actionToStatistics={stats}
        ></TileOffersComponent>
      </div>
    );
  }
  // const previousOffers = state.props.previousOffers;
  const previousOffersElement = offersElement(
    "Previous offers",
    state.props.previousOffers
  );
  const nextOffersElement = offersElement(
    "Next offers",
    state.props.nextOffers,
    props.actionToStatistics
  );

  const policyElement =
    props.actionToStatistics == undefined ? (
      <></>
    ) : (
      <PolicyComponent
        policy={props.actionToStatistics}
        currentPlayerId={
          requireDefined(Kingdomino.INSTANCE.currentPlayer(props.snapshot)).id
        }
      ></PolicyComponent>
    );

  return (
    <div className={styles.verticalFlex}>
      <div className={styles.horizontalFlex}>
        {previousOffersElement}
        {nextOffersElement}
      </div>

      <PlayersComponent
        snapshot={props.snapshot}
        predictedValues={props.predictedValues}
        terminalValues={props.terminalValues}
      ></PlayersComponent>

      {policyElement}
    </div>
  );
}

type PlayersProps = {
  snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>;
  predictedValues?: PlayerValues;
  terminalValues?: PlayerValues;
};

export function PlayersComponent(props: GameProps) {
  const currentPlayer = Kingdomino.INSTANCE.currentPlayer(props.snapshot);
  const playerComponents =
    props.snapshot.episodeConfiguration.players.players.map((player) => {
      const isCurrentPlayer = player.id == currentPlayer?.id;
      return (
        <PlayerComponent
          key={player.id}
          player={player}
          playerState={props.snapshot.state.requirePlayerState(player.id)}
          expectedValue={props.predictedValues?.playerIdToValue?.get(player.id)}
          terminalValue={props.terminalValues?.playerIdToValue?.get(player.id)}
          isCurrentPlayer={isCurrentPlayer}
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
  isCurrentPlayer?: boolean;
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
  const textAlignCenter: CSSProperties = { textAlign: "center" };
  let nameElement = <>{props.player.name}</>;
  if (props.isCurrentPlayer) {
    nameElement = <em>{nameElement}</em>;
  }
  return (
    <div className={styles.verticalFlex} style={{ padding: s_spacing }}>
      <div style={textAlignCenter}>{nameElement}</div>
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
  const rows = _.range(playAreaRadius, -playAreaRadius - 1, -1).map((row) => {
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
  return (
    <td className={classNames} style={{ alignContent: "center" }}>
      {text}
    </td>
  );
}

type TileOffersProps = {
  episodeConfig: EpisodeConfiguration;
  offers: TileOffers;
  title: string;
  actionToStatistics?: Map<KingdominoAction, ActionStatistics>;
};

function TileOffersComponent(props: TileOffersProps) {
  return (
    <div className={styles.verticalFlex} style={{ border: "1pt solid gray" }}>
      <div style={{ padding: s_spacing }}>{props.title}</div>
      {props.offers.offers.map((offer, offerIndex) => (
        <TileOfferComponent
          episodeConfig={props.episodeConfig}
          offer={offer}
          offerIndex={offerIndex}
          actionToStatistics={props.actionToStatistics}
        ></TileOfferComponent>
      ))}
    </div>
  );
}

type TileOfferProps = {
  episodeConfig: EpisodeConfiguration;
  offer: TileOffer;
  offerIndex: number;
  actionToStatistics?: Map<KingdominoAction, ActionStatistics>;
};

function TileOfferComponent(props: TileOfferProps) {
  const claim = props.offer.claim;
  const claimPlayerName =
    claim == undefined
      ? ""
      : props.episodeConfig.players.requirePlayer(claim.playerId).name;
  const tileNumber = props.offer.tileNumber;
  const tileNumberString = tileNumber == undefined ? "" : tileNumber.toString();
  function squareProperties(index: number): LocationProperties {
    if (tileNumber == undefined) {
      return defaultLocationProperties;
    }
    return Tile.withNumber(tileNumber).properties[index];
  }
  const square0Properties = squareProperties(0);
  const square1Properties = squareProperties(1);
  const policyValue = props.actionToStatistics?.get(
    KingdominoAction.claimTile(new ClaimTile(props.offerIndex))
  );
  const policyElement = (() => {
    if (props.actionToStatistics == undefined) {
      return <></>;
    } else if (policyValue == undefined) {
      return <div style={{ width: "16ch" }}></div>;
    } else {
      return (
        <div style={{ width: "16ch", alignContent: "center" }}>
          <ClaimStatistics statistics={policyValue}></ClaimStatistics>
        </div>
      );
    }
  })();
  return (
    <div className={styles.horizontalFlex} style={{ padding: s_spacing }}>
      <div style={{ padding: s_spacing, width: "3ch" }}>{tileNumberString}</div>
      <table className={styles.center}>
        <tbody>
          <tr>
            <Square
              key="0"
              terrain={square0Properties.terrain}
              crowns={square0Properties.crowns}
            ></Square>
            <Square
              key="1"
              terrain={square1Properties.terrain}
              crowns={square1Properties.crowns}
            ></Square>
          </tr>
        </tbody>
      </table>
      <div style={{ padding: s_spacing, width: "8ch" }}>{claimPlayerName}</div>
      {policyElement}
    </div>
  );
}

type ClaimStatisticsProps = { statistics: ActionStatistics };

function ClaimStatistics(props: ClaimStatisticsProps) {
  const stats = props.statistics;
  return (
    <div>
      Prior: {decimalFormat.format(stats.prior)}
      <br />
      Visit count: {stats.visitCount}
      <br />
    </div>
  );
}

type PolicyProps = {
  policy: Map<KingdominoAction, ActionStatistics>;
  currentPlayerId: string;
};

function PolicyComponent(props: PolicyProps) {
  const sortedEntries = [...props.policy.entries()].sort(
    ([action1, stats1], [action2, stats2]) =>
      stats2.visitCount - stats1.visitCount
  );
  return (
    <div className={styles.horizontalFlex}>
      {sortedEntries.map(([action, stats], index) => {
        return (
          <div style={{ padding: s_spacing }} key={index}>
            <ActionPolicyComponent
              action={action}
              stats={stats}
              currentPlayerId={props.currentPlayerId}
            ></ActionPolicyComponent>
          </div>
        );
      })}
    </div>
  );
}

type ActionPolicyProps = {
  action: KingdominoAction;
  stats: ActionStatistics;
  currentPlayerId: string;
};

function ActionPolicyComponent(props: ActionPolicyProps) {
  return (
    <div style={{ border: "1pt solid gray", padding: s_spacing }}>
      {actionToString(props.action)}
      <br />
      Prior: {decimalFormat.format(props.stats.prior)}
      <br />
      Visit count: {props.stats.visitCount}
      <br />
      Expected value:{" "}
      {decimalFormat.format(
        requireDefined(
          props.stats.expectedValues.playerIdToValue.get(props.currentPlayerId)
        )
      )}
    </div>
  );
}

function actionToString(action: KingdominoAction) {
  switch (action.data.case) {
    case ActionCase.CLAIM:
      return `Claim offer index ${action.data.claim.offerIndex}`;
    case ActionCase.PLACE:
      return `Place at (${action.data.place.location.x}, ${action.data.place.location.y}), direction ${action.data.place.direction.label}`;
    case ActionCase.DISCARD:
      return `Discard`;
  }
}

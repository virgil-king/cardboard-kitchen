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
import { Map, Set } from "immutable";

import styles from "@/app/page.module.css";
import { PlayerBoard } from "kingdomino/out/board";
import { KingdominoPlayerState } from "kingdomino/out/state";
import { ProbabilityDistribution, requireDefined } from "studio-util";
import { CSSProperties } from "react";
import { ActionStatistics } from "training-data";

export const s_spacing = "9pt";
export const m_spacing = "18pt";
export const l_spacing = "36pt";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

export type TilePlacementState = {
  previouslyPlacedSquareLocation?: Vector2;
  previouslyPlacedSquareProperties?: LocationProperties;
  nextSquareProperties: LocationProperties;
  nextSquarePossibleLocations: Set<Vector2>;
  onPlaceNextSquare: (location: Vector2) => void;
};

export type GameProps = {
  snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>;

  onClaimTile?: (tileIndex: number) => void;
  tilePlacementState?: TilePlacementState;
  onDiscardTile?: () => void;

  // Training data
  modelValues?: PlayerValues;
  searchValues?: PlayerValues;
  terminalValues?: PlayerValues;
  actionToStatistics?: Map<KingdominoAction, ActionStatistics>;
  improvedPolicy?: ProbabilityDistribution<KingdominoAction>;
};

export function GameComponent(props: GameProps): JSX.Element {
  const state = props.snapshot.state;
  function offersElement(
    title: string,
    offers?: TileOffers,
    stats?: Map<KingdominoAction, ActionStatistics>,
    onClaimTile?: (offerIndex: number) => void,
    onDiscardTile?: () => void
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
          onClaimTile={onClaimTile}
          onDiscardTile={onDiscardTile}
        ></TileOffersComponent>
      </div>
    );
  }
  const previousOffersElement = offersElement(
    "Previous offers",
    state.props.previousOffers,
    undefined,
    undefined,
    props.onDiscardTile
  );
  const nextOffersElement = offersElement(
    "Next offers",
    state.props.nextOffers,
    props.actionToStatistics,
    props.onClaimTile
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
        improvedPolicy={props.improvedPolicy}
      ></PolicyComponent>
    );

  return (
    <div className={styles.verticalFlex}>
      <div className={styles.horizontalFlex}>
        {previousOffersElement}
        {nextOffersElement}
      </div>
      {PlayersComponent(props)}
      {policyElement}
    </div>
  );
}

export function PlayersComponent(props: GameProps): JSX.Element {
  const currentPlayer = Kingdomino.INSTANCE.currentPlayer(props.snapshot);
  const playerComponents =
    props.snapshot.episodeConfiguration.players.players.map((player) => {
      const isCurrentPlayer = player.id == currentPlayer?.id;
      return (
        <PlayerComponent
          key={player.id}
          player={player}
          playerState={props.snapshot.state.requirePlayerState(player.id)}
          modelValue={props.modelValues?.playerIdToValue?.get(player.id)}
          terminalValue={props.terminalValues?.playerIdToValue?.get(player.id)}
          isCurrentPlayer={isCurrentPlayer}
          tilePlacementState={
            isCurrentPlayer ? props.tilePlacementState : undefined
          }
        />
      );
    });
  return <div className={styles.horizontalFlex}>{playerComponents}</div>;
}

type PlayerProps = {
  player: Player;
  playerState: KingdominoPlayerState;
  modelValue?: number;
  terminalValue?: number;
  isCurrentPlayer?: boolean;
  tilePlacementState?: TilePlacementState;
};

function PlayerComponent(props: PlayerProps) {
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
      <div style={{ textAlign: "center" }}>
        Model value:{" "}
        {props.modelValue ? decimalFormat.format(props.modelValue) : ""}
      </div>
      {terminalValueElement}
      <div style={{ height: s_spacing }} />
      <div>
        <BoardComponent
          board={props.playerState.board}
          tilePlacementState={props.tilePlacementState}
        />
      </div>
    </div>
  );
}

type BoardProps = {
  board: PlayerBoard;
  tilePlacementState?: TilePlacementState;
};

function BoardComponent(props: BoardProps) {
  const rows = _.range(playAreaRadius, -playAreaRadius - 1, -1).map((row) => {
    const cells = _.range(-playAreaRadius, playAreaRadius + 1).map((column) => {
      const location = new Vector2(column, row);
      const isPossibleNextLocation =
        props.tilePlacementState != undefined &&
        props.tilePlacementState.nextSquarePossibleLocations.contains(location);
      const onClick = isPossibleNextLocation
        ? () => props.tilePlacementState?.onPlaceNextSquare(location)
        : undefined;
      const locationState = isPossibleNextLocation
        ? requireDefined(props.tilePlacementState).nextSquareProperties
        : props.board.getLocationState(location);
      return (
        <Square
          key={column.toString()}
          terrain={locationState.terrain}
          crowns={locationState.crowns}
          onClick={onClick}
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
  onClick?: () => void;
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
    <td
      className={classNames}
      style={{
        alignContent: "center",
        opacity: props.onClick == undefined ? 1 : 0.5,
      }}
      onClick={props.onClick}
    >
      {text}
    </td>
  );
}

type TileOffersProps = {
  episodeConfig: EpisodeConfiguration;
  offers: TileOffers;
  title: string;
  actionToStatistics?: Map<KingdominoAction, ActionStatistics>;
  onClaimTile?: (offerIndex: number) => void;
  onDiscardTile?: () => void;
};

function TileOffersComponent(props: TileOffersProps) {
  const firstIndexWithTile = props.offers.offers.findIndex((offer) =>
    offer.hasTile()
  );
  return (
    <div className={styles.verticalFlex} style={{ border: "1pt solid gray" }}>
      <div style={{ padding: s_spacing }}>{props.title}</div>
      {props.offers.offers.map((offer, offerIndex) => {
        const onDiscard =
          props.onDiscardTile != undefined && offerIndex == firstIndexWithTile
            ? props.onDiscardTile
            : undefined;
        return (
          <TileOfferComponent
            key={offerIndex}
            episodeConfig={props.episodeConfig}
            offer={offer}
            offerIndex={offerIndex}
            actionToStatistics={props.actionToStatistics}
            onClaim={ifDefined(props.onClaimTile, (f) => () => f(offerIndex))}
            onDiscardTile={onDiscard}
          ></TileOfferComponent>
        );
      })}
    </div>
  );
}

type TileOfferProps = {
  episodeConfig: EpisodeConfiguration;
  offer: TileOffer;
  offerIndex: number;
  actionToStatistics?: Map<KingdominoAction, ActionStatistics>;
  onClaim?: () => void;
  onDiscardTile?: () => void;
};

function TileOfferComponent(props: TileOfferProps) {
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
  const buttonElement = (() => {
    const claim = props.offer.claim;
    if (props.onDiscardTile != undefined) {
      return <button onClick={props.onDiscardTile}>Discard</button>;
    } else if (claim != undefined) {
      return (
        <>{props.episodeConfig.players.requirePlayer(claim.playerId).name}</>
      );
    } else if (props.onClaim != undefined) {
      return <button onClick={props.onClaim}>Claim</button>;
    } else {
      return <></>;
    }
  })();
  const policyElement = (() => {
    return (
      <div style={{ width: "16ch", alignContent: "center" }}>
        {policyValue == undefined ? (
          <></>
        ) : (
          <ClaimStatistics statistics={policyValue} />
        )}
      </div>
    );
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
      <div style={{ padding: s_spacing, width: "8ch" }}>{buttonElement}</div>
      {policyElement}
    </div>
  );
}

type ClaimStatisticsProps = { statistics: ActionStatistics };

export function ifDefined<T, U>(
  t: T | undefined,
  f: (t: T) => U
): U | undefined {
  if (t == undefined) {
    return undefined;
  }
  return f(t);
}

function ClaimStatistics(props: ClaimStatisticsProps) {
  const stats = props.statistics;
  return (
    <div>
      Prior: {decimalFormat.format(stats.priorProbability)}
      <br />
      Visit count: {stats.visitCount}
      <br />
    </div>
  );
}

type PolicyProps = {
  policy: Map<KingdominoAction, ActionStatistics>;
  currentPlayerId: string;
  improvedPolicy?: ProbabilityDistribution<KingdominoAction>;
};

function PolicyComponent(props: PolicyProps) {
  const sortedEntries = [...props.policy.entries()].sort(
    ([, stats1], [, stats2]) => {
      const visitDiff = stats2.visitCount - stats1.visitCount;
      if (visitDiff != 0) {
        return visitDiff;
      }
      return stats2.priorProbability - stats1.priorProbability;
    }
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
              improvedPrior={props.improvedPolicy?.get(action)}
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
  improvedPrior?: number;
};

function ActionPolicyComponent(props: ActionPolicyProps) {
  const expectedValue = props.stats.expectedValues.playerIdToValue.get(
    props.currentPlayerId
  );
  const expectedValueString =
    expectedValue == undefined
      ? "unknown"
      : decimalFormat.format(expectedValue);
  return (
    <div style={{ border: "1pt solid gray", padding: s_spacing }}>
      {actionToString(props.action)}
      <br />
      Prior: {props.stats.priorProbability}
      <br />
      Visit count: {props.stats.visitCount}
      <br />
      Expected value: {expectedValueString}
      <br />
      Improved prior: {props.improvedPrior ?? ""}
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

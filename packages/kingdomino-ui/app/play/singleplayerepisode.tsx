"use client";

import { GameComponent, TilePlacementState } from "@/components";
import {
  ClaimTile,
  Direction,
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoModel,
  KingdominoSnapshot,
  KingdominoState,
  NextAction,
  PlaceTile,
  Tile,
} from "kingdomino";
import { EpisodeConfiguration, EpisodeSnapshot, Player, Players } from "game";
import { useState } from "react";
import { MctsConfig, MctsStats, MctsAgent } from "mcts";
import * as tf from "@tensorflow/tfjs";
import { requireDefined } from "studio-util";
import { nextSquarePossibleLocations } from "./controller";

const playerId = "player";
const bot1PlayerId = "bot1";
const bot2PlayerId = "bot2";
const bot3PlayerId = "bot3";

const players = new Players(
  new Player(playerId, "Player 1"),
  new Player(bot1PlayerId, "Bot 1"),
  new Player(bot2PlayerId, "Bot 2"),
  new Player(bot3PlayerId, "Bot 3")
);
const episodeConfig = new EpisodeConfiguration(players);

const kingdominoConfig = new KingdominoConfiguration(players.players.count());

const mctsConfig = new MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({
  simulationCount: 64,
  modelValueWeight: 1,
});

export default function SinglePlayerEpisodePage(): JSX.Element {
  console.log(`SinglePlayerEpisodePage`);

  const [model, setModel] = useState<KingdominoModel | undefined>(() => {
    tf.setBackend("webgl");
    console.log(tf.backend());
    console.log(`useState initializer running`);
    async function fetch() {
      const result = await KingdominoModel.loadFromUrl(
        "http://localhost:3000/kingdomino/models/conv6/2024-11-10T02:11:42.841Z",
        tf
      );
      console.log(`Setting model`);
      setModel(result);
    }
    fetch();
    return undefined;
  });

  const modelSnapshot = model;

  if (modelSnapshot == undefined) {
    console.log("Loading model...");
    return <>Loading...</>;
  }

  return <WithModel model={modelSnapshot} />;
}

function logSnapshot(snapshot: KingdominoSnapshot) {
  console.log(`next action is ${snapshot.state.nextAction}`);
  console.log(`next player is ${snapshot.state.requireCurrentPlayerId()}`);
}

function WithModel(props: { model: KingdominoModel }): JSX.Element {
  const [episodeState, _setEpisodeState] = useState(() => {
    const state = KingdominoState.newGame(episodeConfig, kingdominoConfig);
    return new EpisodeSnapshot(episodeConfig, kingdominoConfig, state);
  });

  const [tilePlacementState, setTilePlacementState] = useState<
    TilePlacementState | undefined
  >(undefined);

  function setEpisodeState(snapshot: KingdominoSnapshot) {
    console.log(
      `Setting new state with next action ${snapshot.state.nextAction}`
    );
    _setEpisodeState(snapshot);

    if (
      snapshot.state.nextAction == NextAction.RESOLVE_OFFER &&
      isHumanPlayerTurn(snapshot)
    ) {
      const offerToResolve = requireDefined(
        snapshot.state.props.previousOffers?.firstOfferWithTile()
      );
      const tile = Tile.withNumber(requireDefined(offerToResolve.tileNumber));
      setTilePlacementState({
        nextSquareProperties: tile.properties[0],
        nextSquarePossibleLocations: nextSquarePossibleLocations(
          snapshot,
          undefined
        ),
        onPlaceNextSquare: (location1) => {
          logSnapshot(episodeState);
          setTilePlacementState({
            previouslyPlacedSquareLocation: location1,
            previouslyPlacedSquareProperties: tile.properties[0],
            nextSquareProperties: tile.properties[1],
            nextSquarePossibleLocations: nextSquarePossibleLocations(
              snapshot,
              location1
            ),
            onPlaceNextSquare: (location2) => {
              logSnapshot(episodeState);
              setTilePlacementState(undefined);
              const offset = location2.minus(location1);
              const direction = requireDefined(Direction.withOffset(offset));
              act(
                snapshot,
                KingdominoAction.placeTile(new PlaceTile(location1, direction))
              );
            },
          });
        },
      } satisfies TilePlacementState);
    } else {
      setTilePlacementState(undefined);
    }
  }

  function isHumanPlayerTurn(snapshot: KingdominoSnapshot): Boolean {
    return snapshot.state.currentPlayerId == playerId;
  }

  function isBotTurn(snapshot: KingdominoSnapshot): Boolean {
    const currentPlayerId = snapshot.state.currentPlayerId;
    return currentPlayerId != undefined && currentPlayerId != playerId;
  }

  async function performBotActionsIfNeeded(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
  ) {
    let newSnapshot = snapshot;
    while (true) {
      if (!isBotTurn(newSnapshot)) {
        return;
      }
      const mctsStats = new MctsStats();
      const mctsContext = {
        config: mctsConfig,
        game: Kingdomino.INSTANCE,
        model: props.model.inferenceModel,
        stats: mctsStats,
      };
      const mctsAgent = new MctsAgent(Kingdomino.INSTANCE, mctsContext);
      const start = performance.now();
      const action = await mctsAgent.act(newSnapshot);
      console.log(`Generating move took ${performance.now() - start} ms`);
      console.log(`MCTS stats: ${JSON.stringify(mctsStats)}`);
      const [newState] = Kingdomino.INSTANCE.apply(newSnapshot, action);
      newSnapshot = newSnapshot.derive(newState);
      setEpisodeState(newSnapshot);
    }
  }

  function act(snapshot: KingdominoSnapshot, action: KingdominoAction) {
    console.log(`act: ${JSON.stringify(action)}`);
    logSnapshot(episodeState);

    const [newState] = Kingdomino.INSTANCE.apply(snapshot, action);
    const newSnapshot = snapshot.derive(newState);

    setEpisodeState(newSnapshot);

    performBotActionsIfNeeded(newSnapshot);
  }

  const onClaimTile =
    isHumanPlayerTurn(episodeState) &&
    episodeState.state.nextAction == NextAction.CLAIM_OFFER
      ? (tileIndex: number) => {
          act(
            episodeState,
            KingdominoAction.claimTile(new ClaimTile(tileIndex))
          );
        }
      : undefined;

  const onDiscardTile =
    isHumanPlayerTurn(episodeState) &&
    episodeState.state.nextAction == NextAction.RESOLVE_OFFER
      ? () => {
          act(episodeState, KingdominoAction.discardTile());
        }
      : undefined;

  return (
    <GameComponent
      snapshot={episodeState}
      onClaimTile={onClaimTile}
      tilePlacementState={tilePlacementState}
      onDiscardTile={onDiscardTile}
    ></GameComponent>
  );
}

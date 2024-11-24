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
  Vector2,
} from "kingdomino";
import { Set } from "immutable";
import { GameProps, TilePlacementState } from "@/components";
import { EpisodeConfiguration, EpisodeSnapshot, Player, Players } from "game";
import { mcts2, MctsAgent2 } from "mcts";
import { requireDefined } from "studio-util";

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

const mctsConfig = new mcts2.MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({
  simulationCount: 512,
  modelValueWeight: 1,
});

const batchSize = 64;

type ControllerState = {
  viewData: GameProps;
  pendingAction: KingdominoAction | undefined;
};

export class SinglePlayerEpisodeController {
  listener: (() => void) | undefined = undefined;

  state: ControllerState;

  private autoAdvance = false;

  constructor(private readonly model: KingdominoModel, autoAdvance: boolean) {
    const state = KingdominoState.newGame(episodeConfig, kingdominoConfig);
    const snapshot = new EpisodeSnapshot(
      episodeConfig,
      kingdominoConfig,
      state
    );
    this.autoAdvance = autoAdvance;
    this.state = this.createStateForNewSnapshot(snapshot);
  }

  subscribe(listener: () => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  snapshot(): ControllerState {
    return this.state;
  }

  advance() {
    if (this.state.pendingAction != undefined) {
      this.act(this.state.pendingAction);
    }
  }

  setAutoAdvance(autoAdvance: boolean) {
    this.autoAdvance = autoAdvance;
    if (autoAdvance) {
      if (this.state.pendingAction != undefined) {
        this.act(this.state.pendingAction);
      } else {
        this.generateBotActionIfNeeded();
      }
    }
  }

  private createStateForNewSnapshot(
    snapshot: KingdominoSnapshot
  ): ControllerState {
    const onClaimTile =
      this.isHumanPlayerTurn(snapshot) &&
      snapshot.state.nextAction == NextAction.CLAIM_OFFER
        ? (tileIndex: number) => {
            this.act(KingdominoAction.claimTile(new ClaimTile(tileIndex)));
          }
        : undefined;

    const onDiscardTile =
      this.isHumanPlayerTurn(snapshot) &&
      snapshot.state.nextAction == NextAction.RESOLVE_OFFER
        ? () => {
            this.act(KingdominoAction.discardTile());
          }
        : undefined;

    const tilePlacementState = (() => {
      if (
        !this.isHumanPlayerTurn(snapshot) ||
        snapshot.state.nextAction != NextAction.RESOLVE_OFFER
      ) {
        return undefined;
      }
      const offerToResolve = requireDefined(
        snapshot.state.props.previousOffers?.firstOfferWithTile()
      );
      const tile = Tile.withNumber(requireDefined(offerToResolve.tileNumber));
      return {
        nextSquareProperties: tile.properties[0],
        nextSquarePossibleLocations: this.nextSquarePossibleLocations(
          snapshot,
          undefined
        ),
        onPlaceNextSquare: (location: Vector2) => {
          this.setFirstPlacementLocation(location);
        },
      } satisfies TilePlacementState;
    })();

    return {
      viewData: {
        snapshot: snapshot,
        onClaimTile: onClaimTile,
        tilePlacementState: tilePlacementState,
        onDiscardTile: onDiscardTile,
      } satisfies GameProps,
      pendingAction: undefined,
    };
  }

  private updateState(state: ControllerState) {
    this.state = state;
    if (this.listener != undefined) {
      this.listener();
    }
  }

  /**
   * Applies {@link action} to the current snapshot and updates our state
   * to reflect the resulting snapshot and no pending action
   */
  private act(action: KingdominoAction) {
    const [newState] = Kingdomino.INSTANCE.apply(
      this.state.viewData.snapshot,
      action
    );
    const newSnapshot = this.state.viewData.snapshot.derive(newState);
    this.updateState(this.createStateForNewSnapshot(newSnapshot));
    this.generateBotActionIfNeeded();
  }

  private isHumanPlayerTurn(snapshot: KingdominoSnapshot): Boolean {
    return snapshot.state.currentPlayerId == playerId;
  }

  isBotTurn(snapshot: KingdominoSnapshot): Boolean {
    const currentPlayerId = snapshot.state.currentPlayerId;
    return currentPlayerId != undefined && currentPlayerId != playerId;
  }

  private async generateBotActionIfNeeded() {
    if (!this.isBotTurn(this.state.viewData.snapshot)) {
      return;
    }
    const mctsStats = new mcts2.MctsStats();
    const mctsAgent = new MctsAgent2(
      Kingdomino.INSTANCE,
      this.model.inferenceModel,
      mctsConfig,
      batchSize,
      mctsStats
    );
    const start = performance.now();
    const mctsResult = await mctsAgent.mcts(this.state.viewData.snapshot);
    const action = mctsAgent.greedyAction(
      this.state.viewData.snapshot,
      mctsResult.actionToStatistics
    );
    console.log(`Generating move took ${performance.now() - start} ms`);
    console.log(`MCTS stats: ${JSON.stringify(mctsStats)}`);

    if (this.autoAdvance) {
      this.act(action);
    } else {
      const viewData = {
        ...this.state.viewData,
        modelValues: mctsResult.stateValues,
        actionToStatistics: mctsResult.actionToStatistics,
      } satisfies GameProps;
      this.updateState({
        viewData: viewData,
        pendingAction: action,
      } satisfies ControllerState);
    }
  }

  private nextSquarePossibleLocations(
    snapshot: KingdominoSnapshot,
    firstSquareLocation: Vector2 | undefined
  ): Set<Vector2> {
    let result = Set<Vector2>();
    for (const placement of snapshot.state.possiblePlacements()) {
      if (firstSquareLocation == undefined) {
        result = result.add(placement.location);
      } else if (firstSquareLocation.equals(placement.location)) {
        result = result.add(
          placement.location.plus(placement.direction.offset)
        );
      }
    }
    return result;
  }

  private setFirstPlacementLocation(location: Vector2) {
    const offerToResolve = requireDefined(
      this.state.viewData.snapshot.state.props.previousOffers?.firstOfferWithTile()
    );
    const tile = Tile.withNumber(requireDefined(offerToResolve.tileNumber));

    const tilePlacementState = {
      nextSquareProperties: tile.properties[1],
      nextSquarePossibleLocations: this.nextSquarePossibleLocations(
        this.state.viewData.snapshot,
        location
      ),
      onPlaceNextSquare: (location2: Vector2) => {
        const offset = location2.minus(location);
        const direction = requireDefined(Direction.withOffset(offset));
        this.act(
          KingdominoAction.placeTile(new PlaceTile(location, direction))
        );
      },
    } satisfies TilePlacementState;

    this.updateState({
      ...this.state,
      viewData: {
        ...this.state.viewData,
        tilePlacementState: tilePlacementState,
      },
    });
  }
}

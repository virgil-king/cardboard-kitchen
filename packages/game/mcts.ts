import {
  Action,
  Episode,
  GameResult,
  GameState,
  Model,
  PlayerExpectedValues,
} from "./game.js";
import { Map } from "immutable";
import { requireDefined } from "studio-util";

/**
 * A node in a UCT search tree uniquely corresponding to a preceding sequence of actions.
 */
class Node<StateT extends GameState, ActionT extends Action> {
  visits = 0;
  children = Map<ActionT, Node<StateT, ActionT>>();
  readonly playerExpectedValues = new NodeValues();
  constructor(
    readonly model: Model<StateT, ActionT>,
    readonly explorationBias: number
  ) {}

  /**
   * Updates the node by unrolling {@link episode}
   */
  visit(episode: Episode<StateT, ActionT>): PlayerExpectedValues {
    this.visits++;
    const state = episode.currentState;

    const result = state.result;
    if (result != undefined) {
      //   this.playerExpectedValues.addGameResult(result);
      return Map(
        result.playerIdOrder.map((playerId) => [
          playerId,
          result.value(playerId),
        ])
      );
    }

    const action = this.selectAction(state);
    const childState = episode.apply(action);
    let childNode = this.children.get(action);
    if (childNode == undefined) {
      // New child:
      childNode = new Node(this.model, this.explorationBias);
      this.children = this.children.set(action, childNode);
    } else {
      // Existing child: continue the search into a grandchild node
      childNode.visit(episode);
    }
    this.playerExpectedValues.addExpectedValues(childNode.playerExpectedValues);
  }

  selectAction(state: StateT): ActionT {
    let maxUcb = 0;
    let maxUcbAction: ActionT | undefined = undefined;
    for (const [action, probability] of this.model.policy(state)) {
      let childNode = this.children.get(action);
      if (childNode == undefined) {
        return action;
      }

      const ucb =
        requireDefined(
          childNode.playerExpectedValues.playerIdToAverageValue.get(
            requireDefined(state.currentPlayer).id
          )
        ) +
        this.explorationBias *
          Math.sqrt((2 * Math.log(this.visits)) / childNode.visits);
      if (ucb > maxUcb) {
        maxUcb = ucb;
        maxUcbAction = action;
      }
    }
    if (maxUcbAction == undefined) {
      throw new Error("No action to select");
    }
    return maxUcbAction;
  }
}

/**
 * Returns a map from possible actions from {@link state} to their predicted value
 *
 * @param steps how many search steps to perform
 */
export function mcts<StateT extends GameState, ActionT extends Action>(
  model: Model<StateT, ActionT>,
  state: StateT,
  steps: number,
  explorationBias: number
): Map<ActionT, number> {
  const root = new Node(model, explorationBias);
  for (let step = 0; step < steps; step++) {}
  return root.children.map((node) => node.value);
}

/**
 * Average values for each player at a single search tree node
 */
class NodeValues {
  resultCount = 0;
  playerIdToAverageValue = Map<string, number>();
  addGameResult(gameResult: GameResult) {
    this.resultCount++;
    this.playerIdToAverageValue = Map(
      gameResult.playerIdOrder.map((playerId) => {
        return [
          playerId,
          this.updatedPlayerValue(playerId, gameResult.value(playerId)),
        ];
      })
    );
  }
  addExpectedValues(other: NodeValues) {
    this.resultCount++;
    this.playerIdToAverageValue = Map(
      other.playerIdToAverageValue.keySeq().map((playerId) => {
        return [
          playerId,
          this.updatedPlayerValue(
            playerId,
            other.playerIdToAverageValue.get(playerId, 0)
          ),
        ];
      })
    );
  }
  /**
   * Returns the new average value for {@link playerId} taking into account {@link value}.
   *
   * {@link resultCount} should already take into account {@link value} when this method is called.
   */
  updatedPlayerValue(playerId: string, value: number): number {
    const currentValue = this.playerIdToAverageValue.get(playerId, 0);
    return currentValue + (value - currentValue) / this.resultCount;
  }
}

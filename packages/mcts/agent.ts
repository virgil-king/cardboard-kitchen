import {
  Action,
  Agent,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
} from "game";
import { Range, Seq } from "immutable";
import { requireDefined, driveGenerators } from "studio-util";
import { MctsContext, NonTerminalStateNode } from "./mcts.js";

/**
 * MCTS agent that performs poorly since it doesn't support batch inference
 */
export class MctsAgent<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements Agent<C, S, A>
{
  constructor(
    readonly game: Game<C, S, A>,
    readonly mctsContext: MctsContext<C, S, A>
  ) {}
  act(snapshot: EpisodeSnapshot<C, S>): A {
    const root = new NonTerminalStateNode(
      this.mctsContext,
      snapshot,
      this.mctsContext.model.infer([snapshot])[0]
    );
    // Run simulationCount steps or enough to try every possible action once
    let selectedAction: A | undefined = undefined;
    if (root.actionToChild.size == 1) {
      // When root has exactly one child, visit it once to populate the
      // action statistics, but no further visits are necessary
      this.visit(root);
      return requireDefined(root.actionToChild.keys().next().value);
    } else {
      for (let i of Range(
        0,
        Math.max(
          this.mctsContext.config.simulationCount,
          root.actionToChild.size
        )
      )) {
        this.visit(root);
      }
      const currentPlayer = requireDefined(this.game.currentPlayer(snapshot));
      // Greedily select action with greatest expected value
      [selectedAction] = requireDefined(
        Seq(root.actionToChild.entries()).max(
          ([, actionNode1], [, actionNode2]) =>
            actionNode1.requirePlayerValue(currentPlayer) -
            actionNode2.requirePlayerValue(currentPlayer)
        )
      );
      return selectedAction;
    }
  }

  private visit(node: NonTerminalStateNode<C, S, A>) {
    const generator = node.visit();
    driveGenerators([generator], (snapshots) =>
      this.mctsContext.model.infer(snapshots)
    );
  }
}

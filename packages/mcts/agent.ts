import {
  Action,
  Agent,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  PlayerValues,
} from "game";
import { Range, Seq } from "immutable";
import { requireDefined, driveAsyncGenerators } from "studio-util";
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
  async act(snapshot: EpisodeSnapshot<C, S>): Promise<A> {
    const batchInferenceResult = await this.mctsContext.model.infer([snapshot]);
    // console.log(`inference result is ${JSON.stringify(batchInferenceResult)}`);
    const root = new NonTerminalStateNode(
      this.mctsContext,
      snapshot,
      batchInferenceResult[0]
    );
    // Run simulationCount steps or enough to try every possible action once
    let selectedAction: A | undefined = undefined;
    if (root.actionToChild.size == 1) {
      // When root has exactly one child, visit it once to populate the
      // action statistics, but no further visits are necessary
      await this.visit(root);
      return requireDefined(root.actionToChild.keys().next().value);
    }

    for (let i of Range(
      0,
      Math.max(this.mctsContext.config.simulationCount, root.actionToChild.size)
    )) {
      await this.visit(root);
    }
    const currentPlayer = requireDefined(this.game.currentPlayer(snapshot));
    // Greedily select action with greatest expected value
    console.log(`node is ${JSON.stringify(root.playerValues)}`);
    console.log(
      `action nodes are ${JSON.stringify(root.actionToChild.entries())}`
    );
    [selectedAction] = requireDefined(
      Seq(root.actionToChild.entries()).max(
        ([, actionNode1], [, actionNode2]) =>
          actionNode1.requirePlayerValue(currentPlayer) -
          actionNode2.requirePlayerValue(currentPlayer)
      )
    );
    return selectedAction;
  }

  private visit(
    node: NonTerminalStateNode<C, S, A>
  ): Promise<ReadonlyArray<PlayerValues>> {
    const generator = node.visit();
    return driveAsyncGenerators([generator], (snapshots) => {
      const start = performance.now();
      const result = this.mctsContext.model.infer(snapshots);
      console.log(`Inference took ${performance.now() - start} ms`);
      return result;
    });
  }
}

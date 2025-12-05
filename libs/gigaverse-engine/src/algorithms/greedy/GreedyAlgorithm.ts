// path: gigaverse-engine/src/algorithms/greedy/GreedyAlgorithm.ts
/**
 * A greedy (greedy) algorithm with more advanced loot & move scoring,
 * plus an defaultEvaluate fallback for additional synergy logic.
 */

import {
  IGigaverseAlgorithm,
  GigaverseAction,
  GigaverseActionType,
} from "../IGigaverseAlgorithm";
import {
  GigaverseRunState,
  GigaverseFighter,
} from "../../simulator/GigaverseTypes";
import {
  GigaverseSimulator,
  GigaverseMove,
} from "../../simulator/GigaverseSimulator";
import cloneDeep from "lodash/cloneDeep";
import { CustomLogger } from "../../types/CustomLogger";
import { defaultLogger } from "../../utils/defaultLogger";
import { defaultEvaluate } from "../defaultEvaluate";

/** Optional config for weighting ATK/DEF in picking moves, etc. */
export interface GreedyConfig {
  atkWeight?: number;
  defWeight?: number;
  /**
   * If set, use this to evaluate the runState for final checks (rarely used by a purely greedy approach).
   */
  evaluateFn?: (state: GigaverseRunState) => number;
}

export class GreedyAlgorithm implements IGigaverseAlgorithm {
  private config: Required<GreedyConfig>;
  private simulator: GigaverseSimulator;
  private logger: CustomLogger;

  constructor(config?: GreedyConfig, logger?: CustomLogger) {
    this.config = {
      atkWeight: config?.atkWeight ?? 2.0,
      defWeight: config?.defWeight ?? 1.0,
      evaluateFn: config?.evaluateFn ?? defaultEvaluate, // fallback
    };
    this.logger = logger ?? defaultLogger;
    this.simulator = new GigaverseSimulator(this.logger);

    this.logger.info(
      `[GreedyAlgorithm] Initialized => atkWeight=${this.config.atkWeight}, defWeight=${this.config.defWeight}`
    );
  }

  public pickAction(runState: GigaverseRunState): GigaverseAction {
    // If we are in loot phase => pick best loot
    if (runState.lootPhase && runState.lootOptions.length > 0) {
      const lootAction = this.pickLoot(runState);
      this.logger.debug(`[GreedyAlgorithm] pickLoot => ${lootAction.type}`);
      return lootAction;
    }

    // Otherwise => pick the best R/P/S move
    const moveAction = this.pickMove(runState);
    this.logger.debug(`[GreedyAlgorithm] pickMove => ${moveAction.type}`);
    return moveAction;
  }

  private pickMove(state: GigaverseRunState): GigaverseAction {
    const p = state.player;
    const possible: { action: GigaverseAction; score: number }[] = [];

    if (p.rock.currentCharges > 0) {
      possible.push({
        action: { type: GigaverseActionType.MOVE_ROCK },
        score: this.scoreMove(p, GigaverseMove.ROCK),
      });
    }
    if (p.paper.currentCharges > 0) {
      possible.push({
        action: { type: GigaverseActionType.MOVE_PAPER },
        score: this.scoreMove(p, GigaverseMove.PAPER),
      });
    }
    if (p.scissor.currentCharges > 0) {
      possible.push({
        action: { type: GigaverseActionType.MOVE_SCISSOR },
        score: this.scoreMove(p, GigaverseMove.SCISSOR),
      });
    }

    // If no moves have charges => fallback
    if (possible.length === 0) {
      return { type: GigaverseActionType.MOVE_ROCK };
    }

    // pick the highest-scoring move
    possible.sort((a, b) => b.score - a.score);
    return possible[0].action;
  }

  private scoreMove(fighter: GigaverseFighter, move: GigaverseMove): number {
    // Weighted sum of ATK & DEF
    switch (move) {
      case GigaverseMove.ROCK:
        return (
          fighter.rock.currentATK * this.config.atkWeight +
          fighter.rock.currentDEF * this.config.defWeight
        );
      case GigaverseMove.PAPER:
        return (
          fighter.paper.currentATK * this.config.atkWeight +
          fighter.paper.currentDEF * this.config.defWeight
        );
      case GigaverseMove.SCISSOR:
        return (
          fighter.scissor.currentATK * this.config.atkWeight +
          fighter.scissor.currentDEF * this.config.defWeight
        );
    }
  }

  private pickLoot(state: GigaverseRunState): GigaverseAction {
    // Evaluate each loot's immediate impact. For a "greedy" approach, we just do a quick greedy.
    // You could even simulate picking that loot, run defaultEvaluate, and pick the highest.

    let bestIdx = 0;
    let bestEval = -Infinity;

    for (let i = 0; i < state.lootOptions.length; i++) {
      // simulate picking loot i
      const cloned = cloneDeep(state);
      this.simulator.applyLootOption(cloned, cloned.lootOptions[i]);
      cloned.lootOptions = [];
      cloned.lootPhase = false;

      const val = this.config.evaluateFn(cloned);
      if (val > bestEval) {
        bestEval = val;
        bestIdx = i;
      }
    }

    switch (bestIdx) {
      case 0:
        return { type: GigaverseActionType.PICK_LOOT_ONE };
      case 1:
        return { type: GigaverseActionType.PICK_LOOT_TWO };
      case 2:
        return { type: GigaverseActionType.PICK_LOOT_THREE };
      case 3:
        return { type: GigaverseActionType.PICK_LOOT_FOUR };
    }
    // fallback
    return { type: GigaverseActionType.PICK_LOOT_ONE };
  }
}

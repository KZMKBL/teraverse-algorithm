// path: gigaverse-engine/src/algorithms/minimax/MinimaxAlgorithm.ts
/**
 * A minimax with alpha-beta pruning approach, with defaultEvaluate fallback.
 */

import {
  IGigaverseAlgorithm,
  GigaverseAction,
  GigaverseActionType,
} from "../IGigaverseAlgorithm";
import { GigaverseRunState } from "../../simulator/GigaverseTypes";
import { GigaverseSimulator } from "../../simulator/GigaverseSimulator";
import { CustomLogger } from "../../types/CustomLogger";
import { defaultLogger } from "../../utils/defaultLogger";
import cloneDeep from "lodash/cloneDeep";
import { defaultEvaluate } from "../defaultEvaluate";

export interface MinimaxConfig {
  maxDepth: number;
  evaluateFn?: (state: GigaverseRunState) => number;
}

export class MinimaxAlgorithm implements IGigaverseAlgorithm {
  private config: MinimaxConfig;
  private simulator: GigaverseSimulator;
  private logger: CustomLogger;

  constructor(config: MinimaxConfig, logger?: CustomLogger) {
    this.config = {
      ...config,
      evaluateFn: config.evaluateFn ?? defaultEvaluate,
    };
    this.logger = logger ?? defaultLogger;
    this.simulator = new GigaverseSimulator(this.logger);

    this.logger.info(
      `[MinimaxAlgorithm] Initialized => maxDepth=${this.config.maxDepth}`
    );
  }

  public pickAction(state: GigaverseRunState): GigaverseAction {
    const { bestAction, bestValue } = this.alphaBetaRoot(
      state,
      this.config.maxDepth
    );
    if (!bestAction) {
      this.logger.warn(
        "[MinimaxAlgorithm] No best action found => fallback=MOVE_ROCK"
      );
      return { type: GigaverseActionType.MOVE_ROCK };
    }
    this.logger.debug(
      `[MinimaxAlgorithm] Best action => ${bestAction.type}, value=${bestValue.toFixed(2)}`
    );
    return bestAction;
  }

  private alphaBetaRoot(state: GigaverseRunState, depth: number) {
    let bestValue = -Infinity;
    let bestAction: GigaverseAction | null = null;
    const actions = this.getPossibleActions(state);

    for (const action of actions) {
      const newState = this.applyActionClone(state, action);
      const val = this.alphaBeta(
        newState,
        depth - 1,
        -Infinity,
        Infinity,
        false
      );
      if (val > bestValue) {
        bestValue = val;
        bestAction = action;
      }
    }

    return { bestValue, bestAction };
  }

  private alphaBeta(
    state: GigaverseRunState,
    depth: number,
    alpha: number,
    beta: number,
    maximizingPlayer: boolean
  ): number {
    if (depth === 0 || this.isTerminal(state)) {
      return this.config.evaluateFn!(state);
    }

    const actions = this.getPossibleActions(state);

    if (maximizingPlayer) {
      let value = -Infinity;
      for (const action of actions) {
        const newState = this.applyActionClone(state, action);
        value = Math.max(
          value,
          this.alphaBeta(newState, depth - 1, alpha, beta, false)
        );
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    } else {
      // Minimizing => environment
      let value = Infinity;
      for (const action of actions) {
        const newState = this.applyActionClone(state, action);
        value = Math.min(
          value,
          this.alphaBeta(newState, depth - 1, alpha, beta, true)
        );
        beta = Math.min(beta, value);
        if (beta <= alpha) break;
      }
      return value;
    }
  }

  private isTerminal(state: GigaverseRunState): boolean {
    return (
      state.player.health.current <= 0 ||
      state.currentEnemyIndex >= state.enemies.length
    );
  }

  private getPossibleActions(state: GigaverseRunState): GigaverseAction[] {
    if (state.lootPhase && state.lootOptions.length > 0) {
      const acts: GigaverseAction[] = [];
      for (let i = 0; i < state.lootOptions.length; i++) {
        switch (i) {
          case 0:
            acts.push({ type: GigaverseActionType.PICK_LOOT_ONE });
            break;
          case 1:
            acts.push({ type: GigaverseActionType.PICK_LOOT_TWO });
            break;
          case 2:
            acts.push({ type: GigaverseActionType.PICK_LOOT_THREE });
            break;
          case 3:
            acts.push({ type: GigaverseActionType.PICK_LOOT_FOUR });
            break;
        }
      }
      return acts;
    }

    const p = state.player;
    const result: GigaverseAction[] = [];
    if (p.rock.currentCharges > 0)
      result.push({ type: GigaverseActionType.MOVE_ROCK });
    if (p.paper.currentCharges > 0)
      result.push({ type: GigaverseActionType.MOVE_PAPER });
    if (p.scissor.currentCharges > 0)
      result.push({ type: GigaverseActionType.MOVE_SCISSOR });
    if (result.length === 0)
      result.push({ type: GigaverseActionType.MOVE_ROCK });
    return result;
  }

  private applyActionClone(
    oldState: GigaverseRunState,
    action: GigaverseAction
  ): GigaverseRunState {
    const newSt = cloneDeep(oldState);
    this.simulator.applyAction(newSt, action);
    // If the current enemy died => proceed
    const enemy = newSt.enemies[newSt.currentEnemyIndex];
    if (enemy && enemy.health.current <= 0) {
      newSt.currentEnemyIndex++;
    }
    return newSt;
  }
}

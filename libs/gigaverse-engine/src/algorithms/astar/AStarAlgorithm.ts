// path: gigaverse-engine/src/algorithms/aStar/AStarAlgorithm.ts
/**
 * A short-horizon A* search with an defaultEvaluate fallback.
 * We treat "score" as something to maximize => cost = -score.
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

export interface AStarConfig {
  maxIterations: number;
  heuristicFn?: (state: GigaverseRunState) => number;
  evaluateFn?: (state: GigaverseRunState) => number; // optional override for final scoring
}

export class AStarAlgorithm implements IGigaverseAlgorithm {
  private config: AStarConfig;
  private simulator: GigaverseSimulator;
  private logger: CustomLogger;

  constructor(config: AStarConfig, logger?: CustomLogger) {
    this.config = {
      ...config,
      evaluateFn: config.evaluateFn ?? defaultEvaluate,
    };
    this.logger = logger ?? defaultLogger;
    this.simulator = new GigaverseSimulator(this.logger);

    this.logger.info(
      `[AStarAlgorithm] Initialized => maxIterations=${config.maxIterations}`
    );
  }

  public pickAction(state: GigaverseRunState): GigaverseAction {
    const actions = this.getPossibleActions(state);
    if (actions.length === 1) {
      this.logger.debug(
        "[AStarAlgorithm] Only one possible action => returning it"
      );
      return actions[0];
    }

    let bestAction = actions[0];
    let bestScore = -Infinity;

    // We do a mini search: for each possible action, we do a short A* expansion
    for (const act of actions) {
      const newSt = cloneDeep(state);
      this.simulator.applyAction(newSt, act);
      // if enemy died => next
      const enemy = newSt.enemies[newSt.currentEnemyIndex];
      if (enemy && enemy.health.current <= 0) {
        newSt.currentEnemyIndex++;
      }

      const sc = this.aStarSearch(newSt);
      if (sc > bestScore) {
        bestScore = sc;
        bestAction = act;
      }
    }

    this.logger.debug(
      `[AStarAlgorithm] bestAction => ${bestAction.type}, bestScore=${bestScore.toFixed(2)}`
    );
    return bestAction;
  }

  private aStarSearch(start: GigaverseRunState): number {
    interface Node {
      state: GigaverseRunState;
      gCost: number; // cost so far
      hCost: number; // greedy
      fCost: number; // sum
    }

    const openList: Node[] = [];
    const closedSet = new Set<string>();

    // interpret cost = -score
    const startScore = this.config.evaluateFn!(start);
    openList.push({
      state: start,
      gCost: -startScore,
      hCost: -startScore,
      fCost: -startScore * 2,
    });

    let iterations = 0;
    let bestSoFar = startScore;

    while (openList.length > 0 && iterations < this.config.maxIterations) {
      iterations++;
      openList.sort((a, b) => a.fCost - b.fCost);
      const current = openList.shift()!;
      const key = this.buildKey(current.state);

      if (this.isTerminal(current.state)) {
        const sc = this.config.evaluateFn!(current.state);
        if (sc > bestSoFar) {
          bestSoFar = sc;
        }
        continue;
      }

      closedSet.add(key);

      const actions = this.getPossibleActions(current.state);
      for (const act of actions) {
        const newSt = cloneDeep(current.state);
        this.simulator.applyAction(newSt, act);
        const enemy = newSt.enemies[newSt.currentEnemyIndex];
        if (enemy && enemy.health.current <= 0) {
          newSt.currentEnemyIndex++;
        }

        const newScore = this.config.evaluateFn!(newSt);
        const neighborKey = this.buildKey(newSt);
        if (closedSet.has(neighborKey)) continue;

        const gCost = current.gCost + -newScore;
        const hCost = -this.heuristicFn(newSt);
        const fCost = gCost + hCost;

        openList.push({
          state: newSt,
          gCost,
          hCost,
          fCost,
        });

        if (newScore > bestSoFar) {
          bestSoFar = newScore;
        }
      }
    }

    return bestSoFar;
  }

  private isTerminal(state: GigaverseRunState): boolean {
    return (
      state.player.health.current <= 0 ||
      state.currentEnemyIndex >= state.enemies.length
    );
  }

  private getPossibleActions(state: GigaverseRunState): GigaverseAction[] {
    if (state.lootPhase && state.lootOptions.length > 0) {
      const result: GigaverseAction[] = [];
      for (let i = 0; i < state.lootOptions.length; i++) {
        switch (i) {
          case 0:
            result.push({ type: GigaverseActionType.PICK_LOOT_ONE });
            break;
          case 1:
            result.push({ type: GigaverseActionType.PICK_LOOT_TWO });
            break;
          case 2:
            result.push({ type: GigaverseActionType.PICK_LOOT_THREE });
            break;
          case 3:
            result.push({ type: GigaverseActionType.PICK_LOOT_FOUR });
            break;
        }
      }
      return result;
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

  private buildKey(state: GigaverseRunState): string {
    // minimal key, ignoring some fields
    return JSON.stringify([
      state.currentEnemyIndex,
      state.player.health.current,
      state.player.armor.current,
      state.player.rock.currentCharges,
      state.player.paper.currentCharges,
      state.player.scissor.currentCharges,
      state.lootPhase,
      state.lootOptions.map((l) => l.boonTypeString),
    ]);
  }

  private heuristicFn(state: GigaverseRunState): number {
    if (this.config.heuristicFn) {
      return this.config.heuristicFn(state);
    }
    // Default => 0
    return 0;
  }
}

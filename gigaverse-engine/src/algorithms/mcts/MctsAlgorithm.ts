// path: gigaverse-engine/src/algorithms/mcts/MctsAlgorithm.ts
/**
 * A Monte Carlo Tree Search algorithm implementing IGigaverseAlgorithm,
 * returning a GigaverseAction each time (move or loot).
 */

import {
  IGigaverseAlgorithm,
  GigaverseAction,
  GigaverseActionType,
} from "../IGigaverseAlgorithm";
import {
  GigaverseSimulator,
  GigaverseMove,
} from "../../simulator/GigaverseSimulator";
import { GigaverseRunState } from "../../simulator/GigaverseTypes";
import { CustomLogger } from "../../types/CustomLogger";
import { defaultLogger } from "../../utils/defaultLogger";
import cloneDeep from "lodash/cloneDeep";
import { defaultEvaluate } from "../defaultEvaluate";

interface MctsNode {
  parent: MctsNode | null;
  children: MctsNode[];
  actionFromParent: GigaverseAction | null;
  state: GigaverseRunState;
  visits: number;
  totalValue: number;
}

export interface MctsConfig {
  simulationsCount: number;
  maxDepth?: number;
  explorationConstant?: number;
  evaluateFn?: (finalState: GigaverseRunState) => number;
}

export class MctsAlgorithm implements IGigaverseAlgorithm {
  private config: MctsConfig;
  private logger: CustomLogger;
  private simulator: GigaverseSimulator;
  private defaultExplorationConstant = 1.414;

  constructor(config: MctsConfig, logger?: CustomLogger) {
    this.config = config;
    this.logger = logger ?? defaultLogger;
    this.simulator = new GigaverseSimulator(this.logger);

    this.logger.info(
      `[MctsAlgorithm] Initialized => sims=${config.simulationsCount}, maxDepth=${config.maxDepth}`
    );
  }

  /**
   * From IGigaverseAlgorithm => pickAction(runState).
   * This runs MCTS to find the best move/loot pick.
   */
  public pickAction(runState: GigaverseRunState): GigaverseAction {
    const rootNode: MctsNode = {
      parent: null,
      children: [],
      actionFromParent: null,
      state: cloneDeep(runState),
      visits: 0,
      totalValue: 0,
    };

    for (let i = 0; i < this.config.simulationsCount; i++) {
      const leaf = this.selectNode(rootNode);
      this.expandNode(leaf);

      let nodeToRollout = leaf;
      if (leaf.children.length > 0) {
        nodeToRollout =
          leaf.children[Math.floor(Math.random() * leaf.children.length)];
      }

      const val = this.rollout(nodeToRollout, this.config.maxDepth ?? 2);
      this.backpropagate(nodeToRollout, val);
    }

    // pick best child
    let bestChild: MctsNode | null = null;
    let bestAvg = -Infinity;
    for (const child of rootNode.children) {
      if (child.visits > 0) {
        const avg = child.totalValue / child.visits;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestChild = child;
        }
      }
    }

    if (!bestChild || !bestChild.actionFromParent) {
      this.logger.warn(
        "[MctsAlgorithm] No best child => fallback => MOVE_ROCK"
      );
      return { type: GigaverseActionType.MOVE_ROCK };
    }

    this.logger.info(
      `[MctsAlgorithm] Best action => ${bestChild.actionFromParent.type}, avg=${bestAvg.toFixed(2)}`
    );
    return bestChild.actionFromParent;
  }

  // -------------------------------------------
  // MCTS Steps
  // -------------------------------------------

  private selectNode(node: MctsNode): MctsNode {
    let current = node;
    while (current.children.length > 0) {
      let bestUcb = -Infinity;
      let selected: MctsNode | null = null;

      for (const child of current.children) {
        const val = this.ucbValue(child, current.visits);
        if (val > bestUcb) {
          bestUcb = val;
          selected = child;
        }
      }
      if (!selected) break;
      current = selected;
    }
    return current;
  }

  private expandNode(node: MctsNode): void {
    if (node.children.length > 0) return;

    const st = node.state;
    // if terminal => skip
    if (
      st.player.health.current <= 0 ||
      st.currentEnemyIndex >= st.enemies.length
    ) {
      return;
    }

    const actions = this.getPossibleActions(st);
    for (const act of actions) {
      const childState = this.applyAction(st, act);
      const childNode: MctsNode = {
        parent: node,
        children: [],
        actionFromParent: act,
        state: childState,
        visits: 0,
        totalValue: 0,
      };
      node.children.push(childNode);
    }
  }

  private rollout(node: MctsNode, maxDepth: number): number {
    const simState = cloneDeep(node.state);
    let depth = 0;

    while (
      depth < maxDepth &&
      simState.player.health.current > 0 &&
      simState.currentEnemyIndex < simState.enemies.length
    ) {
      const actions = this.getPossibleActions(simState);
      if (actions.length === 0) break;

      const action = actions[Math.floor(Math.random() * actions.length)];
      this.applyAction(simState, action);
      depth++;
    }

    if (this.config.evaluateFn) {
      return this.config.evaluateFn(simState);
    } else {
      return defaultEvaluate(simState);
    }
  }

  private backpropagate(node: MctsNode, value: number): void {
    let current: MctsNode | null = node;
    while (current) {
      current.visits++;
      current.totalValue += value;
      current = current.parent;
    }
  }

  private ucbValue(child: MctsNode, parentVisits: number): number {
    if (child.visits === 0) return Infinity;
    const avg = child.totalValue / child.visits;
    const c =
      this.config.explorationConstant ?? this.defaultExplorationConstant;
    return avg + c * Math.sqrt(Math.log(parentVisits) / child.visits);
  }

  // -------------------------------------------
  // Action Space
  // -------------------------------------------

  private getPossibleActions(state: GigaverseRunState): GigaverseAction[] {
    const acts: GigaverseAction[] = [];

    // if lootPhase => pick from 1..4
    if (state.lootPhase && state.lootOptions.length > 0) {
      for (let i = 0; i < state.lootOptions.length; i++) {
        if (i === 0) acts.push({ type: GigaverseActionType.PICK_LOOT_ONE });
        if (i === 1) acts.push({ type: GigaverseActionType.PICK_LOOT_TWO });
        if (i === 2) acts.push({ type: GigaverseActionType.PICK_LOOT_THREE });
        if (i === 3) acts.push({ type: GigaverseActionType.PICK_LOOT_FOUR });
      }
      return acts;
    }

    // otherwise => RPS
    const p = state.player;
    if (p.rock.currentCharges > 0)
      acts.push({ type: GigaverseActionType.MOVE_ROCK });
    if (p.paper.currentCharges > 0)
      acts.push({ type: GigaverseActionType.MOVE_PAPER });
    if (p.scissor.currentCharges > 0)
      acts.push({ type: GigaverseActionType.MOVE_SCISSOR });

    if (acts.length === 0) {
      acts.push({ type: GigaverseActionType.MOVE_ROCK });
    }
    return acts;
  }

  private applyAction(
    oldState: GigaverseRunState,
    action: GigaverseAction
  ): GigaverseRunState {
    const newSt = cloneDeep(oldState);

    switch (action.type) {
      case GigaverseActionType.MOVE_ROCK:
        this.simulator.simulateOneRound(newSt, GigaverseMove.ROCK);
        break;
      case GigaverseActionType.MOVE_PAPER:
        this.simulator.simulateOneRound(newSt, GigaverseMove.PAPER);
        break;
      case GigaverseActionType.MOVE_SCISSOR:
        this.simulator.simulateOneRound(newSt, GigaverseMove.SCISSOR);
        break;

      case GigaverseActionType.PICK_LOOT_ONE: {
        const chosenLoot = newSt.lootOptions[0];
        this.simulator.applyLootOption(newSt, chosenLoot);
        newSt.lootOptions = [];
        newSt.lootPhase = false;
        break;
      }
      case GigaverseActionType.PICK_LOOT_TWO: {
        const chosenLoot = newSt.lootOptions[1];
        this.simulator.applyLootOption(newSt, chosenLoot);
        newSt.lootOptions = [];
        newSt.lootPhase = false;
        break;
      }
      case GigaverseActionType.PICK_LOOT_THREE: {
        const chosenLoot = newSt.lootOptions[2];
        this.simulator.applyLootOption(newSt, chosenLoot);
        newSt.lootOptions = [];
        newSt.lootPhase = false;
        break;
      }
      case GigaverseActionType.PICK_LOOT_FOUR: {
        const chosenLoot = newSt.lootOptions[3];
        this.simulator.applyLootOption(newSt, chosenLoot);
        newSt.lootOptions = [];
        newSt.lootPhase = false;
        break;
      }
    }

    return newSt;
  }
}

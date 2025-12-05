"use strict";
// path: gigaverse-engine/src/algorithms/mcts/MctsAlgorithm.ts
/**
 * A Monte Carlo Tree Search algorithm implementing IGigaverseAlgorithm,
 * returning a GigaverseAction each time (move or loot).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MctsAlgorithm = void 0;
const IGigaverseAlgorithm_1 = require("../IGigaverseAlgorithm");
const GigaverseSimulator_1 = require("../../simulator/GigaverseSimulator");
const defaultLogger_1 = require("../../utils/defaultLogger");
const cloneDeep_1 = __importDefault(require("lodash/cloneDeep"));
const defaultEvaluate_1 = require("../defaultEvaluate");
class MctsAlgorithm {
    constructor(config, logger) {
        this.defaultExplorationConstant = 1.414;
        this.config = config;
        this.logger = logger ?? defaultLogger_1.defaultLogger;
        this.simulator = new GigaverseSimulator_1.GigaverseSimulator(this.logger);
        this.logger.info(`[MctsAlgorithm] Initialized => sims=${config.simulationsCount}, maxDepth=${config.maxDepth}`);
    }
    /**
     * From IGigaverseAlgorithm => pickAction(runState).
     * This runs MCTS to find the best move/loot pick.
     */
    pickAction(runState) {
        const rootNode = {
            parent: null,
            children: [],
            actionFromParent: null,
            state: (0, cloneDeep_1.default)(runState),
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
        let bestChild = null;
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
            this.logger.warn("[MctsAlgorithm] No best child => fallback => MOVE_ROCK");
            return { type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK };
        }
        this.logger.info(`[MctsAlgorithm] Best action => ${bestChild.actionFromParent.type}, avg=${bestAvg.toFixed(2)}`);
        return bestChild.actionFromParent;
    }
    // -------------------------------------------
    // MCTS Steps
    // -------------------------------------------
    selectNode(node) {
        let current = node;
        while (current.children.length > 0) {
            let bestUcb = -Infinity;
            let selected = null;
            for (const child of current.children) {
                const val = this.ucbValue(child, current.visits);
                if (val > bestUcb) {
                    bestUcb = val;
                    selected = child;
                }
            }
            if (!selected)
                break;
            current = selected;
        }
        return current;
    }
    expandNode(node) {
        if (node.children.length > 0)
            return;
        const st = node.state;
        // if terminal => skip
        if (st.player.health.current <= 0 ||
            st.currentEnemyIndex >= st.enemies.length) {
            return;
        }
        const actions = this.getPossibleActions(st);
        for (const act of actions) {
            const childState = this.applyAction(st, act);
            const childNode = {
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
    rollout(node, maxDepth) {
        const simState = (0, cloneDeep_1.default)(node.state);
        let depth = 0;
        while (depth < maxDepth &&
            simState.player.health.current > 0 &&
            simState.currentEnemyIndex < simState.enemies.length) {
            const actions = this.getPossibleActions(simState);
            if (actions.length === 0)
                break;
            const action = actions[Math.floor(Math.random() * actions.length)];
            this.applyAction(simState, action);
            depth++;
        }
        if (this.config.evaluateFn) {
            return this.config.evaluateFn(simState);
        }
        else {
            return (0, defaultEvaluate_1.defaultEvaluate)(simState);
        }
    }
    backpropagate(node, value) {
        let current = node;
        while (current) {
            current.visits++;
            current.totalValue += value;
            current = current.parent;
        }
    }
    ucbValue(child, parentVisits) {
        if (child.visits === 0)
            return Infinity;
        const avg = child.totalValue / child.visits;
        const c = this.config.explorationConstant ?? this.defaultExplorationConstant;
        return avg + c * Math.sqrt(Math.log(parentVisits) / child.visits);
    }
    // -------------------------------------------
    // Action Space
    // -------------------------------------------
    getPossibleActions(state) {
        const acts = [];
        // if lootPhase => pick from 1..4
        if (state.lootPhase && state.lootOptions.length > 0) {
            for (let i = 0; i < state.lootOptions.length; i++) {
                if (i === 0)
                    acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_ONE });
                if (i === 1)
                    acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_TWO });
                if (i === 2)
                    acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_THREE });
                if (i === 3)
                    acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_FOUR });
            }
            return acts;
        }
        // otherwise => RPS
        const p = state.player;
        if (p.rock.currentCharges > 0)
            acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK });
        if (p.paper.currentCharges > 0)
            acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_PAPER });
        if (p.scissor.currentCharges > 0)
            acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_SCISSOR });
        if (acts.length === 0) {
            acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK });
        }
        return acts;
    }
    applyAction(oldState, action) {
        const newSt = (0, cloneDeep_1.default)(oldState);
        switch (action.type) {
            case IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK:
                this.simulator.simulateOneRound(newSt, GigaverseSimulator_1.GigaverseMove.ROCK);
                break;
            case IGigaverseAlgorithm_1.GigaverseActionType.MOVE_PAPER:
                this.simulator.simulateOneRound(newSt, GigaverseSimulator_1.GigaverseMove.PAPER);
                break;
            case IGigaverseAlgorithm_1.GigaverseActionType.MOVE_SCISSOR:
                this.simulator.simulateOneRound(newSt, GigaverseSimulator_1.GigaverseMove.SCISSOR);
                break;
            case IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_ONE: {
                const chosenLoot = newSt.lootOptions[0];
                this.simulator.applyLootOption(newSt, chosenLoot);
                newSt.lootOptions = [];
                newSt.lootPhase = false;
                break;
            }
            case IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_TWO: {
                const chosenLoot = newSt.lootOptions[1];
                this.simulator.applyLootOption(newSt, chosenLoot);
                newSt.lootOptions = [];
                newSt.lootPhase = false;
                break;
            }
            case IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_THREE: {
                const chosenLoot = newSt.lootOptions[2];
                this.simulator.applyLootOption(newSt, chosenLoot);
                newSt.lootOptions = [];
                newSt.lootPhase = false;
                break;
            }
            case IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_FOUR: {
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
exports.MctsAlgorithm = MctsAlgorithm;

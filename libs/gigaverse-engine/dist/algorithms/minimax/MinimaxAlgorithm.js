"use strict";
// path: gigaverse-engine/src/algorithms/minimax/MinimaxAlgorithm.ts
/**
 * A minimax with alpha-beta pruning approach, with defaultEvaluate fallback.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinimaxAlgorithm = void 0;
const IGigaverseAlgorithm_1 = require("../IGigaverseAlgorithm");
const GigaverseSimulator_1 = require("../../simulator/GigaverseSimulator");
const defaultLogger_1 = require("../../utils/defaultLogger");
const cloneDeep_1 = __importDefault(require("lodash/cloneDeep"));
const defaultEvaluate_1 = require("../defaultEvaluate");
class MinimaxAlgorithm {
    constructor(config, logger) {
        this.config = {
            ...config,
            evaluateFn: config.evaluateFn ?? defaultEvaluate_1.defaultEvaluate,
        };
        this.logger = logger ?? defaultLogger_1.defaultLogger;
        this.simulator = new GigaverseSimulator_1.GigaverseSimulator(this.logger);
        this.logger.info(`[MinimaxAlgorithm] Initialized => maxDepth=${this.config.maxDepth}`);
    }
    pickAction(state) {
        const { bestAction, bestValue } = this.alphaBetaRoot(state, this.config.maxDepth);
        if (!bestAction) {
            this.logger.warn("[MinimaxAlgorithm] No best action found => fallback=MOVE_ROCK");
            return { type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK };
        }
        this.logger.debug(`[MinimaxAlgorithm] Best action => ${bestAction.type}, value=${bestValue.toFixed(2)}`);
        return bestAction;
    }
    alphaBetaRoot(state, depth) {
        let bestValue = -Infinity;
        let bestAction = null;
        const actions = this.getPossibleActions(state);
        for (const action of actions) {
            const newState = this.applyActionClone(state, action);
            const val = this.alphaBeta(newState, depth - 1, -Infinity, Infinity, false);
            if (val > bestValue) {
                bestValue = val;
                bestAction = action;
            }
        }
        return { bestValue, bestAction };
    }
    alphaBeta(state, depth, alpha, beta, maximizingPlayer) {
        if (depth === 0 || this.isTerminal(state)) {
            return this.config.evaluateFn(state);
        }
        const actions = this.getPossibleActions(state);
        if (maximizingPlayer) {
            let value = -Infinity;
            for (const action of actions) {
                const newState = this.applyActionClone(state, action);
                value = Math.max(value, this.alphaBeta(newState, depth - 1, alpha, beta, false));
                alpha = Math.max(alpha, value);
                if (alpha >= beta)
                    break;
            }
            return value;
        }
        else {
            // Minimizing => environment
            let value = Infinity;
            for (const action of actions) {
                const newState = this.applyActionClone(state, action);
                value = Math.min(value, this.alphaBeta(newState, depth - 1, alpha, beta, true));
                beta = Math.min(beta, value);
                if (beta <= alpha)
                    break;
            }
            return value;
        }
    }
    isTerminal(state) {
        return (state.player.health.current <= 0 ||
            state.currentEnemyIndex >= state.enemies.length);
    }
    getPossibleActions(state) {
        if (state.lootPhase && state.lootOptions.length > 0) {
            const acts = [];
            for (let i = 0; i < state.lootOptions.length; i++) {
                switch (i) {
                    case 0:
                        acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_ONE });
                        break;
                    case 1:
                        acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_TWO });
                        break;
                    case 2:
                        acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_THREE });
                        break;
                    case 3:
                        acts.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_FOUR });
                        break;
                }
            }
            return acts;
        }
        const p = state.player;
        const result = [];
        if (p.rock.currentCharges > 0)
            result.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK });
        if (p.paper.currentCharges > 0)
            result.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_PAPER });
        if (p.scissor.currentCharges > 0)
            result.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_SCISSOR });
        if (result.length === 0)
            result.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK });
        return result;
    }
    applyActionClone(oldState, action) {
        const newSt = (0, cloneDeep_1.default)(oldState);
        this.simulator.applyAction(newSt, action);
        // If the current enemy died => proceed
        const enemy = newSt.enemies[newSt.currentEnemyIndex];
        if (enemy && enemy.health.current <= 0) {
            newSt.currentEnemyIndex++;
        }
        return newSt;
    }
}
exports.MinimaxAlgorithm = MinimaxAlgorithm;

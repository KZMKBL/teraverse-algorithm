"use strict";
// path: gigaverse-engine/src/algorithms/dp/DPAlgorithm.ts
/**
 * A DP approach for picking the best immediate action, exploring up to maxHorizon steps.
 * Uses an defaultEvaluate fallback if no custom evaluateFn is provided.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DPAlgorithm = void 0;
const IGigaverseAlgorithm_1 = require("../IGigaverseAlgorithm");
const GigaverseSimulator_1 = require("../../simulator/GigaverseSimulator");
const defaultLogger_1 = require("../../utils/defaultLogger");
const cloneDeep_1 = __importDefault(require("lodash/cloneDeep"));
const defaultEvaluate_1 = require("../defaultEvaluate");
class DPAlgorithm {
    constructor(config, logger) {
        this.config = {
            maxHorizon: config.maxHorizon,
            evaluateFn: config.evaluateFn ?? defaultEvaluate_1.defaultEvaluate,
        };
        this.logger = logger ?? defaultLogger_1.defaultLogger;
        this.simulator = new GigaverseSimulator_1.GigaverseSimulator(this.logger);
        this.memo = new Map();
        this.logger.info(`[DPAlgorithm] Initialized => maxHorizon=${this.config.maxHorizon}`);
    }
    pickAction(state) {
        const result = this.dpSearch(state, this.config.maxHorizon);
        if (!result.bestAction) {
            this.logger.warn("[DPAlgorithm] No best action => fallback=MOVE_ROCK");
            return { type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK };
        }
        this.logger.debug(`[DPAlgorithm] bestAction => ${result.bestAction.type}, value=${result.bestValue.toFixed(2)}`);
        return result.bestAction;
    }
    dpSearch(state, depth) {
        // If game ended or horizon=0 => evaluate
        if (depth <= 0 ||
            state.player.health.current <= 0 ||
            state.currentEnemyIndex >= state.enemies.length) {
            return { bestValue: this.config.evaluateFn(state), bestAction: null };
        }
        const key = this.buildStateKey(state, depth);
        if (this.memo.has(key)) {
            return this.memo.get(key);
        }
        const actions = this.getPossibleActions(state);
        if (actions.length === 0) {
            // fallback
            return { bestValue: this.config.evaluateFn(state), bestAction: null };
        }
        let bestVal = -Infinity;
        let bestAct = null;
        for (const act of actions) {
            const newSt = (0, cloneDeep_1.default)(state);
            this.simulator.applyAction(newSt, act);
            // if the enemy died => next enemy
            const enemy = newSt.enemies[newSt.currentEnemyIndex];
            if (enemy && enemy.health.current <= 0) {
                newSt.currentEnemyIndex++;
            }
            const sub = this.dpSearch(newSt, depth - 1);
            if (sub.bestValue > bestVal) {
                bestVal = sub.bestValue;
                bestAct = act;
            }
        }
        const res = { bestValue: bestVal, bestAction: bestAct };
        this.memo.set(key, res);
        return res;
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
    buildStateKey(state, depth) {
        // Key for memoization: capture relevant data
        const p = state.player;
        return JSON.stringify([
            depth,
            state.currentEnemyIndex,
            p.health.current,
            p.health.max,
            p.armor.current,
            p.armor.max,
            p.rock.currentATK,
            p.rock.currentDEF,
            p.rock.currentCharges,
            p.paper.currentATK,
            p.paper.currentDEF,
            p.paper.currentCharges,
            p.scissor.currentATK,
            p.scissor.currentDEF,
            p.scissor.currentCharges,
            state.lootPhase,
            state.lootOptions.map((l) => l.boonTypeString + l.selectedVal1 + l.selectedVal2),
        ]);
    }
}
exports.DPAlgorithm = DPAlgorithm;

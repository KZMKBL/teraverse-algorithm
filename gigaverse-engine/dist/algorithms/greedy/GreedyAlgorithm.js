"use strict";
// path: gigaverse-engine/src/algorithms/greedy/GreedyAlgorithm.ts
/**
 * A greedy (greedy) algorithm with more advanced loot & move scoring,
 * plus an defaultEvaluate fallback for additional synergy logic.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreedyAlgorithm = void 0;
const IGigaverseAlgorithm_1 = require("../IGigaverseAlgorithm");
const GigaverseSimulator_1 = require("../../simulator/GigaverseSimulator");
const cloneDeep_1 = __importDefault(require("lodash/cloneDeep"));
const defaultLogger_1 = require("../../utils/defaultLogger");
const defaultEvaluate_1 = require("../defaultEvaluate");
class GreedyAlgorithm {
    constructor(config, logger) {
        this.config = {
            atkWeight: config?.atkWeight ?? 2.0,
            defWeight: config?.defWeight ?? 1.0,
            evaluateFn: config?.evaluateFn ?? defaultEvaluate_1.defaultEvaluate, // fallback
        };
        this.logger = logger ?? defaultLogger_1.defaultLogger;
        this.simulator = new GigaverseSimulator_1.GigaverseSimulator(this.logger);
        this.logger.info(`[GreedyAlgorithm] Initialized => atkWeight=${this.config.atkWeight}, defWeight=${this.config.defWeight}`);
    }
    pickAction(runState) {
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
    pickMove(state) {
        const p = state.player;
        const possible = [];
        if (p.rock.currentCharges > 0) {
            possible.push({
                action: { type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK },
                score: this.scoreMove(p, GigaverseSimulator_1.GigaverseMove.ROCK),
            });
        }
        if (p.paper.currentCharges > 0) {
            possible.push({
                action: { type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_PAPER },
                score: this.scoreMove(p, GigaverseSimulator_1.GigaverseMove.PAPER),
            });
        }
        if (p.scissor.currentCharges > 0) {
            possible.push({
                action: { type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_SCISSOR },
                score: this.scoreMove(p, GigaverseSimulator_1.GigaverseMove.SCISSOR),
            });
        }
        // If no moves have charges => fallback
        if (possible.length === 0) {
            return { type: IGigaverseAlgorithm_1.GigaverseActionType.MOVE_ROCK };
        }
        // pick the highest-scoring move
        possible.sort((a, b) => b.score - a.score);
        return possible[0].action;
    }
    scoreMove(fighter, move) {
        // Weighted sum of ATK & DEF
        switch (move) {
            case GigaverseSimulator_1.GigaverseMove.ROCK:
                return (fighter.rock.currentATK * this.config.atkWeight +
                    fighter.rock.currentDEF * this.config.defWeight);
            case GigaverseSimulator_1.GigaverseMove.PAPER:
                return (fighter.paper.currentATK * this.config.atkWeight +
                    fighter.paper.currentDEF * this.config.defWeight);
            case GigaverseSimulator_1.GigaverseMove.SCISSOR:
                return (fighter.scissor.currentATK * this.config.atkWeight +
                    fighter.scissor.currentDEF * this.config.defWeight);
        }
    }
    pickLoot(state) {
        // Evaluate each loot's immediate impact. For a "greedy" approach, we just do a quick greedy.
        // You could even simulate picking that loot, run defaultEvaluate, and pick the highest.
        let bestIdx = 0;
        let bestEval = -Infinity;
        for (let i = 0; i < state.lootOptions.length; i++) {
            // simulate picking loot i
            const cloned = (0, cloneDeep_1.default)(state);
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
                return { type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_ONE };
            case 1:
                return { type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_TWO };
            case 2:
                return { type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_THREE };
            case 3:
                return { type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_FOUR };
        }
        // fallback
        return { type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_ONE };
    }
}
exports.GreedyAlgorithm = GreedyAlgorithm;

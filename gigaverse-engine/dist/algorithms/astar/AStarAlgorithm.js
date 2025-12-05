"use strict";
// path: gigaverse-engine/src/algorithms/aStar/AStarAlgorithm.ts
/**
 * A short-horizon A* search with an defaultEvaluate fallback.
 * We treat "score" as something to maximize => cost = -score.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AStarAlgorithm = void 0;
const IGigaverseAlgorithm_1 = require("../IGigaverseAlgorithm");
const GigaverseSimulator_1 = require("../../simulator/GigaverseSimulator");
const defaultLogger_1 = require("../../utils/defaultLogger");
const cloneDeep_1 = __importDefault(require("lodash/cloneDeep"));
const defaultEvaluate_1 = require("../defaultEvaluate");
class AStarAlgorithm {
    constructor(config, logger) {
        this.config = {
            ...config,
            evaluateFn: config.evaluateFn ?? defaultEvaluate_1.defaultEvaluate,
        };
        this.logger = logger ?? defaultLogger_1.defaultLogger;
        this.simulator = new GigaverseSimulator_1.GigaverseSimulator(this.logger);
        this.logger.info(`[AStarAlgorithm] Initialized => maxIterations=${config.maxIterations}`);
    }
    pickAction(state) {
        const actions = this.getPossibleActions(state);
        if (actions.length === 1) {
            this.logger.debug("[AStarAlgorithm] Only one possible action => returning it");
            return actions[0];
        }
        let bestAction = actions[0];
        let bestScore = -Infinity;
        // We do a mini search: for each possible action, we do a short A* expansion
        for (const act of actions) {
            const newSt = (0, cloneDeep_1.default)(state);
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
        this.logger.debug(`[AStarAlgorithm] bestAction => ${bestAction.type}, bestScore=${bestScore.toFixed(2)}`);
        return bestAction;
    }
    aStarSearch(start) {
        const openList = [];
        const closedSet = new Set();
        // interpret cost = -score
        const startScore = this.config.evaluateFn(start);
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
            const current = openList.shift();
            const key = this.buildKey(current.state);
            if (this.isTerminal(current.state)) {
                const sc = this.config.evaluateFn(current.state);
                if (sc > bestSoFar) {
                    bestSoFar = sc;
                }
                continue;
            }
            closedSet.add(key);
            const actions = this.getPossibleActions(current.state);
            for (const act of actions) {
                const newSt = (0, cloneDeep_1.default)(current.state);
                this.simulator.applyAction(newSt, act);
                const enemy = newSt.enemies[newSt.currentEnemyIndex];
                if (enemy && enemy.health.current <= 0) {
                    newSt.currentEnemyIndex++;
                }
                const newScore = this.config.evaluateFn(newSt);
                const neighborKey = this.buildKey(newSt);
                if (closedSet.has(neighborKey))
                    continue;
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
    isTerminal(state) {
        return (state.player.health.current <= 0 ||
            state.currentEnemyIndex >= state.enemies.length);
    }
    getPossibleActions(state) {
        if (state.lootPhase && state.lootOptions.length > 0) {
            const result = [];
            for (let i = 0; i < state.lootOptions.length; i++) {
                switch (i) {
                    case 0:
                        result.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_ONE });
                        break;
                    case 1:
                        result.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_TWO });
                        break;
                    case 2:
                        result.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_THREE });
                        break;
                    case 3:
                        result.push({ type: IGigaverseAlgorithm_1.GigaverseActionType.PICK_LOOT_FOUR });
                        break;
                }
            }
            return result;
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
    buildKey(state) {
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
    heuristicFn(state) {
        if (this.config.heuristicFn) {
            return this.config.heuristicFn(state);
        }
        // Default => 0
        return 0;
    }
}
exports.AStarAlgorithm = AStarAlgorithm;

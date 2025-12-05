/**
 * A short-horizon A* search with an defaultEvaluate fallback.
 * We treat "score" as something to maximize => cost = -score.
 */
import { IGigaverseAlgorithm, GigaverseAction } from "../IGigaverseAlgorithm";
import { GigaverseRunState } from "../../simulator/GigaverseTypes";
import { CustomLogger } from "../../types/CustomLogger";
export interface AStarConfig {
    maxIterations: number;
    heuristicFn?: (state: GigaverseRunState) => number;
    evaluateFn?: (state: GigaverseRunState) => number;
}
export declare class AStarAlgorithm implements IGigaverseAlgorithm {
    private config;
    private simulator;
    private logger;
    constructor(config: AStarConfig, logger?: CustomLogger);
    pickAction(state: GigaverseRunState): GigaverseAction;
    private aStarSearch;
    private isTerminal;
    private getPossibleActions;
    private buildKey;
    private heuristicFn;
}
//# sourceMappingURL=AStarAlgorithm.d.ts.map
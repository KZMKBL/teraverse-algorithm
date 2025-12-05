/**
 * A minimax with alpha-beta pruning approach, with defaultEvaluate fallback.
 */
import { IGigaverseAlgorithm, GigaverseAction } from "../IGigaverseAlgorithm";
import { GigaverseRunState } from "../../simulator/GigaverseTypes";
import { CustomLogger } from "../../types/CustomLogger";
export interface MinimaxConfig {
    maxDepth: number;
    evaluateFn?: (state: GigaverseRunState) => number;
}
export declare class MinimaxAlgorithm implements IGigaverseAlgorithm {
    private config;
    private simulator;
    private logger;
    constructor(config: MinimaxConfig, logger?: CustomLogger);
    pickAction(state: GigaverseRunState): GigaverseAction;
    private alphaBetaRoot;
    private alphaBeta;
    private isTerminal;
    private getPossibleActions;
    private applyActionClone;
}
//# sourceMappingURL=MinimaxAlgorithm.d.ts.map
/**
 * A Monte Carlo Tree Search algorithm implementing IGigaverseAlgorithm,
 * returning a GigaverseAction each time (move or loot).
 */
import { IGigaverseAlgorithm, GigaverseAction } from "../IGigaverseAlgorithm";
import { GigaverseRunState } from "../../simulator/GigaverseTypes";
import { CustomLogger } from "../../types/CustomLogger";
export interface MctsConfig {
    simulationsCount: number;
    maxDepth?: number;
    explorationConstant?: number;
    evaluateFn?: (finalState: GigaverseRunState) => number;
}
export declare class MctsAlgorithm implements IGigaverseAlgorithm {
    private config;
    private logger;
    private simulator;
    private defaultExplorationConstant;
    constructor(config: MctsConfig, logger?: CustomLogger);
    /**
     * From IGigaverseAlgorithm => pickAction(runState).
     * This runs MCTS to find the best move/loot pick.
     */
    pickAction(runState: GigaverseRunState): GigaverseAction;
    private selectNode;
    private expandNode;
    private rollout;
    private backpropagate;
    private ucbValue;
    private getPossibleActions;
    private applyAction;
}
//# sourceMappingURL=MctsAlgorithm.d.ts.map
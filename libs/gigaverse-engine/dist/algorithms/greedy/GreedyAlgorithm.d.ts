/**
 * A greedy (greedy) algorithm with more advanced loot & move scoring,
 * plus an defaultEvaluate fallback for additional synergy logic.
 */
import { IGigaverseAlgorithm, GigaverseAction } from "../IGigaverseAlgorithm";
import { GigaverseRunState } from "../../simulator/GigaverseTypes";
import { CustomLogger } from "../../types/CustomLogger";
/** Optional config for weighting ATK/DEF in picking moves, etc. */
export interface GreedyConfig {
    atkWeight?: number;
    defWeight?: number;
    /**
     * If set, use this to evaluate the runState for final checks (rarely used by a purely greedy approach).
     */
    evaluateFn?: (state: GigaverseRunState) => number;
}
export declare class GreedyAlgorithm implements IGigaverseAlgorithm {
    private config;
    private simulator;
    private logger;
    constructor(config?: GreedyConfig, logger?: CustomLogger);
    pickAction(runState: GigaverseRunState): GigaverseAction;
    private pickMove;
    private scoreMove;
    private pickLoot;
}
//# sourceMappingURL=GreedyAlgorithm.d.ts.map
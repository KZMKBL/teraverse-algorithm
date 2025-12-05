/**
 * A DP approach for picking the best immediate action, exploring up to maxHorizon steps.
 * Uses an defaultEvaluate fallback if no custom evaluateFn is provided.
 */
import { IGigaverseAlgorithm, GigaverseAction } from "../IGigaverseAlgorithm";
import { GigaverseRunState } from "../../simulator/GigaverseTypes";
import { CustomLogger } from "../../types/CustomLogger";
export interface DPConfig {
    maxHorizon: number;
    evaluateFn?: (state: GigaverseRunState) => number;
}
export declare class DPAlgorithm implements IGigaverseAlgorithm {
    private config;
    private simulator;
    private memo;
    private logger;
    constructor(config: DPConfig, logger?: CustomLogger);
    pickAction(state: GigaverseRunState): GigaverseAction;
    private dpSearch;
    private getPossibleActions;
    private buildStateKey;
}
//# sourceMappingURL=DPAlgorithm.d.ts.map
/**
 * Interface for any Gigaverse algorithm in this engine.
 * Each algorithm must implement `pickAction(runState) => GigaverseAction`.
 */
import { GigaverseRunState } from "../simulator/GigaverseTypes";
/**
 * We define all possible actions (moves or loot picks).
 * If you later add item usage, add more enum members.
 */
export declare enum GigaverseActionType {
    MOVE_ROCK = "rock",
    MOVE_PAPER = "paper",
    MOVE_SCISSOR = "scissor",
    PICK_LOOT_ONE = "loot_one",
    PICK_LOOT_TWO = "loot_two",
    PICK_LOOT_THREE = "loot_three",
    PICK_LOOT_FOUR = "loot_four"
}
export interface GigaverseAction {
    /** The type of action (move or loot). */
    type: GigaverseActionType;
}
/**
 * Common interface that all algorithms (MCTS, random, etc.) must implement.
 */
export interface IGigaverseAlgorithm {
    pickAction(runState: GigaverseRunState): GigaverseAction;
}
//# sourceMappingURL=IGigaverseAlgorithm.d.ts.map
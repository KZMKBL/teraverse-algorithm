"use strict";
// path: gigaverse-engine/src/algorithms/IGigaverseAlgorithm.ts
/**
 * Interface for any Gigaverse algorithm in this engine.
 * Each algorithm must implement `pickAction(runState) => GigaverseAction`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GigaverseActionType = void 0;
/**
 * We define all possible actions (moves or loot picks).
 * If you later add item usage, add more enum members.
 */
var GigaverseActionType;
(function (GigaverseActionType) {
    GigaverseActionType["MOVE_ROCK"] = "rock";
    GigaverseActionType["MOVE_PAPER"] = "paper";
    GigaverseActionType["MOVE_SCISSOR"] = "scissor";
    GigaverseActionType["PICK_LOOT_ONE"] = "loot_one";
    GigaverseActionType["PICK_LOOT_TWO"] = "loot_two";
    GigaverseActionType["PICK_LOOT_THREE"] = "loot_three";
    GigaverseActionType["PICK_LOOT_FOUR"] = "loot_four";
    // Future: "use_item" etc.
})(GigaverseActionType || (exports.GigaverseActionType = GigaverseActionType = {}));

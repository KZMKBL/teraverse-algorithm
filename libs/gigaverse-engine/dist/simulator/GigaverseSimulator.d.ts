/**
 * A production-ready simulator for the Gigaverse game.
 * Supports single-round logic, full-run simulation across multiple enemies,
 * and applying loot (including "maxArmor" style).
 * All logs/comments in English only, safe, and thoroughly documented.
 */
import { CustomLogger } from "../types/CustomLogger";
import { GigaverseRunState, GigaverseLootOption } from "./GigaverseTypes";
import { GigaverseAction } from "../algorithms/IGigaverseAlgorithm";
/**
 * Possible moves in the Gigaverse.
 * If your logic changes in the future, adjust accordingly.
 */
export declare enum GigaverseMove {
    ROCK = "rock",
    PAPER = "paper",
    SCISSOR = "scissor"
}
export declare class GigaverseSimulator {
    private logger;
    constructor(logger?: CustomLogger);
    /**
     * Simulate a full run, fighting each enemy in sequence,
     * applying loot after each victory (if desired).
     *
     * The user supplies:
     *  - `pickMove`: callback that decides the player's move each round.
     *  - `pickLoot`: optional callback if we want to pick a loot after victory.
     *  - `generateLootOptions`: optional callback if we want to generate random loot automatically.
     *
     * Return a summary: finalState, how many enemies were defeated, and if the player survived.
     */
    simulateFullRun(initialState: GigaverseRunState, pickMove: (s: GigaverseRunState) => GigaverseMove, pickLoot?: (loots: GigaverseLootOption[], s: GigaverseRunState) => GigaverseLootOption, generateLootOptions?: (count: number) => GigaverseLootOption[]): {
        finalState: GigaverseRunState;
        enemiesDefeated: number;
        survived: boolean;
    };
    /**
     * Simulate a single duel vs. the current enemy.
     * Calls `simulateOneRound` repeatedly until the enemy or player dies.
     * Returns an object indicating if the duel was won or lost.
     */
    private simulateOneDuel;
    /**
     * Simulate exactly one round of RPS, with the player's chosen move and
     * an enemy move (picked randomly here).
     */
    simulateOneRound(runState: GigaverseRunState, playerMove: GigaverseMove): GigaverseRunState;
    /**
     * Optionally, a partial-run simulation for an AI (like MCTS) that does short horizon lookahead.
     */
    simulatePartialRun(runState: GigaverseRunState, maxRounds: number): {
        finalState: GigaverseRunState;
    };
    /**
     * Figure out how much damage each side deals, plus how much armor they gain.
     */
    private computeRoundOutcome;
    /**
     * Apply incomingDamage to the defender, reduce armor first, then HP,
     * while the attacker gains some armor.
     */
    private applyDamageAndArmor;
    /**
     * Updates charges for the used move (spam penalty if it was at 1 => -1),
     * and increments the other moves by +1 if they have charges left or are at -1 => 0.
     */
    private updateCharges;
    private getMoveStats;
    /**
     * Picks a random enemy move among the ones with charges > 0.
     */
    private pickRandomEnemyMove;
    /**
     * Picks a random move for the player. This is used for partialRun or fallback.
     */
    private pickRandomPlayerMove;
    /**
     * Applies the chosen loot to the player's stats.
     * E.g. Heal => +HP, AddMaxHealth => increase max HP, AddMaxArmor => increase armor, etc.
     */
    applyLootOption(state: GigaverseRunState, loot: GigaverseLootOption): void;
    applyAction(state: GigaverseRunState, action: GigaverseAction): GigaverseRunState;
    private cloneState;
}
//# sourceMappingURL=GigaverseSimulator.d.ts.map
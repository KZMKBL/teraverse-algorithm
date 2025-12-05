/**
 * Defines the core data types used by the Gigaverse simulator and any offline logic.
 * Production-ready, logs/comments in English only, safe and clean code.
 */
export interface GigaverseMoveState {
    currentATK: number;
    currentDEF: number;
    currentCharges: number;
}
export interface GigaverseHealthState {
    current: number;
    max: number;
}
export interface GigaverseArmorState {
    current: number;
    max: number;
}
/**
 * A minimal fighter shape for both the player and enemies,
 * only storing fields needed by the simulator.
 */
export interface GigaverseFighter {
    rock: GigaverseMoveState;
    paper: GigaverseMoveState;
    scissor: GigaverseMoveState;
    health: GigaverseHealthState;
    armor: GigaverseArmorState;
}
/**
 * Minimal shape for loot. We only keep selectedVal1, selectedVal2, and boonTypeString.
 * Example boonTypeString => "Heal", "AddMaxHealth", "AddMaxArmor", "UpgradeRock", etc.
 */
export interface GigaverseLootOption {
    boonTypeString: string;
    selectedVal1: number;
    selectedVal2: number;
}
/**
 * The main run state for one entire run (multiple enemies).
 *  - `player`: the player's current stats
 *  - `enemies`: array of enemies to fight in order
 *  - `currentEnemyIndex`: which enemy we are fighting
 *  - `lootPhase`: if we are currently picking loot
 *  - `lootOptions`: if we have loot choices
 *  - `randomSeed`: optional for deterministic random
 */
export interface GigaverseRunState {
    player: GigaverseFighter;
    enemies: GigaverseFighter[];
    currentEnemyIndex: number;
    lootPhase: boolean;
    lootOptions: GigaverseLootOption[];
    randomSeed?: string | number;
}
//# sourceMappingURL=GigaverseTypes.d.ts.map
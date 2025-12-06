// path: gigaverse-engine/src/algorithms/hybridEvaluate.ts
import { GigaverseRunState } from "../simulator/GigaverseTypes";
import { combatEvaluate } from "./combatEvaluate";
import { evaluateLoot } from "./lootEvaluate";

/**
 * Hybrid evaluate:
 *  - In loot selection screens, per-option scoring uses evaluateLoot(state, loot).
 *    hybridEvaluate returns baseline combat score for the state (DPAlgorithm or UI can call evaluateLoot per option).
 *  - In combat, return combatEvaluate + a light planning boost depending on remaining rooms.
 */
export function hybridEvaluate(state: GigaverseRunState): number {
  if (!state || !state.player) return -1e9;

  // If we are in loot phase, return baseline combat score (per-loot scoring should be done by evaluateLoot)
  if (state.lootPhase) {
    // Slightly favor loot-phase states (so DP that compares states has small bias)
    return combatEvaluate(state) * 1.0;
  }

  // Combat phase: base combat evaluate
  const base = combatEvaluate(state);

  // small planning term: prefer survivability if multiple rooms remain
  const totalRooms = state.totalRooms ?? (state.enemies?.length ?? 1);
  const currentRoomIndex = state.currentRoomIndex ?? state.currentEnemyIndex ?? 0;
  const remaining = Math.max(0, totalRooms - currentRoomIndex);

  // planningBoost scales gently with remaining rooms (balanced preference)
  const planningBoost = Math.min(remaining, 4) * 500; // up to +2000
  return base + planningBoost;
}

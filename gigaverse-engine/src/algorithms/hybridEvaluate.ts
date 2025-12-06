// path: gigaverse-engine/src/algorithms/hybridEvaluate.ts
import { GigaverseRunState } from "../simulator/GigaverseTypes";
import { combatEvaluate } from "./combatEvaluate";
import { evaluateLoot } from "./lootEvaluate";

/**
 * Hybrid evaluate: if lootPhase => return combatEvaluate(state) plus a small factor
 * (DPAlgorithm's getLootSynergyScore may call evaluateLoot per-option; hybrid returns baseline).
 *
 * If not lootPhase => return combatEvaluate plus small planning heuristics.
 */
export function hybridEvaluate(state: GigaverseRunState): number {
  if (!state) return -1e9;

  // If in loot selection screen, rely on combatEvaluate baseline
  // The actual per-loot scoring should be done with evaluateLoot(state, loot).
  if (state.lootPhase) {
    // We want the engine to prefer states that have higher combat baseline,
    // but per-loot comparison is handled externally by evaluateLoot.
    return combatEvaluate(state) + 0; // neutral baseline
  }

  // Combat phase: use combatEvaluate and apply a small planning term
  const base = combatEvaluate(state);

  // Simple planning term: if many rooms remain, prefer survivability more
  const roomsLeft = Math.max(0, (state.totalRooms ?? 1) - (state.currentRoomIndex ?? state.currentEnemyIndex ?? 0));
  const planningBoost = Math.min(roomsLeft, 3) * 400; // small boost per remaining room
  return base + planningBoost;
}

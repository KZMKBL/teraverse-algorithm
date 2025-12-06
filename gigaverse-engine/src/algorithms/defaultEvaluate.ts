// path: gigaverse-engine/src/algorithms/defaultEvaluate.ts

import { GigaverseRunState, GigaverseFighter, GigaverseMoveState } from "../simulator/GigaverseTypes";

/**
 * Evaluates the state to give a numeric score.
 * Higher is better.
 * TUNED FOR DEFENSIVE PLAY: Prioritizes Armor and Health preservation.
 */
export function defaultEvaluate(state: GigaverseRunState): number {
  const p = state.player;
  const e = state.enemies[state.currentEnemyIndex];

  // 1. CRITICAL: DEATH CHECK
  if (p.health.current <= 0) return -1000000;

  let score = 0;

  // 2. PROGRESSION (Winning is still the ultimate goal)
  score += state.currentEnemyIndex * 100000; 

  if (!e || e.health.current <= 0) {
      score += 50000;
      // If we won, return immediately with a bonus for remaining health
      return score + (p.health.current * 200); 
  }

  // 3. DEFENSIVE METRICS (The Core Change)
  
  // Health is King: Massive multiplier to avoid ANY health loss
  score += p.health.current * 300; 

  // Armor is Queen: High multiplier to keep armor up
  // We also add a specific "Armor Integrity" bonus
  score += p.armor.current * 100; 

  // ARMOR CRITICALITY: If armor is broken (0) or very low (< 20%), apply a heavy penalty.
  // This forces the bot to recharge armor immediately.
  if (p.armor.current === 0) {
      score -= 5000; // Panic! Get armor NOW!
  } else if (p.armor.current < p.armor.max * 0.2) {
      score -= 2000; // Warning! Armor is critical.
  }

  // 4. OFFENSIVE METRICS (Aggression)
  // We still need to kill the enemy, but we value it slightly less than survival.
  const damageDealt = e.health.max - e.health.current;
  score += damageDealt * 100; // Reduced from 150 to 100

  const armorBroken = e.armor.max - e.armor.current;
  score += armorBroken * 40;

  // 5. ECONOMY (Ammo Management)
  const myMoves = [p.rock, p.paper, p.scissor];
  let myTotalStats = 0;

  for (const m of myMoves) {
      myTotalStats += m.currentATK + m.currentDEF;

      // Penalize having NO ammo significantly to ensure we always have options
      if (m.currentCharges === -1) score -= 800; 
      else if (m.currentCharges === 0) score -= 200; // Increased penalty for 0 ammo

      // Reward having ammo
      if (m.currentCharges > 0) score += m.currentCharges * 20;
  }
  
  score += myTotalStats * 40;

  // 6. THREAT ASSESSMENT
  // If the enemy has ammo and high attack, we should be scared (lower score for this state).
  const enemyMoves = [e.rock, e.paper, e.scissor];
  let threatScore = 0;

  for (const em of enemyMoves) {
      if (em.currentCharges > 0) {
          // If enemy can attack, reduce our score based on their attack power.
          // This makes "safe" states (where enemy has no ammo) much more attractive.
          threatScore += (em.currentATK * 30); // Increased threat weight
      }
  }
  
  score -= threatScore;

  return score;
}

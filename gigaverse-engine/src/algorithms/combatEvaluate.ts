// path: gigaverse-engine/src/algorithms/combatEvaluate.ts
import { GigaverseRunState } from "../simulator/GigaverseTypes";

/**
 * Combat-only evaluate. Higher is better.
 * Balanced profile: survival prioritized but not overcautious.
 *
 * Returns a numeric score (unbounded but roughly scaled).
 */
export function combatEvaluate(state: GigaverseRunState): number {
  if (!state || !state.player) return -1e9;
  const p = state.player;
  const e = state.enemies[state.currentEnemyIndex];

  // Death absolute (very large negative)
  if (p.health.current <= 0) return -1000000;

  // Base score
  let score = 0;

  // Small progress reward (encourage clearing)
  score += (state.currentEnemyIndex || 0) * 20000;

  // If enemy dead -> reward and value remaining HP
  if (!e || e.health.current <= 0) {
    score += 35000;
    return score + (p.health.current * 250);
  }

  // Survival: health is primary
  score += p.health.current * 300;

  // Armor helpful but secondary
  const armorCur = p.armor?.current ?? 0;
  score += armorCur * 120;

  // If armor zero, small penalty (not huge)
  if (armorCur === 0) score -= 800;

  // Damage dealt so far to current enemy (moderate weight)
  const damageDealt = (e.health?.max ?? 0) - (e.health?.current ?? 0);
  score += damageDealt * 80;

  // Ammo/charges economy - modest bonuses, penalize being empty
  const myMoves = [p.rock, p.paper, p.scissor];
  let myTotalStats = 0;
  for (const m of myMoves) {
    if (!m) continue;
    myTotalStats += (m.currentATK ?? 0) + (m.currentDEF ?? 0);
    const charges = m.currentCharges ?? 0;
    if (charges <= 0) score -= 120;
    else if (charges === 1) score += 35;
    else if (charges === 2) score += 60;
    else if (charges >= 3) score += 90;
  }
  score += myTotalStats * 30;

  // Threat analysis: how dangerous is enemy next turn
  const enemyMoves = [e.rock, e.paper, e.scissor];
  let threatScore = 0;
  for (const em of enemyMoves) {
    if (!em) continue;
    if ((em.currentCharges ?? 0) > 0) threatScore += (em.currentATK ?? 0) * 25;
  }
  score -= threatScore;

  // Risk aversion: penalize low percent HP states (makes bot more careful when low HP)
  const hpPercent = p.health.current / Math.max(1, p.health.max ?? 1);
  if (hpPercent < 0.35) {
    score -= (0.35 - hpPercent) * 2000;
  }

  return score;
}

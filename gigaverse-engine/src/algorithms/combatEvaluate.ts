// path: gigaverse-engine/src/algorithms/combatEvaluate.ts
import { GigaverseRunState } from "../simulator/GigaverseTypes";

/**
 * Combat-only evaluate. Higher is better.
 * Pure combat heuristics: survival, armor, damage dealt, ammo economy, threat.
 */
export function combatEvaluate(state: GigaverseRunState): number {
  const p = state.player;
  const e = state.enemies[state.currentEnemyIndex];

  if (!p) return -1e9;
  if (p.health.current <= 0) return -1000000;

  let score = 0;

  // Progress small contribution (combat local)
  score += (state.currentEnemyIndex || 0) * 20000;

  // If enemy dead => reward and value remaining HP
  if (!e || e.health.current <= 0) {
    score += 35000;
    return score + (p.health.current * 250);
  }

  // Survival absolute values
  score += p.health.current * 300;
  score += (p.armor?.current || 0) * 120;
  if ((p.armor?.current || 0) === 0) score -= 800;

  // Damage dealt (moderate)
  const damageDealt = (e.health?.max ?? 0) - (e.health?.current ?? 0);
  score += damageDealt * 80;

  // Charges / ammo economy
  const myMoves = [p.rock, p.paper, p.scissor];
  let myTotalStats = 0;
  for (const m of myMoves) {
    if (!m) continue;
    myTotalStats += (m.currentATK || 0) + (m.currentDEF || 0);
    if ((m.currentCharges ?? 0) <= 0) score -= 120;
    else if (m.currentCharges === 1) score += 35;
    else if (m.currentCharges === 2) score += 60;
    else if ((m.currentCharges ?? 0) >= 3) score += 90;
  }
  score += myTotalStats * 30;

  // Threat analysis
  const enemyMoves = [e.rock, e.paper, e.scissor];
  let threatScore = 0;
  for (const em of enemyMoves) {
    if (!em) continue;
    if ((em.currentCharges ?? 0) > 0) threatScore += (em.currentATK || 0) * 25;
  }
  score -= threatScore;

  // Risk aversion when low HP
  const hpPercent = p.health.current / Math.max(1, p.health.max || 1);
  if (hpPercent < 0.35) score -= (0.35 - hpPercent) * 2000;

  return score;
}

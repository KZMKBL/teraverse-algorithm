// path: gigaverse-engine/src/algorithms/defaultEvaluate.ts

import { GigaverseRunState, GigaverseFighter, GigaverseMoveState } from "../simulator/GigaverseTypes";

/**
 * Evaluates the state to give a numeric score.
 * Higher is better.
 * BALANCED FOR: Expectimax with enemy-modeling
 *
 * Principles:
 *  - Survival >> Progress (enemy index) >> Kills >> Resource management
 *  - Avoid overvaluing single-round damage; prefer durable advantage
 */
export function defaultEvaluate(state: GigaverseRunState): number {
  const p = state.player;
  const e = state.enemies[state.currentEnemyIndex];

  // 1) Death check (very large negative)
  if (p.health.current <= 0) return -1000000;

  let score = 0;

  // 2) Progress and victory
  // Progress is important but not overwhelmingly so.
  score += state.currentEnemyIndex * 25000;

  // If current enemy is dead (we advanced), reward and value remaining HP
  if (!e || e.health.current <= 0) {
    score += 40000; // victory bonus for clearing enemy
    // remaining HP is valuable but not enormous
    return score + (p.health.current * 250);
  }

  // 3) Survival absolute values (strong priority)
  // Health much more important than anything else
  score += p.health.current * 300;

  // Armor is useful but less than raw HP
  score += p.armor.current * 120;

  // If armor is zero, mild penalty (encourage keeping at least some armor)
  if (p.armor.current === 0) {
    score -= 800;
  }

  // 4) Kill-value and damage
  // Reward dealing damage but less aggressively than before
  const damageDealt = e.health.max - e.health.current;
  score += damageDealt * 80; // reduced multiplier

  // Strong bonus for actually killing the current enemy (so search will prefer lethal)
  if (e.health.current <= 0) {
    score += 30000 + (p.health.current * 300);
  }

  // 5) Ammo / charges (economy)
  // Reasonable bonuses for having charges but not absurd.
  const myMoves = [p.rock, p.paper, p.scissor];
  let myTotalStats = 0;
  let chargeCount = 0;

  for (const m of myMoves) {
    myTotalStats += m.currentATK + m.currentDEF;
    if (m.currentCharges > 0) {
      chargeCount += Math.min(m.currentCharges, 3);
    } else {
      // if completely empty it's a modest penalty
      score -= 120;
    }
    // Smaller per-charge bonus — keeps bot mindful but not obsessed
    if (m.currentCharges === 1) score += 35;
    else if (m.currentCharges === 2) score += 60;
    else if (m.currentCharges >= 3) score += 90;
  }

  // Stat investment matters (ATK/DEF)
  score += myTotalStats * 30;

  // 6) Threat analysis: enemy potential to harm us next rounds
  const enemyMoves = [e.rock, e.paper, e.scissor];
  let threatScore = 0;
  for (const em of enemyMoves) {
    if (em.currentCharges > 0) {
      // enemy attack power scaled - moderate factor
      threatScore += (em.currentATK * 25);
    }
  }
  // subtract immediate threat (we want to avoid walking into high incoming power)
  score -= threatScore;

  // 7) Slight preference to conserve some armor/HP margin (risk aversion)
  // If our health is lowish, bias towards healing/defense by reducing score of aggressive states
  const hpPercent = p.health.current / Math.max(1, p.health.max);
  if (hpPercent < 0.35) {
    score -= (0.35 - hpPercent) * 2000; // more risk-averse when low hp
  }

  return score;
}

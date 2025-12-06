import { GigaverseRunState } from "../simulator/GigaverseTypes";

export function defaultEvaluate(state: GigaverseRunState): number {
  const player = state.player;

  // If player is dead => minimal
  if (player.health.current <= 0) return 0;

  // 1) Main scoring: how many enemies we’ve defeated so far
  const enemiesDefeated = state.currentEnemyIndex;

  // 2) Reward current HP ratio & armor ratio
  const hpRatio =
    player.health.max > 0 ? player.health.current / player.health.max : 0;
  const armorRatio =
    player.armor.max > 0 ? player.armor.current / player.armor.max : 0;

  // 3) Synergy for top 2 moves
  //    We look at (ATK + DEF) for each move, identify top 2
  const moves = [
    { name: "rock", stats: player.rock },
    { name: "paper", stats: player.paper },
    { name: "scissor", stats: player.scissor },
  ];
  moves.sort(
    (a, b) =>
      b.stats.currentATK +
      b.stats.currentDEF -
      (a.stats.currentATK + a.stats.currentDEF)
  );
  const [best1, best2] = moves;

  // Simple synergy factor: sum of (ATK+DEF) of best 2 moves * 0.01
  // Adjust as you like
  const synergy =
    (best1.stats.currentATK +
      best1.stats.currentDEF +
      best2.stats.currentATK +
      best2.stats.currentDEF) *
    0.01;

  // 4) Penalty for negative charges
  const negativeChargesCount = moves.filter(
    (m) => m.stats.currentCharges < 0
  ).length;
  const spamPenalty = negativeChargesCount * 0.3;

  // Build final
  return (
    enemiesDefeated +
    hpRatio * 2.0 + // weigh HP strongly
    armorRatio +
    synergy -
    spamPenalty
  );
}

// path: gigaverse-engine/src/algorithms/lootEvaluate.ts
import { GigaverseRunState, GigaverseFighter, GigaverseMoveState } from "../simulator/GigaverseTypes";
import { combatEvaluate } from "./combatEvaluate";

/**
 * Loot evaluation utilities (SDV + build analysis + micro-sim).
 * Exports: evaluateLoot(state, loot) => number
 */

/** Helper: deep clone state (simple JSON clone) */
function cloneState(state: GigaverseRunState): GigaverseRunState {
  return JSON.parse(JSON.stringify(state));
}

function getStats(f: GigaverseFighter, m: "rock" | "paper" | "scissor"): GigaverseMoveState {
  switch (m) {
    case "rock": return f.rock;
    case "paper": return f.paper;
    case "scissor": return f.scissor;
  }
}

/** Apply a loot to a cloned state (minimal but extendable) */
export function applyLootToClone(clone: GigaverseRunState, loot: any) {
  const rawType = (loot.boonTypeString || "").toString();
  const t = rawType.toLowerCase();
  const v1 = loot.selectedVal1 || 0;
  const v2 = loot.selectedVal2 || 0;
  const p = clone.player;

  if (!p) return;

  if (rawType === "AddMaxHealth" || t.includes("maxhealth") || t.includes("vitality") || t.includes("hp")) {
    p.health.max += v1;
    p.health.current = Math.min(p.health.max, p.health.current + v1);
    return;
  }

  if (rawType === "AddMaxArmor" || t.includes("maxarmor") || t.includes("armor")) {
    p.armor.max += v1;
    p.armor.current = Math.min(p.armor.current + v1, p.armor.max);
    return;
  }

  if (rawType === "Heal" || t === "heal" || t.includes("potion")) {
    p.health.current = Math.min(p.health.max, p.health.current + v1);
    return;
  }

  if (rawType === "UpgradeRock" || t.includes("upgraderock") || t.includes("rock")) {
    if (v1 > 0) p.rock.currentATK += v1;
    if (v2 > 0) p.rock.currentDEF += v2;
    return;
  }
  if (rawType === "UpgradePaper" || t.includes("upgradepaper") || t.includes("paper")) {
    if (v1 > 0) p.paper.currentATK += v1;
    if (v2 > 0) p.paper.currentDEF += v2;
    return;
  }
  if (rawType === "UpgradeScissor" || t.includes("upgradescissor") || t.includes("scissor") || t.includes("spell") || t.includes("magic")) {
    if (v1 > 0) p.scissor.currentATK += v1;
    if (v2 > 0) p.scissor.currentDEF += v2;
    return;
  }

  // fallback for any grantCharges-like structure
  if (loot.grantCharges && typeof loot.grantCharges === "object") {
    p.rock.currentCharges = Math.min(3, (p.rock.currentCharges || 0) + (loot.grantCharges.rock || 0));
    p.paper.currentCharges = Math.min(3, (p.paper.currentCharges || 0) + (loot.grantCharges.paper || 0));
    p.scissor.currentCharges = Math.min(3, (p.scissor.currentCharges || 0) + (loot.grantCharges.scissor || 0));
  }
}

/** compute evaluate(new) - evaluate(old) using combatEvaluate (SDV) */
export function computeStateDeltaValue(state: GigaverseRunState, loot: any): number {
  const oldScore = combatEvaluate(state);
  const clone = cloneState(state);
  applyLootToClone(clone, loot);
  const newScore = combatEvaluate(clone);
  return newScore - oldScore;
}

/** basic build analysis heuristic */
export function analyzeBuildPreference(state: GigaverseRunState) {
  const p = state.player;
  const enemy = state.enemies[state.currentEnemyIndex] || null;

  const safeNumber = (n: number | undefined) => n ?? 0;
  const rockScore = (safeNumber(p.rock.currentATK) * Math.max(1, Math.min(3, safeNumber(p.rock.currentCharges)))) + (safeNumber(p.rock.currentDEF) * 0.5);
  const paperScore = (safeNumber(p.paper.currentATK) * Math.max(1, Math.min(3, safeNumber(p.paper.currentCharges)))) + (safeNumber(p.paper.currentDEF) * 0.5);
  const scissorScore = (safeNumber(p.scissor.currentATK) * Math.max(1, Math.min(3, safeNumber(p.scissor.currentCharges)))) + (safeNumber(p.scissor.currentDEF) * 0.5);

  const maxWeapon = Math.max(rockScore, paperScore, scissorScore, 1);
  const rockPref = rockScore / maxWeapon;
  const paperPref = paperScore / maxWeapon;
  const scissorPref = scissorScore / maxWeapon;

  const hpPref = 1 - (safeNumber(p.health.current) / Math.max(1, safeNumber(p.health.max)));
  const armorPref = (safeNumber(p.armor.current) / Math.max(1, safeNumber(p.armor.max) || 1));

  const totalCharges = (p.rock.currentCharges > 0 ? p.rock.currentCharges : 0)
    + (p.paper.currentCharges > 0 ? p.paper.currentCharges : 0)
    + (p.scissor.currentCharges > 0 ? p.scissor.currentCharges : 0);
  const chargesPref = 1 - Math.min(1, totalCharges / 9);

  return { rock: rockPref, paper: paperPref, scissor: scissorPref, hp: hpPref, armor: armorPref, charges: chargesPref };
}

/** micro-simulate a few rounds (greedy deterministic) */
export function microSimulateLootEffect(state: GigaverseRunState, loot: any, rounds = 3) {
  const baseClone = cloneState(state);
  const modClone = cloneState(state);
  applyLootToClone(modClone, loot);

  const pickGreedyMove = (f: GigaverseFighter): "rock" | "paper" | "scissor" | null => {
    if (!f) return null;
    let best: { move: "rock" | "paper" | "scissor", val: number } | null = null;
    const rockVal = (f.rock.currentCharges > 0) ? f.rock.currentATK : -Infinity;
    const paperVal = (f.paper.currentCharges > 0) ? f.paper.currentATK : -Infinity;
    const scissorVal = (f.scissor.currentCharges > 0) ? f.scissor.currentATK : -Infinity;
    if (rockVal !== -Infinity) best = { move: "rock", val: rockVal };
    if (paperVal !== -Infinity && (best === null || paperVal > best.val)) best = { move: "paper", val: paperVal };
    if (scissorVal !== -Infinity && (best === null || scissorVal > best.val)) best = { move: "scissor", val: scissorVal };
    return best ? best.move : null;
  };

  const applyRoundOutcome = (stateClone: GigaverseRunState, pMove: "rock" | "paper" | "scissor", eMove: "rock" | "paper" | "scissor") => {
    const p = stateClone.player;
    const e = stateClone.enemies[stateClone.currentEnemyIndex];
    if (!p || !e) return;
    const pStats = getStats(p, pMove);
    const eStats = getStats(e, eMove);
    let pWins = false;
    let tie = pMove === eMove;
    if (!tie) {
      if ((pMove === "rock" && eMove === "scissor") ||
          (pMove === "paper" && eMove === "rock") ||
          (pMove === "scissor" && eMove === "paper")) pWins = true;
    }
    let dmgToE = 0, dmgToP = 0, armorGainP = 0, armorGainE = 0;
    if (tie) {
      dmgToE = pStats.currentATK;
      dmgToP = eStats.currentATK;
      armorGainP = pStats.currentDEF;
      armorGainE = eStats.currentDEF;
    } else if (pWins) {
      dmgToE = pStats.currentATK;
      armorGainP = pStats.currentDEF;
    } else {
      dmgToP = eStats.currentATK;
      armorGainE = eStats.currentDEF;
    }

    // apply damage (simple)
    e.armor.current = Math.min(e.armor.current + armorGainE, e.armor.max);
    let dmg = dmgToE;
    if (e.armor.current > 0 && dmg > 0) {
      const absorb = Math.min(e.armor.current, dmg);
      e.armor.current -= absorb;
      dmg -= absorb;
    }
    if (dmg > 0) e.health.current = Math.max(0, e.health.current - dmg);

    p.armor.current = Math.min(p.armor.current + armorGainP, p.armor.max);
    let dmgP = dmgToP;
    if (p.armor.current > 0 && dmgP > 0) {
      const absorbP = Math.min(p.armor.current, dmgP);
      p.armor.current -= absorbP;
      dmgP -= absorbP;
    }
    if (dmgP > 0) p.health.current = Math.max(0, p.health.current - dmgP);

    // update charges simple (same logic as engine)
    const decCharge = (mv: "rock"|"paper"|"scissor", f: GigaverseFighter) => {
      const s = getStats(f, mv);
      if (s.currentCharges > 1) s.currentCharges--;
      else if (s.currentCharges === 1) s.currentCharges = -1;
    };
    decCharge(pMove, p);
    decCharge(eMove, e);
    // recharge others
    (["rock", "paper", "scissor"] as const).forEach(m => {
      if (m !== pMove) {
        const s = getStats(p, m);
        if (s.currentCharges === -1) s.currentCharges = 0;
        else if (s.currentCharges >= 0 && s.currentCharges < 3) s.currentCharges++;
      }
      if (m !== eMove) {
        const s = getStats(e, m);
        if (s.currentCharges === -1) s.currentCharges = 0;
        else if (s.currentCharges >= 0 && s.currentCharges < 3) s.currentCharges++;
      }
    });
  };

  const runSim = (clone: GigaverseRunState) => {
    let roundsToKill = 0;
    for (let r = 0; r < rounds; r++) {
      if (clone.player.health.current <= 0) break;
      if (clone.currentEnemyIndex >= clone.enemies.length) break;
      const enemy = clone.enemies[clone.currentEnemyIndex];
      if (!enemy) break;
      const pmove = pickGreedyMove(clone.player) || "rock";
      const emove = pickGreedyMove(enemy) || "rock";
      applyRoundOutcome(clone, pmove, emove);
      if (clone.enemies[clone.currentEnemyIndex] && clone.enemies[clone.currentEnemyIndex].health.current <= 0) {
        clone.currentEnemyIndex++;
      }
      roundsToKill++;
    }
    return { survived: clone.player.health.current > 0, roundsToKill };
  };

  const baseRes = runSim(baseClone);
  const modRes = runSim(modClone);

  const baseTTK = (baseRes.roundsToKill === 0 && (state.enemies[state.currentEnemyIndex]?.health.current ?? 0) > 0) ? rounds + 1 : baseRes.roundsToKill;
  const modTTK = (modRes.roundsToKill === 0 && (state.enemies[state.currentEnemyIndex]?.health.current ?? 0) > 0) ? rounds + 1 : modRes.roundsToKill;

  const deltaTTK = modTTK - baseTTK;
  const deltaSurvival = (modRes.survived ? 1 : 0) - (baseRes.survived ? 1 : 0);

  return { deltaTTK, deltaSurvival };
}

/** Main exported function: evaluate the loot in the current run state */
export function evaluateLoot(state: GigaverseRunState, loot: any): number {
  const sdv = computeStateDeltaValue(state, loot);
  const buildPref = analyzeBuildPreference(state);
  const micro = microSimulateLootEffect(state, loot, 3);

  let score = sdv;

  // Build pref bonuses
  const rawType = (loot.boonTypeString || "").toString();
  const t = rawType.toLowerCase();
  const isHeal = (rawType === "Heal" || t === "heal" || t.includes("potion")) && !t.includes("maxhealth");
  const isMaxHP = rawType === "AddMaxHealth" || t.includes("maxhealth") || t.includes("vitality") || t.includes("hp");
  const isArmor = rawType === "AddMaxArmor" || t.includes("armor");
  const isRock = rawType === "UpgradeRock" || t.includes("rock") || t.includes("sword");
  const isPaper = rawType === "UpgradePaper" || t.includes("paper") || t.includes("shield");
  const isScissor = rawType === "UpgradeScissor" || t.includes("scissor") || t.includes("spell") || t.includes("magic");

  if (isRock) score += 50 * buildPref.rock;
  if (isPaper) score += 50 * buildPref.paper;
  if (isScissor) score += 50 * buildPref.scissor;
  if (isMaxHP) score += 40 * buildPref.hp;
  if (isArmor) score += 40 * buildPref.armor;
  if (isHeal) score += 30 * (buildPref.hp + 0.5);

  // micro-sim effects scaled
  score += -micro.deltaTTK * 1200;
  score += micro.deltaSurvival * 4000;

  // small +1 handling: if +1 but micro shows survival gain, give small bonus
  const v1 = loot.selectedVal1 || 0;
  const v2 = loot.selectedVal2 || 0;
  if ((isRock || isPaper || isScissor) && (v1 === 1 || v2 === 1)) {
    score += Math.max(0, micro.deltaSurvival * 1000);
  }

  if (!Number.isFinite(score)) score = -1e9;
  return score;
}

// path: gigaverse-engine/src/algorithms/lootEvaluate.ts
import { GigaverseRunState, GigaverseFighter, GigaverseMoveState } from "../simulator/GigaverseTypes";
import { combatEvaluate } from "./combatEvaluate";

/**
 * Loot evaluation utilities (SDV + build analysis + micro-sim).
 * This file exports `evaluateLoot(state, loot)` which returns a numeric score.
 *
 * Balanced profile:
 *  - Full HP should never choose heal
 *  - ATK/DEF/HP upgrades valued sensibly
 *  - Charges / refill highly valued
 *  - Future floors amplify value moderately
 */

/* ---------- Helpers ---------- */

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

/* Apply a loot boon to a cloned state.
   This intentionally keeps semantics conservative; extend if you have custom boon types. */
export function applyLootToClone(clone: GigaverseRunState, loot: any) {
  const rawType = (loot.boonTypeString || "").toString();
  const t = rawType.toLowerCase();
  const v1 = loot.selectedVal1 || 0;
  const v2 = loot.selectedVal2 || 0;
  const p = clone.player;
  if (!p) return;

  // Max Health
  if (rawType === "AddMaxHealth" || t.includes("maxhealth") || t.includes("vitality") || t.includes("hp")) {
    p.health.max += v1;
    // Increase current HP by same amount (conservative: treat as instant heal to keep safe)
    p.health.current = Math.min(p.health.max, (p.health.current ?? 0) + v1);
    return;
  }

  // Max Armor
  if (rawType === "AddMaxArmor" || t.includes("maxarmor") || t.includes("armor")) {
    p.armor.max += v1;
    p.armor.current = Math.min(p.armor.current + v1, p.armor.max);
    return;
  }

  // Heal / Potion
  if (rawType === "Heal" || t === "heal" || t.includes("potion")) {
    p.health.current = Math.min(p.health.max, p.health.current + v1);
    return;
  }

  // Weapon Upgrades
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

  // Fallback: grantCharges-like
  if (loot.grantCharges && typeof loot.grantCharges === "object") {
    p.rock.currentCharges = Math.min(3, (p.rock.currentCharges || 0) + (loot.grantCharges.rock || 0));
    p.paper.currentCharges = Math.min(3, (p.paper.currentCharges || 0) + (loot.grantCharges.paper || 0));
    p.scissor.currentCharges = Math.min(3, (p.scissor.currentCharges || 0) + (loot.grantCharges.scissor || 0));
  }
}

/* SDV: evaluate(new) - evaluate(old) using combatEvaluate */
export function computeStateDeltaValue(state: GigaverseRunState, loot: any): number {
  const oldScore = combatEvaluate(state);
  const clone = cloneState(state);
  applyLootToClone(clone, loot);
  const newScore = combatEvaluate(clone);
  return newScore - oldScore;
}

/* Basic build preference heuristic */
export function analyzeBuildPreference(state: GigaverseRunState) {
  const p = state.player;
  const safe = (n: number | undefined) => n ?? 0;

  const rockScore = (safe(p.rock.currentATK) * Math.max(1, Math.min(3, safe(p.rock.currentCharges)))) + (safe(p.rock.currentDEF) * 0.5);
  const paperScore = (safe(p.paper.currentATK) * Math.max(1, Math.min(3, safe(p.paper.currentCharges)))) + (safe(p.paper.currentDEF) * 0.5);
  const scissorScore = (safe(p.scissor.currentATK) * Math.max(1, Math.min(3, safe(p.scissor.currentCharges)))) + (safe(p.scissor.currentDEF) * 0.5);

  const maxWeapon = Math.max(rockScore, paperScore, scissorScore, 1);
  const rockPref = rockScore / maxWeapon;
  const paperPref = paperScore / maxWeapon;
  const scissorPref = scissorScore / maxWeapon;

  const hpPref = 1 - (safe(p.health.current) / Math.max(1, safe(p.health.max)));
  const armorPref = safe(p.armor.current) / Math.max(1, safe(p.armor.max) || 1);

  const totalCharges = (p.rock.currentCharges > 0 ? p.rock.currentCharges : 0)
    + (p.paper.currentCharges > 0 ? p.paper.currentCharges : 0)
    + (p.scissor.currentCharges > 0 ? p.scissor.currentCharges : 0);
  const chargesPref = 1 - Math.min(1, totalCharges / 9);

  return { rock: rockPref, paper: paperPref, scissor: scissorPref, hp: hpPref, armor: armorPref, charges: chargesPref };
}

/* Micro-simulate a few rounds using greedy play to approximate short-term effect */
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

  const applyRound = (s: GigaverseRunState, pMove: "rock" | "paper" | "scissor", eMove: "rock" | "paper" | "scissor") => {
    const p = s.player;
    const e = s.enemies[s.currentEnemyIndex];
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

    // Apply to enemy
    e.armor.current = Math.min(e.armor.current + armorGainE, e.armor.max);
    let dmg = dmgToE;
    if (e.armor.current > 0 && dmg > 0) {
      const absorb = Math.min(e.armor.current, dmg);
      e.armor.current -= absorb;
      dmg -= absorb;
    }
    if (dmg > 0) e.health.current = Math.max(0, e.health.current - dmg);

    // Apply to player
    p.armor.current = Math.min(p.armor.current + armorGainP, p.armor.max);
    let dmgP = dmgToP;
    if (p.armor.current > 0 && dmgP > 0) {
      const absorbP = Math.min(p.armor.current, dmgP);
      p.armor.current -= absorbP;
      dmgP -= absorbP;
    }
    if (dmgP > 0) p.health.current = Math.max(0, p.health.current - dmgP);

    // Update charges (simple decrement and regen logic copied from engine)
    const decCharge = (mv: "rock"|"paper"|"scissor", f: GigaverseFighter) => {
      const s = getStats(f, mv);
      if (s.currentCharges > 1) s.currentCharges--;
      else if (s.currentCharges === 1) s.currentCharges = -1;
    };
    decCharge(pMove, p);
    decCharge(eMove, e);

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
      const pm = pickGreedyMove(clone.player) || "rock";
      const em = pickGreedyMove(enemy) || "rock";
      applyRound(clone, pm, em);
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

/* Main exported function: evaluate the loot in the current run state */
export function evaluateLoot(state: GigaverseRunState, loot: any): number {
  // safety
  if (!state || !state.player) return -1e9;

  // 1) SDV (immediate combat effect)
  const sdv = computeStateDeltaValue(state, loot);

  // 2) Build preference
  const buildPref = analyzeBuildPreference(state);

  // 3) Micro simulation
  const micro = microSimulateLootEffect(state, loot, 3);

  // Start with SDV weighted
  let score = sdv * 1.0;

  // Detect loot type
  const rawType = (loot.boonTypeString || "").toString();
  const t = rawType.toLowerCase();

  const isHeal = (rawType === "Heal" || t === "heal" || t.includes("potion")) && !t.includes("maxhealth");
  const isMaxHP = rawType === "AddMaxHealth" || t.includes("maxhealth") || t.includes("vitality") || t.includes("hp");
  const isArmor = rawType === "AddMaxArmor" || t.includes("armor");
  const isRock = rawType === "UpgradeRock" || t.includes("rock") || t.includes("sword");
  const isPaper = rawType === "UpgradePaper" || t.includes("paper") || t.includes("shield");
  const isScissor = rawType === "UpgradeScissor" || t.includes("scissor") || t.includes("spell") || t.includes("magic");
  const v1 = loot.selectedVal1 || 0;
  const v2 = loot.selectedVal2 || 0;

  // Heals: if full HP -> strongly negative so never chosen
  const currentHP = state.player.health.current ?? 0;
  const maxHP = state.player.health.max ?? 1;
  const missingHP = Math.max(0, maxHP - currentHP);

  if (isHeal) {
    if (currentHP >= maxHP) {
      // full health: do not pick healing
      return -1e9;
    }
    // dynamic heal value: scales by missing HP percent and remaining danger
    // Balanced choice: moderate sensitivity
    const hpPercent = currentHP / Math.max(1, maxHP);
    let healWeight = 6; // balanced default
    // If very low HP, boost weight
    if (hpPercent < 0.30) healWeight = 10;
    else if (hpPercent < 0.50) healWeight = 8;
    score += missingHP * healWeight;
    // small micro-sim add
    score += micro.deltaSurvival * 2500;
  }

  // Max HP
  if (isMaxHP) {
    // maxHP upgrades are valuable (survivability)
    score += (v1 * 180);
    // micro sim contribution
    score += micro.deltaSurvival * 2000;
  }

  // Armor
  if (isArmor) {
    score += (v1 * 150);
    score += micro.deltaSurvival * 1500;
  }

  // Weapon upgrades
  if (isRock || isPaper || isScissor) {
    // treat v1 as atk, v2 as def if present; if only val2 used treat accordingly
    const isAtk = v1 > 0;
    const val = isAtk ? v1 : v2;
    // +1 upgrades shouldn't be automatically thrown away; judge via micro-sim and build pref
    let baseWeaponValue = Math.pow(val, 2) * 40; // quadratic to favor bigger upgrades
    if (isAtk) baseWeaponValue *= 1.1; // slight bias to atk for progression
    // apply build preference multiplier
    const prefMult = isRock ? (1 + buildPref.rock * 0.5) : isPaper ? (1 + buildPref.paper * 0.5) : (1 + buildPref.scissor * 0.5);
    baseWeaponValue *= prefMult;
    // boost if micro-sim reduces TTK or increases survival
    baseWeaponValue += -micro.deltaTTK * 1000;
    baseWeaponValue += micro.deltaSurvival * 1500;
    // small penalty if val === 1 to avoid extreme garbage filtering but not complete drop
    if (val === 1) baseWeaponValue *= 0.6;
    score += baseWeaponValue;
  }

  // Charge grants (if present)
  if (loot.grantCharges && typeof loot.grantCharges === "object") {
    const add = (loot.grantCharges.rock || 0) + (loot.grantCharges.paper || 0) + (loot.grantCharges.scissor || 0);
    // charges are very valuable for progression
    score += add * 250;
    // if micro sim improves survival, amplify
    score += micro.deltaSurvival * 2000;
  }

  // Small SDV fallback: if SDV strongly positive keep it
  score += sdv * 0.5;

  // Future floors multiplier: encourage progression early
  const totalRooms = state.totalRooms ?? (state.enemies?.length ?? 1);
  const currentRoomIndex = state.currentRoomIndex ?? state.currentEnemyIndex ?? 0;
  const remaining = Math.max(0, (totalRooms - currentRoomIndex));
  // small scaling: each remaining floor adds 5% value (capped)
  const futureMult = 1 + Math.min(0.4, remaining * 0.05);
  score *= futureMult;

  // Normalize / guard
  if (!Number.isFinite(score)) score = -1e9;
  return score;
}

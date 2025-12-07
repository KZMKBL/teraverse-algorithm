// path: gigaverse-engine/src/algorithms/dp/DPAlgorithm.ts
/**
 * A DP approach for picking the best immediate action, exploring up to maxHorizon steps.
 * Includes "Synergy Heuristics" to make smarter build decisions (Loot picking).
 */

import {
  IGigaverseAlgorithm,
  GigaverseAction,
  GigaverseActionType,
} from "../IGigaverseAlgorithm";
import { GigaverseRunState } from "../../simulator/GigaverseTypes";
import { GigaverseSimulator } from "../../simulator/GigaverseSimulator";
import { CustomLogger } from "../../types/CustomLogger";
import { defaultLogger } from "../../utils/defaultLogger";
import cloneDeep from "lodash/cloneDeep";
import { defaultEvaluate } from "../defaultEvaluate";

export interface DPConfig {
  maxHorizon: number;
  evaluateFn?: (state: GigaverseRunState) => number;
}

interface DPResult {
  bestValue: number;
  bestAction: GigaverseAction | null;
}

export class DPAlgorithm implements IGigaverseAlgorithm {
  private config: Required<DPConfig>;
  private simulator: GigaverseSimulator;
  private memo: Map<string, DPResult>;
  private logger: CustomLogger;

  constructor(config: DPConfig, logger?: CustomLogger) {
    this.config = {
      maxHorizon: config.maxHorizon,
      evaluateFn: config.evaluateFn ?? defaultEvaluate,
    };
    this.logger = logger ?? defaultLogger;
    this.simulator = new GigaverseSimulator(this.logger);
    this.memo = new Map();

    this.logger.info(
      `[DPAlgorithm] Initialized => maxHorizon=${this.config.maxHorizon} (Smart Synergy Enabled)`
    );
  }

  public pickAction(state: GigaverseRunState): GigaverseAction {
    // Her hamlede hafızayı temizle (state çok değiştiği için)
    this.memo.clear();
    
    const result = this.dpSearch(state, this.config.maxHorizon);
    
    if (!result.bestAction) {
      this.logger.warn("[DPAlgorithm] No best action => fallback=MOVE_ROCK");
      return { type: GigaverseActionType.MOVE_ROCK };
    }
    
    this.logger.debug(
      `[DPAlgorithm] bestAction => ${result.bestAction.type}, value=${result.bestValue.toFixed(2)}`
    );
    return result.bestAction;
  }

  private dpSearch(state: GigaverseRunState, depth: number): DPResult {
  // 1) Terminal / base case
  if (
    depth <= 0 ||
    state.player.health.current <= 0 ||
    state.currentEnemyIndex >= state.enemies.length
  ) {
    return { bestValue: this.config.evaluateFn(state), bestAction: null };
  }

  // 2) LOOT PHASE: tamamen bağımsız, geleceğe bakma
  if (state.lootPhase && state.lootOptions && state.lootOptions.length > 0) {
    let bestVal = -Infinity;
    let bestAct: GigaverseAction | null = null;

    const actions = this.getPossibleActions(state);
    for (const act of actions) {
      const lootIdx = this.getLootIndexFromAction(act);
      if (lootIdx < 0 || !state.lootOptions[lootIdx]) continue;

      // Yalnızca anlık synergy skoru kullan
      const score = this.getLootSynergyScore(state, state.lootOptions[lootIdx]);

      if (score > bestVal) {
        bestVal = score;
        bestAct = act;
      }
    }

    return { bestValue: bestVal, bestAction: bestAct };
  }

  // 3) Normal DP (combat) — memoization ile
  const key = this.buildStateKey(state, depth);
  if (this.memo.has(key)) {
    return this.memo.get(key)!;
  }

  const actions = this.getPossibleActions(state);
  if (actions.length === 0) {
    const val = this.config.evaluateFn(state);
    const r: DPResult = { bestValue: val, bestAction: null };
    this.memo.set(key, r);
    return r;
  }

  let bestVal = -Infinity;
  let bestAct: GigaverseAction | null = null;

  for (const act of actions) {
    // clone state and simulate action
    const newSt = cloneDeep(state);
    this.simulator.applyAction(newSt, act);

    // if the simulator doesn't advance dead enemies automatically
    const enemy = newSt.enemies[newSt.currentEnemyIndex];
    if (enemy && enemy.health.current <= 0) {
      newSt.currentEnemyIndex++;
    }

    // recurse
    const sub = this.dpSearch(newSt, depth - 1);

    // total score = future value (we intentionally do NOT add loot heuristic here,
    // because loot decisions are handled only in lootPhase above)
    const totalScore = sub.bestValue;

    if (totalScore > bestVal) {
      bestVal = totalScore;
      bestAct = act;
    }
  }

  const res: DPResult = { bestValue: bestVal, bestAction: bestAct };
  this.memo.set(key, res);
  return res;
}


/**
 * Sade, doğru ve mantıklı loot seçimi.
 * Full can → heal alınmaz
 * Max HP / Max Armor → her zaman alınabilir
 */
// --- TABLO BAZLI (TIER LIST) PUANLAMA MOTORU ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const type = loot.boonTypeString;
    
    // Değeri al (Saldırı veya Defans)
    const isAtk = (loot.selectedVal1 || 0) > 0;
    const val = isAtk ? loot.selectedVal1 : loot.selectedVal2;

    // --- TABLO: STAT DEĞERİNE GÖRE PUAN (BASE SCORE TABLE) ---
    // Bu tablo sayesinde +7'nin değeri +4'ten kat kat fazla olur.
    // +1'in değeri ise diplerde olur.
    let baseScore = 0;
    if (val <= 1) baseScore = 5;          // Çöp
    else if (val === 2) baseScore = 200;  // İdare Eder
    else if (val === 3) baseScore = 500;  // İyi
    else if (val === 4) baseScore = 1200; // Çok İyi
    else if (val === 5) baseScore = 2500; // Harika
    else if (val >= 6) baseScore = 10000; // Efsanevi (Kesin Al)

    let finalScore = 0;

    switch (type) {
      // --- CAN YÖNETİMİ ---
      case "Heal": {
        const missingHealth = p.health.max - p.health.current;
        const healAmount = val; // Heal için val1 kullanılıyor
        
        if (missingHealth <= 0) return -5000; // Can full ise ALMA
        
        // Heal için özel tablo: Ne kadar çok heal, o kadar iyi ama aciliyete bağlı.
        const effectiveHeal = Math.min(missingHealth, healAmount);
        
        // Aciliyet Çarpanı
        let urgency = 1;
        const hpPercent = p.health.current / p.health.max;
        if (hpPercent < 0.30) urgency = 20;      // Ölüyoruz
        else if (hpPercent < 0.50) urgency = 5;  // Lazım
        else urgency = 0.5;                      // Keyfi

        // Heal Formülü: (Miktar * 50) * Aciliyet
        // Örn: +6 Heal, Acil Durumda -> 300 * 20 = 6000 Puan (Her silahı geçer)
        finalScore = effectiveHeal * 50 * urgency;
        break;
      }
  
      // --- MAX HP (TIER S) ---
      case "AddMaxHealth": {
        // Can her şeyden değerlidir. Tablo puanını x2 yap.
        // +2 Health -> 200 * 2 = 400 Puan.
        // +7 Health -> 10000 * 2 = 20000 Puan.
        finalScore = baseScore * 2.0; 
        break;
      }
  
      // --- MAX ARMOR (TIER A) ---
      case "AddMaxArmor": {
        // Zırh çok değerlidir. Tablo puanını x1.8 yap.
        // +2 Armor -> 200 * 1.8 = 360 Puan.
        finalScore = baseScore * 1.8;
        break;
      }
  
      // --- SİLAHLAR ---
      case "UpgradeRock":
      case "UpgradePaper":
      case "UpgradeScissor": {
        let buildMultiplier = 1.0;
        let charges = 0;

        if (type === "UpgradeRock") {
            charges = p.rock.currentCharges;
            buildMultiplier = 2.0; // Favori
        } else if (type === "UpgradePaper") {
            charges = p.paper.currentCharges;
            buildMultiplier = 2.0; // Favori
        } else if (type === "UpgradeScissor") {
            charges = p.scissor.currentCharges;
            buildMultiplier = 0.5; // Zayıf
        }

        // Mermi Etkisi: Mermimiz varsa silahın değeri biraz artar (x1.2), yoksa düşer (x0.8)
        let chargeBonus = (charges > 0) ? 1.2 : 0.8;

        // Silah Puanı: Tablo Puanı * Build * Mermi
        // +2 Kılıç (Favori, Mermili) -> 200 * 2.0 * 1.2 = 480 Puan.
        // +3 Kılıç -> 500 * 2.0 * 1.2 = 1200 Puan.
        finalScore = baseScore * buildMultiplier * chargeBonus;
        
        break;
      }

      default:
        finalScore = 20; 
        break;
    }
  
    return finalScore;
  }


  // Action tipinden Loot indexini bulur (0, 1, 2, 3)
  private getLootIndexFromAction(act: GigaverseAction): number {
      switch(act.type) {
          case GigaverseActionType.PICK_LOOT_ONE: return 0;
          case GigaverseActionType.PICK_LOOT_TWO: return 1;
          case GigaverseActionType.PICK_LOOT_THREE: return 2;
          case GigaverseActionType.PICK_LOOT_FOUR: return 3;
          default: return -1;
      }
  }

  private getPossibleActions(state: GigaverseRunState): GigaverseAction[] {
    if (state.lootPhase && state.lootOptions.length > 0) {
      const acts: GigaverseAction[] = [];
      for (let i = 0; i < state.lootOptions.length; i++) {
        switch (i) {
          case 0: acts.push({ type: GigaverseActionType.PICK_LOOT_ONE }); break;
          case 1: acts.push({ type: GigaverseActionType.PICK_LOOT_TWO }); break;
          case 2: acts.push({ type: GigaverseActionType.PICK_LOOT_THREE }); break;
          case 3: acts.push({ type: GigaverseActionType.PICK_LOOT_FOUR }); break;
        }
      }
      return acts;
    }

    const p = state.player;
    const result: GigaverseAction[] = [];
    if (p.rock.currentCharges > 0) result.push({ type: GigaverseActionType.MOVE_ROCK });
    if (p.paper.currentCharges > 0) result.push({ type: GigaverseActionType.MOVE_PAPER });
    if (p.scissor.currentCharges > 0) result.push({ type: GigaverseActionType.MOVE_SCISSOR });
    
    // Mermi yoksa mecburen Rock (Fallback)
    if (result.length === 0) result.push({ type: GigaverseActionType.MOVE_ROCK });
    
    return result;
  }

  private buildStateKey(state: GigaverseRunState, depth: number): string {
    // JSON.stringify yerine manuel string birleştirme (PERFORMANS BOOST)
    const p = state.player;
    
    // Sadece karar için kritik olan verileri anahtara ekliyoruz.
    // Loot seçeneklerini de anahtara eklemeliyiz ki loot phase'de saçmalamasın.
    let lootKey = "";
    if (state.lootPhase) {
        lootKey = state.lootOptions.map(l => l.boonTypeString + l.selectedVal1).join("-");
    }

    return `${depth}|${state.currentEnemyIndex}|${p.health.current}|${p.armor.current}|` +
           `${p.rock.currentCharges}-${p.rock.currentATK}|` +
           `${p.paper.currentCharges}-${p.paper.currentATK}|` +
           `${p.scissor.currentCharges}-${p.scissor.currentATK}|` +
           `${lootKey}`;
  }
}

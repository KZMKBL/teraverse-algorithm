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
    // 1. Bitiş Koşulları
    if (
      depth <= 0 ||
      state.player.health.current <= 0 ||
      state.currentEnemyIndex >= state.enemies.length
    ) {
      return { bestValue: this.config.evaluateFn(state), bestAction: null };
    }

    // 2. Memoization (Hafıza Kontrolü)
    const key = this.buildStateKey(state, depth);
    if (this.memo.has(key)) {
      return this.memo.get(key)!;
    }

    // 3. Olası Hamleleri Bul
    const actions = this.getPossibleActions(state);
    if (actions.length === 0) {
      return { bestValue: this.config.evaluateFn(state), bestAction: null };
    }

    let bestVal = -Infinity;
    let bestAct: GigaverseAction | null = null;

    // 4. Tüm Hamleleri Dene
    for (const act of actions) {
      const newSt = cloneDeep(state);
      this.simulator.applyAction(newSt, act);

      // Düşman öldü mü? Sonraki düşmana geç (Simülatör bunu yapmıyorsa manuel yapıyoruz)
      const enemy = newSt.enemies[newSt.currentEnemyIndex];
      if (enemy && enemy.health.current <= 0) {
        newSt.currentEnemyIndex++;
      }

      // --- SİNERJİ & ZEKA BONUSU ---
      // Simülasyon sonucuna ek olarak, "bu hamle mantıklı mı?" puanı ekliyoruz.
      let heuristicBonus = 0;
      if (state.lootPhase) {
        const lootIndex = this.getLootIndexFromAction(act);
        if (lootIndex !== -1 && state.lootOptions[lootIndex]) {
            heuristicBonus = this.getLootSynergyScore(state, state.lootOptions[lootIndex]);
        }
      }
      // -----------------------------

      const sub = this.dpSearch(newSt, depth - 1);
      
      // Toplam Puan = (Gelecekteki Durum Puanı) + (Anlık Zeka Bonusu)
      const totalScore = sub.bestValue + heuristicBonus;

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
   * Loot seçimlerinde botun IQ'sunu ve "Build" tercihini belirleyen fonksiyon.
   * Rock/Paper tercih eder, Scissor'dan kaçınır.
   */
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const type = loot.boonTypeString;
    let score = 0;
  
    switch (type) {
      // --- CAN YÖNETİMİ ---
      case "Heal": {
        const missingHealth = p.health.max - p.health.current;
        const healAmount = loot.selectedVal1 || 0;
        if (missingHealth <= 0) return -5000;
        
        const effectiveHeal = Math.min(missingHealth, healAmount);
        const urgencyMult = p.health.max / Math.max(1, p.health.current); 
        
        score += effectiveHeal * 5 * urgencyMult;
        break;
      }
  
      case "AddMaxHealth": {
        // ESKİ: * 15 -> YENİ: * 40
        // Max HP çok değerlidir, upgrade'e kolay kolay değişilmez.
        score += (loot.selectedVal1 || 0) * 40; 
        break;
      }
  
      case "AddMaxArmor": {
        // ESKİ: * 20 -> YENİ: * 60
        // Armor oyundaki en kral stat olabilir (hasarı direkt düşüyor).
        // +4 Armor (240 Puan), +3 Sword Def'i artık rahatça yener.
        score += (loot.selectedVal1 || 0) * 60;
        break;
      }
  
      // --- SALDIRI / SAVUNMA GELİŞTİRMELERİ ---
      case "UpgradeRock":
      case "UpgradePaper":
      case "UpgradeScissor": {
        const isAtk = (loot.selectedVal1 || 0) > 0;
        const val = isAtk ? loot.selectedVal1 : loot.selectedVal2;
  
        let charges = 0;
        let currentStat = 0;
        let buildMultiplier = 1.0;

        if (type === "UpgradeRock") {
            charges = p.rock.currentCharges;
            currentStat = isAtk ? p.rock.currentATK : p.rock.currentDEF;
            buildMultiplier = 2.0; // Favori
        } else if (type === "UpgradePaper") {
            charges = p.paper.currentCharges;
            currentStat = isAtk ? p.paper.currentATK : p.paper.currentDEF;
            buildMultiplier = 2.0; // Favori
        } else if (type === "UpgradeScissor") {
            charges = p.scissor.currentCharges;
            currentStat = isAtk ? p.scissor.currentATK : p.scissor.currentDEF;
            buildMultiplier = 0.3; // Zayıf
        }
  
        if (charges > 0) {
            // DÜZELTME BURADA:
            // Eskiden "charges" ile direkt çarpıyorduk (10 mermi varsa x10 puan).
            // Şimdi "Effective Charges" kullanıyoruz. En fazla 6 mermi varmış gibi davran.
            // Böylece mermi sayısı sonsuza gitse bile puan patlaması yaşanmaz.
            const effectiveChargeImpact = Math.min(charges, 6); 
            
            // Çarpanı da 5'ten 4'e çektim. 
            score += val * effectiveChargeImpact * 4 * buildMultiplier;
            
            // Mevcut stat bonusunu biraz düşürdük.
            score += currentStat * 1 * buildMultiplier;
        } else {
            score += val * 1 * buildMultiplier;
        }
        break;
      }

      default:
        score += 20; 
        break;
    }
  
    return score;
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

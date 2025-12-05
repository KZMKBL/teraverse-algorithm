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
      // ---------------------------------------------------------
      // 1. CAN YÖNETİMİ (Artık daha "Cesur")
      // ---------------------------------------------------------
      case "Heal": {
        const missingHealth = p.health.max - p.health.current;
        const hpPercent = p.health.current / p.health.max; // 0.0 ile 1.0 arası
        const healAmount = loot.selectedVal1 || 0;
  
        // KURAL 1: Canın %60'ın üzerindeyse Heal alma, git güçlen!
        if (hpPercent > 0.60) {
            return -200; // Caydırıcı puan
        }
        
        if (missingHealth <= 0) return -5000;
  
        const effectiveHeal = Math.min(missingHealth, healAmount);
        
        // KURAL 2: Sadece can kritikse (%35 altı) yüksek puan ver (Panik Modu)
        // Can %50 civarıysa düşük puan ver.
        let urgency = 1;
        if (hpPercent < 0.35) urgency = 10; // Ölüyoruz!
        else urgency = 2; // İdare ederiz.
  
        score += effectiveHeal * urgency;
        break;
      }
  
      case "AddMaxHealth": {
        // Max HP değerlidir ama hasar kadar değil. Puanı makul tutuyoruz.
        // +2 MaxHP => 50 Puan
        score += (loot.selectedVal1 || 0) * 25; 
        break;
      }
  
      case "AddMaxArmor": {
        // ESKİ: *60 -> YENİ: *30
        // +1 Armor artık sadece 30 puan. 
        // Böylece +3 Sword Def (Build bonuslarıyla 100+ puan) onu rahatça geçer.
        score += (loot.selectedVal1 || 0) * 30;
        break;
      }
  
      // ---------------------------------------------------------
      // 2. BUILD STRATEJİSİ & DOYGUNLUK KONTROLÜ
      // ---------------------------------------------------------
      case "UpgradeRock":
      case "UpgradePaper":
      case "UpgradeScissor": {
        const isAtk = (loot.selectedVal1 || 0) > 0;
        const val = isAtk ? loot.selectedVal1 : loot.selectedVal2;
  
        let charges = 0;
        let currentStat = 0;
        let buildMultiplier = 1.0;

        // Element Kontrolü
        if (type === "UpgradeRock") {
            charges = p.rock.currentCharges;
            currentStat = isAtk ? p.rock.currentATK : p.rock.currentDEF;
            buildMultiplier = 2.5; // Rock çok önemli (x2.5 yaptık)
        } else if (type === "UpgradePaper") {
            charges = p.paper.currentCharges;
            currentStat = isAtk ? p.paper.currentATK : p.paper.currentDEF;
            buildMultiplier = 2.5; // Paper çok önemli
        } else if (type === "UpgradeScissor") {
            charges = p.scissor.currentCharges;
            currentStat = isAtk ? p.scissor.currentATK : p.scissor.currentDEF;
            buildMultiplier = 0.2; // Scissor çöp (iyice düşürdük)
        }

        // --- DEFANS İÇİN "DOYGUNLUK" (CAP) KONTROLÜ ---
        // Eğer Defans Upgrade'i ise ve zaten Max Armor'a ulaştıysak değeri düşmeli.
        let usefulness = 1.0;
        if (!isAtk) { // Eğer bu bir DEF geliştirmesi ise
            const currentTotalDef = currentStat; // Kabaca o anki defansımız
            const maxArmor = p.armor.max;
            
            // Eğer kartın defansı zaten Max Armor'dan büyükse, daha fazla Def
            // eklemek o kadar da kritik değildir (Yine de iyidir ama öncelik azalır).
            // Ama senin örneğindeki gibi (Def 9 < Armor 16) ise, çok değerlidir.
            if (currentTotalDef < maxArmor) {
                usefulness = 2.0; // Kapasite dolana kadar DEF bas!
            } else {
                usefulness = 0.8; // Zaten taşıyor, belki başka şeye bakarız.
            }
        }
        // ---------------------------------------------
  
        if (charges > 0) {
            // Mermi limiti (Cap) 6. 
            const effectiveChargeImpact = Math.min(charges, 6); 
            
            // Formül: Değer * Mermi * 5 * BuildTorpili * İşeYarama
            score += val * effectiveChargeImpact * 5 * buildMultiplier * usefulness;
            
            // Mevcut statı da hafif ödüllendir (Stacking)
            score += currentStat * 1 * buildMultiplier;
        } else {
            // Mermi yoksa düşük puan
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

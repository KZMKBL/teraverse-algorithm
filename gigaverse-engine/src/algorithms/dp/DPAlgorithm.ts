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
      // 1. CAN YÖNETİMİ (Heal vs Max HP Dengesi)
      // ---------------------------------------------------------
      case "Heal": {
        const missingHealth = p.health.max - p.health.current;
        const hpPercent = p.health.current / p.health.max; 
        const healAmount = loot.selectedVal1 || 0;
  
        // Can %75 üzeriyse ASLA Heal alma.
        if (hpPercent > 0.75) return -1000; 
        // Can %60 üzeriyse Heal alma, çok kötü bir seçenek değilse.
        if (hpPercent > 0.60) return -100; 
        
        if (missingHealth <= 0) return -5000;
  
        const effectiveHeal = Math.min(missingHealth, healAmount);
        
        // Aciliyet: Can %40 altıysa panik modu.
        let urgency = 1;
        if (hpPercent < 0.40) urgency = 10; 
        else urgency = 2;
  
        score += effectiveHeal * urgency;
        break;
      }
  
      case "AddMaxHealth": {
        const val = loot.selectedVal1 || 0;
        
        // --- TIER BONUSU (YENİ) ---
        // +2 Health iyidir, ama +4 Health MUHTEŞEMDİR.
        // Düz mantık (val * 40) yerine, büyük sayılara ekstra ödül veriyoruz.
        let rarityBonus = 0;
        if (val >= 4) rarityBonus = 100; // +4 ve üzeri gelirse kaçırma!
        
        // Base puan: 40. (+2 Health = 80 Puan)
        // +4 Health = 160 + 100 = 260 Puan (Sword +2'yi ezer geçer)
        score += (val * 40) + rarityBonus; 
        break;
      }
  
      case "AddMaxArmor": {
        const val = loot.selectedVal1 || 0;

        // Armor oyundaki en değerli stat. Base puanı: 45.
        // +1 Armor = 45 Puan.
        // +2 Armor = 90 Puan. (Sword +2'yi ucu ucuna geçer)
        
        // --- TIER BONUSU ---
        let rarityBonus = 0;
        if (val >= 3) rarityBonus = 50;
        if (val >= 5) rarityBonus = 150; // +5 Armor gelirse her şeyi bırak al.

        // Örnek: +5 Armor = (5*45) + 150 = 375 Puan. (Sword Def +1'in esamesi okunmaz)
        score += (val * 45) + rarityBonus;
        break;
      }
  
      // ---------------------------------------------------------
      // 2. SİLAH GELİŞTİRMELERİ (Daha Dengeli)
      // ---------------------------------------------------------
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
            // ESKİ: 2.5 -> YENİ: 1.8 
            // Torpili azalttık. Artık Armor +2 varken Sword +2'ye atlamaz.
            buildMultiplier = 1.8; 
        } else if (type === "UpgradePaper") {
            charges = p.paper.currentCharges;
            currentStat = isAtk ? p.paper.currentATK : p.paper.currentDEF;
            // ESKİ: 2.5 -> YENİ: 1.8
            buildMultiplier = 1.8; 
        } else if (type === "UpgradeScissor") {
            charges = p.scissor.currentCharges;
            currentStat = isAtk ? p.scissor.currentATK : p.scissor.currentDEF;
            buildMultiplier = 0.1; // Scissor hala çöp.
        }

        // --- DEFANS CAP KONTROLÜ ---
        let usefulness = 1.0;
        if (!isAtk) { 
            const maxArmor = p.armor.max;
            if (currentStat < maxArmor) usefulness = 1.4; 
            else usefulness = 0.7;
        }

        // --- "+1 ÇÖPÜ" KONTROLÜ ---
        let lowValuePenalty = 1.0;
        if (val === 1) lowValuePenalty = 0.5; // +1 ise puanı yarıla.

        if (charges > 0) {
            // Mermi etkisini max 6 ile sınırla.
            const effectiveChargeImpact = Math.min(charges, 6); 
            
            // Formül: Val * Charges * 4 (Base) * Build * Usefulness * Penalty
            // Çarpanı 5'ten 4'e çektim. Silahlar statlara göre bir tık daha az puan versin.
            score += val * effectiveChargeImpact * 4 * buildMultiplier * usefulness * lowValuePenalty;
            
            // Mevcut stat bonusu (Stacking)
            score += currentStat * 1 * buildMultiplier;
        } else {
            // Mermi yoksa base yatırım puanı
            score += val * 4 * buildMultiplier * lowValuePenalty;
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

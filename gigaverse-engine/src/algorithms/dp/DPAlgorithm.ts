// path: gigaverse-engine/src/algorithms/dp/DPAlgorithm.ts
/**
 * A Probabilistic DP approach (Expectimax).
 * Instead of relying on a random simulator, it calculates the
 * "Weighted Average Outcome" against all possible enemy moves.
 */

import {
  IGigaverseAlgorithm,
  GigaverseAction,
  GigaverseActionType,
} from "../IGigaverseAlgorithm";
import { 
  GigaverseRunState, 
  GigaverseFighter,
  GigaverseMoveState 
} from "../../simulator/GigaverseTypes";
import { CustomLogger } from "../../types/CustomLogger";
import { defaultLogger } from "../../utils/defaultLogger";
import cloneDeep from "lodash/cloneDeep";
import { defaultEvaluate } from "../defaultEvaluate";

export interface DPConfig {
  maxHorizon: number; // Tavsiye: Expectimax daha ağırdır, bunu 4-5 civarı tut.
  evaluateFn?: (state: GigaverseRunState) => number;
}

interface DPResult {
  bestValue: number;
  bestAction: GigaverseAction | null;
}

// Oyundaki Hamle Tipleri (Logic için gerekli)
enum MoveType {
  ROCK = "rock",
  PAPER = "paper",
  SCISSOR = "scissor",
}

export class DPAlgorithm implements IGigaverseAlgorithm {
  private config: Required<DPConfig>;
  private memo: Map<string, DPResult>;
  private logger: CustomLogger;

  constructor(config: DPConfig, logger?: CustomLogger) {
    this.config = {
      maxHorizon: config.maxHorizon,
      evaluateFn: config.evaluateFn ?? defaultEvaluate,
    };
    this.logger = logger ?? defaultLogger;
    this.memo = new Map();

    this.logger.info(
      `[DPAlgorithm] Initialized Expectimax => maxHorizon=${this.config.maxHorizon}`
    );
  }

  public pickAction(state: GigaverseRunState): GigaverseAction {
    this.memo.clear();
    
    // Loot Phase ise Expectimax yapmaya gerek yok, akıllı Loot fonksiyonu yeterli.
    if (state.lootPhase) {
        return this.pickBestLoot(state);
    }

    const result = this.expectimaxSearch(state, this.config.maxHorizon);
    
    if (!result.bestAction) {
      this.logger.warn("[DPAlgorithm] No best action => fallback=MOVE_ROCK");
      return { type: GigaverseActionType.MOVE_ROCK };
    }
    
    this.logger.debug(
      `[DPAlgorithm] bestAction => ${result.bestAction.type}, ExpectedValue=${result.bestValue.toFixed(2)}`
    );
    return result.bestAction;
  }

  // --- LOOT MANTIĞI (Önceki konuşmamızdan gelen mükemmel kod) ---
  private pickBestLoot(state: GigaverseRunState): GigaverseAction {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for(let i=0; i < state.lootOptions.length; i++) {
          const score = this.getLootSynergyScore(state, state.lootOptions[i]);
          if(score > bestScore) {
              bestScore = score;
              bestIdx = i;
          }
      }

      switch(bestIdx) {
          case 0: return { type: GigaverseActionType.PICK_LOOT_ONE };
          case 1: return { type: GigaverseActionType.PICK_LOOT_TWO };
          case 2: return { type: GigaverseActionType.PICK_LOOT_THREE };
          case 3: return { type: GigaverseActionType.PICK_LOOT_FOUR };
          default: return { type: GigaverseActionType.PICK_LOOT_ONE };
      }
  }

  // --- EXPECTIMAX ARAMA MOTORU ---
  private expectimaxSearch(state: GigaverseRunState, depth: number): DPResult {
    // 1. Bitiş Koşulları
    if (
      depth <= 0 ||
      state.player.health.current <= 0 ||
      state.currentEnemyIndex >= state.enemies.length
    ) {
      return { bestValue: this.config.evaluateFn(state), bestAction: null };
    }

    // 2. Memoization
    const key = this.buildStateKey(state, depth);
    if (this.memo.has(key)) {
      return this.memo.get(key)!;
    }

    // 3. Olası Hamlelerim (Sadece Savaş Hamleleri)
    const myActions = this.getCombatActions(state);
    if (myActions.length === 0) {
       // Mermi yoksa Rock at (Fallback)
       return { bestValue: -Infinity, bestAction: { type: GigaverseActionType.MOVE_ROCK } }; 
    }

    let bestVal = -Infinity;
    let bestAct: GigaverseAction | null = null;

    // 4. Her Hamlemi Dene
    for (const myAct of myActions) {
      // Bu hamlenin "Beklenen Değerini" (Expected Value) hesapla
      const expectedValue = this.calculateExpectedValue(state, myAct, depth);

      if (expectedValue > bestVal) {
        bestVal = expectedValue;
        bestAct = myAct;
      }
    }

    const res: DPResult = { bestValue: bestVal, bestAction: bestAct };
    this.memo.set(key, res);
    return res;
  }

  /**
   * Bir hamlenin değerini hesaplarken düşmanın TÜM olasılıklarına bakar.
   * Düşman Taş atarsa puanım ne olur? Kağıt atarsa ne olur?
   * Hepsini olasılıklarına göre ağırlıklandırıp toplar.
   */
  private calculateExpectedValue(state: GigaverseRunState, myAct: GigaverseAction, depth: number): number {
      const enemy = state.enemies[state.currentEnemyIndex];
      if (!enemy || enemy.health.current <= 0) return this.config.evaluateFn(state);

      // Düşmanın atabileceği hamleleri bul (Mermisi olanlar)
      const enemyMoves: MoveType[] = [];
      if (enemy.rock.currentCharges > 0) enemyMoves.push(MoveType.ROCK);
      if (enemy.paper.currentCharges > 0) enemyMoves.push(MoveType.PAPER);
      if (enemy.scissor.currentCharges > 0) enemyMoves.push(MoveType.SCISSOR);

      // Eğer düşmanın hiç mermisi yoksa (teorik olarak imkansız ama) Rock atar varsay
      if (enemyMoves.length === 0) enemyMoves.push(MoveType.ROCK);

      // Olasılık (Eşit dağılım varsayıyoruz - Random Simülatör gibi)
      const probability = 1.0 / enemyMoves.length;
      let totalWeightedScore = 0;

      // Benim hamlem ne? (Enum'a çevir)
      const myMove = this.actionToMoveType(myAct);

      // Düşmanın her olası hamlesi için bir "Paralel Evren" yarat
      for (const enemyMove of enemyMoves) {
          // Durumu kopyala (Hafif kopya yeterli değil, derin kopya lazım)
          const nextState = cloneDeep(state);
          
          // O evrende savaşı simüle et (Deterministically!)
          this.applyRoundOutcome(nextState, myMove, enemyMove);

          // Düşman öldü mü?
          const nextEnemy = nextState.enemies[nextState.currentEnemyIndex];
          if (nextEnemy && nextEnemy.health.current <= 0) {
              nextState.currentEnemyIndex++;
          }

          // Geleceğe git (Recursion)
          const subResult = this.expectimaxSearch(nextState, depth - 1);
          
          // Puanı olasılıkla çarpıp toplama ekle
          totalWeightedScore += (subResult.bestValue * probability);
      }

      return totalWeightedScore;
  }

  // --- FİZİK MOTORU (SİMÜLATÖRÜN KOPYASI AMA DETERMINISTIC) ---
  // Simülatördeki computeRoundOutcome ve applyDamage mantığını buraya gömdük.
  private applyRoundOutcome(state: GigaverseRunState, pMove: MoveType, eMove: MoveType) {
      const p = state.player;
      const e = state.enemies[state.currentEnemyIndex];

      // 1. Stats Çek
      const pStats = this.getStats(p, pMove);
      const eStats = this.getStats(e, eMove);

      // 2. Kazananı Belirle
      let pWins = false;
      let tie = (pMove === eMove);
      if (!tie) {
          if (
            (pMove === MoveType.ROCK && eMove === MoveType.SCISSOR) ||
            (pMove === MoveType.PAPER && eMove === MoveType.ROCK) ||
            (pMove === MoveType.SCISSOR && eMove === MoveType.PAPER)
          ) {
              pWins = true;
          }
      }

      // 3. Hasar ve Zırh Hesapla
      let dmgToE = 0, dmgToP = 0, armorGainP = 0, armorGainE = 0;

      if (tie) {
          dmgToE = pStats.currentATK;
          dmgToP = eStats.currentATK;
          armorGainP = pStats.currentDEF;
          armorGainE = eStats.currentDEF;
      } else if (pWins) {
          dmgToE = pStats.currentATK;
          armorGainP = pStats.currentDEF;
      } else { // Enemy Wins
          dmgToP = eStats.currentATK;
          armorGainE = eStats.currentDEF;
      }

      // 4. Hasarı Uygula (Önce Zırh, Sonra Can)
      this.applyDamage(p, dmgToP, armorGainP);
      this.applyDamage(e, dmgToE, armorGainE);

      // 5. Mermileri (Charges) Güncelle
      this.updateCharges(p, pMove);
      this.updateCharges(e, eMove);
  }

  private applyDamage(fighter: GigaverseFighter, incoming: number, armorGain: number) {
      // Armor Gain
      fighter.armor.current = Math.min(fighter.armor.current + armorGain, fighter.armor.max);
      
      // Damage Soak
      let dmg = incoming;
      if (fighter.armor.current > 0 && dmg > 0) {
          const absorb = Math.min(fighter.armor.current, dmg);
          fighter.armor.current -= absorb;
          dmg -= absorb;
      }
      // HP Hit
      if (dmg > 0) {
          fighter.health.current = Math.max(0, fighter.health.current - dmg);
      }
  }

  private updateCharges(f: GigaverseFighter, used: MoveType) {
      // Kullanılan azalır
      const st = this.getStats(f, used);
      if (st.currentCharges > 1) st.currentCharges--;
      else if (st.currentCharges === 1) st.currentCharges = -1; // Penalty

      // Kullanılmayanlar artar
      [MoveType.ROCK, MoveType.PAPER, MoveType.SCISSOR].forEach(m => {
          if (m !== used) {
              const s = this.getStats(f, m);
              if (s.currentCharges === -1) s.currentCharges = 0;
              else if (s.currentCharges >= 0 && s.currentCharges < 3) s.currentCharges++;
          }
      });
  }

  private getStats(f: GigaverseFighter, m: MoveType): GigaverseMoveState {
      switch(m) {
          case MoveType.ROCK: return f.rock;
          case MoveType.PAPER: return f.paper;
          case MoveType.SCISSOR: return f.scissor;
      }
  }

  // --- YARDIMCI FONKSİYONLAR ---

  private getCombatActions(state: GigaverseRunState): GigaverseAction[] {
      const p = state.player;
      const acts: GigaverseAction[] = [];
      if (p.rock.currentCharges > 0) acts.push({ type: GigaverseActionType.MOVE_ROCK });
      if (p.paper.currentCharges > 0) acts.push({ type: GigaverseActionType.MOVE_PAPER });
      if (p.scissor.currentCharges > 0) acts.push({ type: GigaverseActionType.MOVE_SCISSOR });
      return acts;
  }

  private actionToMoveType(act: GigaverseAction): MoveType {
      if (act.type === GigaverseActionType.MOVE_ROCK) return MoveType.ROCK;
      if (act.type === GigaverseActionType.MOVE_PAPER) return MoveType.PAPER;
      return MoveType.SCISSOR;
  }

  // --- DÜZELTİLMİŞ LOOT SİNERJİ MANTIĞI ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const type = loot.boonTypeString || ""; // Güvenlik için
    let score = 0;

    // --- İSİM EŞLEŞTİRME (STRING NORMALIZATION) ---
    // SDK bazen "UpgradeRock", bazen "UpgradeSword" diyebilir. Hepsini kapsayalım.
    const isHeal = type.includes("Heal") || type.includes("Potion");
    const isMaxHP = type.includes("AddMaxHealth") || type.includes("Vitality") || type.includes("Health");
    const isArmor = type.includes("AddMaxArmor") || type.includes("ShieldMax"); // ShieldMax ismini salladım ama armor stringi neyse o.
    
    const isRock = type.includes("UpgradeRock") || type.includes("UpgradeSword") || type.includes("Sword");
    const isPaper = type.includes("UpgradePaper") || type.includes("UpgradeShield") || type.includes("Shield");
    const isScissor = type.includes("UpgradeScissor") || type.includes("UpgradeSpell") || type.includes("UpgradeMagic") || type.includes("Spell");

    // 1. CAN YÖNETİMİ (Heal vs Max HP)
    if (isHeal && !isMaxHP) { // MaxHealth içinde "Health" geçtiği için karışmasın
        const missingHealth = p.health.max - p.health.current;
        const hpPercent = p.health.current / p.health.max;
        const healAmount = loot.selectedVal1 || 0;

        if (missingHealth <= 0) return -99999; // Can full ise alma
        if (hpPercent > 0.85) return -5000;   // Can %85 üstüyse alma

        const effectiveHeal = Math.min(missingHealth, healAmount);
        // Aciliyet Eğrisi: Can azaldıkça puan logaritmik artar
        const urgency = Math.pow(1 / Math.max(0.1, hpPercent), 2.5);
        
        score += effectiveHeal * urgency * 3;
        return score;
    }

    // 2. MAX HEALTH (Tier S Stat)
    if (isMaxHP) {
        const val = loot.selectedVal1 || 0;
        // ESKİ: (val * 40) idi.
        // YENİ: Health çok kritik, puanını artırıyoruz.
        // +2 Health = 120 Puan.
        // +7 Health = 420 + 300(Jackpot) = 720 Puan! (Hiçbir silah bunu geçemez)
        
        let jackpot = 0;
        if (val >= 4) jackpot = 150;
        if (val >= 6) jackpot = 300;

        score += (val * 60) + jackpot;
        return score;
    }

    // 3. MAX ARMOR (Tier S+ Stat)
    if (isArmor) {
        const val = loot.selectedVal1 || 0;
        // Armor en değerli stat.
        // +1 Armor = 70 Puan.
        // +5 Armor = 350 + 250 = 600 Puan.
        
        let jackpot = 0;
        if (val >= 3) jackpot = 100;
        if (val >= 5) jackpot = 250;

        score += (val * 70) + jackpot;
        return score;
    }

    // 4. SİLAH GELİŞTİRMELERİ (Nerflendi)
    if (isRock || isPaper || isScissor) {
        const isAtk = (loot.selectedVal1 || 0) > 0;
        const val = isAtk ? loot.selectedVal1 : loot.selectedVal2;

        let charges = 0;
        let currentStat = 0;
        let buildMultiplier = 1.0;

        // Elementleri Tanı
        if (isRock) {
            charges = p.rock.currentCharges;
            currentStat = isAtk ? p.rock.currentATK : p.rock.currentDEF;
            buildMultiplier = 1.5; // Rock seven bot
        } else if (isPaper) {
            charges = p.paper.currentCharges;
            currentStat = isAtk ? p.paper.currentATK : p.paper.currentDEF;
            buildMultiplier = 1.5; // Paper seven bot
        } else if (isScissor) {
            charges = p.scissor.currentCharges;
            currentStat = isAtk ? p.scissor.currentATK : p.scissor.currentDEF;
            buildMultiplier = 0.6; // Scissor (Spell) sevmeyen bot
        }

        // Defans Doygunluğu (Usefulness)
        let usefulness = 1.0;
        if (!isAtk) {
             // Eğer bu bir defans kartıysa ve defansımız zaten Max Armor'dan yüksekse
             // puanını kırıyoruz. Ama düşükse bonus veriyoruz.
             if (currentStat < p.armor.max) usefulness = 1.5; 
             else usefulness = 0.8;
        }

        // --- MATEMATİK DÜZELTMESİ ---
        // Eskiden: val^2 * 10 yapıyorduk. Bu çok fazlaydı.
        // Şimdi: val^2 * 4 yapıyoruz.
        // Örnek: Spell Def +2 (Scissor, Build 0.6)
        // Val=2 -> Pow=4.
        // Score = 4 * 4(Base) * 5(Charges) * 0.6(Build) * 1.5(Useful) = 72 Puan.
        // Health +7 Puanı = 720 Puan.
        // SONUÇ: 720 >>> 72. Bot Health alır. (DÜZELDİ)
        
        // Örnek: Spell Def +3
        // Val=3 -> Pow=9.
        // Score = 9 * 4 * 5 * 0.6 * 1.5 = 162 Puan.
        // Armor +5 Puanı = 600 Puan.
        // SONUÇ: 600 >>> 162. Bot Armor alır. (DÜZELDİ)

        const powerValue = Math.pow(val, 2);
        
        if (charges > 0) {
            const effectiveCharges = Math.min(charges, 5); // Max 5 mermi etkisi
            score += powerValue * 4 * effectiveCharges * buildMultiplier * usefulness;
            
            // Mevcut stat bonusu (stacking)
            score += currentStat * 2;
        } else {
            // Mermi yoksa düşük puan
            score += powerValue * 5 * buildMultiplier;
        }
        return score;
    }

    // Bilinmeyen eşya
    return 10;
  }

  private buildStateKey(state: GigaverseRunState, depth: number): string {
    const p = state.player;
    // Basit ve hızlı bir key
    return `${depth}|${state.currentEnemyIndex}|${p.health.current.toFixed(1)}|${p.armor.current}|` +
           `${p.rock.currentCharges}-${p.paper.currentCharges}-${p.scissor.currentCharges}`;
  }
}

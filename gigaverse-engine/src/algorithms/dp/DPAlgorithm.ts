// path: gigaverse-engine/src/algorithms/dp/DPAlgorithm.ts
/**
 * A Probabilistic DP approach (Expectimax).
 * Instead of relying on a random simulator, it calculates the
 * "Weighted Average Outcome" against all possible enemy moves.
 * * FEATURES:
 * - Expectimax Logic (No RNG dependence)
 * - Fast Cloning (Performance Boost)
 * - Robust Memoization (Enemy State Tracking)
 * - Smart Loot Filter (Case Insensitive + Trash Filter)
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
import { defaultEvaluate } from "../defaultEvaluate";

// Lodash cloneDeep yerine kendi fastClone fonksiyonumuzu kullanacağız.

export interface DPConfig {
  maxHorizon: number; 
  evaluateFn?: (state: GigaverseRunState) => number;
}

interface DPResult {
  bestValue: number;
  bestAction: GigaverseAction | null;
}

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
    // DERİNLİK AYARI BURADA:
    // Hız yaması sayesinde artık 4 yerine 6'ya rahatça çıkabiliriz.
    // Eğer config'den gelen değer 6'dan küçükse, biz onu 6'ya zorlayalım.
    const targetHorizon = Math.max(config.maxHorizon, 6);

    this.config = {
      maxHorizon: targetHorizon,
      evaluateFn: config.evaluateFn ?? defaultEvaluate,
    };
    this.logger = logger ?? defaultLogger;
    this.memo = new Map();

    this.logger.info(
      `[DPAlgorithm] Initialized Expectimax (Fast Mode) => maxHorizon=${this.config.maxHorizon}`
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

  // --- LOOT MANTIĞI ---
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

    // 3. Olası Hamlelerim
    const myActions = this.getCombatActions(state);
    if (myActions.length === 0) {
       return { bestValue: -Infinity, bestAction: { type: GigaverseActionType.MOVE_ROCK } }; 
    }

    let bestVal = -Infinity;
    let bestAct: GigaverseAction | null = null;

    // 4. Her Hamlemi Dene
    for (const myAct of myActions) {
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

  private calculateExpectedValue(state: GigaverseRunState, myAct: GigaverseAction, depth: number): number {
      const enemy = state.enemies[state.currentEnemyIndex];
      if (!enemy || enemy.health.current <= 0) return this.config.evaluateFn(state);

      // Düşmanın atabileceği hamleleri bul
      const enemyMoves: MoveType[] = [];
      if (enemy.rock.currentCharges > 0) enemyMoves.push(MoveType.ROCK);
      if (enemy.paper.currentCharges > 0) enemyMoves.push(MoveType.PAPER);
      if (enemy.scissor.currentCharges > 0) enemyMoves.push(MoveType.SCISSOR);

      if (enemyMoves.length === 0) enemyMoves.push(MoveType.ROCK);

      // Olasılık (Eşit dağılım)
      const probability = 1.0 / enemyMoves.length;
      let totalWeightedScore = 0;

      const myMove = this.actionToMoveType(myAct);

      // Düşmanın her olası hamlesi için paralel evren
      for (const enemyMove of enemyMoves) {
          // HIZ YAMASI: cloneDeep yerine fastClone kullanıyoruz
          const nextState = this.fastClone(state);
          
          // O evrende savaşı simüle et
          this.applyRoundOutcome(nextState, myMove, enemyMove);

          // Düşman öldü mü?
          const nextEnemy = nextState.enemies[nextState.currentEnemyIndex];
          if (nextEnemy && nextEnemy.health.current <= 0) {
              nextState.currentEnemyIndex++;
          }

          // Geleceğe git
          const subResult = this.expectimaxSearch(nextState, depth - 1);
          
          totalWeightedScore += (subResult.bestValue * probability);
      }

      return totalWeightedScore;
  }

  // --- PERFORMANS YAMASI (FAST CLONE) ---
  // Lodash kullanmak yerine JSON parse/stringify ile çok daha hızlı kopyalıyoruz.
  // Bu sayede derinliği 4'ten 6'ya çıkarabiliriz.
  private fastClone(state: GigaverseRunState): GigaverseRunState {
      return JSON.parse(JSON.stringify(state));
  }

  // --- FİZİK MOTORU (DETERMINISTIC) ---
  private applyRoundOutcome(state: GigaverseRunState, pMove: MoveType, eMove: MoveType) {
      const p = state.player;
      const e = state.enemies[state.currentEnemyIndex];

      const pStats = this.getStats(p, pMove);
      const eStats = this.getStats(e, eMove);

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

      this.applyDamage(p, dmgToP, armorGainP);
      this.applyDamage(e, dmgToE, armorGainE);

      this.updateCharges(p, pMove);
      this.updateCharges(e, eMove);
  }

  private applyDamage(fighter: GigaverseFighter, incoming: number, armorGain: number) {
      fighter.armor.current = Math.min(fighter.armor.current + armorGain, fighter.armor.max);
      
      let dmg = incoming;
      if (fighter.armor.current > 0 && dmg > 0) {
          const absorb = Math.min(fighter.armor.current, dmg);
          fighter.armor.current -= absorb;
          dmg -= absorb;
      }
      if (dmg > 0) {
          fighter.health.current = Math.max(0, fighter.health.current - dmg);
      }
  }

  private updateCharges(f: GigaverseFighter, used: MoveType) {
      const st = this.getStats(f, used);
      if (st.currentCharges > 1) st.currentCharges--;
      else if (st.currentCharges === 1) st.currentCharges = -1; 

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

 // --- FINAL FIX: STRING PARSING & SCORING ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();

    // ---------------------------------------------------------
    // 1. TİP AYRIŞTIRMA (GENİŞ KAPSAMLI)
    // ---------------------------------------------------------

    // MAX HEALTH TANIMI:
    // İçinde "health" geçecek VE ("max" VEYA "upgrade" VEYA "add") geçecek.
    // Örnek: "health upgrade", "addmaxhealth", "max hp"
    const isMaxHP = t.includes("health") && (t.includes("max") || t.includes("upgrade") || t.includes("add") || t.includes("upg"));

    // MAX ARMOR TANIMI:
    // İçinde "armor" geçecek. (Shield Upgrade ile karışmaması için Shield kelimesine bakmıyoruz burada)
    const isArmor = t.includes("armor"); // "armor upgrade", "maxarmor"

    // HEAL TANIMI:
    // "heal" veya "potion" geçecek AMA bu bir upgrade olmayacak.
    const isHeal = (t.includes("heal") || t.includes("potion")) && !isMaxHP && !isArmor;

    // SİLAHLAR:
    const isRock = t.includes("rock") || t.includes("sword") || t.includes("blade");
    
    // Paper (Shield Item): "Shield" geçecek AMA "Armor" geçmeyecek (Max armor ile karışmasın diye)
    const isPaper = t.includes("paper") || (t.includes("shield") && !t.includes("armor"));
    
    const isScissor = t.includes("scissor") || t.includes("spell") || t.includes("magic");

    // ---------------------------------------------------------
    // 2. PUANLAMA MANTIĞI
    // ---------------------------------------------------------

    // === DURUM A: HEAL (İYİLEŞTİRME) ===
    if (isHeal) {
        const current = p.health.current;
        const max = p.health.max;
        const missing = max - current;

        // Eksik can 1'den azsa (Full), ASLA ALMA.
        if (missing < 1) return -999999; 
        
        // Can %85 üzerindeyse alma.
        if (current / max > 0.85) return -5000;

        const healAmount = loot.selectedVal1 || 0;
        const effectiveHeal = Math.min(missing, healAmount);
        
        const hpPercent = current / max;
        let urgency = 0;
        if (hpPercent < 0.30) urgency = 50;      // ÖLÜM KALIM
        else if (hpPercent < 0.50) urgency = 10; // İHTİYAÇ
        else urgency = 1;                        // Keyfi

        return effectiveHeal * urgency * 5;
    }

    // === DURUM B: MAX HEALTH (KALICI STAT - TIER S) ===
    if (isMaxHP) {
        const val = loot.selectedVal1 || 0;
        // PUAN ARTIRILDI:
        // +2 Health = 300 Puan.
        // +4 Health = 600 + 500(Jackpot) = 1100 Puan.
        // Bunu geçebilecek bir silah yok.
        let jackpot = 0;
        if (val >= 4) jackpot = 500;
        
        return (val * 150) + jackpot;
    }

    // === DURUM C: MAX ARMOR (KALICI STAT - TIER S) ===
    if (isArmor) {
        const val = loot.selectedVal1 || 0;
        // PUAN ARTIRILDI:
        // +2 Armor = 240 Puan.
        let jackpot = 0;
        if (val >= 3) jackpot = 400;

        return (val * 120) + jackpot;
    }

    // === DURUM D: SİLAH GELİŞTİRMELERİ ===
    if (isRock || isPaper || isScissor) {
        const isAtk = (loot.selectedVal1 || 0) > 0;
        const val = isAtk ? loot.selectedVal1 : loot.selectedVal2;

        // --- HARDCORE ÇÖP FİLTRESİ ---
        // +1 Eşyaları neredeyse yok sayıyoruz. (0.1 Katsayı)
        // Böylece +1 Kılıç (Puanı 2-3 olur), +2 Can'ı (Puanı 300) asla yenemez.
        let lowTierPenalty = 1.0;
        if (val === 1) lowTierPenalty = 0.1; 

        let charges = 0;
        let currentStat = 0;
        let buildMultiplier = 1.0;

        if (isRock) {
            charges = p.rock.currentCharges;
            currentStat = isAtk ? p.rock.currentATK : p.rock.currentDEF;
            buildMultiplier = 1.5; 
        } else if (isPaper) {
            charges = p.paper.currentCharges;
            currentStat = isAtk ? p.paper.currentATK : p.paper.currentDEF;
            buildMultiplier = 1.5; 
        } else if (isScissor) {
            charges = p.scissor.currentCharges;
            currentStat = isAtk ? p.scissor.currentATK : p.scissor.currentDEF;
            buildMultiplier = 0.7; 
        }

        // --- DOYGUNLUK KONTROLÜ ---
        let usefulness = 1.0;
        if (isAtk) {
            // Zırh doluyken saldırıya aban (Comfort Zone)
            const armorPercent = p.armor.max > 0 ? p.armor.current / p.armor.max : 0;
            if (armorPercent > 0.9) usefulness = 1.8;
            else usefulness = 1.2;
        } else {
            // Defans eşyası
            if (currentStat < p.armor.max) usefulness = 1.5; 
            else usefulness = 0.8;
        }

        const powerValue = Math.pow(val, 2);
        let finalScore = 0;
        
        if (charges > 0) {
            const effectiveCharges = Math.min(charges, 5);
            // +3 Silah = 9 * 5 * 5 * 1.5 = ~337 Puan (Health +2 ile yarışır)
            // +1 Silah = 1 * 5 * 5 * 1.5 = 37 Puan -> Penalty(0.1) -> 3.7 Puan. (ÇÖP)
            finalScore = powerValue * 5 * effectiveCharges * buildMultiplier * usefulness + (currentStat * 2);
        } else {
            finalScore = powerValue * 5 * buildMultiplier;
        }

        return finalScore * lowTierPenalty;
    }

    // Bilinmeyen eşya
    return 0;
  }

  // --- HAFIZA ANAHTARI (ROBUST KEY) ---
  // Düşmanın durumunu da kaydeder, böylece farklı düşmanlar karışmaz.
  private buildStateKey(state: GigaverseRunState, depth: number): string {
    const p = state.player;
    const e = state.enemies[state.currentEnemyIndex]; 
    
    if (!e || e.health.current <= 0) {
        return `END|${depth}|${p.health.current}|${state.currentEnemyIndex}`;
    }

    const playerKey = `${p.health.current.toFixed(1)}|${p.armor.current}|` +
           `${p.rock.currentCharges}-${p.rock.currentATK}-${p.rock.currentDEF}|` +
           `${p.paper.currentCharges}-${p.paper.currentATK}-${p.paper.currentDEF}|` +
           `${p.scissor.currentCharges}-${p.scissor.currentATK}-${p.scissor.currentDEF}`;

    const enemyKey = `${e.health.current.toFixed(1)}|${e.armor.current}|` +
           `${e.rock.currentCharges}-${e.rock.currentATK}-${e.rock.currentDEF}|` +
           `${e.paper.currentCharges}-${e.paper.currentATK}-${e.paper.currentDEF}|` +
           `${e.scissor.currentCharges}-${e.scissor.currentATK}-${e.scissor.currentDEF}`;

    return `${depth}|${state.currentEnemyIndex}|${playerKey}|VS|${enemyKey}`;
  }
}

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

  // --- FINAL DÜZELTİLMİŞ LOOT SİNERJİ MANTIĞI (CASE INSENSITIVE) ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    // Her şeyi küçük harfe çevirip güvenli hale getiriyoruz.
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();

    // 1. TİP AYRIŞTIRMA (Hassas ve Kapsayıcı)
    
    // Max Health: "maxhealth", "vitality", "hp" (ama "heal" değil)
    // "AddMaxHealth" -> içinde "maxhealth" var.
    const isMaxHP = t.includes("maxhealth") || t.includes("addmaxhp") || (t.includes("health") && t.includes("max"));
    
    // Max Armor: "maxarmor", "addmaxarmor"
    const isArmor = t.includes("maxarmor") || t.includes("armor");

    // Heal: "heal", "potion" (Ama MaxHP değil, Armor değil)
    const isHeal = (t.includes("heal") || t.includes("potion")) && !isMaxHP && !isArmor;

    // Silahlar
    const isRock = t.includes("rock") || t.includes("sword") || t.includes("blade");
    // "Shield" kelimesi hem Zırh hem Kağıt için geçebilir. Genelde "UpgradeShield" silahtır.
    const isPaper = t.includes("paper") || (t.includes("shield") && !t.includes("max"));
    const isScissor = t.includes("scissor") || t.includes("spell") || t.includes("magic");

    // === DURUM A: HEAL (İYİLEŞTİRME) ===
    if (isHeal) {
        const current = p.health.current;
        const max = p.health.max;
        const missing = max - current;

        // KURAL: Eğer eksik can 1'den azsa (neredeyse full), -Sonsuz Puan.
        if (missing < 1) return -99999; 
        
        // KURAL: Can %85 üzeriyse, yine de alma (Başka şeyler al).
        if (current / max > 0.85) return -5000;

        const healAmount = loot.selectedVal1 || 0;
        const effectiveHeal = Math.min(missing, healAmount);
        
        // Aciliyet Eğrisi
        const hpPercent = current / max;
        let urgency = 0;
        if (hpPercent < 0.30) urgency = 20;      // Çok kritik
        else if (hpPercent < 0.50) urgency = 5;  // Lazım
        else urgency = 0.5;                      // Önemsiz

        return effectiveHeal * urgency * 2;
    }

    // === DURUM B: MAX HEALTH (TIER S) ===
    if (isMaxHP) {
        const val = loot.selectedVal1 || 0;
        // +2 Health = 140 Puan
        // +4 Health = 280 + 300 = 580 Puan
        let jackpot = 0;
        if (val >= 4) jackpot = 300;
        
        return (val * 70) + jackpot;
    }

    // === DURUM C: MAX ARMOR (TIER S) ===
    if (isArmor) {
        const val = loot.selectedVal1 || 0;
        // +1 Armor = 60 Puan
        let jackpot = 0;
        if (val >= 3) jackpot = 200;

        return (val * 60) + jackpot;
    }

    // === DURUM D: SİLAH GELİŞTİRMELERİ ===
    if (isRock || isPaper || isScissor) {
        const isAtk = (loot.selectedVal1 || 0) > 0;
        const val = isAtk ? loot.selectedVal1 : loot.selectedVal2;

        // --- ÇÖP FİLTRESİ ---
        // Eğer değer 1 ise, puanı 1 (neredeyse hiç).
        // Eğer bot bunu tanırsa 1 puan verir. Tanımazsa 0 puan verir.
        // Böylece tanıdığı +1 eşyayı, tanımadığı şeye tercih eder ama çok düşük ihtimalle.
        if (val === 1) return 1;

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

        // Defans Doygunluğu
        let usefulness = 1.0;
        if (!isAtk) {
             if (currentStat < p.armor.max) usefulness = 1.5; 
             else usefulness = 0.8;
        }

        // Karesel Güç Hesabı
        const powerValue = Math.pow(val, 2);
        
        if (charges > 0) {
            const effectiveCharges = Math.min(charges, 5);
            // +3 Shield Atk -> 9 * 4 * 5 * 1.5 = 270 Puan.
            return powerValue * 4 * effectiveCharges * buildMultiplier * usefulness + (currentStat * 2);
        } else {
            return powerValue * 5 * buildMultiplier;
        }
    }

    // --- VARSAYILAN PUAN ---
    // Eğer bot eşyanın ne olduğunu HİÇ anlamadıysa 0 puan ver.
    // Böylece "Heal" stringini tanımazsa onu 0 puan sayar.
    // Eğer +1 Shield varsa (Puanı 1), 1 > 0 olduğu için Shield alır.
    // (Ama önceki sorunda Heal seçtiyse, demek ki Shield'ı 2 puan görüp Heal'i 10 puan görüyordu. Şimdi Heal 0 olacak.)
    return 0;
  }

  private buildStateKey(state: GigaverseRunState, depth: number): string {
    const p = state.player;
    const e = state.enemies[state.currentEnemyIndex]; // Şu an savaştığımız düşman
    
    // Düşman yoksa veya öldüyse
    if (!e || e.health.current <= 0) {
        return `END|${depth}|${p.health.current}|${state.currentEnemyIndex}`;
    }

    // OYUNCU DURUMU (Can, Zırh, Mermiler, Statlar)
    const playerKey = `${p.health.current.toFixed(1)}|${p.armor.current}|` +
           `${p.rock.currentCharges}-${p.rock.currentATK}-${p.rock.currentDEF}|` +
           `${p.paper.currentCharges}-${p.paper.currentATK}-${p.paper.currentDEF}|` +
           `${p.scissor.currentCharges}-${p.scissor.currentATK}-${p.scissor.currentDEF}`;

    // DÜŞMAN DURUMU (Bunu eklemezsek memoization hatalı çalışır!)
    const enemyKey = `${e.health.current.toFixed(1)}|${e.armor.current}|` +
           `${e.rock.currentCharges}-${e.rock.currentATK}-${e.rock.currentDEF}|` +
           `${e.paper.currentCharges}-${e.paper.currentATK}-${e.paper.currentDEF}|` +
           `${e.scissor.currentCharges}-${e.scissor.currentATK}-${e.scissor.currentDEF}`;

    return `${depth}|${state.currentEnemyIndex}|${playerKey}|VS|${enemyKey}`;
  }
}

// path: gigaverse-engine/src/algorithms/dp/DPAlgorithm.ts

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
    const targetHorizon = Math.max(config.maxHorizon, 6);

    this.config = {
      maxHorizon: targetHorizon,
      evaluateFn: config.evaluateFn ?? defaultEvaluate,
    };
    this.logger = logger ?? defaultLogger;
    this.memo = new Map();
  }

  public pickAction(state: GigaverseRunState): GigaverseAction {
    this.memo.clear();
    
    // LOOT PHASE: Saf Kural Modu (Simulation Free)
    if (state.lootPhase) {
        return this.pickBestLoot(state);
    }

    // COMBAT PHASE: Expectimax (Lethal Check Korumalı)
    const result = this.expectimaxSearch(state, this.config.maxHorizon);
    
    if (!result.bestAction) {
      return { type: GigaverseActionType.MOVE_ROCK };
    }
    
    return result.bestAction;
  }

  // --- LOOT SEÇİMİ ---
  private pickBestLoot(state: GigaverseRunState): GigaverseAction {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for(let i=0; i < state.lootOptions.length; i++) {
          const loot = state.lootOptions[i];
          const score = this.getLootSynergyScore(state, loot);
          
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

  // --- PUANLAMA MOTORU (SAYI ODAKLI & HATA KORUMALI) ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    
    // Değerleri al
    const val1 = loot.selectedVal1 || 0;
    const val2 = loot.selectedVal2 || 0;
    
    // Eşyanın Toplam "Gücü" (Stat büyüklüğü)
    // +2 Can -> Güç 2.
    // +3 Atk / +0 Def -> Güç 3.
    const rawPower = val1 + val2;

    // --- ADIM 1: TABAN PUAN (SAYILARA GÖRE) ---
    // İsmi ne olursa olsun, büyük sayı iyidir.
    // +1 -> 10 Puan
    // +2 -> 200 Puan (Karesiyle artan değer)
    // +3 -> 450 Puan
    // Bu sayede tanımsız +2 eşya, tanımlı +1 eşyayı her zaman yener.
    let score = Math.pow(rawPower, 2) * 50; 

    // +1 Eşyalar için Taban Puanı baştan öldür.
    if (rawPower === 1) score = 5; 

    // ---------------------------------------------------------
    // ADIM 2: TİP ANALİZİ VE ÇARPANLAR
    // ---------------------------------------------------------
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();

    // TİP TESPİTİ (Basitleştirilmiş)
    const isHeal = (t === "heal" || t.includes("potion")) && !t.includes("health"); // "Health" geçiyorsa Heal değildir!
    
    const isMaxHP = t.includes("health") || t.includes("vitality") || t.includes("hp");
    const isArmor = t.includes("armor") || t.includes("shieldmax");
    
    const isRock = t.includes("rock") || t.includes("sword");
    const isPaper = t.includes("paper") || (t.includes("shield") && !isArmor);
    const isScissor = t.includes("scissor") || t.includes("spell") || t.includes("magic");

    // --- DURUM A: HEAL (İSTİSNA) ---
    // Heal bir stat değil, eylemdir. Özel hesap gerektirir.
    if (isHeal) {
        const missing = p.health.max - p.health.current;
        if (missing < 1) return -999999; // Can full
        if (p.health.current / p.health.max > 0.90) return -5000;

        // Aciliyet (Can azsa değeri artar)
        const urgency = p.health.current < p.health.max * 0.5 ? 10 : 2;
        return Math.min(missing, val1) * urgency * 5;
    }

    // --- DURUM B: TİP ÇARPANLARI ---
    
    if (isMaxHP) {
        // Max HP en değerlisidir. Taban puanı x4 yap.
        // +2 Health -> Taban(200) * 4 = 800 Puan.
        score *= 4.0;
        
        // Jackpot
        if (rawPower >= 4) score += 500;
    }
    else if (isArmor) {
        // Max Armor çok iyidir. x3.5 yap.
        // +2 Armor -> Taban(200) * 3.5 = 700 Puan.
        score *= 3.5;
    }
    else if (isRock || isPaper || isScissor) {
        // Silahlar. Taban puanı duruma göre ayarla.
        
        let buildMult = 1.0;
        if (isRock || isPaper) buildMult = 1.5; // Güçlü silahlar
        if (isScissor) buildMult = 0.8;         // Zayıf silah

        // Zırh Doluluk Kontrolü
        // Bu bir saldırı mı? (val1 > 0)
        const isAtk = val1 > 0;
        let usefulness = 1.0;

        if (isAtk) {
            // Zırh doluyken saldırı x1.5 daha değerlidir.
            if (p.armor.current >= p.armor.max * 0.9) usefulness = 1.5;
        } else {
            // Defans eşyası. Zırh taşıyorsa cezalandır.
            const currentItemStat = isRock ? p.rock.currentDEF : (isPaper ? p.paper.currentDEF : p.scissor.currentDEF);
            if ((currentItemStat + rawPower) > p.armor.max) {
                usefulness = 0.1; // BOŞA GİDER -> ÇÖP
            } else {
                usefulness = 1.5; // İhtiyaç var
            }
        }

        score *= buildMult * usefulness;
        
        // Mermi Bonusu (Ufak etki)
        let charges = 0;
        if (isRock) charges = p.rock.currentCharges;
        else if (isPaper) charges = p.paper.currentCharges;
        else if (isScissor) charges = p.scissor.currentCharges;
        
        if (charges > 0) score *= 1.2;
    }
    else {
        // TİP TANIMLANAMADI! (Burası senin sorunun çözümü)
        // Ama puanı "Taban Puan" olarak kaldı.
        // +2 Bilinmeyen Eşya -> 200 Puan.
        // +1 Bilinen Kılıç -> ~10-15 Puan.
        // KAZANAN: Bilinmeyen +2 Eşya.
        
        // Tanınmayan ama yüksek statlı eşyaya güvenelim.
        score *= 1.0; 
    }

    return score;
  }

  // --- SAVAŞ MOTORU (EXPECTIMAX + LETHAL CHECK) ---
  private expectimaxSearch(state: GigaverseRunState, depth: number): DPResult {
    if (depth <= 0 || state.player.health.current <= 0 || state.currentEnemyIndex >= state.enemies.length) {
      return { bestValue: this.config.evaluateFn(state), bestAction: null };
    }

    const key = this.buildStateKey(state, depth);
    if (this.memo.has(key)) return this.memo.get(key)!;

    const myActions = this.getCombatActions(state);
    if (myActions.length === 0) return { bestValue: -Infinity, bestAction: { type: GigaverseActionType.MOVE_ROCK } };

    let bestVal = -Infinity;
    let bestAct: GigaverseAction | null = null;

    for (const myAct of myActions) {
      // Değişiklik Burada: Lethal Check içeren hesaplama
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

      const enemyMoves: MoveType[] = [];
      if (enemy.rock.currentCharges > 0) enemyMoves.push(MoveType.ROCK);
      if (enemy.paper.currentCharges > 0) enemyMoves.push(MoveType.PAPER);
      if (enemy.scissor.currentCharges > 0) enemyMoves.push(MoveType.SCISSOR);
      if (enemyMoves.length === 0) enemyMoves.push(MoveType.ROCK);

      const probability = 1.0 / enemyMoves.length;
      let totalWeightedScore = 0;
      const myMove = this.actionToMoveType(myAct);

      // --- CELLAT KONTROLÜ (LETHAL CHECK) ---
      // Eğer düşmanın HERHANGİ bir hamlesi beni öldürüyorsa, o ihtimali %100 kabul et.
      // Yani ortalamaya bakma, "En kötü senaryo (Ölüm)" puanını döndür.
      
      let deathDetected = false;
      let deathScore = -Infinity;

      for (const enemyMove of enemyMoves) {
          const nextState = this.fastClone(state);
          this.applyRoundOutcome(nextState, myMove, enemyMove);

          const nextEnemy = nextState.enemies[nextState.currentEnemyIndex];
          if (nextEnemy && nextEnemy.health.current <= 0) {
              nextState.currentEnemyIndex++;
          }

          const subResult = this.expectimaxSearch(nextState, depth - 1);
          
          // EĞER BU SENARYODA ÖLDÜYSEK:
          // Puan -900.000'den küçükse (Evaluate fonksiyonumuzda ölüm -1.000.000 idi)
          if (subResult.bestValue < -900000) {
              deathDetected = true;
              deathScore = subResult.bestValue;
              // Döngüyü kırmaya gerek yok ama sonucu etkileyecek
          }

          totalWeightedScore += (subResult.bestValue * probability);
      }

      // EĞER ÖLÜM TEHLİKESİ VARSA:
      // Ortalamayı boşver, direkt ölüm puanını döndür.
      // Böylece bot, "Ya ölmezsem?" diye risk almaz.
      if (deathDetected) {
          return deathScore;
      }

      return totalWeightedScore;
  }

  private fastClone(state: GigaverseRunState): GigaverseRunState {
      return JSON.parse(JSON.stringify(state));
  }

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
          ) { pWins = true; }
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

  private buildStateKey(state: GigaverseRunState, depth: number): string {
    const p = state.player;
    const e = state.enemies[state.currentEnemyIndex]; 
    if (!e || e.health.current <= 0) return `END|${depth}|${p.health.current}|${state.currentEnemyIndex}`;

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

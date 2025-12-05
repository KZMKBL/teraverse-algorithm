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
    
    // LOOT PHASE: Saf Kural Modu (Simulation-Free)
    if (state.lootPhase) {
        return this.pickBestLoot(state);
    }

    // COMBAT PHASE: Expectimax
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

  // --- PUANLAMA MOTORU (OVERKILL KORUMALI) ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();
    
    const val1 = loot.selectedVal1 || 0;
    const val2 = loot.selectedVal2 || 0;

    // --- TİP AYRIŞTIRMA ---
    const isMaxHP = rawType === "AddMaxHealth" || t.includes("health upgrade") || t.includes("addmaxhealth");
    const isArmor = rawType === "AddMaxArmor" || t.includes("armor upgrade") || t.includes("addmaxarmor");
    const isHeal = (rawType === "Heal" || t === "heal" || t.includes("potion")) && !isMaxHP;

    const isRock = rawType === "UpgradeRock" || t.includes("sword") || t.includes("rock");
    const isPaper = rawType === "UpgradePaper" || t.includes("shield") || t.includes("paper");
    const isScissor = rawType === "UpgradeScissor" || t.includes("spell") || t.includes("magic") || t.includes("scissor");

    // === DURUM A: HEAL ===
    if (isHeal) {
        const current = p.health.current;
        const max = p.health.max;
        const missing = max - current;

        if (missing < 1) return -999999; 
        if (current / max > 0.90) return -5000;

        const healAmount = loot.selectedVal1 || 0;
        const effectiveHeal = Math.min(missing, healAmount);
        
        const hpPercent = current / max;
        let urgency = 1;
        if (hpPercent < 0.30) urgency = 50;      
        else if (hpPercent < 0.50) urgency = 10; 
        
        return effectiveHeal * urgency * 5;
    }

    // === DURUM B: MAX HEALTH ===
    if (isMaxHP) {
        let jackpot = 0;
        if (val1 >= 4) jackpot = 500;
        return (val1 * 150) + jackpot;
    }

    // === DURUM C: MAX ARMOR ===
    if (isArmor) {
        let jackpot = 0;
        if (val1 >= 3) jackpot = 400;
        return (val1 * 120) + jackpot;
    }

    // === DURUM D: SİLAH GELİŞTİRMELERİ ===
    if (isRock || isPaper || isScissor) {
        const isAtk = val1 > 0;
        const val = isAtk ? val1 : val2;

        // +1 Çöp Filtresi
        let lowTierPenalty = 1.0;
        if (val === 1) lowTierPenalty = 0.1; 

        let charges = 0;
        let currentStat = 0; // Mevcut ATK veya DEF değeri
        let buildMultiplier = 1.0;

        // Statları ve Build'i çek
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

        // --- Usefulness & OVERKILL Kontrolü ---
        let usefulness = 1.0;
        
        if (isAtk) {
            // SALDIRI İÇİN: Zırhımız doluyken saldırı değerlidir.
            const armorPercent = p.armor.max > 0 ? p.armor.current / p.armor.max : 0;
            if (armorPercent > 0.9) usefulness = 1.8;
            else usefulness = 1.2;
        } else {
            // DEFANS İÇİN: (Burada düzeltme yapıyoruz)
            // Gelecekteki Defans Değeri = Şu anki + Eşyadan Gelen
            const futureDef = currentStat + val;
            
            // Eğer gelecekteki defans, Max Armor kapasitemizi aşıyorsa bu İSRAFTIR.
            if (futureDef > p.armor.max) {
                // OVERKILL CEZASI: Puanı çöp seviyesine indir (x0.1)
                // Bu eşya, +1 eşya muamelesi görür.
                usefulness = 0.1; 
                this.logger.warn(`⚠️ OVERKILL: Defans (${futureDef}) > Max Armor (${p.armor.max}). Puan kırıldı.`);
            } 
            else if (futureDef === p.armor.max) {
                // Tam dolduruyorsa mükemmeldir.
                usefulness = 1.6;
            }
            else {
                // Hâlâ yer varsa iyidir.
                usefulness = 1.5; 
            }
        }

        const powerValue = Math.pow(val, 2);
        const POTENTIAL_FACTOR = 18; 

        let baseScore = 0;
        if (charges > 0) {
            const effectiveCharges = Math.min(charges, 5);
            baseScore = powerValue * POTENTIAL_FACTOR * effectiveCharges * buildMultiplier * usefulness + (currentStat * 2);
        } else {
            baseScore = powerValue * POTENTIAL_FACTOR * buildMultiplier * usefulness;
        }

        return baseScore * lowTierPenalty;
    }

    return 0;
  }

  // --- EXPECTIMAX (SAVAŞ) ---
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

      for (const enemyMove of enemyMoves) {
          const nextState = this.fastClone(state);
          this.applyRoundOutcome(nextState, myMove, enemyMove);

          const nextEnemy = nextState.enemies[nextState.currentEnemyIndex];
          if (nextEnemy && nextEnemy.health.current <= 0) {
              nextState.currentEnemyIndex++;
          }

          const subResult = this.expectimaxSearch(nextState, depth - 1);
          totalWeightedScore += (subResult.bestValue * probability);
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

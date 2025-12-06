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
    
    // --- 1. LOOT FAZI: SAF KURAL MODU ---
    // Simülasyon yok, sadece matematik.
    if (state.lootPhase) {
        return this.pickBestLoot(state);
    }

    // --- 2. SAVAŞ FAZI: EXPECTIMAX ---
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

  // --- (Mevcut) getLootSynergyScore'in aynısını kullandım, değiştirmek istersin söyle ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();
    
    const val1 = loot.selectedVal1 || 0;
    const val2 = loot.selectedVal2 || 0;

    const isMaxHP = rawType === "AddMaxHealth" || t.includes("health") || t.includes("vitality") || t.includes("hp");
    const isArmor = rawType === "AddMaxArmor" || t.includes("armor");
    const isHeal = (rawType === "Heal" || t === "heal" || t.includes("potion")) && !isMaxHP;
    const isRock = rawType === "UpgradeRock" || t.includes("sword") || t.includes("rock");
    const isPaper = rawType === "UpgradePaper" || t.includes("shield") || t.includes("paper");
    const isScissor = rawType === "UpgradeScissor" || t.includes("spell") || t.includes("magic") || t.includes("scissor");

    if (isHeal) {
        const current = p.health.current;
        const max = p.health.max;
        const missing = max - current;

        if (missing < 1) return -999999; 
        if (current / max > 0.90) return -5000;

        const effectiveHeal = Math.min(missing, val1);
        
        const hpPercent = current / max;
        let urgency = 1;
        if (hpPercent < 0.30) urgency = 50;      
        else if (hpPercent < 0.50) urgency = 10; 
        
        return effectiveHeal * urgency * 5;
    }

    if (isMaxHP) {
        let jackpot = 0;
        if (val1 >= 4) jackpot = 500;
        return (val1 * 200) + jackpot;
    }

    if (isArmor) {
        let jackpot = 0;
        if (val1 >= 3) jackpot = 400;
        return (val1 * 180) + jackpot;
    }

    if (isRock || isPaper || isScissor) {
        const isAtk = val1 > 0;
        const val = isAtk ? val1 : val2;

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

        let usefulness = 1.0;
        if (isAtk) {
            const armorPercent = p.armor.max > 0 ? p.armor.current / p.armor.max : 0;
            if (armorPercent > 0.9) usefulness = 1.8;
            else usefulness = 1.2;
        } else {
            if (currentStat < p.armor.max) usefulness = 1.5; 
            else usefulness = 1.2;
        }

        const powerValue = Math.pow(val, 2);
        const WEAPON_BASE_MULTIPLIER = 30; 

        let baseScore = 0;
        if (charges > 0) {
            const effectiveCharges = Math.min(charges, 3);
            baseScore = powerValue * WEAPON_BASE_MULTIPLIER * effectiveCharges * buildMultiplier * usefulness + (currentStat * 2);
        } else {
            baseScore = powerValue * WEAPON_BASE_MULTIPLIER * 1.5 * buildMultiplier;
        }

        return baseScore * lowTierPenalty;
    }

    return 0;
  }

  // --- SAVAŞ MOTORU (LETHAL CHECK DAHİL) ---
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

  /**
   * Yeni: Düşman hareket dağılımı tahmini.
   * Her potansiyel enemy move için kısa vadeli bir simülasyon yapıp
   * ham-puan = (dmgToPlayer) - (dmgToEnemy) + (armorGainFactor)
   * şeklinde bir fayda hesaplıyoruz. Daha yüksek fayda -> daha yüksek olasılık.
   * Softmax ile normalize ediyoruz. Temperature ile rastgelelik kontrolü.
   */
  private estimateEnemyMoveDistribution(state: GigaverseRunState, myMove: MoveType): Map<MoveType, number> {
    const enemy = state.enemies[state.currentEnemyIndex];
    const moves: MoveType[] = [];
    if (enemy.rock.currentCharges > 0) moves.push(MoveType.ROCK);
    if (enemy.paper.currentCharges > 0) moves.push(MoveType.PAPER);
    if (enemy.scissor.currentCharges > 0) moves.push(MoveType.SCISSOR);
    if (moves.length === 0) moves.push(MoveType.ROCK);

    const scores: number[] = [];
    for (const em of moves) {
      // simulate one round to estimate immediate outcomes
      const clone = this.fastClone(state);
      this.applyRoundOutcome(clone, myMove, em);

      // after applying round, compute immediate heuristics
      // dmg to player = originalPlayerHP - newPlayerHP
      const origP = state.player.health.current;
      const newP = clone.player.health.current;
      const dmgToPlayer = Math.max(0, origP - newP);

      // dmg to enemy = originalEnemyHP - newEnemyHP
      const origE = state.enemies[state.currentEnemyIndex].health.current;
      const newE = clone.enemies[clone.currentEnemyIndex].health.current;
      const dmgToEnemy = Math.max(0, origE - newE);

      // armor gain (positive for enemy) helps prefer defensive plays
      const armorGainEnemy = clone.enemies[clone.currentEnemyIndex].armor.current - state.enemies[state.currentEnemyIndex].armor.current;

      // enemy prefers moves that maximize (damage to player - damage to enemy + armorGain*factor)
      const raw = (dmgToPlayer * 1.0) - (dmgToEnemy * 0.6) + (armorGainEnemy * 0.4);

      scores.push(raw);
    }

    // softmax conversion
    const temperature = 0.8; // lower => more deterministic
    const exps = scores.map(s => Math.exp(s / Math.max(0.0001, temperature)));
    const sum = exps.reduce((a,b) => a+b, 0);
    const probs: number[] = exps.map(x => x / Math.max(1e-9, sum));

    const map = new Map<MoveType, number>();
    for (let i = 0; i < moves.length; i++) {
      map.set(moves[i], probs[i]);
    }
    return map;
  }

  private calculateExpectedValue(state: GigaverseRunState, myAct: GigaverseAction, depth: number): number {
      const enemy = state.enemies[state.currentEnemyIndex];
      if (!enemy || enemy.health.current <= 0) return this.config.evaluateFn(state);

      const myMove = this.actionToMoveType(myAct);

      // Yeni: düşman hamle dağılımını tahmin et
      const enemyDist = this.estimateEnemyMoveDistribution(state, myMove);

      let totalWeightedScore = 0;
      let deathDetected = false;
      let deathScore = -Infinity;

      for (const [enemyMove, prob] of enemyDist.entries()) {
          const nextState = this.fastClone(state);
          this.applyRoundOutcome(nextState, myMove, enemyMove);

          const nextEnemy = nextState.enemies[nextState.currentEnemyIndex];
          if (nextEnemy && nextEnemy.health.current <= 0) {
              nextState.currentEnemyIndex++;
          }

          const subResult = this.expectimaxSearch(nextState, depth - 1);

          // Lethal check: eğer alt yol kesin ölüm getiriyorsa bunu dikkate al
          if (subResult.bestValue < -900000) {
              deathDetected = true;
              // deathScore'e en "kötü" bulunan lethal sonucu al
              if (subResult.bestValue > deathScore) {
                deathScore = subResult.bestValue;
              }
          }

          totalWeightedScore += subResult.bestValue * prob;
      }

      if (deathDetected) return deathScore;
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

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
    
    // Başlangıç logunu da kapattım, sadece loot odaklı olalım.
  }

  public pickAction(state: GigaverseRunState): GigaverseAction {
    this.memo.clear();
    
    // --- SADECE BURADA KONUŞACAK (LOOT PHASE) ---
    if (state.lootPhase) {
        return this.pickBestLoot(state);
    }

    // --- SAVAŞ MODU (TAMAMEN SESSİZ) ---
    const result = this.expectimaxSearch(state, this.config.maxHorizon);
    
    if (!result.bestAction) {
      return { type: GigaverseActionType.MOVE_ROCK };
    }
    
    // Savaş hamlelerini loglamıyoruz artık.
    return result.bestAction;
  }

  // --- LOOT SEÇİMİ (DEDEKTİF MODU - SADECE GEREKLİ DETAYLAR) ---
  private pickBestLoot(state: GigaverseRunState): GigaverseAction {
      let bestScore = -Infinity;
      let bestIdx = 0;

      const p = state.player;
      
      // Sadece Loot ekranı gelince bu blok çalışır ve konsola düşer
      this.logger.info(`\n📦 --- LOOT ZAMANI --- [Can: ${p.health.current}/${p.health.max}]`);

      for(let i=0; i < state.lootOptions.length; i++) {
          const loot = state.lootOptions[i];
          const score = this.getLootSynergyScore(state, loot); // Puanı hesapla (İçeride detay logu var)
          
          if(score > bestScore) {
              bestScore = score;
              bestIdx = i;
          }
      }

      // Kazananı belirgin şekilde yaz
      const winnerName = state.lootOptions[bestIdx]?.boonTypeString || "???";
      const winnerVal1 = state.lootOptions[bestIdx]?.selectedVal1;
      const winnerVal2 = state.lootOptions[bestIdx]?.selectedVal2;
      
      this.logger.info(`✅ SEÇİLEN: [${winnerName}] (+${winnerVal1}|+${winnerVal2}) => Puan: ${bestScore.toFixed(0)}\n`);

      switch(bestIdx) {
          case 0: return { type: GigaverseActionType.PICK_LOOT_ONE };
          case 1: return { type: GigaverseActionType.PICK_LOOT_TWO };
          case 2: return { type: GigaverseActionType.PICK_LOOT_THREE };
          case 3: return { type: GigaverseActionType.PICK_LOOT_FOUR };
          default: return { type: GigaverseActionType.PICK_LOOT_ONE };
      }
  }

  // --- PUANLAMA MOTORU (DETAYLI ANALİZ) ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();
    
    const val1 = loot.selectedVal1 || 0;
    const val2 = loot.selectedVal2 || 0;

    // TİP AYRIŞTIRMA
    const isMaxHP = rawType === "AddMaxHealth" || t.includes("health upgrade") || t.includes("addmaxhealth");
    const isArmor = rawType === "AddMaxArmor" || t.includes("armor upgrade") || t.includes("addmaxarmor");
    const isHeal = (rawType === "Heal" || t === "heal") && !isMaxHP;

    const isRock = rawType === "UpgradeRock" || t.includes("sword");
    const isPaper = rawType === "UpgradePaper" || t.includes("shield");
    const isScissor = rawType === "UpgradeScissor" || t.includes("spell");

    let detected = "❓ BİLİNMEYEN";
    if (isMaxHP) detected = "❤️ MAX HP";
    if (isArmor) detected = "🛡️ MAX ARMOR";
    if (isHeal) detected = "💊 HEAL";
    if (isRock) detected = "⚔️ SWORD";
    if (isPaper) detected = "🛡️ SHIELD";
    if (isScissor) detected = "🔮 SPELL";

    // === DURUM A: HEAL ===
    if (isHeal) {
        const current = p.health.current;
        const max = p.health.max;
        const missing = max - current;

        if (missing < 1) {
             this.logger.info(`   ❌ ${rawType}: Can Full -> RED (-999k)`);
             return -999999;
        }
        if (current / max > 0.90) {
             this.logger.info(`   ❌ ${rawType}: Can %90+ -> RED (-5000)`);
             return -5000;
        }

        const effectiveHeal = Math.min(missing, val1);
        const hpPercent = current / max;
        let urgency = 1;
        if (hpPercent < 0.30) urgency = 50;      
        else if (hpPercent < 0.50) urgency = 10; 
        
        const finalScore = effectiveHeal * urgency * 5;
        this.logger.info(`   💊 ${rawType}: Aciliyet x${urgency} -> Puan: ${finalScore.toFixed(0)}`);
        return finalScore;
    }

    // === DURUM B: MAX HEALTH ===
    if (isMaxHP) {
        let jackpot = 0;
        if (val1 >= 4) jackpot = 500;
        const finalScore = (val1 * 150) + jackpot;
        this.logger.info(`   ❤️ ${rawType} (+${val1}): Tier S -> Puan: ${finalScore.toFixed(0)}`);
        return finalScore;
    }

    // === DURUM C: MAX ARMOR ===
    if (isArmor) {
        let jackpot = 0;
        if (val1 >= 3) jackpot = 400;
        const finalScore = (val1 * 120) + jackpot;
        this.logger.info(`   🛡️ ${rawType} (+${val1}): Tier S -> Puan: ${finalScore.toFixed(0)}`);
        return finalScore;
    }

    // === DURUM D: SİLAH GELİŞTİRMELERİ ===
    if (isRock || isPaper || isScissor) {
        const isAtk = val1 > 0;
        const val = isAtk ? val1 : val2;

        // +1 Çöp Filtresi
        let lowTierPenalty = 1.0;
        let note = "";
        if (val === 1) {
            lowTierPenalty = 0.1; 
            note = " [⚠️ +1 CEZASI]";
        }

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
            else usefulness = 0.8;
        }

        const powerValue = Math.pow(val, 2);
        const POTENTIAL_FACTOR = 18; 

        let baseScore = 0;
        if (charges > 0) {
            const effectiveCharges = Math.min(charges, 5);
            baseScore = powerValue * POTENTIAL_FACTOR * effectiveCharges * buildMultiplier * usefulness + (currentStat * 2);
        } else {
            baseScore = powerValue * POTENTIAL_FACTOR * buildMultiplier;
        }

        const finalScore = baseScore * lowTierPenalty;
        this.logger.info(`   ⚔️ ${rawType} (+${val}): ${detected} -> Puan: ${finalScore.toFixed(0)}${note}`);
        return finalScore;
    }

    // Bilinmeyen eşya
    this.logger.warn(`   ❓ BİLİNMEYEN: "${rawType}" -> Puan: 0`);
    return 0;
  }

  // --- EXPECTIMAX ARAMA MOTORU ---
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

  // --- PERFORMANS YAMASI (FAST CLONE) ---
  private fastClone(state: GigaverseRunState): GigaverseRunState {
      return JSON.parse(JSON.stringify(state));
  }

  // --- FİZİK MOTORU ---
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

  // --- HAFIZA ANAHTARI ---
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

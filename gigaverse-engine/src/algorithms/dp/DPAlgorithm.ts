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
    // Hız yaması sayesinde derinliği 6'ya sabitliyoruz.
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
    
    // --- 1. LOOT FAZI: SAF KURAL MODU (SİMÜLASYONSUZ) ---
    // Burada geleceği simüle etmiyoruz, sadece belirlediğimiz katı kurallara bakıyoruz.
    if (state.lootPhase) {
        return this.pickBestLoot(state);
    }

    // --- 2. SAVAŞ FAZI: EXPECTIMAX SİMÜLASYONU ---
    // Savaşta ise geleceği (6 hamle) simüle ediyoruz.
    const result = this.expectimaxSearch(state, this.config.maxHorizon);
    
    if (!result.bestAction) {
      return { type: GigaverseActionType.MOVE_ROCK };
    }
    
    return result.bestAction;
  }

  // --- LOOT SEÇİMİ (TEMİZ & KARARLI) ---
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

  // --- PUANLAMA MOTORU ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();
    
    const val1 = loot.selectedVal1 || 0;
    const val2 = loot.selectedVal2 || 0;

    // --- TİP AYRIŞTIRMA (KESİN EŞLEŞME) ---
    
    // MAX HEALTH: "AddMaxHealth" veya arayüz adı "Health Upgrade"
    const isMaxHP = rawType === "AddMaxHealth" || t.includes("health upgrade") || t.includes("addmaxhealth");

    // MAX ARMOR: "AddMaxArmor" veya arayüz adı "Armor Upgrade"
    const isArmor = rawType === "AddMaxArmor" || t.includes("armor upgrade") || t.includes("addmaxarmor");

    // HEAL: Sadece "Heal" stringi (MaxHP ile karışmaması garanti)
    const isHeal = (rawType === "Heal" || t === "heal" || t.includes("potion")) && !isMaxHP;

    // SİLAHLAR (Mapping: Rock->Sword, Paper->Shield, Scissor->Spell)
    const isRock = rawType === "UpgradeRock" || t.includes("sword") || t.includes("rock");
    const isPaper = rawType === "UpgradePaper" || t.includes("shield") || t.includes("paper");
    const isScissor = rawType === "UpgradeScissor" || t.includes("spell") || t.includes("magic") || t.includes("scissor");

    // === DURUM A: HEAL (GERÇEK İKSİR) ===
    if (isHeal) {
        const current = p.health.current;
        const max = p.health.max;
        const missing = max - current;

        // Can zaten full veya fulle çok yakınsa (-Sonsuz Puan)
        if (missing < 1) return -999999;
        
        // Can %90 üzerindeyse alma
        if (current / max > 0.90) return -5000;

        const healAmount = loot.selectedVal1 || 0;
        const effectiveHeal = Math.min(missing, healAmount);
        
        // Aciliyet Hesabı
        const hpPercent = current / max;
        let urgency = 1;
        if (hpPercent < 0.30) urgency = 50;      // ÖLÜM KALIM
        else if (hpPercent < 0.50) urgency = 10; // İHTİYAÇ
        
        return effectiveHeal * urgency * 5;
    }

    // === DURUM B: MAX HEALTH (TIER S) ===
    if (isMaxHP) {
        let jackpot = 0;
        if (val1 >= 4) jackpot = 500;
        // +2 Health = 300 Puan.
        return (val1 * 150) + jackpot;
    }

    // === DURUM C: MAX ARMOR (TIER S) ===
    if (isArmor) {
        let jackpot = 0;
        if (val1 >= 3) jackpot = 400;
        // +2 Armor = 240 Puan.
        return (val1 * 120) + jackpot;
    }

    // === DURUM D: SİLAH GELİŞTİRMELERİ (DÜZELTİLMİŞ MATEMATİK) ===
    if (isRock || isPaper || isScissor) {
        const isAtk = val1 > 0;
        const val = isAtk ? val1 : val2;

        // +1 Çöp Filtresi (Yumuşak Ceza)
        let lowTierPenalty = 1.0;
        if (val === 1) lowTierPenalty = 0.1; 

        // Build Çarpanları
        let buildMultiplier = 1.0;
        if (isRock) { // Sword (Favori)
            buildMultiplier = 1.5; 
        } else if (isPaper) { // Shield (Favori)
            buildMultiplier = 1.5; 
        } else if (isScissor) { // Spell (Zayıf)
            buildMultiplier = 0.7; 
        }

        // Zırh/Saldırı Stratejisi (Usefulness)
        let usefulness = 1.0;
        if (isAtk) {
            const armorPercent = p.armor.max > 0 ? p.armor.current / p.armor.max : 0;
            // Zırh doluyken saldırı çok daha değerlidir
            if (armorPercent > 0.9) usefulness = 1.8;
            else usefulness = 1.2;
        } else {
            // Defans eşyası
            let currentStat = 0;
            if (isRock) currentStat = p.rock.currentDEF;
            else if (isPaper) currentStat = p.paper.currentDEF;
            else if (isScissor) currentStat = p.scissor.currentDEF;

            // Zırh kapasitemizden düşükse defans almak mantıklıdır
            if (currentStat < p.armor.max) usefulness = 1.5; 
            else usefulness = 0.8;
        }

        const powerValue = Math.pow(val, 2); // Gücün Karesi (Önemli)
        
        // --- DÜZELTİLMİŞ FORMÜL ---
        // Eskiden (18 * 5 = 90) ile çarpıyorduk, çok fazlaydı.
        // Şimdi standart bir "45" katsayısı ile çarpıyoruz.
        // +2 Kılıç = 4 * 45 * 1.5 = 270 Puan. (+2 Can 300 Puan olduğu için CAN KAZANIR ✅)
        // +3 Kılıç = 9 * 45 * 1.5 = 607 Puan. (Çok güçlü silah, +2 Canı geçer ama +4 Canı geçemez ✅)
        
        const WEAPON_BASE_MULTIPLIER = 45; 

        // Ayrıca mermimiz çoksa ufak bir "Bonus" ekleyelim, ana çarpan yapmayalım.
        let chargeBonus = 1.0;
        let myCharges = 0;
        if (isRock) myCharges = p.rock.currentCharges;
        else if (isPaper) myCharges = p.paper.currentCharges;
        else if (isScissor) myCharges = p.scissor.currentCharges;

        if (myCharges >= 3) chargeBonus = 1.2; // Full mermim varsa bu silahı daha çok isterim

        let finalScore = powerValue * WEAPON_BASE_MULTIPLIER * buildMultiplier * usefulness * chargeBonus;

        // Mevcut stat bonusu (Stacking - hafif etki)
        let currentStatVal = isAtk 
            ? (isRock ? p.rock.currentATK : (isPaper ? p.paper.currentATK : p.scissor.currentATK))
            : (isRock ? p.rock.currentDEF : (isPaper ? p.paper.currentDEF : p.scissor.currentDEF));
            
        finalScore += (currentStatVal * 2);

        return finalScore * lowTierPenalty;
    }

    // Bilinmeyen eşya
    return 0;
  }

  // --- EXPECTIMAX ARAMA MOTORU (SADECE SAVAŞ) ---
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

  // --- HIZLI KOPYALAMA ---
  private fastClone(state: GigaverseRunState): GigaverseRunState {
      return JSON.parse(JSON.stringify(state));
  }

  // --- FİZİK MOTORU (SESSİZ) ---
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

// path: gigaverse-engine/src/algorithms/dp/DPAlgorithm.ts
/**
 * A Probabilistic DP approach (Expectimax).
 * Instead of relying on a random simulator, it calculates the
 * "Weighted Average Outcome" against all possible enemy moves.
 * * FEATURES:
 * - Expectimax Logic (No RNG dependence)
 * - Fast Cloning (Performance Boost)
 * - Robust Memoization (Enemy State Tracking)
 * - Smart Loot Filter (Exact Match + Trash Filter)
 * - Debug Logging (Detailed Decision Analysis)
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
    // DERİNLİK AYARI: Hız yaması sayesinde 6'ya çıkıyoruz.
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
    
    // Loot Phase ise Akıllı Loot Seçicisine git
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

  // --- LOOT SEÇİMİ (DEBUG / DEDEKTİF MODU) ---
  private pickBestLoot(state: GigaverseRunState): GigaverseAction {
      let bestScore = -Infinity;
      let bestIdx = 0;

      const p = state.player;
      this.logger.info("==========================================");
      this.logger.info(`🕵️‍♂️ [LOOT DEDEKTİFİ] ANALİZ BAŞLIYOR`);
      this.logger.info(`📊 MEVCUT DURUM: Can: ${p.health.current}/${p.health.max} | Zırh: ${p.armor.current}/${p.armor.max}`);
      this.logger.info("==========================================");

      for(let i=0; i < state.lootOptions.length; i++) {
          const loot = state.lootOptions[i];
          
          // Puanı hesapla (İçeride detaylı log atacak)
          this.logger.info(`--- SEÇENEK ${i + 1} ANALİZİ ---`);
          const score = this.getLootSynergyScore(state, loot); 
          
          this.logger.info(`👉 SONUÇ PUANI: ${score.toFixed(1)}`);

          if(score > bestScore) {
              bestScore = score;
              bestIdx = i;
          }
      }

      const winnerName = state.lootOptions[bestIdx]?.boonTypeString || "???";
      this.logger.info("==========================================");
      this.logger.info(`🏆 KAZANAN: SEÇENEK ${bestIdx + 1} (${winnerName})`);
      this.logger.info(`🌟 PUAN: ${bestScore.toFixed(1)}`);
      this.logger.info("==========================================");

      switch(bestIdx) {
          case 0: return { type: GigaverseActionType.PICK_LOOT_ONE };
          case 1: return { type: GigaverseActionType.PICK_LOOT_TWO };
          case 2: return { type: GigaverseActionType.PICK_LOOT_THREE };
          case 3: return { type: GigaverseActionType.PICK_LOOT_FOUR };
          default: return { type: GigaverseActionType.PICK_LOOT_ONE };
      }
  }

  // --- PUANLAMA MOTORU (KESİN EŞLEŞME + STRATEJİ) ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    // SDK'dan gelen ham string ve küçük harfli versiyonu
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();
    
    // Değerleri logla
    const val1 = loot.selectedVal1 || 0;
    const val2 = loot.selectedVal2 || 0;
    this.logger.info(`📝 Eşya İsmi: "${rawType}" | Değerler: ${val1} / ${val2}`);

    // 1. TİP AYRIŞTIRMA (KESİN REFERANS)
    // lootFormatter.ts dosyasındaki mapping'e göre birebir kontrol

    // MAX HEALTH: "AddMaxHealth" veya ekranda görünen "Health Upgrade"
    const isMaxHP = rawType === "AddMaxHealth" || t.includes("health upgrade") || t.includes("addmaxhealth");

    // MAX ARMOR: "AddMaxArmor" veya ekranda görünen "Armor Upgrade"
    const isArmor = rawType === "AddMaxArmor" || t.includes("armor upgrade") || t.includes("addmaxarmor");

    // HEAL: "Heal" (Sadece ve sadece bu string)
    // "Health Upgrade" içindeki 'heal' kelimesiyle karışmaması için isMaxHP kontrolü şart.
    const isHeal = (rawType === "Heal" || t === "heal") && !isMaxHP;

    // SİLAHLAR (Mapping: Rock->Sword, Paper->Shield, Scissor->Spell)
    const isRock = rawType === "UpgradeRock" || t.includes("sword");
    const isPaper = rawType === "UpgradePaper" || t.includes("shield");
    const isScissor = rawType === "UpgradeScissor" || t.includes("spell");

    // LOGLAMA: Bot bunu ne sandı?
    if (isHeal) this.logger.info(`💡 Algılanan Tip: [HEAL / İKSİR]`);
    else if (isMaxHP) this.logger.info(`💡 Algılanan Tip: [MAX HEALTH / KALICI CAN]`);
    else if (isArmor) this.logger.info(`💡 Algılanan Tip: [MAX ARMOR / KALICI ZIRH]`);
    else if (isRock) this.logger.info(`💡 Algılanan Tip: [SİLAH: SWORD/ROCK]`);
    else if (isPaper) this.logger.info(`💡 Algılanan Tip: [SİLAH: SHIELD/PAPER]`);
    else if (isScissor) this.logger.info(`💡 Algılanan Tip: [SİLAH: SPELL/SCISSOR]`);
    else this.logger.warn(`⚠️ Algılanan Tip: [BİLİNMEYEN]`);


    // === DURUM A: HEAL ===
    if (isHeal) {
        const current = p.health.current;
        const max = p.health.max;
        const missing = max - current;

        if (missing < 1) {
             this.logger.info(`❌ KARAR: Can full, Heal reddedildi.`);
             return -999999;
        }
        if (current / max > 0.90) {
             this.logger.info(`❌ KARAR: Can %90+, Heal reddedildi.`);
             return -5000;
        }

        const effectiveHeal = Math.min(missing, val1);
        
        // Aciliyet Hesabı
        const hpPercent = current / max;
        let urgency = 1;
        if (hpPercent < 0.30) urgency = 50;      
        else if (hpPercent < 0.50) urgency = 10; 
        
        const finalScore = effectiveHeal * urgency * 5;
        this.logger.info(`✅ HESAP: Efektif: ${effectiveHeal} * Aciliyet: ${urgency} * 5 = ${finalScore}`);
        return finalScore;
    }

    // === DURUM B: MAX HEALTH ===
    if (isMaxHP) {
        let jackpot = 0;
        if (val1 >= 4) jackpot = 500;
        
        const finalScore = (val1 * 150) + jackpot;
        this.logger.info(`✅ HESAP: (Val: ${val1} * 150) + Jackpot: ${jackpot} = ${finalScore}`);
        return finalScore;
    }

    // === DURUM C: MAX ARMOR ===
    if (isArmor) {
        let jackpot = 0;
        if (val1 >= 3) jackpot = 400;

        const finalScore = (val1 * 120) + jackpot;
        this.logger.info(`✅ HESAP: (Val: ${val1} * 120) + Jackpot: ${jackpot} = ${finalScore}`);
        return finalScore;
    }

    // === DURUM D: SİLAH GELİŞTİRMELERİ ===
    if (isRock || isPaper || isScissor) {
        const isAtk = val1 > 0;
        const val = isAtk ? val1 : val2;

        // +1 Çöp Filtresi
        let lowTierPenalty = 1.0;
        if (val === 1) {
            lowTierPenalty = 0.1; 
            this.logger.info(`⚠️ UYARI: +1 Eşya tespit edildi! Ceza Çarpanı: 0.1`);
        }

        let charges = 0;
        let currentStat = 0;
        let buildMultiplier = 1.0;

        // DOĞRU EŞLEŞTİRME: Rock=Sword, Paper=Shield, Scissor=Spell
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

        // Usefulness (Zırh Doluluk Kontrolü)
        let usefulness = 1.0;
        if (isAtk) {
            const armorPercent = p.armor.max > 0 ? p.armor.current / p.armor.max : 0;
            if (armorPercent > 0.9) {
                usefulness = 1.8;
                this.logger.info(`⚔️ STRATEJİ: Zırh dolu, Saldırı Modu (x1.8)`);
            } else {
                usefulness = 1.2;
            }
        } else {
            if (currentStat < p.armor.max) {
                usefulness = 1.5; 
                this.logger.info(`🛡️ STRATEJİ: Defans lazım (x1.5)`);
            } else {
                usefulness = 0.8;
                this.logger.info(`🛡️ STRATEJİ: Zırh taşıyor, Defans gereksiz (x0.8)`);
            }
        }

        const powerValue = Math.pow(val, 2);
        
        // POTANSİYEL HESABI (Mermiden Bağımsız)
        const POTENTIAL_FACTOR = 18; 

        // Hesaplama
        let baseScore = 0;
        if (charges > 0) {
            const effectiveCharges = Math.min(charges, 5);
            // Tie-breaker bonusu (Mermi varsa bir tık daha iyidir)
            baseScore = powerValue * POTENTIAL_FACTOR * buildMultiplier * usefulness + (currentStat * 2);
        } else {
            baseScore = powerValue * POTENTIAL_FACTOR * buildMultiplier;
        }

        const finalScore = baseScore * lowTierPenalty;
        this.logger.info(`✅ HESAP: Base: ${baseScore.toFixed(1)} * Penalty: ${lowTierPenalty} = ${finalScore.toFixed(1)}`);
        return finalScore;
    }

    // Bilinmeyen eşya
    this.logger.warn(`❌ TİP TANINAMADI: Puan 0`);
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

  // --- HIZLI KOPYALAMA (FAST CLONE) ---
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

  // --- HAFIZA ANAHTARI (ROBUST KEY) ---
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

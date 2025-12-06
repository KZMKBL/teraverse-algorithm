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

    // --- YENİ: LOOT SKORLAMASI (SDV + BUILD ANALYSIS + MICRO-SIM) ---
  private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    // 1) Temel: evaluate fonksiyonuyla state delta (SDV)
    const baseDelta = this.computeStateDeltaValue(state, loot);

    // 2) Build analizi: hangi silah/istat öne çıkıyor?
    const buildPref = this.analyzeBuildPreference(state); // returns { rock: number, paper: number, scissor: number, hp: number, armor: number, charges: number }

    // 3) Micro-simulation: kısa vadeli etkiler (3 tur)
    const micro = this.microSimulateLootEffect(state, loot, 3);

    // 4) Tür bazlı multipliers: loot tipini tespit et ve build ile eşleştir
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();
    const isHeal = (rawType === "Heal" || t === "heal" || t.includes("potion")) && !t.includes("maxhealth") && !t.includes("addmaxhealth");
    const isMaxHP = rawType === "AddMaxHealth" || t.includes("maxhealth") || t.includes("vitality") || t.includes("hp");
    const isArmor = rawType === "AddMaxArmor" || t.includes("armor");
    const isRock = rawType === "UpgradeRock" || t.includes("rock") || t.includes("sword");
    const isPaper = rawType === "UpgradePaper" || t.includes("paper") || t.includes("shield");
    const isScissor = rawType === "UpgradeScissor" || t.includes("scissor") || t.includes("spell") || t.includes("magic");

    // baseScore başlangıç: evaluate delta
    let score = baseDelta;

    // Build preference multiplier: eğer loot tercih edilen statla uyuşuyorsa bonus ver
    const prefBonusWeight = 1.0;
    if (isRock) score += prefBonusWeight * 50 * buildPref.rock;
    if (isPaper) score += prefBonusWeight * 50 * buildPref.paper;
    if (isScissor) score += prefBonusWeight * 50 * buildPref.scissor;
    if (isMaxHP) score += prefBonusWeight * 40 * buildPref.hp;
    if (isArmor) score += prefBonusWeight * 40 * buildPref.armor;
    if (isHeal) score += prefBonusWeight * 30 * (buildPref.hp + 0.5); // heal daha çok hp tercihine bağlıdır

    // Micro-sim etkileri: ΔTTK (düşüş iyi) ve ΔSurvival (artış çok iyi)
    // micro.deltaTTK: newTTK - oldTTK (negatifse TTK azalmış => iyi)
    // micro.deltaSurvival: newSurv - oldSurv (pozitifse iyi)
    const ttkFactor = 1200; // TTK farkını puana çevirme ölçeği
    const survivalFactor = 4000; // survival farkını puana çevirme ölçeği (öncelikli)
    score += -micro.deltaTTK * ttkFactor; // TTK azaldıysa pozitif katkı yap
    score += micro.deltaSurvival * survivalFactor;

    // Küçük bir taşıyıcı: charges veya +1 small upgrades için mantıklı ama aşırı cezalandırılmamış
    const val1 = loot.selectedVal1 || 0;
    const val2 = loot.selectedVal2 || 0;
    // Eğer item weapon upgrade ise ve sadece +1 ise normal penalti yerine micro-sim kararına bak
    if ((isRock || isPaper || isScissor) && (val1 === 1 || val2 === 1)) {
      // +1'ler artık tamamen çöpe atılmıyor; micro-sim pozitifse değerli olabilir
      score += Math.max(0, micro.deltaSurvival * 1000);
    }

    // Son düzeltme: çok uç değerleri kırp (numerik stabilite)
    if (!Number.isFinite(score)) score = -1e9;
    return score;
  }

  // UYGULA: loot'u klon state'e uygular (basit fakat kapsayıcı)
  private applyLootToClone(clone: GigaverseRunState, loot: any) {
    // Bu fonksiyon loot formatına bağlı olarak genişletilebilir.
    const rawType = (loot.boonTypeString || "").toString();
    const t = rawType.toLowerCase();
    const v1 = loot.selectedVal1 || 0;
    const v2 = loot.selectedVal2 || 0;
    const p = clone.player;

    // Max Health
    if (rawType === "AddMaxHealth" || t.includes("maxhealth") || t.includes("vitality")) {
      p.health.max += v1;
      p.health.current += v1; // genelde max hp arttığında current de artar (bunu tercih edilebilir yap)
    }

    // Max Armor
    else if (rawType === "AddMaxArmor" || t.includes("maxarmor") || t.includes("armor")) {
      p.armor.max += v1;
      p.armor.current = Math.min(p.armor.current + v1, p.armor.max);
    }

    // Heal / Potion
    else if (rawType === "Heal" || t === "heal" || t.includes("potion")) {
      p.health.current = Math.min(p.health.max, p.health.current + v1);
    }

    // Weapon Upgrades (Attack)
    else if (rawType === "UpgradeRock" || t.includes("upgraderock") || t.includes("rock")) {
      if (v1 > 0) p.rock.currentATK += v1;
      if (v2 > 0) p.rock.currentDEF += v2;
    } else if (rawType === "UpgradePaper" || t.includes("upgradepaper") || t.includes("paper")) {
      if (v1 > 0) p.paper.currentATK += v1;
      if (v2 > 0) p.paper.currentDEF += v2;
    } else if (rawType === "UpgradeScissor" || t.includes("upgradescissor") || t.includes("scissor") || t.includes("spell") || t.includes("magic")) {
      if (v1 > 0) p.scissor.currentATK += v1;
      if (v2 > 0) p.scissor.currentDEF += v2;
    }

    // Generic fallback: bazı boon'lar item stats olarak geçiyorsa
    else {
      // Eğer loot bir obje ile ekstra charges veya benzeri veriyorsa uygula (deneyselse)
      if (loot.grantCharges && typeof loot.grantCharges === "object") {
        p.rock.currentCharges = Math.min(3, p.rock.currentCharges + (loot.grantCharges.rock || 0));
        p.paper.currentCharges = Math.min(3, p.paper.currentCharges + (loot.grantCharges.paper || 0));
        p.scissor.currentCharges = Math.min(3, p.scissor.currentCharges + (loot.grantCharges.scissor || 0));
      }
    }
  }

  // compute evaluate(newState) - evaluate(oldState)
  private computeStateDeltaValue(state: GigaverseRunState, loot: any): number {
    const oldScore = this.config.evaluateFn(state);

    const clone = this.fastClone(state);
    this.applyLootToClone(clone, loot);

    const newScore = this.config.evaluateFn(clone);
    return newScore - oldScore;
  }

  // Basit build analizi: hangi silah build'i daha avantajlı? (normalize edilmiş skorlar)
  private analyzeBuildPreference(state: GigaverseRunState): { rock: number, paper: number, scissor: number, hp: number, armor: number, charges: number } {
    const p = state.player;
    // Basit heuristic: (atk * charges) + def bonus + relative to enemy
    const enemy = state.enemies[state.currentEnemyIndex] || null;

    const rockScore = (p.rock.currentATK * Math.max(1, Math.min(3, p.rock.currentCharges))) + (p.rock.currentDEF * 0.5);
    const paperScore = (p.paper.currentATK * Math.max(1, Math.min(3, p.paper.currentCharges))) + (p.paper.currentDEF * 0.5);
    const scissorScore = (p.scissor.currentATK * Math.max(1, Math.min(3, p.scissor.currentCharges))) + (p.scissor.currentDEF * 0.5);

    const maxWeapon = Math.max(rockScore, paperScore, scissorScore, 1);
    const rockPref = rockScore / maxWeapon;
    const paperPref = paperScore / maxWeapon;
    const scissorPref = scissorScore / maxWeapon;

    // HP vs Armor tendency: düşük HP -> hp ağırlığı artar; yüksek armor mevcutsa armor ağırlığı artar.
    const hpPref = 1 - (p.health.current / Math.max(1, p.health.max)); // daha düşük can => hpPref yüksek
    const armorPref = p.armor.current / Math.max(1, p.armor.max || 1);

    // charges pref: ne kadar mermi kaldığı (daha azsa charges daha değerli)
    const totalCharges = Math.max(0, (p.rock.currentCharges > 0 ? p.rock.currentCharges : 0) + (p.paper.currentCharges > 0 ? p.paper.currentCharges : 0) + (p.scissor.currentCharges > 0 ? p.scissor.currentCharges : 0));
    const chargesPref = 1 - Math.min(1, totalCharges / 9); // az charges -> daha yüksek pref

    return { rock: rockPref, paper: paperPref, scissor: scissorPref, hp: hpPref, armor: armorPref, charges: chargesPref };
  }

  // Micro-simulate: belirli tur kadar loot uygulanmış ve uygulanmamış hallerde deterministic benzetim uygula.
  // Çıktı: { deltaTTK, deltaSurvival } - TTK: time-to-kill (daha küçük daha iyi), Survival: 0..1 fark
  private microSimulateLootEffect(state: GigaverseRunState, loot: any, rounds: number): { deltaTTK: number, deltaSurvival: number } {
    // Kısa deterministic simülasyon: her round için en yüksek ATK hamlesini kullan (basitleştirilmiş)
    const baseClone = this.fastClone(state);
    const modClone = this.fastClone(state);
    this.applyLootToClone(modClone, loot);

    // Helper seçici: fighter için en yüksek öncelikli hamleyi döndür
    const pickGreedyMove = (f: GigaverseFighter): MoveType | null => {
      let best: { move: MoveType, val: number } | null = null;
      const rockVal = (f.rock.currentCharges > 0) ? f.rock.currentATK : -Infinity;
      const paperVal = (f.paper.currentCharges > 0) ? f.paper.currentATK : -Infinity;
      const scissorVal = (f.scissor.currentCharges > 0) ? f.scissor.currentATK : -Infinity;
      if (rockVal !== -Infinity) best = { move: MoveType.ROCK, val: rockVal };
      if (paperVal !== -Infinity && (best === null || paperVal > best.val)) best = { move: MoveType.PAPER, val: paperVal };
      if (scissorVal !== -Infinity && (best === null || scissorVal > best.val)) best = { move: MoveType.SCISSOR, val: scissorVal };
      return best ? best.move : null;
    };

    const runSimulation = (clone: GigaverseRunState): { survived: boolean, roundsToKillEnemy: number } => {
      let roundsToKill = 0;
      for (let r = 0; r < rounds; r++) {
        if (clone.player.health.current <= 0) break;
        if (clone.currentEnemyIndex >= clone.enemies.length) break;
        const enemy = clone.enemies[clone.currentEnemyIndex];
        if (!enemy) break;

        const pMove = pickGreedyMove(clone.player);
        const eMove = pickGreedyMove(enemy);

        // fallback: if null, use rock (consistent)
        const pm = pMove ?? MoveType.ROCK;
        const em = eMove ?? MoveType.ROCK;

        this.applyRoundOutcome(clone, pm, em);

        // advance enemy if dead
        if (clone.enemies[clone.currentEnemyIndex] && clone.enemies[clone.currentEnemyIndex].health.current <= 0) {
          clone.currentEnemyIndex++;
        }

        roundsToKill++;
      }

      const survived = clone.player.health.current > 0;
      return { survived, roundsToKill };
    };

    const baseRes = runSimulation(baseClone);
    const modRes = runSimulation(modClone);

    // deltaTTK: newTTK - oldTTK (pozitifse daha uzun sürmüş => kötü). Normalize: eğer enemy ölmedi simülasyonda, büyük pozitif penalty
    let baseTTK = baseRes.roundsToKill;
    let modTTK = modRes.roundsToKill;
    if (baseRes.roundsToKill === 0 && (state.enemies[state.currentEnemyIndex] && state.enemies[state.currentEnemyIndex].health.current > 0)) {
      baseTTK = rounds + 1;
    }
    if (modRes.roundsToKill === 0 && (state.enemies[state.currentEnemyIndex] && state.enemies[state.currentEnemyIndex].health.current > 0)) {
      modTTK = rounds + 1;
    }
    const deltaTTK = modTTK - baseTTK;

    // deltaSurvival: 1 if survived in mod and not in base, -1 if opposite, else 0 (coarse)
    const baseSurv = baseRes.survived ? 1 : 0;
    const modSurv = modRes.survived ? 1 : 0;
    const deltaSurvival = modSurv - baseSurv;

    return { deltaTTK, deltaSurvival };
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

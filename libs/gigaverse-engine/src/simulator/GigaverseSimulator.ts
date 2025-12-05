// path: gigaverse-engine/src/simulator/GigaverseSimulator.ts
/**
 * A production-ready simulator for the Gigaverse game.
 * Supports single-round logic, full-run simulation across multiple enemies,
 * and applying loot (including "maxArmor" style).
 * All logs/comments in English only, safe, and thoroughly documented.
 */

import { CustomLogger } from "../types/CustomLogger";
import { defaultLogger } from "../utils/defaultLogger";
import {
  GigaverseRunState,
  GigaverseFighter,
  GigaverseMoveState,
  GigaverseLootOption,
} from "./GigaverseTypes";
import {
  GigaverseAction,
  GigaverseActionType,
} from "../algorithms/IGigaverseAlgorithm";

/**
 * Possible moves in the Gigaverse.
 * If your logic changes in the future, adjust accordingly.
 */
export enum GigaverseMove {
  ROCK = "rock",
  PAPER = "paper",
  SCISSOR = "scissor",
}

export class GigaverseSimulator {
  private logger: CustomLogger;

  constructor(logger?: CustomLogger) {
    this.logger = logger ?? defaultLogger;
  }

  /**
   * Simulate a full run, fighting each enemy in sequence,
   * applying loot after each victory (if desired).
   *
   * The user supplies:
   *  - `pickMove`: callback that decides the player's move each round.
   *  - `pickLoot`: optional callback if we want to pick a loot after victory.
   *  - `generateLootOptions`: optional callback if we want to generate random loot automatically.
   *
   * Return a summary: finalState, how many enemies were defeated, and if the player survived.
   */
  public simulateFullRun(
    initialState: GigaverseRunState,
    pickMove: (s: GigaverseRunState) => GigaverseMove,
    pickLoot?: (
      loots: GigaverseLootOption[],
      s: GigaverseRunState
    ) => GigaverseLootOption,
    generateLootOptions?: (count: number) => GigaverseLootOption[]
  ): {
    finalState: GigaverseRunState;
    enemiesDefeated: number;
    survived: boolean;
  } {
    // clone to avoid mutating original
    const runState = this.cloneState(initialState);
    let enemiesDefeated = 0;

    // main loop: fight each enemy
    while (
      runState.currentEnemyIndex < runState.enemies.length &&
      runState.player.health.current > 0
    ) {
      // fight current enemy until one side dies
      const { duelWon, duelLost } = this.simulateOneDuel(runState, pickMove);
      if (duelWon) {
        enemiesDefeated++;

        // if we want to generate loot, do so now
        if (generateLootOptions) {
          runState.lootPhase = true;
          runState.lootOptions = generateLootOptions(3);
        }

        // if pickLoot is provided, let the user pick & apply
        if (runState.lootPhase && runState.lootOptions?.length && pickLoot) {
          const chosenLoot = pickLoot(runState.lootOptions, runState);
          this.applyLootOption(runState, chosenLoot);

          // reset loot phase
          runState.lootPhase = false;
          runState.lootOptions = [];
        }

        runState.currentEnemyIndex++;
      } else if (duelLost) {
        // player died => end
        break;
      }
    }

    const survived = runState.player.health.current > 0;
    return {
      finalState: runState,
      enemiesDefeated,
      survived,
    };
  }

  /**
   * Simulate a single duel vs. the current enemy.
   * Calls `simulateOneRound` repeatedly until the enemy or player dies.
   * Returns an object indicating if the duel was won or lost.
   */
  private simulateOneDuel(
    runState: GigaverseRunState,
    pickMove: (s: GigaverseRunState) => GigaverseMove
  ): { duelWon: boolean; duelLost: boolean } {
    const enemy = runState.enemies[runState.currentEnemyIndex];
    while (enemy.health.current > 0 && runState.player.health.current > 0) {
      const move = pickMove(runState);
      this.simulateOneRound(runState, move);
    }

    if (enemy.health.current <= 0) {
      return { duelWon: true, duelLost: false };
    }
    return { duelWon: false, duelLost: true };
  }

  /**
   * Simulate exactly one round of RPS, with the player's chosen move and
   * an enemy move (picked randomly here).
   */
  public simulateOneRound(
    runState: GigaverseRunState,
    playerMove: GigaverseMove
  ): GigaverseRunState {
    const enemy = runState.enemies[runState.currentEnemyIndex];
    if (!enemy) {
      this.logger.warn(
        "[simulateOneRound] No current enemy => possibly run ended."
      );
      return runState;
    }

    // pick random enemy move
    const enemyMove = this.pickRandomEnemyMove(enemy);
    this.logger.info(
      `[simulateOneRound] Player move=${playerMove}, Enemy move=${enemyMove}`
    );

    // compute outcome
    const outcome = this.computeRoundOutcome(
      playerMove,
      enemyMove,
      runState.player,
      enemy
    );

    // apply damage
    this.applyDamageAndArmor(
      outcome.dmgToEnemy,
      outcome.armorGainPlayer,
      runState.player,
      enemy
    );
    this.applyDamageAndArmor(
      outcome.dmgToPlayer,
      outcome.armorGainEnemy,
      enemy,
      runState.player
    );

    // update charges
    this.updateCharges(runState.player, playerMove);
    this.updateCharges(enemy, enemyMove);

    return runState;
  }

  /**
   * Optionally, a partial-run simulation for an AI (like MCTS) that does short horizon lookahead.
   */
  public simulatePartialRun(
    runState: GigaverseRunState,
    maxRounds: number
  ): { finalState: GigaverseRunState } {
    const cloned = this.cloneState(runState);
    for (let i = 0; i < maxRounds; i++) {
      const enemy = cloned.enemies[cloned.currentEnemyIndex];
      if (!enemy || cloned.player.health.current <= 0) break;

      // pick a random move for demonstration
      const move = this.pickRandomPlayerMove(cloned.player);
      this.simulateOneRound(cloned, move);

      // if enemy or player died => might move on or stop
      if (enemy.health.current <= 0) {
        cloned.currentEnemyIndex++;
        if (cloned.currentEnemyIndex >= cloned.enemies.length) break;
      }
    }
    return { finalState: cloned };
  }

  // -----------------------------------------------------
  //           DAMAGE / CHARGES / MOVE LOGIC
  // -----------------------------------------------------

  /**
   * Figure out how much damage each side deals, plus how much armor they gain.
   */
  private computeRoundOutcome(
    playerMove: GigaverseMove,
    enemyMove: GigaverseMove,
    player: GigaverseFighter,
    enemy: GigaverseFighter
  ): {
    dmgToEnemy: number;
    dmgToPlayer: number;
    armorGainPlayer: number;
    armorGainEnemy: number;
  } {
    const pStats = this.getMoveStats(player, playerMove);
    const eStats = this.getMoveStats(enemy, enemyMove);
    if (!pStats || !eStats) {
      return {
        dmgToEnemy: 0,
        dmgToPlayer: 0,
        armorGainPlayer: 0,
        armorGainEnemy: 0,
      };
    }

    const tie = playerMove === enemyMove;
    let playerWins = false;
    if (!tie) {
      // normal RPS
      if (
        (playerMove === GigaverseMove.ROCK &&
          enemyMove === GigaverseMove.SCISSOR) ||
        (playerMove === GigaverseMove.PAPER &&
          enemyMove === GigaverseMove.ROCK) ||
        (playerMove === GigaverseMove.SCISSOR &&
          enemyMove === GigaverseMove.PAPER)
      ) {
        playerWins = true;
      }
    }

    let dmgToEnemy = 0;
    let dmgToPlayer = 0;
    let armorGainPlayer = 0;
    let armorGainEnemy = 0;

    if (tie) {
      dmgToEnemy = pStats.currentATK;
      dmgToPlayer = eStats.currentATK;
      armorGainPlayer = pStats.currentDEF;
      armorGainEnemy = eStats.currentDEF;
    } else if (playerWins) {
      dmgToEnemy = pStats.currentATK;
      armorGainPlayer = pStats.currentDEF;
    } else {
      dmgToPlayer = eStats.currentATK;
      armorGainEnemy = eStats.currentDEF;
    }

    return { dmgToEnemy, dmgToPlayer, armorGainPlayer, armorGainEnemy };
  }

  /**
   * Apply incomingDamage to the defender, reduce armor first, then HP,
   * while the attacker gains some armor.
   */
  private applyDamageAndArmor(
    incomingDamage: number,
    armorGain: number,
    attacker: GigaverseFighter,
    defender: GigaverseFighter
  ) {
    // 1) attacker gains armor
    const oldArmor = attacker.armor.current;
    attacker.armor.current = Math.min(
      attacker.armor.current + armorGain,
      attacker.armor.max
    );

    if (armorGain > 0) {
      this.logger.info(
        `[applyDamageAndArmor] Attacker armor: ${oldArmor} -> ${attacker.armor.current} (+${armorGain})`
      );
    }

    // 2) defender soaks damage with armor
    let dmgLeft = incomingDamage;
    if (defender.armor.current > 0 && dmgLeft > 0) {
      const absorb = Math.min(defender.armor.current, dmgLeft);
      defender.armor.current -= absorb;
      dmgLeft -= absorb;
      this.logger.info(
        `[applyDamageAndArmor] Defender armor absorbed ${absorb} dmg.`
      );
    }

    // 3) leftover damage hits defender health
    if (dmgLeft > 0) {
      const oldHP = defender.health.current;
      defender.health.current = Math.max(0, oldHP - dmgLeft);
      this.logger.info(
        `[applyDamageAndArmor] Defender HP: ${oldHP} -> ${defender.health.current}`
      );
    }
  }

  /**
   * Updates charges for the used move (spam penalty if it was at 1 => -1),
   * and increments the other moves by +1 if they have charges left or are at -1 => 0.
   */
  private updateCharges(fighter: GigaverseFighter, usedMove: GigaverseMove) {
    const usedStats = this.getMoveStats(fighter, usedMove);
    if (!usedStats) return;

    if (usedStats.currentCharges > 1) {
      usedStats.currentCharges -= 1;
    } else if (usedStats.currentCharges === 1) {
      usedStats.currentCharges = -1; // spam penalty
      this.logger.warn(
        `[updateCharges] Move=${usedMove} => now -1 (spam penalty).`
      );
    }

    const allMoves = [
      GigaverseMove.ROCK,
      GigaverseMove.PAPER,
      GigaverseMove.SCISSOR,
    ];
    for (const mv of allMoves) {
      if (mv === usedMove) continue;
      const st = this.getMoveStats(fighter, mv);
      if (!st) continue;

      if (st.currentCharges === -1) {
        st.currentCharges = 0;
      } else if (st.currentCharges >= 0 && st.currentCharges < 3) {
        st.currentCharges++;
      }
    }
  }

  private getMoveStats(
    f: GigaverseFighter,
    move: GigaverseMove
  ): GigaverseMoveState | null {
    switch (move) {
      case GigaverseMove.ROCK:
        return f.rock;
      case GigaverseMove.PAPER:
        return f.paper;
      case GigaverseMove.SCISSOR:
        return f.scissor;
      default:
        return null;
    }
  }

  /**
   * Picks a random enemy move among the ones with charges > 0.
   */
  private pickRandomEnemyMove(f: GigaverseFighter): GigaverseMove {
    const candidates: GigaverseMove[] = [];
    if (f.rock.currentCharges > 0) candidates.push(GigaverseMove.ROCK);
    if (f.paper.currentCharges > 0) candidates.push(GigaverseMove.PAPER);
    if (f.scissor.currentCharges > 0) candidates.push(GigaverseMove.SCISSOR);

    if (candidates.length === 0) return GigaverseMove.ROCK;
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
  }

  /**
   * Picks a random move for the player. This is used for partialRun or fallback.
   */
  private pickRandomPlayerMove(f: GigaverseFighter): GigaverseMove {
    const candidates: GigaverseMove[] = [];
    if (f.rock.currentCharges > 0) candidates.push(GigaverseMove.ROCK);
    if (f.paper.currentCharges > 0) candidates.push(GigaverseMove.PAPER);
    if (f.scissor.currentCharges > 0) candidates.push(GigaverseMove.SCISSOR);

    if (candidates.length === 0) return GigaverseMove.ROCK;
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
  }

  // -----------------------------------------------------
  //                  LOOT APPLY
  // -----------------------------------------------------

  /**
   * Applies the chosen loot to the player's stats.
   * E.g. Heal => +HP, AddMaxHealth => increase max HP, AddMaxArmor => increase armor, etc.
   */
  public applyLootOption(state: GigaverseRunState, loot: GigaverseLootOption) {
    const { boonTypeString, selectedVal1, selectedVal2 } = loot;
    const p = state.player;

    switch (boonTypeString) {
      case "UpgradeRock":
        p.rock.currentATK += selectedVal1;
        p.rock.currentDEF += selectedVal2;
        break;
      case "UpgradePaper":
        p.paper.currentATK += selectedVal1;
        p.paper.currentDEF += selectedVal2;
        break;
      case "UpgradeScissor":
        p.scissor.currentATK += selectedVal1;
        p.scissor.currentDEF += selectedVal2;
        break;
      case "AddMaxHealth":
        p.health.max += selectedVal1;
        p.health.current = Math.min(
          p.health.current + selectedVal1,
          p.health.max
        );
        break;
      case "AddMaxArmor":
        p.armor.max += selectedVal1;
        // typically do not increase current armor
        break;
      case "Heal":
        p.health.current = Math.min(
          p.health.max,
          p.health.current + selectedVal1
        );
        break;
      default:
        this.logger.warn(
          `[applyLootOption] Unknown boonTypeString=${boonTypeString}`
        );
        break;
    }

    this.logger.info(
      `[applyLootOption] Applied => ${boonTypeString}, +${selectedVal1}, +${selectedVal2}`
    );
  }

  public applyAction(
    state: GigaverseRunState,
    action: GigaverseAction
  ): GigaverseRunState {
    switch (action.type) {
      case GigaverseActionType.MOVE_ROCK:
        return this.simulateOneRound(state, GigaverseMove.ROCK);
      case GigaverseActionType.MOVE_PAPER:
        return this.simulateOneRound(state, GigaverseMove.PAPER);
      case GigaverseActionType.MOVE_SCISSOR:
        return this.simulateOneRound(state, GigaverseMove.SCISSOR);

      case GigaverseActionType.PICK_LOOT_ONE:
        this.applyLootOption(state, state.lootOptions[0]);
        break;
      case GigaverseActionType.PICK_LOOT_TWO:
        this.applyLootOption(state, state.lootOptions[1]);
        break;
      case GigaverseActionType.PICK_LOOT_THREE:
        this.applyLootOption(state, state.lootOptions[2]);
        break;
      case GigaverseActionType.PICK_LOOT_FOUR:
        this.applyLootOption(state, state.lootOptions[3]);
        break;

      default:
        this.logger.warn(`[applyAction] Unknown action type: ${action.type}`);
        break;
    }

    // Réinitialisation après avoir choisi un loot
    if (action.type.startsWith("loot")) {
      state.lootOptions = [];
      state.lootPhase = false;
    }

    return state;
  }

  // -----------------------------------------------------
  //                  UTILITY
  // -----------------------------------------------------

  private cloneState<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

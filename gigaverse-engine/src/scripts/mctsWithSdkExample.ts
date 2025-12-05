// path: scripts/mctsWithSdkExample.ts
/**
 * Example script demonstrating how to:
 *   1) Fetch current dungeon state from the Gigaverse server
 *   2) Transform it into GigaverseRunState
 *   3) Use MctsAlgorithmEnhanced to pick the next action (move/loot)
 *   4) Display before/after state for the player/enemy
 *   5) Log which action it recommends
 * All logs in English only, production-ready.
 */

import { GameClient } from "@slkzgm/gigaverse-sdk";
import {
  MctsAlgorithm,
  MctsConfig,
  MctsActionType,
  MctsAction,
} from "../algorithms/mcts/MctsAlgorithm";

import { GigaverseRunState } from "../simulator/GigaverseTypes";
import {
  GigaverseSimulator,
  GigaverseMove,
} from "../simulator/GigaverseSimulator";
import { buildGigaverseRunState } from "../simulator/GigaverseTransforms";

// 1) Initialize the SDK with your actual API base URL and auth token.
const client = new GameClient(
  "https://gigaverse.io",
  "eyJhbGciOiJIUzI1NiJ9.eyJhZGRyZXNzIjoiMHg3MDBkN2I3NzRmNUFGNjVEMjZFNWI5QWU5NjljQTk2MTFmZjgwZjZEIiwidXNlciI6eyJfaWQiOiI2N2FkMzVhZmFiZTk5NzJmYzQ2MzYzZGQiLCJ3YWxsZXRBZGRyZXNzIjoiMHg3MDBkN2I3NzRmNWFmNjVkMjZlNWI5YWU5NjljYTk2MTFmZjgwZjZkIiwidXNlcm5hbWUiOiIweDcwMGQ3Yjc3NGY1QUY2NUQyNkU1YjlBZTk2OWNBOTYxMWZmODBmNkQiLCJjYXNlU2Vuc2l0aXZlQWRkcmVzcyI6IjB4NzAwZDdiNzc0ZjVBRjY1RDI2RTViOUFlOTY5Y0E5NjExZmY4MGY2RCIsIl9fdiI6MH0sImdhbWVBY2NvdW50Ijp7Im5vb2IiOnsiX2lkIjoiNjdhZDM1ZDc2YzFlNDQ4NzBjZGVhZTI3IiwiZG9jSWQiOiIxMzIiLCJ0YWJsZU5hbWUiOiJHaWdhTm9vYk5GVCIsInRhYmxlSWQiOiIweGIwY2I5ZDViYWM3YmI5NjEwMmMxYTBjZWMxMmE1N2U5NmU4NjAzNGI5NzE2Yjk5Y2EyZWQ5ZDgxZTYxYmI5ZGIiLCJjb2xTZXREYXRhIjp7IkxFVkVMX0NJRCI6eyJibG9ja19udW1iZXIiOjE2MjkzMzMsImxvZ19pbmRleCI6NTEsInRyYW5zYWN0aW9uX2luZGV4Ijo0fSwiSVNfTk9PQl9DSUQiOnsiYmxvY2tfbnVtYmVyIjoxNjI5MzMzLCJsb2dfaW5kZXgiOjUwLCJ0cmFuc2FjdGlvbl9pbmRleCI6NH0sIkxBU1RfVFJBTlNGRVJfVElNRV9DSUQiOnsiYmxvY2tfbnVtYmVyIjoxNjI5MzMzLCJsb2dfaW5kZXgiOjQ1LCJ0cmFuc2FjdGlvbl9pbmRleCI6NH0sIklOSVRJQUxJWkVEX0NJRCI6eyJibG9ja19udW1iZXIiOjE2MjkzMzMsImxvZ19pbmRleCI6NTIsInRyYW5zYWN0aW9uX2luZGV4Ijo0fSwiT1dORVJfQ0lEIjp7ImJsb2NrX251bWJlciI6MTYyOTMzMywibG9nX2luZGV4Ijo0OCwidHJhbnNhY3Rpb25faW5kZXgiOjR9fSwiTEVWRUxfQ0lEIjoxLCJjcmVhdGVkQXQiOiIyMDI1LTAyLTEyVDIzOjU5OjE5LjE2OVoiLCJ1cGRhdGVkQXQiOiIyMDI1LTAyLTEyVDIzOjU5OjIxLjEyN1oiLCJfX3YiOjAsIklTX05PT0JfQ0lEIjp0cnVlLCJMQVNUX1RSQU5TRkVSX1RJTUVfQ0lEIjoxNzM5NDA0NzU1LCJJTklUSUFMSVpFRF9DSUQiOnRydWUsIk9XTkVSX0NJRCI6IjB4NzAwZDdiNzc0ZjVhZjY1ZDI2ZTViOWFlOTY5Y2E5NjExZmY4MGY2ZCJ9LCJhbGxvd2VkVG9DcmVhdGVBY2NvdW50Ijp0cnVlLCJjYW5FbnRlckdhbWUiOnRydWUsIm5vb2JQYXNzQmFsYW5jZSI6MywibGFzdE5vb2JJZCI6NjQ3NjAsIm1heE5vb2JJZCI6MTAwMDB9LCJleHAiOjE3NDQ1NTQzMzJ9.JVbw8-JzAaMJ55Yg_k_XypsWuJqHjTIvCJrvlt-Rfgc"
);

// 2) Build an MCTS config (tweak as needed)
const mctsConfig: MctsConfig = {
  simulationsCount: 1000,
  maxDepth: 3,
  // optionally define evaluateFn or explorationConstant here
};

const mcts = new MctsAlgorithm(mctsConfig);

// We'll also create a local simulator instance if we want to apply the chosen action locally for "after" state debugging.
const localSim = new GigaverseSimulator();

async function main() {
  try {
    // 3) Fetch the current dungeon state from the server
    const dungeonResp = await client.fetchDungeonState();
    if (!dungeonResp.success || !dungeonResp.data.run) {
      console.log(
        "No active run or fetchDungeonState failed. Response:",
        dungeonResp
      );
      return;
    }

    // Possibly also fetch known enemies if you store them in the simulator
    const enemiesResp = await client.getAllEnemies();
    const enemies = enemiesResp.entities; // EnemyEntity[]

    // 4) Transform server data into local GigaverseRunState
    const gigaverseState = buildGigaverseRunState(dungeonResp.data, enemies);

    // === Before: Display Player + Enemy stats ===
    displayBeforeStats(gigaverseState);

    // 5) Use MCTS to pick the next action
    const nextAction = mcts.pickAction(gigaverseState);
    console.log("[INFO] MCTS recommended action =>", nextAction);

    // 6) Locally apply the action to show "after" state for debugging (purely local!)
    const postState = applyActionLocally(gigaverseState, nextAction);
    displayAfterStats(gigaverseState, postState);

    // 7) If you want to actually call the server:
    if (
      nextAction.type === MctsActionType.MOVE_ROCK ||
      nextAction.type === MctsActionType.MOVE_PAPER ||
      nextAction.type === MctsActionType.MOVE_SCISSOR
    ) {
      console.log(
        "[INFO] => We'll call client.playMove({ action: 'rock/paper/scissor', ... })"
      );
    } else if (
      nextAction.type === MctsActionType.PICK_LOOT_1 ||
      nextAction.type === MctsActionType.PICK_LOOT_2 ||
      nextAction.type === MctsActionType.PICK_LOOT_3
    ) {
      const idx = nextAction.lootIndex ?? 0;
      console.log(
        `[INFO] => We'll call client.playMove({ action: 'pick_loot', index: ${idx} })`
      );
    }
  } catch (err) {
    console.error("[ERROR]", err);
  }
}

/**
 * For debugging, display the "before" stats of the player + current enemy.
 */
function displayBeforeStats(state: GigaverseRunState) {
  const player = state.player;
  console.log("[BEFORE] Player =>", {
    HP: `${player.health.current}/${player.health.max}`,
    Armor: `${player.armor.current}/${player.armor.max}`,
    RockCharges: player.rock.currentCharges,
    PaperCharges: player.paper.currentCharges,
    ScissorCharges: player.scissor.currentCharges,
  });

  if (state.currentEnemyIndex < state.enemies.length) {
    const enemy = state.enemies[state.currentEnemyIndex];
    console.log("[BEFORE] Enemy =>", {
      HP: `${enemy.health.current}/${enemy.health.max}`,
      Armor: `${enemy.armor.current}/${enemy.armor.max}`,
      RockCharges: enemy.rock.currentCharges,
      PaperCharges: enemy.paper.currentCharges,
      ScissorCharges: enemy.scissor.currentCharges,
    });
  } else {
    console.log("[BEFORE] No current enemy => Possibly run ended?");
  }
}

/**
 * Locally apply the MCTS-chosen action to see the "expected" after-state.
 * We replicate the same logic MCTS uses.
 */
function applyActionLocally(
  oldState: GigaverseRunState,
  action: MctsAction
): GigaverseRunState {
  // We can call "simulateOneRound" or "applyLootOption" as MCTS does.
  // We'll do a minimal approach. If you want, you can re-use the MctsAlgorithmEnhanced logic.
  const newState: GigaverseRunState = JSON.parse(
    JSON.stringify(oldState)
  ) as GigaverseRunState;

  switch (action.type) {
    case MctsActionType.MOVE_ROCK:
      localSim.simulateOneRound(newState, GigaverseMove.ROCK);
      break;
    case MctsActionType.MOVE_PAPER:
      localSim.simulateOneRound(newState, GigaverseMove.PAPER);
      break;
    case MctsActionType.MOVE_SCISSOR:
      localSim.simulateOneRound(newState, GigaverseMove.SCISSOR);
      break;

    case MctsActionType.PICK_LOOT_1:
    case MctsActionType.PICK_LOOT_2:
    case MctsActionType.PICK_LOOT_3: {
      const idx = action.lootIndex ?? 0;
      const chosenLoot = newState.lootOptions[idx];
      localSim.applyLootOption(newState, chosenLoot);
      newState.lootOptions = [];
      newState.lootPhase = false;
      break;
    }
  }

  return newState;
}

/**
 * Print the player's and enemy's stats after we locally applied the MCTS-chosen move.
 * This helps you debug what MCTS "expects" to happen if you follow its advice.
 */
function displayAfterStats(
  before: GigaverseRunState,
  after: GigaverseRunState
) {
  console.log("[AFTER] Player =>", {
    HP: `${after.player.health.current}/${after.player.health.max}`,
    Armor: `${after.player.armor.current}/${after.player.armor.max}`,
    Rock: `${after.player.rock.currentATK} | ${after.player.rock.currentDEF} (${after.player.rock.currentCharges})`,
    Paper: `${after.player.paper.currentATK} | ${after.player.paper.currentDEF} (${after.player.paper.currentCharges})`,
    Scissor: `${after.player.scissor.currentATK} | ${after.player.scissor.currentDEF} (${after.player.scissor.currentCharges})`,
  });

  if (after.currentEnemyIndex < after.enemies.length) {
    const enemyAfter = after.enemies[after.currentEnemyIndex];
    console.log("[AFTER] Enemy =>", {
      HP: `${enemyAfter.health.current}/${enemyAfter.health.max}`,
      Armor: `${enemyAfter.armor.current}/${enemyAfter.armor.max}`,
      Rock: `${enemyAfter.rock.currentATK} | ${enemyAfter.rock.currentDEF} (${enemyAfter.rock.currentCharges})`,
      Paper: `${enemyAfter.paper.currentATK} | ${enemyAfter.paper.currentDEF} (${enemyAfter.paper.currentCharges})`,
      Scissor: `${enemyAfter.scissor.currentATK} | ${enemyAfter.scissor.currentDEF} (${enemyAfter.scissor.currentCharges})`,
    });
  } else {
    console.log(
      "[AFTER] No current enemy => Possibly run ended or enemy died?"
    );
  }

  console.log("[INFO] Differences => ");
  console.log(
    "  Player HP difference:",
    after.player.health.current - before.player.health.current
  );
  console.log(
    "  Enemy HP difference:",
    after.enemies[after.currentEnemyIndex]?.health.current -
      before.enemies[before.currentEnemyIndex]?.health.current
  );
}

// Run main
main().catch(console.error);

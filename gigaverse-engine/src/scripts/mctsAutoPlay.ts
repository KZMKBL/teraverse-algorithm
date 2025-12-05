// path: scripts/mctsAutoPlay.ts
/**
 * A script that repeatedly calls MCTS for each step (move/loot pick)
 * and auto-plays until the run ends.
 *
 * This is an extension of "mctsWithSdkExample", but in a loop,
 * so we don't have to manually do each step.
 *
 * Usage:
 *   ts-node scripts/mctsAutoPlay.ts
 */

import { GameClient } from "@slkzgm/gigaverse-sdk"; // adjust path if needed
import { MctsAlgorithm, MctsConfig } from "../algorithms/mcts/MctsAlgorithm";
import { buildGigaverseRunState } from "../simulator/GigaverseTransforms";

/**
 * Same config as in mctsWithSdkExample, just loop continuously.
 */
const mctsConfig: MctsConfig = {
  simulationsCount: 500,
  maxDepth: 4,
  // or define evaluateFn if you want
};

const mcts = new MctsAlgorithm(mctsConfig);

// Initialize your SDK
const client = new GameClient("https://gigaverse.io", "");

/**
 * The main auto-play function.
 */
async function main() {
  const startTime = Date.now();

  let actionToken = "";

  // 1) First, fetch the current run.
  //    (Or start one if none is found, if that's part of your flow.)
  let dungeonStateResp = await client.fetchDungeonState();
  if (!dungeonStateResp.success || !dungeonStateResp.data?.run) {
    console.error(
      "[ERROR] No active run found or fetchDungeonState failed =>",
      dungeonStateResp.message
    );
    const startResp = await client.startRun({
      actionToken: "",
      dungeonId: 1,
      data: {
        consumables: [],
        itemId: 0,
        index: 0,
        gearInstanceIds: [],
      },
    });
    actionToken = startResp.actionToken;
    dungeonStateResp = await client.fetchDungeonState();
  }

  // We'll keep looping until the run ends (run=null) or player HP=0.
  let runData = dungeonStateResp.data;

  const enemiesResp = await client.getAllEnemies();
  const enemies = enemiesResp.entities; // EnemyEntity[]

  while (true) {
    // If run is null => ended
    if (!runData) {
      console.log(
        "[INFO] runData is null => run ended. Possibly victory or defeat."
      );
      break;
    }

    // Transform to local GigaverseRunState for MCTS
    const gigaverseState = buildGigaverseRunState(runData, enemies);

    // Check if the player is dead
    if (gigaverseState.player.health.current <= 0) {
      console.log("[INFO] Player HP=0 => run ended (defeat).");
      break;
    }

    // (Optional) If you want to detect a complete run by some other property, do so here:
    // e.g. if runData.COMPLETE_CID or runData.lootPhase=false but no more enemies => break;

    // 2) MCTS picks next action
    const nextAction = mcts.pickAction(gigaverseState);
    console.log("[INFO] MCTS =>", nextAction.type);

    // 3) Actually call the server with that action
    // We can use nextAction.type directly since you changed MctsActionType to
    // 'rock' | 'paper' | 'scissor' | 'loot_one' | 'loot_two' | 'loot_three'
    const moveResp = await client.playMove({
      action: nextAction.type,
      actionToken,
      dungeonId: 1,
      data: {}, // If you need an item index or something, you can add it here
    });

    // Check if success
    if (!moveResp.success || !moveResp.data) {
      console.warn("[WARN] playMove failed =>", moveResp.message);
      break;
    }

    if (moveResp.actionToken) {
      actionToken = moveResp.actionToken;
    } else {
      actionToken = "";
    }

    // 4) Update run data from server response
    runData = moveResp.data || null;

    // If runData is null => run ended
    if (!runData) {
      console.log("[INFO] run ended => possibly victory or defeat");
      break;
    }

    // If player's HP=0 => break
    const playerHP = runData.run.players[0].health.current;
    if (playerHP <= 0) {
      console.log("[INFO] Player HP=0 => run ended (defeat).");
      break;
    }

    // Otherwise continue the loop
  }

  // End => measure time
  const endTime = Date.now();
  const totalMs = endTime - startTime;
  console.log(
    `[INFO] Run ended. Enemies defeated: ${runData.entity?.ROOM_NUM_CID - 1}, Total time => ${(totalMs / 1000).toFixed(2)}s`
  );
  console.log(JSON.stringify(runData));
}

// Start
main().catch(console.error);

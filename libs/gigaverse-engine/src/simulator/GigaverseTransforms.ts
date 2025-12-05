// path: gigaverse-engine/src/simulator/GigaverseTransforms.ts

import {
  Player as SdkPlayer,
  LootOption as SdkLootOption,
  EnemyEntity,
  DungeonData,
} from "@slkzgm/gigaverse-sdk/dist/client/types/game";
import {
  GigaverseFighter,
  GigaverseMoveState,
  GigaverseHealthState,
  GigaverseArmorState,
  GigaverseLootOption,
  GigaverseRunState,
} from "./GigaverseTypes";

/**
 * Transform a server-side `Player` object into our minimal `GigaverseFighter`.
 */
export function transformSdkPlayerToGigaverseFighter(
  p: SdkPlayer
): GigaverseFighter {
  // We'll define a helper to avoid repeating ourselves:
  const toMoveState = (stats: {
    currentATK: number;
    currentDEF: number;
    currentCharges: number;
  }): GigaverseMoveState => {
    return {
      currentATK: stats.currentATK,
      currentDEF: stats.currentDEF,
      currentCharges: stats.currentCharges, // ignoring maxCharges if always 3
    };
  };

  const toHealthState = (h: {
    current: number;
    currentMax: number;
  }): GigaverseHealthState => {
    return {
      current: h.current,
      max: h.currentMax,
    };
  };

  const toArmorState = (s: {
    current: number;
    currentMax: number;
  }): GigaverseArmorState => {
    return {
      current: s.current,
      max: s.currentMax,
    };
  };

  return {
    rock: toMoveState(p.rock),
    paper: toMoveState(p.paper),
    scissor: toMoveState(p.scissor),
    health: toHealthState(p.health),
    armor: toArmorState(p.shield),
  };
}

export function transformSdkEnemyEntityToGigaverseFighter(
  e: EnemyEntity
): GigaverseFighter {
  const arr = e.MOVE_STATS_CID_array;

  const [
    rockATK,
    rockShield,
    paperATK,
    paperShield,
    scissorATK,
    scissorShield,
    maxHP,
    maxArmor,
  ] = arr;

  return {
    rock: {
      currentATK: rockATK,
      currentDEF: rockShield,
      currentCharges: 3,
    },
    paper: {
      currentATK: paperATK,
      currentDEF: paperShield,
      currentCharges: 3,
    },
    scissor: {
      currentATK: scissorATK,
      currentDEF: scissorShield,
      currentCharges: 3,
    },
    health: {
      current: maxHP,
      max: maxHP,
    },
    armor: {
      current: maxArmor,
      max: maxArmor,
    },
  };
}

/**
 * Convert the server's `LootOption` into a minimal `GigaverseLootOption`.
 */
export function transformSdkLootOptionToGigaverse(
  sdkLoot: SdkLootOption
): GigaverseLootOption {
  return {
    selectedVal1: sdkLoot.selectedVal1,
    selectedVal2: sdkLoot.selectedVal2,
    boonTypeString: sdkLoot.boonTypeString,
  };
}

/**
 * If you want to transform an entire array:
 */
export function transformSdkLootOptions(
  sdkLoots: SdkLootOption[]
): GigaverseLootOption[] {
  return sdkLoots.map(transformSdkLootOptionToGigaverse);
}

/**
 * Helper: Build a GigaverseRunState from the server's runData + known enemies.
 * This is a minimal transform example.
 * Adjust logic to match how your server data organizes players + enemies.
 */
export function buildGigaverseRunState(
  data: DungeonData,
  allEnemies: EnemyEntity[]
): GigaverseRunState {
  // Ensure we have valid run and entity data
  if (!data.run) {
    throw new Error("Missing dungeon run data (data.run is null)");
  }
  if (!data.entity) {
    throw new Error("Missing dungeon entity data (data.entity is null)");
  }

  // After checks, safely narrow types
  const run = data.run;
  const entity = data.entity;

  const userPlayer = transformSdkPlayerToGigaverseFighter(run.players[0]);

  const currentEnemyIndex = entity.ROOM_NUM_CID - 1;

  const enemyFighters: GigaverseFighter[] = [];
  for (let i = 0; i < allEnemies.length; i++) {
    if (i === currentEnemyIndex) {
      // Current enemy from active run
      const eFighter = transformSdkPlayerToGigaverseFighter(run.players[1]);
      enemyFighters.push(eFighter);
    } else {
      // Predefined enemy template
      const eFighter = transformSdkEnemyEntityToGigaverseFighter(allEnemies[i]);
      enemyFighters.push(eFighter);
    }
  }

  let lootOptions: GigaverseLootOption[] = [];
  if (run.lootPhase && run.lootOptions?.length) {
    lootOptions = run.lootOptions.map(transformSdkLootOptionToGigaverse);
  }

  return {
    player: userPlayer,
    enemies: enemyFighters,
    currentEnemyIndex,
    lootPhase: run.lootPhase,
    lootOptions,
  };
}

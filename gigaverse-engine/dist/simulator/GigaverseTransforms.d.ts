import { Player as SdkPlayer, LootOption as SdkLootOption, EnemyEntity, DungeonData } from "@slkzgm/gigaverse-sdk/dist/client/types/game";
import { GigaverseFighter, GigaverseLootOption, GigaverseRunState } from "./GigaverseTypes";
/**
 * Transform a server-side `Player` object into our minimal `GigaverseFighter`.
 */
export declare function transformSdkPlayerToGigaverseFighter(p: SdkPlayer): GigaverseFighter;
export declare function transformSdkEnemyEntityToGigaverseFighter(e: EnemyEntity): GigaverseFighter;
/**
 * Convert the server's `LootOption` into a minimal `GigaverseLootOption`.
 */
export declare function transformSdkLootOptionToGigaverse(sdkLoot: SdkLootOption): GigaverseLootOption;
/**
 * If you want to transform an entire array:
 */
export declare function transformSdkLootOptions(sdkLoots: SdkLootOption[]): GigaverseLootOption[];
/**
 * Helper: Build a GigaverseRunState from the server's runData + known enemies.
 * This is a minimal transform example.
 * Adjust logic to match how your server data organizes players + enemies.
 */
export declare function buildGigaverseRunState(data: DungeonData, allEnemies: EnemyEntity[]): GigaverseRunState;
//# sourceMappingURL=GigaverseTransforms.d.ts.map
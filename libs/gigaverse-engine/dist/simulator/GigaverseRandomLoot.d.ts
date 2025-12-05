/**
 * Provides random loot generation for offline simulations.
 * Weighted rarities, random boon type ("AddMaxArmor", "UpgradeRock", etc.),
 * and computes selectedVal1/selectedVal2 accordingly.
 * All logs/comments in English only, production-ready.
 */
import { GigaverseLootOption } from "./GigaverseTypes";
export declare function generateRandomLootOption(): GigaverseLootOption;
export declare function generateRandomLootOptions(count: number): GigaverseLootOption[];
//# sourceMappingURL=GigaverseRandomLoot.d.ts.map
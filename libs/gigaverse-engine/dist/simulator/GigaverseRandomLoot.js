"use strict";
// path: gigaverse-engine/src/simulator/GigaverseRandomLoot.ts
/**
 * Provides random loot generation for offline simulations.
 * Weighted rarities, random boon type ("AddMaxArmor", "UpgradeRock", etc.),
 * and computes selectedVal1/selectedVal2 accordingly.
 * All logs/comments in English only, production-ready.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRandomLootOption = generateRandomLootOption;
exports.generateRandomLootOptions = generateRandomLootOptions;
function generateRandomLootOption() {
    const boonType = pickBoonType();
    const rarity = pickRarity();
    let selectedVal1 = 0;
    let selectedVal2 = 0;
    switch (boonType) {
        case "Heal": {
            selectedVal1 = healValues[rarity]; // e.g. 6,8,12,25,36
            break;
        }
        case "AddMaxHealth": {
            selectedVal1 = maxHealthValues[rarity]; // e.g. 2,4,6,8,12
            break;
        }
        case "AddMaxArmor": {
            if (rarity === 0) {
                // no loot for rarity 0 => re-roll or set to 0
                return generateRandomLootOption();
            }
            selectedVal1 = maxArmorValues[rarity - 1]; // e.g. 1..5
            break;
        }
        case "UpgradeRock":
        case "UpgradePaper":
        case "UpgradeScissor": {
            // Decide if it's an ATK or DEF increase: 50-50
            const isAtk = Math.random() < 0.5;
            const val = upgradeValues[rarity]; // e.g. 1..5
            if (isAtk) {
                selectedVal1 = val; // ATK
                selectedVal2 = 0;
            }
            else {
                selectedVal1 = 0;
                selectedVal2 = val; // DEF
            }
            break;
        }
    }
    return {
        boonTypeString: boonType,
        selectedVal1,
        selectedVal2,
    };
}
function generateRandomLootOptions(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(generateRandomLootOption());
    }
    return results;
}
// --------------------------------------
// Weighted picks for boon type & rarity
// --------------------------------------
function pickBoonType() {
    const total = boonTypes.reduce((sum, b) => sum + b.weight, 0);
    let r = Math.random() * total;
    for (const b of boonTypes) {
        if (r < b.weight) {
            return b.type;
        }
        r -= b.weight;
    }
    return boonTypes[boonTypes.length - 1].type;
}
function pickRarity() {
    let r = Math.random();
    let cumulative = 0;
    for (let i = 0; i < rarityWeights.length; i++) {
        cumulative += rarityWeights[i];
        if (r < cumulative) {
            return i; // 0..4
        }
    }
    return 4;
}
// --------------------------------------
// Weighted distributions & stat arrays
// --------------------------------------
const boonTypes = [
    { type: "Heal", weight: 1.0 },
    { type: "AddMaxHealth", weight: 1.0 },
    { type: "AddMaxArmor", weight: 1.0 },
    { type: "UpgradeRock", weight: 1.0 },
    { type: "UpgradePaper", weight: 1.0 },
    { type: "UpgradeScissor", weight: 1.0 },
];
// e.g. 40% common, 30% uncommon, 15% rare, 10% epic, 5% legendary
const rarityWeights = [0.4, 0.3, 0.15, 0.1, 0.05];
// Heal => [6, 8, 12, 25, 36]
const healValues = [6, 8, 12, 25, 36];
// maxHealth => [2, 4, 6, 8, 12]
const maxHealthValues = [2, 4, 6, 8, 12];
// maxArmor => no rarity 0 => [1,2,4,5] => index => rarity-1
const maxArmorValues = [1, 2, 4, 5];
// upgrade => [1,2,3,4,5]
const upgradeValues = [1, 2, 3, 4, 5];

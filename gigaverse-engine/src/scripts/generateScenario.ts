// scripts/generateScenario.ts
import fs from "fs";
import path from "path";
import seedrandom from "seedrandom";
import { GigaverseLootOption, GigaverseMove } from "../";
import { generateRandomLootOptions } from "../simulator/GigaverseRandomLoot";

interface Scenario {
  enemyMoves: GigaverseMove[][];
  lootOptions: GigaverseLootOption[][];
}

const SCENARIO_SEED = "scenario-seed";
const MAX_ROUNDS = 100;

function generateScenario(enemyCount: number, seed: string): Scenario {
  const rng = seedrandom(seed);

  function pickRandomMove(): GigaverseMove {
    const moves = [
      GigaverseMove.ROCK,
      GigaverseMove.PAPER,
      GigaverseMove.SCISSOR,
    ];
    return moves[Math.floor(rng() * moves.length)];
  }

  const enemyMoves: GigaverseMove[][] = Array.from({ length: enemyCount }, () =>
    Array.from({ length: MAX_ROUNDS }, pickRandomMove)
  );

  const lootOptions: GigaverseLootOption[][] = Array.from(
    { length: enemyCount },
    () => generateRandomLootOptions(4)
  );

  return { enemyMoves, lootOptions };
}

function saveScenarios(scenarios: Scenario[], fileName: string) {
  const dir = path.resolve(__dirname, "../scenarios");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(scenarios, null, 2));
  console.log(`Scenarios saved at ${filePath}`);
}

const enemyCount = parseInt(process.argv[2], 10);
const scenarioCount = parseInt(process.argv[3], 10) || 1000;

if (!enemyCount || enemyCount <= 0) {
  console.error(
    "Usage: ts-node generateScenario.ts <enemyCount> [scenarioCount=1000]"
  );
  process.exit(1);
}

const scenarios = Array.from({ length: scenarioCount }, (_, idx) =>
  generateScenario(enemyCount, `${SCENARIO_SEED}-${idx}`)
);

saveScenarios(scenarios, `scenario_${scenarioCount}.json`);

import fs from "fs";
import path from "path";
import cloneDeep from "lodash/cloneDeep";
import {
  AStarAlgorithm,
  DPAlgorithm,
  GigaverseRunState,
  GigaverseSimulator,
  GreedyAlgorithm,
  IGigaverseAlgorithm,
  MctsAlgorithm,
  MinimaxAlgorithm,
} from "..";

interface Scenario {
  enemyMoves: string[][];
  lootOptions: any[][];
}

interface EnemyEntity {
  docId: string;
  ID_CID: string;
  EQUIPMENT_HEAD_CID: number;
  EQUIPMENT_BODY_CID: number;
  NAME_CID: string;
  LOOT_ID_CID: number;
  MOVE_STATS_CID_array: number[];
}

interface AlgorithmEntry {
  name: string;
  algorithm: IGigaverseAlgorithm;
}

function loadScenarios(filePath: string): Scenario[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as Scenario[];
}

function runScenario(
  scenario: Scenario,
  initialState: GigaverseRunState,
  enemies: EnemyEntity[],
  algorithm: IGigaverseAlgorithm
) {
  const simulator = new GigaverseSimulator({
    info: () => {},
    warn: () => {},
    error: () => {},
  });
  const state = cloneDeep(initialState);
  state.enemies = enemies.map((enemy, idx) => ({
    rock: {
      currentATK: enemy.MOVE_STATS_CID_array[0],
      currentDEF: enemy.MOVE_STATS_CID_array[1],
      currentCharges: 3,
    },
    paper: {
      currentATK: enemy.MOVE_STATS_CID_array[2],
      currentDEF: enemy.MOVE_STATS_CID_array[3],
      currentCharges: 3,
    },
    scissor: {
      currentATK: enemy.MOVE_STATS_CID_array[4],
      currentDEF: enemy.MOVE_STATS_CID_array[5],
      currentCharges: 3,
    },
    health: {
      current: enemy.MOVE_STATS_CID_array[6],
      max: enemy.MOVE_STATS_CID_array[6],
    },
    armor: {
      current: enemy.MOVE_STATS_CID_array[7],
      max: enemy.MOVE_STATS_CID_array[7],
    },
    movesSequence: scenario.enemyMoves[idx],
  }));

  let enemiesDefeated = 0;
  state.currentEnemyIndex = 0;

  for (let enemyIdx = 0; enemyIdx < state.enemies.length; enemyIdx++) {
    while (
      state.player.health.current > 0 &&
      state.enemies[enemyIdx].health.current > 0
    ) {
      const action = algorithm.pickAction(state);
      simulator.applyAction(state, action);
    }

    if (state.player.health.current <= 0) break;
    enemiesDefeated++;

    if (scenario.lootOptions[enemyIdx]) {
      state.lootPhase = true;
      state.lootOptions = scenario.lootOptions[enemyIdx];
      const lootAction = algorithm.pickAction(state);
      simulator.applyAction(state, lootAction);
    }

    state.currentEnemyIndex++;
  }

  return { enemiesDefeated, survived: state.player.health.current > 0 };
}

function compareAlgorithms(
  scenarioPath: string,
  initialState: GigaverseRunState,
  enemies: EnemyEntity[],
  algorithms: AlgorithmEntry[]
) {
  const scenarios = loadScenarios(scenarioPath);

  algorithms.forEach(({ name, algorithm }) => {
    let totalDefeated = 0,
      survivedCount = 0;

    scenarios.forEach((scenario) => {
      const result = runScenario(scenario, initialState, enemies, algorithm);
      totalDefeated += result.enemiesDefeated;
      survivedCount += result.survived ? 1 : 0;
    });

    console.log(`Algorithm: ${name}`);
    console.log(
      `Average Enemies defeated: ${(totalDefeated / scenarios.length).toFixed(2)}`
    );
    console.log(
      `Survival Rate: ${((survivedCount / scenarios.length) * 100).toFixed(2)}%`
    );
  });
}

const scenarioFilePath = path.resolve(
  __dirname,
  "../scenarios/scenario_10.json"
);

const initialState: GigaverseRunState = {
  player: {
    rock: { currentATK: 15, currentDEF: 2, currentCharges: 3 },
    paper: { currentATK: 1, currentDEF: 8, currentCharges: 3 },
    scissor: { currentATK: 3, currentDEF: 2, currentCharges: 3 },
    health: { current: 18, max: 18 },
    armor: { current: 8, max: 8 },
  },
  enemies: [],
  currentEnemyIndex: 0,
  lootPhase: false,
  lootOptions: [],
};

const enemiesList: EnemyEntity[] = [
  {
    docId: "Enemy#1",
    ID_CID: "1",
    EQUIPMENT_HEAD_CID: 12,
    EQUIPMENT_BODY_CID: 13,
    NAME_CID: "Red Robe",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [4, 0, 0, 4, 2, 2, 4, 2],
  },
  {
    docId: "Enemy#2",
    ID_CID: "2",
    EQUIPMENT_HEAD_CID: 14,
    EQUIPMENT_BODY_CID: 15,
    NAME_CID: "Black Robe",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [4, 2, 2, 4, 2, 3, 2, 5],
  },
  {
    docId: "Enemy#3",
    ID_CID: "3",
    EQUIPMENT_HEAD_CID: 18,
    EQUIPMENT_BODY_CID: 17,
    NAME_CID: "Black Knight",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [4, 2, 2, 4, 5, 2, 6, 4],
  },
  {
    docId: "Enemy#4",
    ID_CID: "4",
    EQUIPMENT_HEAD_CID: 66,
    EQUIPMENT_BODY_CID: 67,
    NAME_CID: "Dark Guard",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [4, 2, 7, 2, 2, 4, 9, 6],
  },
  {
    docId: "Enemy#5",
    ID_CID: "5",
    EQUIPMENT_HEAD_CID: 68,
    EQUIPMENT_BODY_CID: 69,
    NAME_CID: "Paladin",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [2, 3, 7, 5, 3, 4, 12, 8],
  },
  {
    docId: "Enemy#6",
    ID_CID: "6",
    EQUIPMENT_HEAD_CID: 70,
    EQUIPMENT_BODY_CID: 71,
    NAME_CID: "Fanatic",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [7, 6, 5, 6, 5, 6, 14, 5],
  },
  {
    docId: "Enemy#7",
    ID_CID: "7",
    EQUIPMENT_HEAD_CID: 93,
    EQUIPMENT_BODY_CID: 94,
    NAME_CID: "Forest Robe",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [5, 4, 4, 5, 10, 5, 15, 5],
  },
  {
    docId: "Enemy#8",
    ID_CID: "8",
    EQUIPMENT_HEAD_CID: 96,
    EQUIPMENT_BODY_CID: 97,
    NAME_CID: "Crimson Knight",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [7, 4, 11, 7, 5, 6, 10, 15],
  },
  {
    docId: "Enemy#9",
    ID_CID: "9",
    EQUIPMENT_HEAD_CID: 95,
    EQUIPMENT_BODY_CID: 92,
    NAME_CID: "White Knight",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [9, 6, 7, 7, 11, 4, 17, 10],
  },
  {
    docId: "Enemy#10",
    ID_CID: "10",
    EQUIPMENT_HEAD_CID: 141,
    EQUIPMENT_BODY_CID: 142,
    NAME_CID: "Impkin",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [15, 3, 13, 12, 12, 6, 18, 14],
  },
  {
    docId: "Enemy#11",
    ID_CID: "11",
    EQUIPMENT_HEAD_CID: 128,
    EQUIPMENT_BODY_CID: 129,
    NAME_CID: "Nocturne",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [12, 5, 6, 12, 18, 8, 22, 15],
  },
  {
    docId: "Enemy#12",
    ID_CID: "12",
    EQUIPMENT_HEAD_CID: 98,
    EQUIPMENT_BODY_CID: 99,
    NAME_CID: "Azure Guard",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [14, 10, 19, 4, 8, 12, 26, 18],
  },
  {
    docId: "Enemy#13",
    ID_CID: "13",
    EQUIPMENT_HEAD_CID: 126,
    EQUIPMENT_BODY_CID: 127,
    NAME_CID: "Gryndor",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [21, 0, 10, 5, 7, 5, 30, 20],
  },
  {
    docId: "Enemy#14",
    ID_CID: "14",
    EQUIPMENT_HEAD_CID: 117,
    EQUIPMENT_BODY_CID: 118,
    NAME_CID: "Aetherion",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [10, 5, 21, 0, 8, 12, 30, 20],
  },
  {
    docId: "Enemy#15",
    ID_CID: "15",
    EQUIPMENT_HEAD_CID: 124,
    EQUIPMENT_BODY_CID: 125,
    NAME_CID: "Zyren",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [10, 10, 12, 4, 21, 0, 30, 20],
  },
  {
    docId: "Enemy#16",
    ID_CID: "16",
    EQUIPMENT_HEAD_CID: 103,
    EQUIPMENT_BODY_CID: 104,
    NAME_CID: "Crusader",
    LOOT_ID_CID: 35,
    MOVE_STATS_CID_array: [20, 10, 20, 10, 20, 10, 40, 28],
  },
  {
    docId: "Enemy#17",
    ID_CID: "17",
    EQUIPMENT_HEAD_CID: 105,
    EQUIPMENT_BODY_CID: 106,
    NAME_CID: "Overseer",
    LOOT_ID_CID: 38,
    MOVE_STATS_CID_array: [20, 10, 20, 10, 20, 10, 40, 28],
  },
  {
    docId: "Enemy#18",
    ID_CID: "18",
    EQUIPMENT_HEAD_CID: 107,
    EQUIPMENT_BODY_CID: 108,
    NAME_CID: "Athena",
    LOOT_ID_CID: 37,
    MOVE_STATS_CID_array: [20, 10, 20, 10, 20, 10, 40, 28],
  },
  {
    docId: "Enemy#19",
    ID_CID: "19",
    EQUIPMENT_HEAD_CID: 109,
    EQUIPMENT_BODY_CID: 110,
    NAME_CID: "Archon",
    LOOT_ID_CID: 39,
    MOVE_STATS_CID_array: [20, 10, 20, 10, 20, 10, 40, 28],
  },
  {
    docId: "Enemy#20",
    ID_CID: "20",
    EQUIPMENT_HEAD_CID: 111,
    EQUIPMENT_BODY_CID: 112,
    NAME_CID: "Foxglove",
    LOOT_ID_CID: 40,
    MOVE_STATS_CID_array: [20, 10, 20, 10, 20, 10, 40, 28],
  },
  {
    docId: "Enemy#21",
    ID_CID: "21",
    EQUIPMENT_HEAD_CID: 114,
    EQUIPMENT_BODY_CID: 114,
    NAME_CID: "Summoner",
    LOOT_ID_CID: 36,
    MOVE_STATS_CID_array: [20, 10, 20, 10, 20, 10, 40, 28],
  },
  {
    docId: "Enemy#22",
    ID_CID: "22",
    EQUIPMENT_HEAD_CID: 115,
    EQUIPMENT_BODY_CID: 116,
    NAME_CID: "Chobo",
    LOOT_ID_CID: 34,
    MOVE_STATS_CID_array: [20, 10, 20, 10, 20, 10, 40, 28],
  },
  {
    docId: "Enemy#23",
    ID_CID: "23",
    EQUIPMENT_HEAD_CID: 186,
    EQUIPMENT_BODY_CID: 187,
    NAME_CID: "Dirtmaw",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [5, 2, 3, 3, 4, 2, 8, 5],
  },
  {
    docId: "Enemy#24",
    ID_CID: "24",
    EQUIPMENT_HEAD_CID: 192,
    EQUIPMENT_BODY_CID: 193,
    NAME_CID: "Grimhusk",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [3, 1, 8, 7, 4, 1, 12, 7],
  },
  {
    docId: "Enemy#25",
    ID_CID: "25",
    EQUIPMENT_HEAD_CID: 179,
    EQUIPMENT_BODY_CID: 180,
    NAME_CID: "Gobwark",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [10, 6, 4, 3, 9, 2, 15, 8],
  },
  {
    docId: "Enemy#26",
    ID_CID: "26",
    EQUIPMENT_HEAD_CID: 161,
    EQUIPMENT_BODY_CID: 162,
    NAME_CID: "Azure Aetherion",
    LOOT_ID_CID: 54,
    MOVE_STATS_CID_array: [9, 5, 14, 10, 8, 5, 20, 12],
  },
  {
    docId: "Enemy#27",
    ID_CID: "27",
    EQUIPMENT_HEAD_CID: 159,
    EQUIPMENT_BODY_CID: 160,
    NAME_CID: "Crimson Aetherion",
    LOOT_ID_CID: 55,
    MOVE_STATS_CID_array: [12, 12, 5, 9, 9, 5, 20, 12],
  },
  {
    docId: "Enemy#28",
    ID_CID: "28",
    EQUIPMENT_HEAD_CID: 181,
    EQUIPMENT_BODY_CID: 182,
    NAME_CID: "Bulwark",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [13, 4, 8, 3, 5, 3, 24, 12],
  },
  {
    docId: "Enemy#29",
    ID_CID: "29",
    EQUIPMENT_HEAD_CID: 190,
    EQUIPMENT_BODY_CID: 191,
    NAME_CID: "Ratsnout",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [10, 4, 4, 10, 15, 8, 26, 15],
  },
  {
    docId: "Enemy#30",
    ID_CID: "30",
    EQUIPMENT_HEAD_CID: 194,
    EQUIPMENT_BODY_CID: 195,
    NAME_CID: "Dighusk",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [8, 10, 17, 4, 4, 12, 28, 17],
  },
  {
    docId: "Enemy#31",
    ID_CID: "31",
    EQUIPMENT_HEAD_CID: 173,
    EQUIPMENT_BODY_CID: 174,
    NAME_CID: "Azure Gryndor",
    LOOT_ID_CID: 56,
    MOVE_STATS_CID_array: [12, 4, 4, 14, 20, 9, 28, 18],
  },
  {
    docId: "Enemy#32",
    ID_CID: "32",
    EQUIPMENT_HEAD_CID: 171,
    EQUIPMENT_BODY_CID: 172,
    NAME_CID: "Crimson Gryndor",
    LOOT_ID_CID: 57,
    MOVE_STATS_CID_array: [11, 10, 17, 6, 10, 11, 22, 16],
  },
  {
    docId: "Enemy#33",
    ID_CID: "33",
    EQUIPMENT_HEAD_CID: 188,
    EQUIPMENT_BODY_CID: 189,
    NAME_CID: "Minktrap",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [4, 14, 8, 4, 14, 7, 26, 20],
  },
  {
    docId: "Enemy#34",
    ID_CID: "34",
    EQUIPMENT_HEAD_CID: 196,
    EQUIPMENT_BODY_CID: 197,
    NAME_CID: "Ironhusk",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [12, 5, 20, 4, 8, 12, 40, 14],
  },
  {
    docId: "Enemy#35",
    ID_CID: "35",
    EQUIPMENT_HEAD_CID: 183,
    EQUIPMENT_BODY_CID: 184,
    NAME_CID: "Grimwark",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [23, 4, 4, 15, 18, 4, 28, 30],
  },
  {
    docId: "Enemy#36",
    ID_CID: "36",
    EQUIPMENT_HEAD_CID: 169,
    EQUIPMENT_BODY_CID: 170,
    NAME_CID: "Azure Zyren",
    LOOT_ID_CID: 58,
    MOVE_STATS_CID_array: [26, 0, 26, 0, 0, 30, 36, 30],
  },
  {
    docId: "Enemy#37",
    ID_CID: "37",
    EQUIPMENT_HEAD_CID: 167,
    EQUIPMENT_BODY_CID: 168,
    NAME_CID: "Crimson Zyren",
    LOOT_ID_CID: 59,
    MOVE_STATS_CID_array: [26, 0, 0, 30, 26, 0, 32, 24],
  },
  {
    docId: "Enemy#38",
    ID_CID: "38",
    EQUIPMENT_HEAD_CID: 232,
    EQUIPMENT_BODY_CID: 233,
    NAME_CID: "Skeltin",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [20, 6, 15, 8, 15, 8, 35, 35],
  },
  {
    docId: "Enemy#39",
    ID_CID: "39",
    EQUIPMENT_HEAD_CID: 143,
    EQUIPMENT_BODY_CID: 144,
    NAME_CID: "Crimson Impkin",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [15, 8, 15, 8, 22, 6, 35, 38],
  },
  {
    docId: "Enemy#40",
    ID_CID: "40",
    EQUIPMENT_HEAD_CID: 255,
    EQUIPMENT_BODY_CID: 256,
    NAME_CID: "Bryophytus",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [18, 10, 23, 6, 15, 8, 40, 45],
  },
  {
    docId: "Enemy#41",
    ID_CID: "41",
    EQUIPMENT_HEAD_CID: 241,
    EQUIPMENT_BODY_CID: 242,
    NAME_CID: "Hand Of Bekda",
    LOOT_ID_CID: 0,
    MOVE_STATS_CID_array: [35, 0, 35, 0, 35, 0, 1, 200],
  },
];

function improvedEvaluate(state: GigaverseRunState): number {
  const healthRatio = state.player.health.current / state.player.health.max;
  const armorRatio = state.player.armor.current / state.player.armor.max;
  const chargePenalty = [
    state.player.rock,
    state.player.paper,
    state.player.scissor,
  ].filter((move) => move.currentCharges <= 0).length;

  const lootPenalty = state.lootPhase
    ? state.lootOptions.reduce((penalty, loot) => {
        if (loot.boonTypeString === "Heal" && healthRatio === 1)
          return penalty + 1;
        if (
          loot.boonTypeString === "AddMaxArmor" &&
          state.player.armor.current === state.player.armor.max
        )
          return penalty + 0.5;
        return penalty;
      }, 0)
    : 0;

  const enemiesDefeated = state.currentEnemyIndex;

  return (
    enemiesDefeated +
    healthRatio +
    armorRatio * 0.5 -
    chargePenalty * 0.2 -
    lootPenalty
  );
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const mcts = new MctsAlgorithm(
  { simulationsCount: 300, maxDepth: 4 },
  silentLogger
);
const mctsPlus = new MctsAlgorithm(
  { simulationsCount: 300, maxDepth: 4, evaluateFn: improvedEvaluate },
  silentLogger
);
const greedy = new GreedyAlgorithm({ atkWeight: 2.0 }, silentLogger);
const minimax = new MinimaxAlgorithm({ maxDepth: 3 }, silentLogger);
const dp = new DPAlgorithm({ maxHorizon: 4 }, silentLogger);
const astar = new AStarAlgorithm({ maxIterations: 100 }, silentLogger);

compareAlgorithms(scenarioFilePath, initialState, enemiesList, [
  // { name: "MCTS", algorithm: mcts },
  // { name: "MCTS++", algorithm: mctsPlus },
  { name: "greedy", algorithm: greedy },
  { name: "minimax", algorithm: minimax },
  { name: "dp", algorithm: dp },
  { name: "astar", algorithm: astar },
]);

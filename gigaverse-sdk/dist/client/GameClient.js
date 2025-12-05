"use strict";
// path: src/client/GameClient.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameClient = void 0;
const HttpClient_1 = require("./HttpClient");
const logger_1 = require("../utils/logger");
/**
 * Main SDK class exposing methods for dungeon runs, user data, items, etc.
 */
class GameClient {
    constructor(baseUrl, authToken) {
        this.currentActionToken = null;
        this.httpClient = new HttpClient_1.HttpClient(baseUrl, authToken);
    }
    setAuthToken(newToken) {
        this.httpClient.setAuthToken(newToken);
    }
    getActionToken() {
        return this.currentActionToken;
    }
    setActionToken(token) {
        this.currentActionToken = token;
    }
    /**
     * Claims a resource like "energy", "shard", or "dust".
     */
    async claimRom(payload) {
        logger_1.logger.info("Claiming resource...");
        const endpoint = "/api/roms/factory/claim";
        const response = await this.httpClient.post(endpoint, payload);
        logger_1.logger.info(`Claim result => success: ${response.success}`);
        return response;
    }
    /**
     * Starts a dungeon run, storing the returned actionToken automatically.
     */
    async startRun(payload) {
        logger_1.logger.info("Starting dungeon run...");
        const endpoint = "/api/game/dungeon/action";
        const body = {
            action: "start_run",
            actionToken: payload.actionToken,
            dungeonId: payload.dungeonId,
            data: payload.data,
        };
        const response = await this.httpClient.post(endpoint, body);
        if (response.actionToken) {
            this.setActionToken(response.actionToken);
            logger_1.logger.info(`New action token: ${response.actionToken}`);
        }
        return response;
    }
    /**
     * Performs a move or loot action.
     * Action can be "rock", "paper", "scissor", "loot_one", etc.
     */
    async playMove(payload) {
        logger_1.logger.info(`Performing action: ${payload.action}`);
        const endpoint = "/api/game/dungeon/action";
        const finalToken = payload.actionToken ?? this.currentActionToken ?? "";
        const body = {
            action: payload.action,
            actionToken: finalToken,
            dungeonId: payload.dungeonId,
            data: payload.data,
        };
        const response = await this.httpClient.post(endpoint, body);
        if (response.actionToken) {
            this.setActionToken(response.actionToken);
            logger_1.logger.info(`Updated action token: ${response.actionToken}`);
        }
        if (response.gameItemBalanceChanges?.length) {
            logger_1.logger.info(`gameItemBalanceChanges: ${JSON.stringify(response.gameItemBalanceChanges)}`);
        }
        return response;
    }
    /**
     * Uses an item (e.g. "use_item" action with itemId, index).
     */
    async useItem(payload) {
        logger_1.logger.info(`Using item. ID: ${payload.data?.itemId}`);
        const endpoint = "/api/game/dungeon/action";
        const finalToken = payload.actionToken ?? this.currentActionToken ?? "";
        const body = {
            action: "use_item",
            actionToken: finalToken,
            dungeonId: payload.dungeonId,
            data: payload.data,
        };
        const response = await this.httpClient.post(endpoint, body);
        if (response.actionToken) {
            this.setActionToken(response.actionToken);
            logger_1.logger.info(`Updated action token: ${response.actionToken}`);
        }
        if (response.gameItemBalanceChanges?.length) {
            logger_1.logger.info(`gameItemBalanceChanges: ${JSON.stringify(response.gameItemBalanceChanges)}`);
        }
        return response;
    }
    /**
     * Retrieves all ROMs associated with the given address.
     */
    async getUserRoms(address) {
        logger_1.logger.info(`Fetching user ROMs for address: ${address}`);
        const endpoint = `/api/roms/player/${address}`;
        return this.httpClient.get(endpoint);
    }
    /**
     * Fetches the current dungeon state. If run=null, not in a run.
     */
    async fetchDungeonState() {
        logger_1.logger.info("Fetching dungeon state...");
        const endpoint = "/api/game/dungeon/state";
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves all available game items from the indexer.
     */
    async getAllGameItems() {
        logger_1.logger.info("Fetching all game items...");
        const endpoint = "/api/indexer/gameitems";
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves all enemies from the indexer.
     */
    async getAllEnemies() {
        logger_1.logger.info("Fetching enemies...");
        const endpoint = "/api/indexer/enemies";
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves the wallet address and a flag indicating if the user can enter the game.
     */
    async getUserMe() {
        logger_1.logger.info("Fetching /api/user/me");
        const endpoint = "/api/user/me";
        return this.httpClient.get(endpoint);
    }
    async getEnergy(address) {
        logger_1.logger.info(`Fetching energy for: ${address}`);
        const endpoint = `/api/offchain/player/energy/${address}`;
        return this.httpClient.get(endpoint);
    }
    async getJuiceState(address) {
        logger_1.logger.info(`Fetching juice state for: ${address}`);
        const endpoint = `/api/gigajuice/player/${address}`;
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves faction info (e.g. faction ID) for the given address.
     */
    async getFaction(address) {
        logger_1.logger.info(`Fetching faction for: ${address}`);
        const endpoint = `/api/factions/player/${address}`;
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves balances of various items for the given address.
     */
    async getUserBalances(address) {
        logger_1.logger.info(`Fetching user balances for: ${address}`);
        const endpoint = `/api/importexport/balances/${address}`;
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves hero's skill progress and level, given a noobId.
     */
    async getHeroSkillsProgress(noobId) {
        logger_1.logger.info(`Fetching skill progress for noobId: ${noobId}`);
        const endpoint = `/api/offchain/skills/progress/${noobId}`;
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves consumable items the user holds, from the indexer.
     */
    async getConsumables(address) {
        logger_1.logger.info(`Fetching consumables for: ${address}`);
        const endpoint = `/api/indexer/player/gameitems/${address}`;
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves global skill definitions from /api/offchain/skills.
     */
    async getAllSkills() {
        logger_1.logger.info("Fetching skill definitions...");
        const endpoint = "/api/offchain/skills";
        return this.httpClient.get(endpoint);
    }
    /**
     * Fetches offchain static data, including constants, enemies, recipes, game items, etc.
     */
    async getOffchainStatic() {
        logger_1.logger.info("Fetching /api/offchain/static...");
        const endpoint = "/api/offchain/static";
        return this.httpClient.get(endpoint);
    }
    /**
     * Retrieves today's dungeon progress for the user, including daily run counts and dungeon data.
     */
    async getDungeonToday() {
        logger_1.logger.info("Fetching /api/game/dungeon/today...");
        const endpoint = "/api/game/dungeon/today";
        return this.httpClient.get(endpoint);
    }
    /**
     * Sends a request to level up a skill stat for a given hero.
     */
    async levelUpSkill(payload) {
        logger_1.logger.info(`Leveling up skill -> skillId:${payload.skillId}, statId:${payload.statId}, noobId:${payload.noobId}`);
        const endpoint = "/api/game/skill/levelup";
        const response = await this.httpClient.post(endpoint, payload);
        logger_1.logger.info(`Skill level up complete. success: ${response.success}, message: ${response.message}`);
        return response;
    }
    /**
     * Retrieves aggregated account data: the main account entity,
     * any usernames, the single noob (if any), and checkpoint progress states.
     */
    async getAccount(address) {
        logger_1.logger.info(`Fetching /api/account/${address} ...`);
        const endpoint = `/api/account/${address}`;
        return this.httpClient.get(endpoint);
    }
}
exports.GameClient = GameClient;

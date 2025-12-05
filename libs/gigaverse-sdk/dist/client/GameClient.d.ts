import { ActionPayload, ClaimRomPayload, LevelUpSkillPayload, StartRunPayload } from "./types/requests";
import { ClaimRomResponse, GetAllEnemiesResponse, GetAllGameItemsResponse, GetEnergyResponse, GetUserRomsResponse, GetUserMeResponse, GetFactionResponse, GetBalancesResponse, GetSkillsProgressResponse, GetConsumablesResponse, GetAllSkillsResponse, BaseResponse, GetJuiceStateResponse, GetOffchainStaticResponse, GetDungeonTodayResponse, LevelUpSkillResponse, GetAccountResponse } from "./types/responses";
/**
 * Main SDK class exposing methods for dungeon runs, user data, items, etc.
 */
export declare class GameClient {
    private httpClient;
    private currentActionToken;
    constructor(baseUrl: string, authToken: string);
    setAuthToken(newToken: string): void;
    getActionToken(): string | number | null;
    setActionToken(token: string | number): void;
    /**
     * Claims a resource like "energy", "shard", or "dust".
     */
    claimRom(payload: ClaimRomPayload): Promise<ClaimRomResponse>;
    /**
     * Starts a dungeon run, storing the returned actionToken automatically.
     */
    startRun(payload: StartRunPayload): Promise<BaseResponse>;
    /**
     * Performs a move or loot action.
     * Action can be "rock", "paper", "scissor", "loot_one", etc.
     */
    playMove(payload: ActionPayload): Promise<BaseResponse>;
    /**
     * Uses an item (e.g. "use_item" action with itemId, index).
     */
    useItem(payload: ActionPayload): Promise<BaseResponse>;
    /**
     * Retrieves all ROMs associated with the given address.
     */
    getUserRoms(address: string): Promise<GetUserRomsResponse>;
    /**
     * Fetches the current dungeon state. If run=null, not in a run.
     */
    fetchDungeonState(): Promise<BaseResponse>;
    /**
     * Retrieves all available game items from the indexer.
     */
    getAllGameItems(): Promise<GetAllGameItemsResponse>;
    /**
     * Retrieves all enemies from the indexer.
     */
    getAllEnemies(): Promise<GetAllEnemiesResponse>;
    /**
     * Retrieves the wallet address and a flag indicating if the user can enter the game.
     */
    getUserMe(): Promise<GetUserMeResponse>;
    getEnergy(address: string): Promise<GetEnergyResponse>;
    getJuiceState(address: string): Promise<GetJuiceStateResponse>;
    /**
     * Retrieves faction info (e.g. faction ID) for the given address.
     */
    getFaction(address: string): Promise<GetFactionResponse>;
    /**
     * Retrieves balances of various items for the given address.
     */
    getUserBalances(address: string): Promise<GetBalancesResponse>;
    /**
     * Retrieves hero's skill progress and level, given a noobId.
     */
    getHeroSkillsProgress(noobId: string | number): Promise<GetSkillsProgressResponse>;
    /**
     * Retrieves consumable items the user holds, from the indexer.
     */
    getConsumables(address: string): Promise<GetConsumablesResponse>;
    /**
     * Retrieves global skill definitions from /api/offchain/skills.
     */
    getAllSkills(): Promise<GetAllSkillsResponse>;
    /**
     * Fetches offchain static data, including constants, enemies, recipes, game items, etc.
     */
    getOffchainStatic(): Promise<GetOffchainStaticResponse>;
    /**
     * Retrieves today's dungeon progress for the user, including daily run counts and dungeon data.
     */
    getDungeonToday(): Promise<GetDungeonTodayResponse>;
    /**
     * Sends a request to level up a skill stat for a given hero.
     */
    levelUpSkill(payload: LevelUpSkillPayload): Promise<LevelUpSkillResponse>;
    /**
     * Retrieves aggregated account data: the main account entity,
     * any usernames, the single noob (if any), and checkpoint progress states.
     */
    getAccount(address: string): Promise<GetAccountResponse>;
}
//# sourceMappingURL=GameClient.d.ts.map
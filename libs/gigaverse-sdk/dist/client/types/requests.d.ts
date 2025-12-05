/**
 * Request payload definitions for core SDK methods.
 */
export interface ClaimRomPayload {
    romId: string;
    claimId: string;
}
export interface StartRunPayload {
    actionToken: string | number;
    dungeonId: number;
    data: {
        isJuiced: boolean;
        consumables: any[];
        itemId: number;
        index: number;
    };
}
export interface ActionPayload {
    action: string;
    actionToken: string | number;
    dungeonId: number;
    data: any;
}
export interface LevelUpSkillPayload {
    skillId: number;
    statId: number;
    noobId: number;
}
//# sourceMappingURL=requests.d.ts.map
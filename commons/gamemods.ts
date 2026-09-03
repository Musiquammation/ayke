import { GameMode } from "./GameMode";
import { GMAirBasket } from "./gamemods/GMAirBasket";
import { GMSuperTicTacToe } from "./gamemods/GMSuperTicTacToe";
import { GMTest } from "./gamemods/GMTest";
import { GMTestSolo } from "./gamemods/GMTestSolo";
import { GMTurrets } from "./gamemods/GMTurrets";
import { SoloGameMode } from "./SoloGameMode";

interface Player {
    trophees: number;
    data: Uint8Array;
    pseudo: string | null;
}

interface MultiplayerFactory {
    type: 'multiplayer';
    server(
        players: Player[],
        total: number,
        hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
    ): Promise<{
        game: GameMode,
        data: Uint8Array
    }>,
    client(entry: Uint8Array | null, total: number, playerIdx: number): {
        game: GameMode,
        data: any,
        html: HTMLDivElement | null,
        skins: { [key: string]: string },
    },
    dom(unlockedSkins: string[]): {produce: ()=>Uint8Array},
    textures: { [key: string]: string },
    name: string,
    tropheesPerPlayer: number,
    skins: string[],
    computerOnly: boolean,
    defaultPlayerCount: number
}

interface SoloFactory {
    type: 'solo';
    name: string;
    computerOnly: boolean;
    textures: { [key: string]: string },
    categories: string[],
    minFirst: boolean,
    dom(): {produce: ()=>string},
    create: ()=>SoloGameMode
}

export const gamemods: Record<string, MultiplayerFactory | SoloFactory> = {
    test: {
        type: 'multiplayer',
        server: GMTest.createServ,
        client: GMTest.createClient,
        dom: GMTest.generateClientDom,
        textures: GMTest.TEXTURES,
        name: "Test",
        computerOnly: false,
        tropheesPerPlayer: 2,
        skins: [],
        defaultPlayerCount: 4
    },

    airbasket: {
        type: 'multiplayer',
        server: GMAirBasket.createServ,
        client: GMAirBasket.createClient,
        dom: GMAirBasket.generateClientDom,
        textures: GMAirBasket.TEXTURES,
        name: "Air Basket",
        tropheesPerPlayer: 20,
        computerOnly: true,
        skins: GMAirBasket.SKINS_IDS,
        defaultPlayerCount: 4
    },

    superTicTacToe: {
        type: 'multiplayer',
        server: GMSuperTicTacToe.createServ,
        client: GMSuperTicTacToe.createClient,
        dom: GMSuperTicTacToe.generateClientDom,
        textures: GMSuperTicTacToe.TEXTURES,
        name: "Super tic tac toe",
        tropheesPerPlayer: 3,
        computerOnly: false,
        skins: [],
        defaultPlayerCount: 2
    },

    turrets: {
        type: 'multiplayer',
        server: GMTurrets.createServ,
        client: GMTurrets.createClient,
        dom: GMTurrets.generateClientDom,
        textures: GMTurrets.TEXTURES,
        name: "Turrets",
        tropheesPerPlayer: 20,
        computerOnly: false,
        skins: [],
        defaultPlayerCount: 4
    },

	testSolo: {
		type: 'solo',
		name: "Test Solo",
		computerOnly: false,
		dom: GMTestSolo.generateClientDom,
        textures: GMTestSolo.TEXTURES,
        categories: GMTestSolo.CATEGORIES,
        minFirst: GMTestSolo.MIN_FIRST,
        create: GMTestSolo.create
	}
};




export function getMultiGmFactory(gamemode: string) {
    const factory = gamemods[gamemode];
    if (!factory || factory.type !== 'multiplayer') {
        throw new Error(`Invalid gamemode '${gamemode}'`);
    }

    return factory;
}

export function getSoloGmFactory(gamemode: string) {
    const factory = gamemods[gamemode];
    if (!factory || factory.type !== 'solo') {
        throw new Error(`Invalid gamemode '${gamemode}'`);
    }

    return factory;
}

export function getGmFactory(gamemode: string) {
    const factory = gamemods[gamemode];
    if (!factory) {
        throw new Error(`Invalid gamemode '${gamemode}'`);
    }

    return factory;
}

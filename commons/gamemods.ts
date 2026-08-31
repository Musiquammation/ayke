import { GameMode } from "./GameMode";
import { GMAirBasket } from "./gamemods/GMAirBasket";
import { GMTest } from "./gamemods/GMTest";
import { GMTestSolo } from "./gamemods/GMTestSolo";

interface Player {
    trophees: number;
    data: Uint8Array;
}

interface MultiplayerFactory {
    type: 'multiplayer';
    server(players: Player[], total: number): {
        game: GameMode,
        data: Uint8Array
    },
    client(entry: Uint8Array | null, total: number): {
        game: GameMode,
        data: any,
        html: HTMLDivElement | null
    },
    dom(): {produce: ()=>Uint8Array},
    textures: { [key: string]: string },
    name: string,
    tropheesPerPlayer: number,
    computerOnly: boolean
}

interface SoloFactory {
    type: 'solo';
    name: string;
    computerOnly: boolean;
    dom(): {produce: ()=>Uint8Array},
}

export const gamemods: Record<string, MultiplayerFactory | SoloFactory> = {
    test: {
        type: 'multiplayer',
        server: GMTest.createServ,
        client: GMTest.createClient,
        dom: GMTest.generateClientDom,
        textures: GMTest.TEXTURES,
        name: "Test",
        tropheesPerPlayer: 20,
        computerOnly: false
    },

    airbasket: {
        type: 'multiplayer',
        server: GMAirBasket.createServ,
        client: GMAirBasket.createClient,
        dom: GMAirBasket.generateClientDom,
        textures: GMAirBasket.TEXTURES,
        name: "Air Basket",
        tropheesPerPlayer: 20,
        computerOnly: true
    },

	testSolo: {
		type: 'solo',
		name: "Test Solo",
		computerOnly: false,
		dom: GMTestSolo.generateClientDom
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

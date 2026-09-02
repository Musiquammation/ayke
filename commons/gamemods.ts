import { GameMode } from "./GameMode";
import { GMAirBasket } from "./gamemods/GMAirBasket";
import { GMTest } from "./gamemods/GMTest";

interface Player {
    trophees: number;
    data: Uint8Array;
    pseudo: string | null;
}

export const gamemods: Record<
    string,
    {
        server(
            players: Player[],
            total: number,
            hasSkin: (gamemode: string, skinId: string, user: string) => Promise<boolean>
        ): Promise<{
            game: GameMode,
            data: Uint8Array
        }>,
        client(entry: Uint8Array | null, total: number): {
            game: GameMode,
            data: any,
            html: HTMLDivElement | null,
            skins: { [k: string]: string; }
        },
        dom(generateClientDom: string[]): {produce: ()=>Uint8Array},
        textures: { [key: string]: string },
        name: string,
        tropheesPerPlayer: number,
        skins: string[]
    }
> = {
    test: {
        server: GMTest.createServ,
        client: GMTest.createClient,
        dom: GMTest.generateClientDom,
        textures: GMTest.TEXTURES,
        name: "Test",
        tropheesPerPlayer: 2,
        skins: []
    },

    airbasket: {
        server: GMAirBasket.createServ,
        client: GMAirBasket.createClient,
        dom: GMAirBasket.generateClientDom,
        textures: GMAirBasket.TEXTURES,
        name: "Air Basket",
        tropheesPerPlayer: 20,
        skins: GMAirBasket.SKINS_IDS
    },
};


export function getGmFactory(gamemode: string) {
    const factory = gamemods[gamemode];
    if (!factory) {
        throw new Error(`Invalid gamemode '${gamemode}'`);
    }

    return factory;
}
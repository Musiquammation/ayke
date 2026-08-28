import { Fields } from "./Fields";
import { GameMode } from "./GameMode";
import { GMTest } from "./gamemods/GMTest";

interface Player {
    trophees: number;
    data: Uint8Array;
}

export const gamemods: Record<
    string,
    {
        server(players: Player[], total: number): {
            game: GameMode,
            data: Uint8Array
        },
        client(entry: Uint8Array | null, total: number): {
            game: GameMode,
            data: any
        },
        dom(): {produce: ()=>Uint8Array},
        textures: { [key: string]: string },
        name: string,
        tropheesPerPlayer: number
    }

> = {
    test: {
        server: GMTest.createServ,
        client: GMTest.createClient,
        dom: GMTest.generateClientDom,
        textures: GMTest.TEXTURES,
        name: "Test",
        tropheesPerPlayer: 20
    },
};



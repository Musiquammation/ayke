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
        server: (players: Player[], total: number) => {
            game: GameMode,
            data: Uint8Array
        },
        client: (entry: Uint8Array, total: number) => {
            game: GameMode,
            data: any
        },
        textures: { [key: string]: string },
        dom: () => {produce: ()=>Uint8Array},
        name: string,
        tropheesPerPlayer: number
    }

> = {
    test: {
        server: (players, total) => GMTest.createServ(players, total),
        client: (entry, total) => GMTest.createClient(entry, total),
        dom: GMTest.generateClientDom,
        textures: GMTest.TEXTURES,
        name: "Test",
        tropheesPerPlayer: 20
    },
};



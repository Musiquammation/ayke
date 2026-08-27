import { Fields } from "./Fields";
import { GameMode } from "./GameMode";
import { GMAirBasket } from "./gamemods/GMAirBasket";
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
        client: (entry: Uint8Array, total: number) => GameMode,
        dom: () => {produce: ()=>Uint8Array},
        tropheesPerPlayer: number
    }

> = {
    test: {
        server: (players, total) => GMTest.createServ(players, total),
        client: (entry, total) => GMTest.createClient(entry, total),
        dom: GMTest.generateClientDom,
        tropheesPerPlayer: 20
    },

    airbasket: {
        server: (players, total) => GMAirBasket.createServ(players, total),
        client: (entry, total) => GMAirBasket.createClient(entry, total),
        dom: GMAirBasket.generateClientDom,
        tropheesPerPlayer: 20

    },
};



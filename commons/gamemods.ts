import { Fields } from "./Fields";
import { GameMode } from "./GameMode";
import { GMAirBasket } from "./gamemods/GMAirBasket";
import { GMTest } from "./gamemods/GMTest";

interface Player {
    trophees: number;
    data: Fields;
}

export const gamemods: Record<
    string,
    {
        server: (players: Player[], total: number) => {
            game: GameMode,
            data: Uint8Array
        },
        client: (entry: Uint8Array, total: number) => GameMode,
    }

> = {
    test: {
        server: (players, total) => GMTest.createServ(players, total),
        client: (entry, total) => GMTest.createClient(entry, total),
    },

    airbasket: {
        server: (players, total) => GMAirBasket.createServ(players, total),
        client: (entry, total) => GMAirBasket.createClient(entry, total),
    },
};



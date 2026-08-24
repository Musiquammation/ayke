import { Fields } from "./Fields";
import { GameMode } from "./GameMode";
import { GMTest } from "./gamemods/GMTest";

interface Player {
    trophees: number;
    data: Fields;
}

export const gamemods: Record<
    string,
    (players: Player[], total: number) => GameMode
> = {
    test: (players, total) => new GMTest(players, total),
};

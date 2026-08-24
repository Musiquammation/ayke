import { Bot } from "../commons/Bot";
import { Fields } from "./Fields";

export abstract class GameMode {
    abstract init(): void;
    abstract getBots(): Bot[];
    abstract run(dt: number): boolean;
    abstract runInput(playerIdx: number, input: Fields): void;
    abstract onDisconnection(id: number): void;
}

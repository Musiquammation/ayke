import { Bot } from "../commons/Bot";

export abstract class GameMode {
    abstract init(): void;
    abstract getBots(): Bot[];
    abstract run(): boolean;
    abstract onDisconnection(id: number): void;
}
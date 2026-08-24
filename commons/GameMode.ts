import { Bot } from "../commons/Bot";
import { Fields } from "./Fields";

export interface IKeyboardController {
	first(key: string): boolean;
	press(key: string): boolean;
	killed(key: string): boolean;
}

export interface IMouseController {
	getX(): number;
	getY(): number;
	first(button: number): boolean;
	press(button: number): boolean;
	killed(button: number): boolean;	
}


export abstract class GameMode {
	abstract init(): void;
	abstract getBots(): Bot[];
	abstract run(dt: number): boolean;
	abstract runInput(playerIdx: number, input: Fields): void;
	abstract detectInputs(keyboard: IKeyboardController, mouse: IMouseController): Fields[];
	abstract draw(ctx: CanvasRenderingContext2D): void;
	abstract onDisconnection(id: number): void;
	abstract save(): Uint8Array;
	abstract load(data: Uint8Array): void;
}

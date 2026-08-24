import protobuf from "protobufjs";
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

interface Input {
	timestamp: number;
	player: number;
}


export abstract class GameMode {
	public static readonly MAX_DT = 0.005; // 5ms

	abstract init(): void;
	abstract getBots(): Bot[];
	protected abstract run(dt: number): boolean;
	abstract runInput(playerIdx: number, input: Fields): void;
	abstract detectInputs(keyboard: IKeyboardController, mouse: IMouseController): Fields[];
	abstract draw(ctx: CanvasRenderingContext2D): void;
	abstract onDisconnection(id: number): void;
	abstract save(): Uint8Array;
	abstract load(data: Uint8Array): void;
	abstract clone(): GameMode;


	private quickEmulate(duration: number) {
		while (duration > GameMode.MAX_DT) {
			this.run(GameMode.MAX_DT);
			duration -= GameMode.MAX_DT;
		}

		this.run(duration);
	}

	emulate(timestamp: number, inputs: Fields[]) {
		console.log(timestamp, inputs);
	}
}

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
	abstract collectInputs(keyboard: IKeyboardController, mouse: IMouseController): Fields[];
	abstract draw(ctx: CanvasRenderingContext2D): void;
	abstract onDisconnection(id: number): void;
	abstract save(): Uint8Array;
	abstract load(data: Uint8Array): void;


	private quickEmulate(duration: number) {
		while (duration > GameMode.MAX_DT) {
			this.run(GameMode.MAX_DT);
			duration -= GameMode.MAX_DT;
		}

		this.run(duration);
	}

	emulate(
		start: number,
		finish: number | (()=>number),
		inputs: Input[]
	) {
		let currentTime = start;

		for (const input of inputs) {
			// Emulate the time elapsed since the previous event.
			const inputTimestamp = input.timestamp;
			const duration = (inputTimestamp - currentTime) / 1000;
			this.quickEmulate(duration);

			// Apply the input at its timestamp.
			this.runInput(input.player, input);

			currentTime = inputTimestamp;
		}

		// If no finish time was provided, only compute it after all inputs
		// have been processed, so that the computation itself does not affect
		// the simulation duration.
		if (typeof finish === 'function') {
			finish = finish();
		}

		// Emulate the remaining time after the last input.
		const duration = (finish - currentTime) / 1000;
		this.quickEmulate(duration);
	}
}

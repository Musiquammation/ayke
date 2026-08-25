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

export interface ILogger {
	debug(text: string): void;
	info(text: string): void;
	warning(text: string): void;
	error(text: string): void;
}

interface Input {
	timestamp: number;
	player: number;
}


type LoggerLevel = "debug" | "info" | "waring" | "error";

type LoggerGenerator = (
	name: string,
	level: "debug" | "info" | "waring" | "error"
) => ILogger;

const ALLOW_CLIENT_LOGS = false;

let _loggerGenerator: LoggerGenerator = (name, level) => ({
	debug(text) {
		if (ALLOW_CLIENT_LOGS && level === 'debug')
			console.log(`[${name.toUpperCase()}] ${text}`)
	},	

	info(text) {
		if (ALLOW_CLIENT_LOGS && (level === 'info' || level === 'debug'))
			console.log(`[${name.toUpperCase()}] ${text}`)

	},

	warning(text) {
		if (ALLOW_CLIENT_LOGS && level !== 'error')
			console.warn(`[${name.toUpperCase()}] ${text}`)
	},

	error(text) {
		if (ALLOW_CLIENT_LOGS)
			console.error(`[${name.toUpperCase()}] ${text}`)

	}
})

export abstract class GameMode {
	public static readonly MAX_DT = 0.050; // 50ms

	protected static getLogger(name: string, level: LoggerLevel = 'info') {
		return _loggerGenerator(name, level);
	}

	abstract init(): void;
	abstract getBots(): Bot[];
	protected abstract run(dt: number): boolean;
	abstract runInput(playerIdx: number, input: Fields): void;
	abstract collectInputs(keyboard: IKeyboardController, mouse: IMouseController): Fields[];
	abstract draw(ctx: CanvasRenderingContext2D): void;
	abstract onDisconnection(id: number): void;
	abstract save(): Uint8Array;
	abstract load(data: Uint8Array): void;

	abstract getSize(): ({width: number, height: number});


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

		const finishLimit = typeof finish === 'function' ? Infinity : finish;

		for (const input of inputs) {
			// Emulate the time elapsed since the previous event.
			const inputTimestamp = input.timestamp;
			if (inputTimestamp > finishLimit)
				break;

			if (inputTimestamp < currentTime)
				continue;

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

export function setGameModeLoggerGenerator(loggerGenerator: LoggerGenerator) {
	_loggerGenerator = loggerGenerator;
}

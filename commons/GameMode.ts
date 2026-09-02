import type { IKeyboardController, ILogger, IMobileController, IMouseController } from "./util/controllerInterfaces";
import { Fields } from "./Fields";
import { ImageLoader } from "./util/ImageLoader";
import { MobileDescriptor } from "../client/src/controllers/MobileController";


interface TutorialData {
    frame(dt: number, clock: number): string | null;
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
});

export interface FinishGame {
	results: number[][];
	teamEqualities: number[];
	playerEqualities: number[];
}

export abstract class GameMode {
	public static readonly MAX_DT = 0.020; // 20ms

	protected static getLogger(name: string, level: LoggerLevel = 'info') {
		return _loggerGenerator(name, level);
	}

	abstract init(): void;
	abstract getBotIds(count: number): number[];
	protected abstract run(dt: number, produceFinish: boolean): FinishGame | null;
	abstract runInput(playerIdx: number, input: Fields): void;
	abstract collectInputs(
		keyboard: IKeyboardController,
		mouse: IMouseController,
		mobile: IMobileController | null,
		data: any
	): Fields[];
	abstract draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		data: any,
		imageLoader: ImageLoader,
		dt: number
	): void;
	abstract onDisconnection(id: number): void;
	abstract save(): Uint8Array;
	abstract load(data: Uint8Array): void;

	abstract getSize(): ({width: number, height: number});

	abstract evalMouseCoords(
		x: number,
		y: number,
		playerIdx: number,
		clientData: any
	): {x: number, y: number};

	abstract getMobileDesc(): MobileDescriptor | null;

	abstract createTutorial(): TutorialData;

	quickEmulate(duration: number, produceFinish: boolean = false) {
		while (duration > GameMode.MAX_DT) {
			const f = this.run(GameMode.MAX_DT, produceFinish);
			if (f && produceFinish) {return f;}
			duration -= GameMode.MAX_DT;
		}

		return this.run(duration, produceFinish);
	}

	/**
	 * Emulates the game from a starting time to a finish time while applying
	 * the given inputs at their respective timestamps.
	 *
	 * @param start The simulation start time, in milliseconds.
	 * @param finish The simulation finish time, or a function that computes
	 *               time after all inputs have been processed.
	 * @param inputs The inputs to apply during the simulation.
	 * @param preprocess Optional function used to create inputs that are
	 *                   executed immediately at the given timestamp.
	 *                   The returned inputs timestamp is ignored.
	 * @param finishGame Handle game finish (if no present, Finish data will be ignored)
	 * @returns The final simulation time.
	 */
	emulate(
		start: number,
		finish: number | (()=>number),
		inputs: Input[],
		preprocess?: ((timestamp: number) => Input[]),
		finishGame?: (finish: FinishGame)=>void
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
			if (preprocess) {
				for (const i of preprocess(currentTime)) {
					this.runInput(i.player, i);
				}
			}

			const f = this.quickEmulate(duration, finishGame ? true:false);
			if (f && finishGame) {
				finishGame(f);
				return inputTimestamp;
			}

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
		if (preprocess) {
			for (const i of preprocess(currentTime)) {
				this.runInput(i.player, i);
			}
		}

		const f = this.quickEmulate(duration, finishGame ? true:false);
		if (f && finishGame) {
			finishGame(f);
		}

		return finish;
	}
}

export function setGameModeLoggerGenerator(loggerGenerator: LoggerGenerator) {
	_loggerGenerator = loggerGenerator;
}

export { IKeyboardController, IMobileController };

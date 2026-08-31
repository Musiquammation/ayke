import Prando from "prando";
import { Fields } from "../Fields";
import { SoloGameMode } from "../SoloGameMode"
import { IKeyboardController, IMouseController, IMobileController } from "../util/controllerInterfaces";
import { getProtocol } from "../protocolLoader";
import { ImageLoader } from "../util/ImageLoader";
import { MobileDescriptor } from "../../client/src/controllers/MobileController";

const protocols = getProtocol('testSolo', 'solo');

function generateClientDom() {
	return {
		category: "default",

		produce() {
			return new Uint8Array();
		}
	};
}

class ClientData {
	
}

export class GMTestSolo extends SoloGameMode {
	static readonly TEXTURES = {};

	static generateClientDom = generateClientDom;
	static create = ()=>new GMTestSolo();

	private player = 500;
	private move = 0;

	init(category: string, rng: Prando, generateClientData: boolean) {
		if (generateClientData) {
			return new ClientData();
		}
	}

	collectInputs(keyboard: IKeyboardController, mouse: IMouseController, mobile: IMobileController | null, data: any) {
		const inputs = [];

		if (keyboard.first('up')) {
			inputs.push({move: -300});
		}

		if (keyboard.first('down')) {
			inputs.push({move: +300});
		}

		if (keyboard.killed('up') || keyboard.killed('down')) {
			inputs.push({move: 0.0000000000000001});
		}

		return inputs;
	}

	runInput(input: Fields): void {
		this.move = input.move;
	}

	protected run(dt: number, clock: number): number | null {
		this.player += this.move * dt;
		if (this.player <= 0)
			return clock; 

		return null;
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		data: any,
		imageLoader: ImageLoader,
		dt: number
	): void {
		ctx.fillStyle = "red";
		ctx.fillRect(0, this.player, 1600, 10);
	}

	getSize(): ({ width: number; height: number; }) {
		return {width: 1600, height: 900};
	}

	evalMouseCoords(x: number, y: number, playerIdx: number, clientData: any): { x: number; y: number; } {
		return {x, y};
	}

	getMobileDesc(): MobileDescriptor | null {
		return null;
	}
}
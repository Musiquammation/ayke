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

	init(category: string, rng: Prando, generateClientData: boolean) {
		if (generateClientData) {
			return new ClientData();
		}
	}

	collectInputs(keyboard: IKeyboardController, mouse: IMouseController, mobile: IMobileController | null, data: any) {
		return [];
	}

	runInput(playerIdx: number, input: Fields): void {
		
	}

	protected run(dt: number): number | null {
		return null;
	}

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		data: any,
		imageLoader: ImageLoader,
		dt: number
	): void {

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
import Prando from "prando";
import { Fields } from "../Fields";
import { SoloGameMode } from "../SoloGameMode"
import { IKeyboardController, IMouseController, IMobileController } from "../util/controllerInterfaces";
import { getProtocol } from "../protocolLoader";

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

	protected run(dt: number, produceFinish: boolean): number | null {
		return null;
	}

	static generateClientDom = generateClientDom;

}
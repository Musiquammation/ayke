import { Bot } from "../Bot";
import { GameMode } from "../GameMode";


type Data = { [k: string]: any };

interface PlayerInput {
	data: Data;
}

class Player {
	
}


export class GMTest extends GameMode {
	constructor(players: PlayerInput[], total: number) {
		super();
	}

	init(): void {
		
	}

	getBots(): Bot[] {
		return [];
	}

	run(): boolean {
		return false;
	}

	onDisconnection(id: number): void {
		
	}

	
}
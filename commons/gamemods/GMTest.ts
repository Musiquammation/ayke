import { Bot } from "../Bot";
import { Fields } from "../Fields";
import { GameMode } from "../GameMode";


interface PlayerInput {
	data: Fields;
}

class Player {
	connected = true;
	move = 0;

	constructor(
		public x: number,
		public y: number
	) {

	}
}


export class GMTest extends GameMode {
	readonly players: Player[];

	constructor(players: PlayerInput[], total: number) {
		super();

		this.players = [
			new Player(-100, 0),
			new Player(100, 0),
		]
	}

	init(): void {
		
	}

	getBots(): Bot[] {
		return [];
	}

	run(dt: number): boolean {
		return false;
	}

	runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		if (input.move) {
			player.move = input.move;
		}
	}

	onDisconnection(id: number): void {
		this.players[id].connected = false;
	}
}

	
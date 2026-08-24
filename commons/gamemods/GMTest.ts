import { Bot } from "../Bot";
import { Fields } from "../Fields";
import { GameMode, IKeyboardController, IMouseController } from "../GameMode";
import { getProtocol } from "../protocolLoader";

const protocols = getProtocol('test');

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


	update(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.move = obj.move;
	}
}


export class GMTest extends GameMode {
	readonly players: Player[];

	private constructor(players: Player[]) {
		super();
		this.players = players;
	}

	static create(players: PlayerInput[], total: number) {
		return new GMTest([
			new Player(0, 0),
			new Player(200, 0),
		]);
	}

	override init(): void {
		
	}

	override getBots(): Bot[] {
		return [];
	}

	override run(dt: number): boolean {
		for (const p of this.players) {
			p.y += p.move * dt;
		}

		return false;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const player = this.players[playerIdx];
		if (input.move !== undefined) {
			player.move = input.move;
		}
	}

	override collectInputs(keyboard: IKeyboardController, mouse: IMouseController) {
		const inputs = [];

		/* Really simplified logic */

		if (keyboard.first('up')) {
			inputs.push({move: +10});
		}

		if (keyboard.first('down')) {
			inputs.push({move: -10});
		}

		if (keyboard.killed('up') || keyboard.killed('down')) {
			inputs.push({move: 0});
		}
		

		// console.log(inputs);
		return inputs;
	}

	override draw(ctx: CanvasRenderingContext2D) {
		
	}


	override onDisconnection(id: number): void {
		this.players[id].connected = false;
	}

	override save(): Uint8Array {
		const {State} = protocols.get();
		return State.encode(this).finish();
	}

	override load(data: Uint8Array): void {
		const {State} = protocols.get();
		const obj = State.decode(data);
		for (const [idx, player] of obj.players.entries()) {
			this.players[idx].update(player);
		}
	}

	override clone() {
		return new GMTest(this.players.map(o => {
			const p = new Player(o.x, o.y);
			p.move = o.move;
			return p;
		}));
	}
}

	
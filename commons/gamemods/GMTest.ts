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


// temp
let _dom: any = null;


export class GMTest extends GameMode {
	readonly players: Player[];

	private constructor(players: Player[]) {
		super();
		this.players = players;
	}

	static create(players: PlayerInput[], total: number) {
		return new GMTest([
			new Player(0, 0),
			new Player(10, 0),
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

		const logger = GMTest.getLogger('game-test', 'info');
		logger.debug(`y0=${this.players[0].y.toFixed(2)} dt=${dt}`);



		return false;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const logger = GMTest.getLogger('game-test', 'info');

		const player = this.players[playerIdx];
		if (input.move !== undefined) {
			player.move = input.move;
			logger.debug(`input ${input.move} ${playerIdx}`);
		}
	}

	override collectInputs(keyboard: IKeyboardController, mouse: IMouseController) {
		const inputs = [];

		/* Really simplified logic */

		if (keyboard.first('up')) {
			inputs.push({move: +300});
		}

		if (keyboard.first('down')) {
			inputs.push({move: -300});
		}

		if (keyboard.killed('up') || keyboard.killed('down')) {
			inputs.push({move: 0.0000000000000001});
		}
		

		// console.log(inputs);
		return inputs;
	}

	override draw(_ctx: CanvasRenderingContext2D) {
		const canvas = document.querySelector("canvas");
		if (canvas) {
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = "black";
			ctx.fillRect(0, 0, 100, 800);
			ctx.fillStyle = "red";
			for (const p of this.players) {
				ctx.fillRect(p.x*3, p.y - 5, 10, 10);
			}
			console.log(Math.floor(this.players[0].y), Math.floor(this.players[1].y));
		}
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
}

	
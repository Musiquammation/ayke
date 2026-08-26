import { Fields } from "../Fields";
import { GameMode, IKeyboardController, IMouseController } from "../GameMode";
import { getProtocol } from "../protocolLoader";

const protocols = getProtocol('test');

interface PlayerInput {
	data: Fields;
}

type Team = 'red' | 'blue';

class Player {
	connected = true;
	move = 0;

	constructor(
		public x: number,
		public y: number,
		public team: Team
	) {

	}


	update(obj: Fields) {
		this.x = obj.x;
		this.y = obj.y;
		this.move = obj.move;
	}
}




export class GMTest extends GameMode {
	static readonly types = {Player};

	readonly players: Player[];

	private constructor(total: number) {
		super();

		this.players = Array.from(
			{ length: total },
			() => new Player(0, 0, 'red')
		);
	}

	static createServ(players: PlayerInput[], total: number) {
		const game = new GMTest(total);
		game.players[0].x = 0;
		game.players[0].y = 1000;
		game.players[0].team = 'red';

		game.players[1].x = 10;
		game.players[1].y = 1000;
		game.players[1].team = 'blue';

		const data = new Uint8Array();

		return {
			game,
			data
		}
	}

	static createClient(data: Uint8Array, total: number) {
		const g = new GMTest(total);
		return g;
	}

	override init(): void {
		
	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
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
		

		return inputs;
	}

	override draw(ctx: CanvasRenderingContext2D, playerIdx: number) {
		ctx.fillStyle = "#333";
		ctx.fillRect(0, 0, 200, 2000);
		ctx.fillStyle = "red";
		for (const p of this.players) {
			ctx.fillRect(p.x, p.y - 5, 10, 10);
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

	override getSize() {
		return {width: 20, height: 2000};
	}

	override evalMouseCoords(x: number, y: number) {
		return {x,y};
	}
}

	
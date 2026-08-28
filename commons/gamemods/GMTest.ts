import { Fields } from "../Fields";
import { FinishGame, GameMode, IKeyboardController, IMouseController } from "../GameMode";
import { getProtocol } from "../protocolLoader";
import { decodeFullMessage } from "../util/decodeFullMessage";

const protocols = getProtocol('test');

interface PlayerInput {
	data: Uint8Array;
}

type Team = 'red' | 'blue';

const LOG_LEVEL = 'info';

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

class ClientData {

}


function generateClientDom() {
	return {
		choosen: 0,

		produce() {
			const {StartData} = protocols.get();
			return StartData.encode({
				testNumber: this.choosen
			}).finish();
		}
	};
}

class Tutorial {
	frame(dt: number, clock: number) {
		return "Placeholder";
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
		const logger = GMTest.getLogger('game-test', LOG_LEVEL);

		logger.debug("Starting choices " + JSON.stringify(players.map(p => {
			const {StartData} = protocols.get();
			const m = decodeFullMessage(StartData.decode(p.data));
			return m.testNumber;
		})));


		const game = new GMTest(total);
		for (let i = 0; i < game.players.length; i++) {
			const p = game.players[i];
			p.x = i*10;
			p.y = 1000;
			p.team = i%2==0 ? 'red' : 'blue';
		}

		const data = new Uint8Array();

		return {
			game,
			data
		}
	}

	static createClient(data: Uint8Array | null, total: number) {
		const game = new GMTest(total);
		for (let i = 0; i < game.players.length; i++) {
			const p = game.players[i];
			p.x = i*10;
			p.y = 1000;
			p.team = i%2==0 ? 'red' : 'blue';
		}
		return {game, data: new ClientData(), html: null};
	}

	static readonly generateClientDom = generateClientDom;


	static readonly TEXTURES = {};


	override init(): void {
		
	}

	override getBotIds(count: number): number[] {
		return Array.from(
			{ length: count },
			() => 0
		);
	}


	private produceFinish(): FinishGame {
		return {
			results: [[1, 2], [0, 3]],
			teamEqualities: [],
			playerEqualities: [0]
		};
	}
	override run(dt: number, produceFinish: boolean) {
		for (const p of this.players) {
			p.y += p.move * dt;
		}

		const logger = GMTest.getLogger('game-test', LOG_LEVEL);
		logger.debug(`y0=${this.players[0].y.toFixed(2)} dt=${dt}`);



		if (produceFinish) {
			for (const [idx, p] of this.players.entries()) {
				if (p.y < 0) {
					return this.produceFinish();
				}
			}
		}

		return null;
	}

	override runInput(playerIdx: number, input: Fields): void {
		const logger = GMTest.getLogger('game-test', LOG_LEVEL);

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

	override draw(
		ctx: CanvasRenderingContext2D,
		playerIdx: number,
		_data: any
	) {
		const data = _data as ClientData;
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
		return {width: 100, height: 2000};
	}

	override evalMouseCoords(x: number, y: number) {
		return {x,y};
	}

	override createTutorial() {
		return new Tutorial();
	}
}

	
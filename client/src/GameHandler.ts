import { Fields } from "../../commons/Fields";
import { GameMode } from "../../commons/GameMode";
import { gamemods } from "../../commons/gamemods";
import { getProtocol, ProtocolTypes } from "../../commons/protocolLoader";
import { getDeltaTime, msgtypes } from "./messages/sendMessage";
import { keyboardController } from "./controllers/KeyboardController"
import { mouseController } from "./controllers/MouseController"
import { mergeSortedArrays, produceMergedSortedArrays } from "../../commons/util/mergeSortedArrays"


interface Input {
	timestamp: number;
}

interface RealInput {
	timestamp: number;
	player: number;
}

function compareInputs(a: RealInput, b: Input) {
	return a.timestamp - b.timestamp;
}

class GameHandler {
	private protocols!: ProtocolTypes;
	private lastEmulation = 0;
	private userInputs: Input[] = [];

	/// TODO: playerId
	private playerId = 0;

	constructor(
		private readonly gamemodeId: string,
		private readonly gamemode: GameMode,
	) {
		const protocol = getProtocol(gamemodeId);
		protocol.load().then(() => {
			this.protocols = protocol.get();
		});
	}

	receive(gdata: Uint8Array) {
		const msg = this.protocols.ServerMessage.decode(gdata);
		this.gamemode.load(msg.state);
		this.lastEmulation = performance.now();

		const inputs = produceMergedSortedArrays(
			msg.inputs as RealInput[],
			this.userInputs,
			compareInputs,
			x => ({...x, player: this.playerId})
		);

		this.gamemode.emulate(
			msg.timestamp,
			this.lastEmulation,
			getDeltaTime(),
			inputs
		);
	}

	frame() {
		// Collect inputs
		const now = performance.now();
		const newInputs = this.gamemode.collectInputs(
			keyboardController,
			mouseController
		).map(data => ({...data, timestamp: now}));
		this.userInputs.push(...newInputs);

		keyboardController.frame();

		this.gamemode.emulate(
			this.lastEmulation,
			now,
			getDeltaTime(),
			newInputs.map(i => ({...i, player: this.playerId}))
		);


		if (_gameHandler) {
			requestAnimationFrame(()=>this.frame());
		}
	}
}





let _gameHandler: GameHandler | null = null;

export function getGameHandler() {
	return _gameHandler;
}



interface Player {
	trophees: number;
	data: Fields;
}

export function setGameHandler(gamemode: string, players: Player[], total: number) {
	const factory = gamemods[gamemode];
	if (!factory) {
		throw new Error(`Invalid gamemode '${gamemode}'`);
	}

	_gameHandler = new GameHandler(gamemode, factory(players, total));
	_gameHandler.frame();
}

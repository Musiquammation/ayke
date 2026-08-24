import { Fields } from "../../commons/Fields";
import { GameMode } from "../../commons/GameMode";
import { gamemods } from "../../commons/gamemods";
import { getProtocol, ProtocolTypes } from "../../commons/protocolLoader";

class GameHandler {
	private protocols!: ProtocolTypes;

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
		this.gamemode.emulate(msg.timestamp, msg.inputs);
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
}

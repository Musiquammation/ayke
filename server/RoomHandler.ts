import { Bot } from "../commons/Bot";
import { GameMode } from "../commons/GameMode";
import { Connection } from "./Connection";
import { getLogger } from "./Logger";
import { GMTest } from "../commons/gamemods/GMTest";
import { Fields } from "../commons/Fields";
import { gamemods } from "../commons/gamemods";
import { getProtocol } from "../commons/protocolLoader";

const logger = getLogger("room");

interface PlayerInput {
	connection: Connection;
	trophees: number;
	data: Fields;
}

class Player {
	constructor(
		public connection: Connection | null,
		public readonly trophees: number,
		public readonly data: Fields
	) {
		
	}
}

export class Room {
	private readonly bots: Bot[];
	private readonly players: Player[];
	private backupData!: Uint8Array;
	private backupDate: number = 0;
	private readonly inputs = new Array<{date: number, data: Fields}>();

	constructor(
		public readonly gamemodeId: string,
		public readonly gamemode: GameMode,
		players: PlayerInput[]
	) {
		this.bots = gamemode.getBots();
		this.players = players.map(p => new Player(
			p.connection,
			p.trophees,
			p.data,
		));
	}

	start() {
		this.gamemode.init();
		this.backupData = this.gamemode.save();
		this.backupDate = performance.now();
		
		const gdata = getProtocol(this.gamemodeId).get().ServerMessage.encode({
			timestamp: this.backupDate,
			state: this.backupData,
			inputs: [],
		}).finish();

		for (const p of this.players) {
			p.connection?.sendMessage({gdata});
		}
	}

	disconnect(idx: number) {
		if (this.players[idx].connection) {
			this.gamemode.onDisconnection(idx);
			this.players[idx].connection = null;
		}
	}

	handle(data: protobuf.ReflectedMessage): Uint8Array {
		return new Uint8Array();
	}
}


class RoomHandler {
	private rooms: Room[] = [];

	append(gamemode: string, total: number, players: PlayerInput[]) {
		const factory = gamemods[gamemode];
		if (!factory) {
			logger.error(`Invalid gamemode '${gamemode}'`);
			return;
		}

		// Check players are'nt in a room
		for (const player of players) {
			if (player.connection.roomInfo) {
				logger.error(
					`Player '${player.connection.getPseudo()}' is already in a room`
				);
				return;
			}
		}

		const room = new Room(gamemode, factory(players, total), players);
		for (const [idx, player] of players.entries()) {
			player.connection.roomInfo = { room, idx };
		}

		this.rooms.push(room);

		room.start();
	}

	disconnect(connection: Connection) {
		if (connection.roomInfo === null)
			return;

		connection.roomInfo.room.disconnect(connection.roomInfo.idx);
	}
}

export const roomHandler = new RoomHandler();



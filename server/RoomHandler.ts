import { Bot } from "../commons/Bot";
import { GameMode } from "../commons/GameMode";
import { Connection } from "./Connection";
import { getLogger } from "./Logger";
import { GMTest } from "../commons/gamemods/GMTest";

type Data = { [k: string]: any };

const logger = getLogger("room");

interface Player {
	connection: Connection;
	trophees: number;
	data: Data;
}


const gamemods: Record<
	string,
	(players: Player[], total: number) => GameMode
> = {
	test: (players, total) => new GMTest(players, total),
};

export class Room {
	private readonly bots: Bot[];

	constructor(
		public readonly gamemode: GameMode,
		private readonly players: Player[],
	) {
		this.bots = gamemode.getBots();
	}
}


class RoomHandler {
	private rooms: Room[] = [];

	append(gamemode: string, total: number, players: Player[]) {
		const factory = gamemods[gamemode];
		if (!factory) {
			logger.error(`Invalid gamemode '${gamemode}'`);
			return;
		}

		// Check players are'nt in a room
		for (const player of players) {
			if (player.connection.room) {
				logger.error(
					`Player '${player.connection.getPseudo()}' is already in a room`
				);
				return;
			}
		}

		const room = new Room(factory(players, total), players);
		for (const player of players) {
			player.connection.room = room;
		}

		this.rooms.push(room);
	}

	disconnect(connection: Connection) {

	}
}

export const roomHandler = new RoomHandler();
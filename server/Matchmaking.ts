import { Connection } from "./Connection";
import { database } from "./Database";
import { getLogger, setLoggerLevel } from "./Logger";
import { roomHandler } from "./RoomHandler";

const logger = getLogger("matchmaking");
// setLoggerLevel("matchmaking", "debug");

type Data = { [k: string]: any };

function getWaitedPlayers(gamemode: string, data: any): number {
	logger.debug(`[getWaitedPlayers] gamemode=${gamemode}, data=${JSON.stringify(data)}`);

	const result = 2;

	logger.debug(`[getWaitedPlayers] result=${result}`);

	return result;
}

interface Player {
	connection: Connection;
	pseudo: string | null;
	trophees: number;
	gamemode: string;
	data: Data;
	useBots: boolean;
}

class WaitingRoom {
	public players: Player[] = [];
	public tolerancy: number = 0;
	public avgTrophees: number = 0;
	public gamemode: string;
	public readonly excepted: number;

	constructor(player: Player) {
		logger.debug(
			`[WaitingRoom] Creating room for pseudo=${player.pseudo}, ` +
			`gamemode=${player.gamemode}, trophees=${player.trophees}`
		);

		this.players.push(player);
		this.avgTrophees = player.trophees;
		this.gamemode = player.gamemode;
		this.tolerancy = 0;
		this.excepted = getWaitedPlayers(this.gamemode, player.data);

		logger.debug(
			`[WaitingRoom] Created room: ` +
			`gamemode=${this.gamemode}, excepted=${this.excepted}, ` +
			`players=${this.players.length}, avgTrophees=${this.avgTrophees}, ` +
			`tolerancy=${this.tolerancy}`
		);
	}

	isCompatibleWith(other: WaitingRoom): boolean {
		logger.debug(
			`[WaitingRoom] Checking compatibility: ` +
			`this(gamemode=${this.gamemode}, excepted=${this.excepted}, ` +
			`avg=${this.avgTrophees}, tol=${this.tolerancy}) ` +
			`other(gamemode=${other.gamemode}, excepted=${other.excepted}, ` +
			`avg=${other.avgTrophees}, tol=${other.tolerancy})`
		);

		if (this.gamemode !== other.gamemode) {
			logger.debug(
				`[WaitingRoom] Incompatible: different gamemodes ` +
				`(${this.gamemode} !== ${other.gamemode})`
			);
			return false;
		}

		if (this.excepted !== other.excepted) {
			logger.debug(
				`[WaitingRoom] Incompatible: different totals ` +
				`(${this.excepted} !== ${other.excepted})`
			);
			return false;
		}

		const thisMin = this.avgTrophees - this.tolerancy;
		const thisMax = this.avgTrophees + this.tolerancy;
		const otherMin = other.avgTrophees - other.tolerancy;
		const otherMax = other.avgTrophees + other.tolerancy;

		const compatible =
			Math.max(thisMin, otherMin) <= Math.min(thisMax, otherMax);

		logger.debug(
			`[WaitingRoom] Intervals: ` +
			`this=[${thisMin}, ${thisMax}], ` +
			`other=[${otherMin}, ${otherMax}], ` +
			`compatible=${compatible}`
		);

		return compatible;
	}

	merge(other: WaitingRoom) {
		logger.debug(
			`[WaitingRoom] Merging rooms: ` +
			`thisPlayers=${this.players.length}, ` +
			`otherPlayers=${other.players.length}, ` +
			`excepted=${this.excepted}`
		);

		const spaceLeft = this.excepted - this.players.length;

		logger.debug(`[WaitingRoom] Space left in target room: ${spaceLeft}`);

		if (spaceLeft <= 0) {
			logger.debug(`[WaitingRoom] Merge cancelled: room already full`);
			return;
		}

		logger.debug(
			`[WaitingRoom] Sorting ${other.players.length} players ` +
			`by proximity to avgTrophees=${this.avgTrophees}`
		);

		other.players.sort((a, b) =>
			Math.abs(a.trophees - this.avgTrophees) -
			Math.abs(b.trophees - this.avgTrophees)
		);

		const absorbedPlayers = other.players.splice(0, spaceLeft);

		logger.debug(
			`[WaitingRoom] Absorbing ${absorbedPlayers.length} players`
		);

		for (const player of absorbedPlayers) {
			logger.debug(
				`[WaitingRoom] Absorbed player: ` +
				`pseudo=${player.pseudo}, trophees=${player.trophees}`
			);
		}

		this.players.push(...absorbedPlayers);

		logger.debug(
			`[WaitingRoom] After merge: ` +
			`thisPlayers=${this.players.length}, ` +
			`otherPlayers=${other.players.length}`
		);

		this.recalculateAverage();
		other.recalculateAverage();

		logger.debug(
			`[WaitingRoom] After recalculation: ` +
			`thisAvg=${this.avgTrophees}, ` +
			`otherAvg=${other.avgTrophees}`
		);
	}

	recalculateAverage() {
		logger.debug(
			`[WaitingRoom] Recalculating average for ` +
			`${this.players.length} players`
		);

		if (this.players.length === 0) {
			logger.debug(`[WaitingRoom] Empty room, setting average to 0`);
			this.avgTrophees = 0;
			return;
		}

		const totalTrophees = this.players.reduce(
			(sum, p) => sum + p.trophees,
			0
		);

		this.avgTrophees = totalTrophees / this.players.length;

		logger.debug(
			`[WaitingRoom] Average recalculated: ` +
			`totalTrophees=${totalTrophees}, ` +
			`players=${this.players.length}, ` +
			`avg=${this.avgTrophees}`
		);
	}
}

class Matchmaking {
	private static readonly STEP_INC = 2;

	private rooms: WaitingRoom[] = [];

	async addConnection(
		connection: Connection,
		gamemode: string,
		data: Data
	) {
		logger.debug(
			`addConnection: ` +
			`gamemode=${gamemode}, data=${JSON.stringify(data)}`
		);

		if (this.hasConnection(connection)) {
			logger.debug(
				`Connection already exists in matchmaking`
			);
			console.warn("Connection is already in matchmaking.");
			return;
		}

		const pseudo: string | null = connection.getPseudo();

		logger.debug(`Player pseudo=${pseudo}`);

		let trophees: number;

		if (pseudo === null) {
			logger.debug(
				`Player has no pseudo, using 0 trophies`
			);
			trophees = 0;
		} else {
			logger.debug(
				`Fetching trophies for ` +
				`pseudo=${pseudo}, gamemode=${gamemode}`
			);

			const db = await database;

			trophees = await db.getTrophees(pseudo, gamemode);

			logger.debug(
				`Trophies retrieved: ${trophees}`
			);
		}

		const player: Player = {
			connection,
			pseudo,
			trophees,
			gamemode,
			data,
			useBots: false
		};

		logger.debug(
			`Player created: ` +
			`pseudo=${pseudo}, trophees=${trophees}, ` +
			`gamemode=${gamemode}, useBots=false`
		);

		const newRoom = new WaitingRoom(player);

		this.rooms.push(newRoom);

		logger.debug(
			`New room added. Total rooms=${this.rooms.length}`
		);

		this.sortRooms();

		logger.debug(
			`Checking newly created room immediately`
		);

		this.checkAndExtractRoom(newRoom);

		logger.debug(
			`addConnection completed. ` +
			`Total rooms=${this.rooms.length}`
		);
	}

	removeConnection(connection: Connection): boolean {
		logger.debug(`removeConnection called`);

		for (let i = 0; i < this.rooms.length; i++) {
			const room = this.rooms[i];

			logger.debug(
				`Checking room #${i}: ` +
				`players=${room.players.length}, ` +
				`avg=${room.avgTrophees}`
			);

			const playerIndex = room.players.findIndex(
				p => p.connection === connection
			);

			if (playerIndex !== -1) {
				logger.debug(
					`Connection found in room #${i} ` +
					`at player index=${playerIndex}`
				);

				room.players.splice(playerIndex, 1);

				logger.debug(
					`Player removed. ` +
					`Remaining players=${room.players.length}`
				);

				if (room.players.length === 0) {
					logger.debug(
						`Room #${i} is empty, removing it`
					);

					this.rooms.splice(i, 1);
				} else {
					logger.debug(
						`Recalculating room #${i} average`
					);

					room.recalculateAverage();
					this.sortRooms();
				}

				logger.debug(`removeConnection succeeded`);

				return true;
			}
		}

		logger.debug(
			`removeConnection failed: connection not found`
		);

		return false;
	}

	voteBotsUse(connection: Connection, allow: boolean) {
		logger.debug(
			`voteBotsUse called: allow=${allow}`
		);

		const room = this.rooms.find(
			r => r.players.some(p => p.connection === connection)
		);

		if (!room) {
			logger.debug(
				`voteBotsUse failed: room not found`
			);
			return false;
		}

		logger.debug(
			`Found room: ` +
			`players=${room.players.length}, ` +
			`excepted=${room.excepted}`
		);

		const player = room.players.find(
			p => p.connection === connection
		);

		if (!player) {
			logger.debug(
				`voteBotsUse failed: player not found`
			);
			return false;
		}

		logger.debug(
			`Player ${player.pseudo} changes bot vote ` +
			`from ${player.useBots} to ${allow}`
		);

		player.useBots = allow;

		logger.debug(
			`Checking whether room is now ready`
		);

		this.checkAndExtractRoom(room);

		return true;
	}

	step() {
		logger.debug(
			`===== STEP START ===== ` +
			`rooms=${this.rooms.length}`
		);

		// 1. Increase tolerancy
		for (const room of this.rooms) {
			const previousTolerance = room.tolerancy;

			room.tolerancy += Matchmaking.STEP_INC;

			logger.debug(
				`Tolerance increased: ` +
				`${previousTolerance} -> ${room.tolerancy}, ` +
				`avg=${room.avgTrophees}, ` +
				`players=${room.players.length}`
			);
		}

		// 2. Check adjacent rooms
		for (let i = 0; i < this.rooms.length - 1; i++) {
			const w = this.rooms[i];
			const next = this.rooms[i + 1];

			logger.debug(
				`Comparing rooms #${i} and #${i + 1}: ` +
				`avg=${w.avgTrophees}/${next.avgTrophees}, ` +
				`tol=${w.tolerancy}/${next.tolerancy}`
			);

			if (w.isCompatibleWith(next)) {
				logger.debug(
					`Rooms #${i} and #${i + 1} are compatible`
				);

				w.merge(next);

				logger.debug(
					`Merge completed: ` +
					`room #${i} players=${w.players.length}, ` +
					`room #${i + 1} players=${next.players.length}`
				);

				if (next.players.length === 0) {
					logger.debug(
						`Room #${i + 1} emptied, removing it`
					);

					this.rooms.splice(i + 1, 1);
				}

				logger.debug(
					`Checking merged room for extraction`
				);

				if (this.checkAndExtractRoom(w)) {
					logger.debug(
						`Merged room was extracted`
					);

					i--;
				} else {
					logger.debug(
						`Merged room is not ready, re-sorting`
					);

					this.sortRooms();
					i--;
				}
			} else {
				logger.debug(
					`Rooms #${i} and #${i + 1} are incompatible`
				);
			}
		}

		logger.debug(
			`===== STEP END ===== ` +
			`remainingRooms=${this.rooms.length}`
		);
	}

	private checkAndExtractRoom(room: WaitingRoom): boolean {
		logger.debug(
			`checkAndExtractRoom: ` +
			`players=${room.players.length}/${room.excepted}, ` +
			`gamemode=${room.gamemode}`
		);

		const isFull = room.players.length === room.excepted;

		const allWantBots =
			room.players.length > 0 &&
			room.players.every(p => p.useBots);

		logger.debug(
			`Room readiness: ` +
			`isFull=${isFull}, allWantBots=${allWantBots}`
		);

		if (isFull || allWantBots) {
			logger.debug(
				`Room is ready, extracting it from queue`
			);

			const index = this.rooms.indexOf(room);

			if (index !== -1) {
				logger.debug(
					`Removing room at index=${index}`
				);

				this.rooms.splice(index, 1);
			} else {
				logger.debug(
					`Room was already absent from queue`
				);
			}

			logger.debug(
				`Calling handleWaitingRoom`
			);

			this.handleRoom(room);

			return true;
		}

		logger.debug(
			`Room is not ready`
		);

		return false;
	}

	private handleRoom(waitingRoom: WaitingRoom) {
		logger.debug(
			`handleWaitingRoom: ` +
			`gamemode=${waitingRoom.gamemode}, ` +
			`players=${waitingRoom.players.length}, ` +
			`excepted=${waitingRoom.excepted}`
		);

		const botsAllowed = waitingRoom.players.every(
			p => p.useBots
		);

		logger.debug(
			`Bots allowed=${botsAllowed}`
		);

		logger.debug(
			`Players in room: ` +
			waitingRoom.players
				.map(p => `${p.pseudo ?? "anonymous"}:${p.trophees}`)
				.join(", ")
		);

		logger.info(
			`Starting game for mode ${waitingRoom.gamemode} ` +
			`with ${waitingRoom.players.length} (of ${waitingRoom.excepted}) players! ` +
			`(Bots allowed: ${botsAllowed})`
		);

		logger.debug(
			`Game start handling completed`
		);

		roomHandler.append(
			waitingRoom.gamemode,
			waitingRoom.excepted,
			waitingRoom.players.map(p => ({
				connection: p.connection,
				trophees: p.trophees,
				data: p.data,
			}))
		)
	}

	private hasConnection(connection: Connection): boolean {
		logger.debug(
			`Checking whether connection is already queued`
		);

		const result = this.rooms.some(room =>
			room.players.some(p => p.connection === connection)
		);

		logger.debug(
			`hasConnection=${result}`
		);

		return result;
	}

	private sortRooms() {
		logger.debug(
			`Sorting ${this.rooms.length} rooms by average trophies`
		);

		this.rooms.sort(
			(a, b) => a.avgTrophees - b.avgTrophees
		);

		logger.debug(
			`Sorted rooms: ` +
			this.rooms
				.map(
					(r, i) =>
						`#${i}(avg=${r.avgTrophees}, ` +
						`tol=${r.tolerancy}, ` +
						`players=${r.players.length}/${r.excepted})`
				)
				.join(" | ")
		);
	}
}

export const matchmaking = new Matchmaking();

logger.debug(`Matchmaking instance created`);

setInterval(() => {
	logger.debug(`Interval tick`);
	matchmaking.step();
}, 2000);
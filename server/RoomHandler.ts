import "dotenv/config";
import { FinishGame, GameMode } from "../commons/GameMode";
import { Connection } from "./Connection";
import { getLogger } from "./Logger";
import { Fields } from "../commons/Fields";
import { gamemods } from "../commons/gamemods";
import { getProtocol } from "../commons/protocolLoader";
import { pushSortedArrays } from "../commons/util/mergeSortedArrays";
import { minBy } from "../commons/util/minBy";
import { sleepTime } from "../commons/util/sleepTime";
import { Bot, generateBot } from "./Bot";
import { decodeFullMessage } from "../commons/util/decodeFullMessage";
import { flattenArrays } from "../commons/util/flattenArrays";
import { evalWonTrophees } from "./evalWonTrophees";
import { database } from "./Database";

const MIN_PING = Number(process.env.MIN_PING ?? 10);

const logger = getLogger("room");
logger.setLevel('info');


interface PlayerInput {
	connection: Connection;
	trophees: number;
	identifier: number;
	data: Uint8Array;
	pseudo: string | null;
}

interface EmulationInput {
	timestamp: number;
	player: number;
}

class Player {
	lastClientDate = 0;
	lastServerDate = 0;

	constructor(
		public connection: Connection | null,
		public readonly trophees: number,
		public readonly identifier: number,
		public readonly data: Fields,
		public readonly pseudo: string | null
	) {
		
	}

	init(date: number) {
		this.lastClientDate = date;
		this.lastServerDate = date;
	}

	getRuntimePing() {
		const now = performance.now();
		const delta = now - this.lastServerDate;
		this.lastServerDate = now;
		return delta;
	}
}


export class Room {
	private readonly bots: Bot<GameMode, any>[];
	private readonly players: Player[];
	private latestData!: Uint8Array;
	private latestUser: number = 0;
	private botsInstant: number = 0;
	private readonly inputs = new Array<Fields>();
	private finished = false;

	constructor(
		public readonly gamemodeId: string,
		public readonly gamemode: GameMode,
		players: PlayerInput[],
		bots: number,
		private onfinish: ()=>void
	) {
		this.bots = gamemode.getBotIds(bots).map(
			(i, index) => generateBot(gamemodeId, i, players.length + index)
		);
		this.players = players.map(p => new Player(
			p.connection,
			p.trophees,
			p.identifier,
			p.data,
			p.pseudo
		));
	}

	start(startData: Uint8Array, total: number) {
		this.gamemode.init();
		this.latestData = this.gamemode.save();

		const gdata = getProtocol(this.gamemodeId, 'multiplayer').get().ServerMessage.encode({
			timestamp: this.players[this.latestUser].lastClientDate,
			state: this.latestData,
			inputs: [],
		}).finish();

		const now = performance.now();
		for (const p of this.players) {
			p.init(now);
		}

		for (const [playerIdx, p] of this.players.entries()) {
			p.connection?.sendMessage({startGame: {
				playerIdx,
				total,
				gamemode: this.gamemodeId,
				startData,
				gdata,
			}});
		}

		this.botsInstant = now;
	}

	disconnect(idx: number) {
		if (this.players[idx].connection) {
			this.gamemode.onDisconnection(idx);
			this.players[idx].connection = null;
		}
	}

	async handle(
		encryptedData: Uint8Array,
		playerIdx: number
	): Promise<Uint8Array | null> {
		if (this.isFinished())
			return null;

		const {
			ClientMessage,
			ServerMessage
		} = getProtocol(this.gamemodeId, 'multiplayer').get();

		const data = decodeFullMessage(ClientMessage.decode(encryptedData));

		logger.debug(`Handle playerIdx=${playerIdx}, latestUser=${this.latestUser}`);


		// Add player inputs
		pushSortedArrays(
			this.inputs,
			data.inputs.map((i: any) => ({...i, player: playerIdx})),
			compareInputs
		);

		const pingCooldown = MIN_PING - this.players[playerIdx].getRuntimePing();
		if (pingCooldown > 0) {
			await sleepTime(pingCooldown);
			this.players[playerIdx].lastServerDate = performance.now();
		}

		// Move latestData
		if (this.latestUser === playerIdx) {
			const lastDate = this.players[playerIdx].lastClientDate;
			this.players[playerIdx].lastClientDate = data.timestamp;
			this.latestUser = minBy(this.players, getLastDate);
			
			
			const nextDate = this.players[this.latestUser].lastClientDate;
			logger.debug(`Run from ${
				lastDate.toFixed(4)
			} to ${
				nextDate.toFixed(4)
			} at {serv=${
				performance.now().toFixed(4)
			}, client=${
				data.timestamp.toFixed(4)
			} with ${
				JSON.stringify((this.inputs as any))
			}`);


			const tempInputs: Fields[] = [];
			/**
			 * If there is only one player, then process bots at every step
			 * because latestData belongs only to this unique player.
			*/
			const preprocess = this.players.length !== 1 ? undefined : (
				(timestamp: number) => this.preprocessBots(tempInputs, timestamp)
			);


			let finish: FinishGame | null = null;
			this.gamemode.emulate(
				lastDate,
				nextDate,
				this.inputs as EmulationInput[],
				preprocess,
				f => {finish = f;}
			);

			// Game is finished
			if (finish) {
				await this.finish(finish);
				return null;
			}

			pushSortedArrays(
				tempInputs,
				data.inputs.map((i: any) => ({...i, player: playerIdx})),
				compareInputs
			);			

			this.latestData = this.gamemode.save();

			let i = 0;
			while (
				i < this.inputs.length &&
				this.inputs[i].timestamp < nextDate
			) {i++;}

			this.inputs.splice(0, i);
		}

		// Add bots inputs
		if (this.players.length !== 1) {
			pushSortedArrays(
				this.inputs,
				this.runBots(),
				compareInputs
			);
		}

		return this.produceGData(ServerMessage);
	}

	private preprocessBots(
		supraList: Fields[],
		timestamp: number
	) {
		const list: Fields[] = [];
		for (const bot of this.bots) {
			const inputs = bot.play(this.gamemode).map(i => ({
				...i,
				player: bot.playerIdx,
				timestamp
			}));
			list.push(...inputs);
			supraList.push(...inputs);
		}

		return list as EmulationInput[];
	}

	private runBots(): Fields[] {
		const botsInputs: Fields[] = [];

		// Move temporary game to botsInstant
		const lastClientDate = this.players[this.latestUser].lastClientDate
		if (lastClientDate < this.botsInstant) {
			this.gamemode.emulate(
				lastClientDate,
				this.botsInstant,
				this.inputs as EmulationInput[],
			);
		}
	
		// Collect new inputs
		this.botsInstant = this.gamemode.emulate(
			this.botsInstant,
			() => performance.now(),
			this.inputs as EmulationInput[],
			timestamp => this.preprocessBots(botsInputs, timestamp)
		);

		// Restore game
		this.gamemode.load(this.latestData);

		return botsInputs;
	}

	private produceGData(ServerMessage: protobuf.Type) {
		return ServerMessage.encode({
			timestamp: this.players[this.latestUser].lastClientDate,
			state: this.latestData,
			inputs: this.inputs.map((data: any) => ({
				data,
				player: data.player
			}))
		}).finish()
	}

	private async finish(finish: FinishGame) {
		if (this.isFinished())
			return; // already sent

		this.finished = true;
		this.onfinish();




		// Get trophees
		const {trophees, scores} = await (async ()=>{
			if (this.bots.length) {
				// Game contained bots so return 0 for everyone
				return {
					trophees: Array.from({
						length: this.players.length + this.bots.length
					}, ()=>0),
					scores: []
				};
			}

			const tropheesPerPlayer = gamemods[this.gamemodeId].tropheesPerPlayer;
			const trophees = evalWonTrophees(finish).map((t, idx) => (
				Math.floor(t*tropheesPerPlayer)
			));


			// Give won trophees
			const db = await database;
			const deltas: {
				player: string;
				delta: number;
			}[] = [];
			for (const [idx, won] of trophees.entries()) {
				const p = this.players[idx];
				if (p.pseudo) {
					deltas.push({player: p.pseudo, delta: won});
				}
			}

			logger.info(`Give trophees in ${this.gamemodeId} with ${JSON.stringify(deltas)}`);

			const scores: number[] = Array.from({
				length: this.players.length
			}, ()=>0);

			const rawResults = await db.giveTrophees(this.gamemodeId, deltas);
			for (const r of rawResults) {
				const idx = this.players.findIndex(p => p.pseudo === r.player);
				if (idx !== -1) {
					scores[idx] = r.trophees;
				}
			}

			return {trophees, scores};
		})(); 



		// Data
		const spreadMsg = {
			finishGame: {
				results: flattenArrays(finish.results.map(
					i => i.map(
						j => (
							j < this.players.length ?
							this.players[j].identifier :
							-1
						)
					)
				), -2),
	
				playerEqualities: finish.playerEqualities.map(i => (
					i < this.players.length ?
					this.players[i].identifier :
					-1
				)),
	
				teamEqualities: finish.teamEqualities,
	
				scores: this.players.map((p, idx) => ({
					delta: trophees[idx],
					result: scores[idx],
					identifier: p.identifier,
				}))
			}
		};

		// Send message and disconnect from room
		for (const p of this.players) {
			if (p.connection) {
				p.connection.sendMessage(spreadMsg);
				p.connection.roomInfo = null;
			}
		}
	}

	isFinished() {
		return this.finished;
	}
}


class RoomHandler {
	private readonly rooms: Room[] = [];

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

		const created = factory.server(players, total);
		const room = new Room(
			gamemode,
			created.game,
			players,
			total - players.length,
			() => {this.rooms.splice(this.rooms.indexOf(room), 1);}
		);
		for (const [idx, player] of players.entries()) {
			player.connection.roomInfo = { room, idx };
		}

		this.rooms.push(room);

		room.start(created.data, total);
	}

	disconnect(connection: Connection) {
		if (connection.roomInfo === null)
			return;

		connection.roomInfo.room.disconnect(connection.roomInfo.idx);
	}
}

export const roomHandler = new RoomHandler();





function compareInputs(a: Fields, b: Fields) {
	return a.timestamp - b.timestamp;
}

function getLastDate(player: Player) {return player.lastClientDate;}

function inspectMessage(i: any): any {
	throw new Error("Function not implemented.");
}

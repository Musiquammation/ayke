import { WebSocket } from "ws";
import protobuf from "protobufjs";
import { msgtypes } from "./sendMessage";
import { database } from "./Database";
import { matchmaking } from "./Matchmaking";
import { Room, roomHandler } from "./RoomHandler";
import { getLogger } from "./Logger";
import { Fields } from "../commons/Fields";
import { evalSoloRunScore } from "./evalSoloRunScore";

const logger = getLogger('connection');
// logger.setLevel('debug');

interface RoomInfo {
	room: Room;
	idx: number;
}

export class Connection {
	private pseudo: string | null = null;
	private alive = true;
	roomInfo: RoomInfo | null = null;

	static readonly runners: Record<string, (c: Connection, data: any) => void> = {
		/**
		 * Handles real-time binary game data frames from players.
		 */
		gdata(c, gdata) {
			if (c.roomInfo === null) {
				c.sendError(2, "Player is not in a room");
				return;
			}

			const room = c.roomInfo.room;
			const gdataPromise = room.handle(
				gdata,
				c.roomInfo.idx
			);

			gdataPromise.then(d => {
				if (d === null)
					return;

				c.sendMessage({gdata: d});
			});
		},

		/**
		 * Handles user registration and generates an initial API key upon success.
		 */
		async createAccount(c, d) {
			const db = await database;
			const success = await db.addUser(d.pseudo, d.password);
			let key: string | undefined = undefined;

			if (success) {
				c.pseudo = d.pseudo;
				key = await db.createKey(d.pseudo);
			}

			c.sendMessage({
				createAccountResult: {
					success,
					pseudo: success ? d.pseudo : undefined,
					key
				}
			});
		},

		/**
		 * Handles login with pseudo and password, generating a new session API key.
		 */
		async login(c, d) {
			if (c.pseudo !== null) {
				c.sendError(1, "Connection already logged in");
				return;
			}

			const db = await database;
			const success = await db.checkPassword(d.pseudo, d.password);
			let key: string | undefined = undefined;

			if (success) {
				c.pseudo = d.pseudo;
				key = await db.createKey(d.pseudo);
			}

			c.sendMessage({
				loginResult: {
					success,
					pseudo: success ? d.pseudo : undefined,
					key
				}
			});
		},

		/**
		 * Handles fast login/reconnection using an API token key.
		 */
		async loginWithKey(c, key) {
			if (c.pseudo !== null) {
				c.sendError(1, "Connection already logged in");
				return;
			}

			const db = await database;
			const pseudo = await db.getUserFromKey(key);

			if (pseudo !== null) {
				c.pseudo = pseudo;
				c.sendMessage({
					loginResult: {
						success: true,
						pseudo,
						key
					}
				});
			} else {
				c.sendMessage({
					loginResult: {
						success: false
					}
				});
			}
		},

		/**
		 * Places player into the matchmaking queue for a specific gamemode.
		 */
		startGame(c, d) {
			const gamemode: string = d.gamemode;
			matchmaking.addConnection(c, gamemode, d.data);
		},

		/**
		 * Registers a vote to allow bot inclusion in a waiting room.
		 */
		allowBotsOrder(c, d) {
			matchmaking.voteBotsUse(c, d);
		},

		/**
		 * Removes connection from current matchmaking waiting room.
		 */
		quitWaitingRoom(c) {
			matchmaking.removeConnection(c);
		},

		/**
		 * Responds with performance timestamp to sync time latency.
		 */
		askTimeDelta(c) {
			c.sendMessage({ timeDeltaDate: performance.now() });
		},

		async deleteConnectionKey(c, key) {
			const db = await database;
			db.revokeKey(key);	
		},

		/**
		 * Fetches leaderboard data requested by the client and sends the result.
		 */
		async askLeaderboard(c, data) {
			try {
				const db = await database;
				const gamemode = data.gamemode || null;
				// Default to first page (index 0) if missing
				const page = data.page || 0; 
				
				const entries = await db.getLeaderboard(gamemode, page);

				c.sendMessage({
					leaderboardResult: { entries }
				});
			} catch (error) {
				console.error("Failed to fetch leaderboard:", error);
				c.sendError(3, "Failed to retrieve leaderboard");
			}
		},

		async soloRunInputs(c, d) {
			const pseudo = c.getPseudo();
			const db = await database;

			const score = await evalSoloRunScore(
				d.gamemode,
				d.category,
				d.seed,
				d.inputs
			);

			const logger = getLogger('solo');
			logger.info(`${pseudo} scored ${score} in ${
				d.gamemode} (category=${d.category})`);

			// db.registerSoloRecord(d.gamemode, d.category, c.getPseudo(), score);
		}
	};






	constructor(
		private socket: WebSocket
	) {

	}

	getPseudo() {
		return this.pseudo;
	}

	sendMessage(msg: {[k: string]: any}) {
		msgtypes.then(m => {
			const data = m.ServerMessage.encode(msg).finish();
			const buffer = new ArrayBuffer(data.byteLength);
			new Uint8Array(buffer).set(data);
			this.socket.send(buffer);
		});
	}

	sendError(code: number, message: string) {
		this.sendMessage({error: {code, message}});
	}

	
	onMessage(msg: protobuf.ReflectedMessage) {
		if (msg.message) {
			Connection.runners[msg.message](this, msg[msg.message]);
		}
	}

	onClose() {
		matchmaking.removeConnection(this);
		roomHandler.disconnect(this);
	}

	isAlive() {
		return this.alive && this.socket.readyState === WebSocket.OPEN;
	}
}

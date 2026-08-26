import { WebSocket } from "ws";
import protobuf from "protobufjs";
import { msgtypes } from "./sendMessage";
import { database } from "./Database";
import { matchmaking } from "./Matchmaking";
import { Room, roomHandler } from "./RoomHandler";
import { getLogger } from "./Logger";
import { Fields } from "../commons/Fields";

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

	static runners: Record<string, (c: Connection, data: any) => void> = {
		gdata(c, gdata) {
			if (c.roomInfo === null) {
				c.sendError(2, "Player is not in a room");
				return;
			}

			const gdataPromise = c.roomInfo.room.handle(
				gdata,
				c.roomInfo.idx
			);

			gdataPromise.then(gdata => c.sendMessage({gdata}));
		},

		async createAccount(c, d) {
			const db = await database;
			const success = await db.addUser(d.pseudo, d.password);

			c.sendMessage({createAccountResult: {success}});
		},

		async login(c, d) {
			if (c.pseudo !== null) {
				c.sendError(1, "Connection already logged in");
				return;
			}

			const db = await database;
			const success = await db.checkPassword(d.pseudo, d.password);

			if (success) {
				c.pseudo = d.pseudo;
			}

			c.sendMessage({loginResult: {success}});
		},

		startGame(c, d) {
			const gamemode: string = d.gamemode;
			matchmaking.addConnection(c, gamemode, d.data);
		},

		allowBotsOrder(c, d) {
			matchmaking.voteBotsUse(c, d);
		},

		quitWaitingRoom(c) {
			matchmaking.removeConnection(c);
		},

		askTimeDelta(c) {
			c.sendMessage({timeDeltaDate: performance.now()});
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
		Connection.runners[msg.message](this, msg[msg.message]);
	}

	onClose() {
		matchmaking.removeConnection(this);
		roomHandler.disconnect(this);
	}

	isAlive() {
		return this.alive && this.socket.readyState === WebSocket.OPEN;
	}
}

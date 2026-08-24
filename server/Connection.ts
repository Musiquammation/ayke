import { WebSocket } from "ws";
import protobuf from "protobufjs";
import { msgtypes } from "./sendMessage";
import { database } from "./Database";
import { matchmaking } from "./Matchmaking";
import { Room, roomHandler } from "./RoomHandler";
import { getLogger } from "./Logger";

const logger = getLogger('connection');
// logger.setLevel('debug');

function run<T>(data: T | undefined, exec: (data: T)=>void) {
	if (data) {
		exec(data);
	}
}


interface RoomInfo {
	room: Room;
	idx: number;
}

export class Connection {
	private pseudo: string | null = null;
	private alive = true;
	roomInfo: RoomInfo | null = null;

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
		if (msg.gdata.length) {
			if (this.roomInfo === null) {
				this.sendError(2, "Player is not in a room");
				return;
			}

			const gdata = this.roomInfo.room.handle(msg.gdata);
			this.sendMessage({gdata});
			return;
		}

		logger.debug(JSON.stringify(msg, null, 4));

		run(msg.createAccount, async d => {
			const db = await database;
			const success = await db.addUser(d.pseudo, d.password);
			this.sendMessage({createAccountResult: {success}});
		});

		run(msg.login, async d => {
			if (this.pseudo !== null) {
				this.sendError(1, "Connection already logged in");
			}

			const db = await database;
			const success = await db.checkPassword(d.pseudo, d.password);
			if (success) {
				this.pseudo = d.pseudo;
			}
			this.sendMessage({loginResult: {success}});
		});

		run(msg.startGame, d => {
			const gamemode: string = d.gamemode;
			matchmaking.addConnection(this, gamemode, {});
		});

		run(msg.useBotsOrder, d => {
			matchmaking.voteBotsUse(this, d.allow);
		});

		run(msg.quitWaitingRoom, d => {
			matchmaking.removeConnection(this);
		});
	}

	onClose() {
		matchmaking.removeConnection(this);
		roomHandler.disconnect(this);
	}

	isAlive() {
		return this.alive && this.socket.readyState === WebSocket.OPEN;
	}
}

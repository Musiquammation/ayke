import { getGameHandler, setGameHandler } from "../handlers/GameHandler";
import { msgtypes, sendMessage } from "./sendMessage";
import { getWaitingPlayHandler, setWaitingPlayHandler } from "../handlers/WaitingPlayHandler"
import { decodeFullMessage } from "../../../commons/util/decodeFullMessage";
import { unflattenPositiveArrays } from "../../../commons/util/flattenArrays";
import { dom } from "../dom/dom";

function run<T>(data: T | undefined, exec: (data: T)=>void) {
	if (data) {
		exec(data);
	}
}


const runners: Record<string, (data: any)=>void> = {
	gdata(gdata) {
		const ghandler = getGameHandler();
		if (ghandler) {
			const newGdata = ghandler.receive(gdata);
			sendMessage({gdata: newGdata});			
		} else {
			console.warn("Received gdata while ghandler is null");
		}
	},

	async startGame(d) {
		const ghandler = await setGameHandler(
			d.gamemode,
			d.playerIdx,
			d.startData,
			d.total
		);
		const gdata = ghandler.receive(d.gdata);
		console.log("playerIdx", d.playerIdx);
		sendMessage({gdata});
	},

	createAccountResult(d) {
		console.log(d.success);
	},

	loginResult(d) {
	},


	error(d) {
		console.error(d.code, d.message);
	},

	waitingWelcome(d) {
		setWaitingPlayHandler(d.total, d.gamemode, d.identifier, d.users);
	},

	waitingAddUser(d) {
		const w = getWaitingPlayHandler();
		if (w) {
			w.add(d.user);
		}
	},

	waitingRemoveUser(d) {
		const w = getWaitingPlayHandler();
		if (w) {
			w.remove(d.identifier);
		}
	},

	waitingAllowBots(d) {
		const w = getWaitingPlayHandler();
		if (w) {
			w.updateBotAllow(d.identifier, d.allow);
		}
	},

	finishGame(d) {
		d = decodeFullMessage(d);
		d.results = unflattenPositiveArrays(d.results, -2);
		dom.openPlayResults(d);
	}
}

export function recvMessage(msg: protobuf.ReflectedMessage) {
	runners[msg.message](msg[msg.message]);
}



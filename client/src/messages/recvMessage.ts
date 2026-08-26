import { getGameHandler, setGameHandler } from "../GameHandler";
import { msgtypes, sendMessage } from "./sendMessage";
import { getWaitingPlayHandler, setWaitingPlayHandler } from "../WaitingPlayHandler"

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
		const ghandler = getGameHandler();
		if (ghandler) {
			ghandler.receive(d.gdata);
		}
		
		console.log(d);
	}
}

export function recvMessage(msg: protobuf.ReflectedMessage) {
	runners[msg.message](msg[msg.message]);
}



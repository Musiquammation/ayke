import { getGameHandler, setGameHandler } from "../handlers/GameHandler";
import { msgtypes, sendMessage } from "./sendMessage";
import { getWaitingPlayHandler, setWaitingPlayHandler } from "../handlers/WaitingPlayHandler"
import { decodeFullMessage } from "../../../commons/util/decodeFullMessage";
import { unflattenPositiveArrays } from "../../../commons/util/flattenArrays";
import { dom } from "../dom/dom";


const runners: Record<string, (data: any) => void> = {
	gdata(gdata) {
		const ghandler = getGameHandler();
		if (ghandler) {
			const newGdata = ghandler.receive(gdata);
			sendMessage({ gdata: newGdata });
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
		sendMessage({ gdata });
	},

	/**
	 * Handle account creation response from the server.
	 */
	createAccountResult(d) {
		console.log("createAccountResult success:", d.success);
		if (d.success) {
			if (d.key) {
				localStorage.setItem("ayke_connectionKey", d.key);
			}
			dom.isAuthenticated = true;
			dom.pseudo = d.pseudo;
			dom.openHome();
		} else {
			dom.getSigninPanel().errorMessage = 
				"Account creation failed. Username may already be taken.";
		}
	},

	/**
	 * Handle login response from the server.
	 */
	loginResult(d) {
		console.log("loginResult success:", d.success);
		if (d.success) {
			if (d.key) {
				localStorage.setItem("ayke_connectionKey", d.key);
			}
			dom.isAuthenticated = true;
			dom.pseudo = d.pseudo;
			dom.openHome();
		} else {
			dom.getLoginPanel().errorMessage = 
				"Invalid username or password";
		}
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
	},

	/**
	 * Handles the paginated leaderboard results sent by the server.
	 */
	leaderboardResult(d) {
		if (dom.uses('leaderboard')) {
			const panel = dom.getLeaderboardPanel();
			// Ensure it resets properly if undefined/null
			panel.entries = d.entries || []; 
		}
	},

	soloRecords(d) {
		if (dom.uses('solo-leaderboard')) {
			const panel = dom.getSoloLeaderboardPanel();
			console.log(d);
			panel.setSoloRecords(d);
		}
	}
};


export function recvMessage(msg: protobuf.ReflectedMessage) {
	runners[msg.message](msg[msg.message]);
}



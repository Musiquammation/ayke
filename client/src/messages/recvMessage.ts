import { getGameHandler, setGameHandler } from "../GameHandler";
import { msgtypes, sendMessage } from "./sendMessage";

function run<T>(data: T | undefined, exec: (data: T)=>void) {
	if (data) {
		exec(data);
	}
}


export function recvMessage(msg: protobuf.ReflectedMessage) {
	if (msg.gdata.length) {
		const ghandler = getGameHandler();
		if (ghandler) {
			const gdata = ghandler.receive(msg.gdata);
			sendMessage({gdata});			
		} else {
			console.warn("Received gdata while ghandler is null");
		}

		return;
	}

	run(msg.startGame, async d => {
		const ghandler = await setGameHandler(
			d.gamemode,
			d.playerIdx,
			d.startData,
			d.total
		);
		const gdata = ghandler.receive(d.gdata);
		console.log("playerIdx", d.playerIdx);
		sendMessage({gdata});
	});

	run(msg.createAccountResult, d => {
		console.log(d.success);
	});

	run(msg.loginResult, d => {
		console.log(d.success);
	});

	run(msg.error, d => {
		console.error(d.code, d.message);
	})
}


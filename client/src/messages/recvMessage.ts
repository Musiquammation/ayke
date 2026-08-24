import { getGameHandler } from "../GameHandler";
import { msgtypes } from "./sendMessage";

function run<T>(data: T | undefined, exec: (data: T)=>void) {
	if (data) {
		exec(data);
	}
}


export function recvMessage(msg: protobuf.ReflectedMessage) {
	if (msg.gdata.length) {
		const ghandler = getGameHandler();
		if (ghandler) {
			ghandler.receive(msg.gdata);
		} else {
			console.warn("Received gdata while ghandler is null");
		}

		return;
	}

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


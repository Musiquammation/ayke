import { dom } from "./dom/dom";
import { sendMessage } from "./messages/sendMessage";

export function init() {
	// test
	sendMessage({
		startGame: {
			gamemode: "test"
		}
	});

	
}

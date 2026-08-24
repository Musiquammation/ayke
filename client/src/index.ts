import { dom, initDom } from "./dom/dom";
import { sendMessage } from "./messages/sendMessage";

export function init() {
	initDom();

	// test
	sendMessage({
		startGame: {
			gamemode: "test"
		}
	});

	
}

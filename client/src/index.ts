import protobuf from "protobufjs";
import { initProtocols } from "../../commons/protocolLoader";
import { dom, initDom } from "./dom/dom";
import { sendMessage } from "./messages/sendMessage";
import { setGameHandler } from "./GameHandler";
import { GMTest } from "../../commons/gamemods/GMTest";

declare global {
	interface Window {
		PROTOCOLS_FOLDER: string;
	}
}

export function init() {
	initProtocols(async name => {
		const response = await fetch(window.PROTOCOLS_FOLDER + name + ".proto");
		const protoText = await response.text();
		return protobuf.parse(protoText).root;
	});
	

	initDom();

	// test
	sendMessage({
		startGame: {
			gamemode: "test"
		}
	});

	setGameHandler('test', [], 2);
}

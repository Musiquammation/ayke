import protobuf from "protobufjs";
import { recvMessage } from "./recvMessage";

declare global {
	interface Window {
		SERVER_ADDRESS: string;
		PROTOCOL_FILE: string;
	}
}


export const msgtypes = (async function() {
	const root = await (async function () {
		const response = await fetch(window.PROTOCOL_FILE);
		const protoText = await response.text();
		return protobuf.parse(protoText).root;
	})();

	const ClientMessage = root.lookupType("game.ClientMessage");
	const ServerMessage = root.lookupType("game.ServerMessage");

	const socket = new WebSocket(window.SERVER_ADDRESS);

	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => {
			resolve();
		});

		socket.addEventListener("message", async (event: MessageEvent) => {
			try {
				const buffer = new Uint8Array(await event.data.arrayBuffer());
				const decodedMessage = ServerMessage.decode(buffer);
				recvMessage(decodedMessage);

			} catch (error) {
				console.error("Failed to decode the incoming WebSocket message:", error);
			}
		});

		socket.addEventListener("error", () => {
			reject(new Error("WebSocket connection failed"));
		});
	});

	console.log("WebSocket connected!");


	function send(message: {[k: string]: any}) {
		const data = ClientMessage.encode(message).finish();

		const buffer = new ArrayBuffer(data.byteLength);
		new Uint8Array(buffer).set(data);

		socket.send(buffer);
	}

	return {
		send,
		ClientMessage,
	};
})();


export function sendMessage(message: {[k: string]: any}) {
	msgtypes.then(m => m.send(message));
}
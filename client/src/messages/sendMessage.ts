import protobuf from "protobufjs";
import { recvMessage } from "./recvMessage";

declare global {
	interface Window {
		SERVER_ADDRESS: string;
		PROTOCOL_FILE: string;
	}
}

let _deltaTime = 0;
let _deltaSendDate = 0;

function calculateDeltaTime(servDate: number) {
	const clientReceive = performance.now();
	const serverTime = Number(servDate);
	const rtt = clientReceive - _deltaSendDate;
	_deltaTime = serverTime - (_deltaSendDate + rtt / 2);

	console.log(_deltaTime);
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
				const msg = ServerMessage.decode(buffer);

				if (msg.timeDeltaDate) {
					calculateDeltaTime(msg.timeDeltaDate);
				}

				recvMessage(msg);

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


	// Send askTimeDelta
	{
		const data = ClientMessage.encode({askTimeDelta: {}}).finish();
		const buffer = new ArrayBuffer(data.byteLength);
		new Uint8Array(buffer).set(data);
		_deltaSendDate = performance.now();
		socket.send(buffer);
	}

	return {
		send,
		ClientMessage,
		ServerMessage,
	};
})();


export function sendMessage(message: {[k: string]: any}) {
	msgtypes.then(m => m.send(message));
}

export function getNow() {
	return performance.now() + _deltaTime;
}
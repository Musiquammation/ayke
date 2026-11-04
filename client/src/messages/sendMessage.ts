import protobuf from "protobufjs";
import { recvMessage } from "./recvMessage";
import { getMobile } from "../getMobile";
import { STORAGE_KEY_CONNECTION } from "./STORAGE_KEY_CONNECTION";
import { dom } from "../dom/dom";

declare global {
	interface Window {
		SERVER_ADDRESS: string;
		PROTOCOL_FILE: string;
		VERSION_CODE: number;
	}
}

let _deltaTime = 0;
let _deltaSendDate = 0;

function calculateDeltaTime(servDate: number) {
	const clientReceive = performance.now();
	const serverTime = Number(servDate);
	const rtt = clientReceive - _deltaSendDate;
	_deltaTime = serverTime - (_deltaSendDate + rtt / 2);

	console.log("Delta time:", _deltaTime.toFixed(4));
}

let _isSocketConnectedToServer = false;

export const msgtypes = (async function() {
	const root = await (async function () {
		const response = await fetch(window.PROTOCOL_FILE);
		const protoText = await response.text();
		return protobuf.parse(protoText).root;
	})();

	const ClientMessage = root.lookupType("game.ClientMessage");
	const ServerMessage = root.lookupType("game.ServerMessage");
	const ServerVersion = root.lookupType("game.ServerVersion");

	const socket = new WebSocket(window.SERVER_ADDRESS);

	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => {
			
		});

		let firstMessage = true;
		socket.addEventListener("message", async (event: MessageEvent) => {
			try {
				if (firstMessage) {
					const buffer = new Uint8Array(await event.data.arrayBuffer());
					const msg = ServerVersion.decode(buffer);
					if (msg.versionCode !== window.VERSION_CODE) {
						alert("Please update Ayke");
						reject(`Version mismatch (${msg.versionCode} vs ${window.VERSION_CODE})`);
					}

					console.log("Version code successfully checked", msg.versionCode);
					_isSocketConnectedToServer = true;


					askCreateAccount();
					resolve();
					firstMessage = false;
				}
				const buffer = new Uint8Array(await event.data.arrayBuffer());
				const msg = ServerMessage.decode(buffer);

				if (msg.message === 'timeDeltaDate') {
					calculateDeltaTime(msg.timeDeltaDate);
				} else {
					recvMessage(msg);
				}


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

export function isSocketConnectedToServer() {
	return _isSocketConnectedToServer;
}

function askCreateAccount() {
	const STORAGE_KEY_LAST = "ayke_lastActivityDate";
	const COOLDOWN = 24 * 3600*1000; // 24 hours

	const last = localStorage.getItem(STORAGE_KEY_LAST);
	localStorage.setItem(STORAGE_KEY_LAST, Date.now().toString())

	if (localStorage.getItem(STORAGE_KEY_CONNECTION))
		return;

	if (last && (Date.now() - parseInt(last)) > COOLDOWN) {
		if (confirm("Do you can to create an account?")) {
			dom.openLogin();
		}
	}
}
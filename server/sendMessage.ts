import "dotenv/config";
import { WebSocket } from "ws";
import protobuf from "protobufjs";
import { Server } from "ws";
import { Connection } from "./Connection";

interface Temp {
	ClientMessage: protobuf.Type;
	ServerMessage: protobuf.Type;
	ServerVersion: protobuf.Type;
}

let resolveMsgTypes: ((value: Temp) => void) | null = null;

export const msgtypes = new Promise<Temp>((resolve) => {
	resolveMsgTypes = resolve;
});

const VERSION_CODE = Number(process.env.VERSION_CODE ?? 0);

export async function initSendMessage(
	protocolPath: string,
	wss: Server<typeof WebSocket>
) {
	const root = await protobuf.load(protocolPath);
	const ClientMessage = root.lookupType("game.ClientMessage");
	const ServerMessage = root.lookupType("game.ServerMessage");
	const ServerVersion = root.lookupType("game.ServerVersion");


	// Resolve the promise once all message types have been loaded.
	resolveMsgTypes!({
		ClientMessage,
		ServerMessage,
		ServerVersion
	});

	wss.on("connection", async (socket: WebSocket) => {
		const connection = new Connection(socket);

		socket.on("close", () => {
			connection.onClose();
		});

		// Send ServerVersion
		{
			const m = await msgtypes;
			const data = m.ServerVersion.encode({versionCode: VERSION_CODE}).finish();
			const buffer = new ArrayBuffer(data.byteLength);
			new Uint8Array(buffer).set(data);
			socket.send(buffer);
		}

		// Listeners
		socket.on("message", (data: Buffer) => {
			const msg = ClientMessage.decode(data);
			connection.onMessage(msg);
		});
	});
}
import { WebSocket } from "ws";
import protobuf from "protobufjs";
import { Server } from "ws";
import { Connection } from "./Connection";

interface Temp {
	ClientMessage: protobuf.Type;
	ServerMessage: protobuf.Type;
}

let resolveMsgTypes: ((value: Temp) => void) | null = null;

export const msgtypes = new Promise<Temp>((resolve) => {
	resolveMsgTypes = resolve;
});


export async function initSendMessage(
	protocolPath: string,
	wss: Server<typeof WebSocket>
) {
	const root = await protobuf.load(protocolPath);

	const ClientMessage = root.lookupType("game.ClientMessage");
	const ServerMessage = root.lookupType("game.ServerMessage");

	// Resolve the promise once all message types have been loaded.
	resolveMsgTypes!({
		ClientMessage,
		ServerMessage,
	});

	wss.on("connection", (socket: WebSocket) => {
		const connection = new Connection(socket);

		socket.on("message", (data: Buffer) => {
			const msg = ClientMessage.decode(data);
			connection.onMessage(msg);
		});

		socket.on("close", () => {
			connection.onClose();
		});
	});
}
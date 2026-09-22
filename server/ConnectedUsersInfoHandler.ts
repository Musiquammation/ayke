import { getLogger } from "../commons/ILogger";
import { Connection } from "./Connection";
import { matchmaking } from "./Matchmaking";
import { roomHandler } from "./RoomHandler";


class ConnectedUsersInfoHandler {
	private sharedMessage: ArrayBuffer | null = null;
	private subscribers = new Set<Connection>();
	private interval: ReturnType<typeof setInterval> | null = null;

	private total = 0;

	subscribe(connection: Connection, subscribe: boolean) {
		if (subscribe) {
			this.subscribers.add(connection);

			// Generate the message immediately if it does not exist yet.
			if (this.sharedMessage === null) {
				this.generateMessage().then(() => {
					if (this.sharedMessage !== null) {
						connection.sendEncodedMessage(this.sharedMessage);
					}
				});
			} else {
				// Send the already encoded message directly.
				connection.sendEncodedMessage(this.sharedMessage);
			}

			this.startInterval();
		} else {
			this.subscribers.delete(connection);
		}
	}

	addUser() {
		this.total++;
		this.startInterval();
	}

	remUser(connection: Connection) {
		this.subscribe(connection, false);
		this.total--;

		// Stop updating when there are no connected users left.
		if (this.total <= 0) {
			this.total = 0;
			this.stopInterval();
		}
	}

	private startInterval() {
		if (this.interval !== null || this.total <= 0) {
			return;
		}

		// Update and broadcast the connected users information every 2 seconds.
		this.interval = setInterval(async () => {
			await this.generateMessage();

			if (this.sharedMessage === null) {
				return;
			}

			// Send the same already encoded message to every subscriber.
			for (const connection of this.subscribers) {
				connection.sendEncodedMessage(this.sharedMessage);
			}
		}, 2000);
	}

	private stopInterval() {
		if (this.interval === null) {
			return;
		}

		clearInterval(this.interval);
		this.interval = null;
	}

	private async generateMessage() {
		const a = roomHandler.askConnectedUsers();
		const b = matchmaking.askConnectedUsers();

		const gamemods = Object.entries(a).map(([gamemode, total]) => ({
			gamemode,
			total: total + (b[gamemode] ?? 0)
		}));

		for (const [gamemode, total] of Object.entries(b)) {
			if (!(gamemode in a)) {
				gamemods.push({ gamemode, total });
			}
		}

		this.sharedMessage = await Connection.encode({
			connectedUsersInfo: {
				total: this.total,
				gamemods
			}
		});
	}
}

export const connectedUsersInfoHandler =
	new ConnectedUsersInfoHandler();
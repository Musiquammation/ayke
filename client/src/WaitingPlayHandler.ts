import { Fields } from "../../commons/Fields";
import { gamemods } from "../../commons/gamemods";
import { getProtocol } from "../../commons/protocolLoader";
import { decodeFullMessage } from "../../commons/util/decodeFullMessage";
import { dom } from "./dom/dom";

interface IUser {
	pseudo: string | null;
	allowBots: boolean;
	isBot: boolean;
	identifier: number;
	data: Uint8Array;
}

export interface WaitingPlayHandlerUser {
	pseudo: string | null;
	allowBots: boolean;
	isBot: boolean;
	data: Fields;
}

type User = WaitingPlayHandlerUser;

type UpdateMethod = (
	users: Record<number, User>,
	event:
		| { type: 'add', identifier: number }
		| { type: 'updateBotAllow', identifier: number, allow: boolean }
		| { type: 'remove', identifier: number }
) => void;

class WaitingPlayHandler {
	private readonly users: Record<number, User> = {};

	constructor(
		public readonly total: number,
		public readonly gamemode: string,
		public readonly userIdentifier: number,
		private readonly update: UpdateMethod,
		users: IUser[]
	) {
		const protocol = getProtocol(gamemode);

		protocol.load().then(() => {
			const { StartData } = protocol.get();

			for (const user of users) {
				this.users[user.identifier] = {
					pseudo: user.pseudo,
					allowBots: user.allowBots,
					isBot: user.isBot,
					data: decodeFullMessage(
						StartData.decode(user.data)
					)
				};
			}
		});
	}

	add(user: IUser) {
		const protocol = getProtocol(this.gamemode);

		protocol.load().then(() => {
			const { StartData } = protocol.get();

			this.users[user.identifier] = {
				pseudo: user.pseudo,
				allowBots: user.allowBots,
				isBot: user.isBot,
				data: decodeFullMessage(
					StartData.decode(user.data)
				)
			};

			this.update(this.users, {
				type: 'add',
				identifier: user.identifier
			});
		});
	}

	remove(identifier: number) {
		this.update(this.users, {
			type: 'remove',
			identifier
		});

		delete this.users[identifier];
	}

	updateBotAllow(identifier: number, allow: boolean) {
		const user = this.users[identifier];

		if (user) {
			user.allowBots = allow;

			this.update(this.users, {
				type: 'updateBotAllow',
				identifier,
				allow
			});
		}
	}
}


let waitingPlayHandler: WaitingPlayHandler | null = null;

export function getWaitingPlayHandler() {
	return waitingPlayHandler;
}


function getPanelUsers(users: Record<number, User>) {
	return Object.values(users);
}

export function setWaitingPlayHandler(
	total: number,
	gamemode: string,
	userIdentifier: number,
	users: IUser[]
) {
	const factory = gamemods[gamemode];
	if (!factory) {
		throw new Error(`Invalid gamemode '${gamemode}'`);
	}

	const updateDom: UpdateMethod = function(users, event) {
		const waitPlayPanel = dom.waitPlayPanel;
		if (waitPlayPanel === null) {
			return;
		}

		switch (event.type) {
			case "add":
				waitPlayPanel.add(users[event.identifier]);
				break;

			case "remove":
				waitPlayPanel.remove(users[event.identifier]);
				break;

			case "updateBotAllow":
				waitPlayPanel.updateBotAllow(users[event.identifier], event.allow);
				break;

		}
	}

	const waitPlayPanel = dom.waitPlayPanel;
	if (waitPlayPanel) {
		waitPlayPanel.init(getPanelUsers(users), users[userIdentifier]);
	}


	
	waitingPlayHandler = new WaitingPlayHandler(
		total,
		gamemode,
		userIdentifier,
		updateDom,
		users
	);

	return waitingPlayHandler;
}

export function deleteGameHandler() {
	waitingPlayHandler = null;
}


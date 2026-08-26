import Alpine from "alpinejs";
import { gamemods } from "../../../commons/gamemods";
import { TemplateLoader } from "./TemplateLoader";
import { sendMessage } from "../messages/sendMessage";
import { WaitingPlayHandlerUser } from "../WaitingPlayHandler";
import { escapeHTML } from "../../../commons/util/escapeHTML";

declare global {
	interface Window {
		Alpine: any;
		dom: MainComponent;
	}
}

interface GamePanelData {
	produce: () => Uint8Array<ArrayBufferLike>;
}

class MainComponent {
	private currentPage = "index";
	private templateLoader = new TemplateLoader();

	protected gamePanel: GamePanelComponent | null = null;
	waitPlayPanel: WaitPlayPanelComponent | null = null;


	// test data
	y0 = 0;
	y1 = 0;

	uses(page: string) {
		return this.currentPage === page;
	}

	openIndex() {
		this.currentPage = "index";
	}

	openTest() {
		this.currentPage = "test";
	}

	async openGamePanel(gamemode: string) {
		this.currentPage = "loading";

		const factory = gamemods[gamemode];

		if (!factory) {
			throw new Error(`Invalid gamemode '${gamemode}'`);
		}

		const data = factory.dom();
		const html = await this.templateLoader.load(gamemode);
		this.gamePanel = new GamePanelComponent(gamemode, data, html);
		this.currentPage = "game-panel";
	}

	openWaitPlayPanel(gamemode: string) {
		this.gamePanel = null;
		this.waitPlayPanel = new WaitPlayPanelComponent(gamemode)
		this.currentPage = "wait-play";

	}

	openPlay() {
		this.currentPage = "play";
	}
}

class GamePanelComponent {
	constructor(
		public readonly gamemode: string,
		public readonly data: GamePanelData,
		public readonly htmlContent: string
	) {
		
	}

	uses(gamemode: string) {
		return this.gamemode === gamemode;
	}

	play() {
		dom.openWaitPlayPanel(this.gamemode);

		sendMessage({
			startGame: {
				gamemode: this.gamemode,
				data: this.data.produce()
			}
		});
	}
}

class WaitPlayPanelComponent {
	private users: WaitingPlayHandlerUser[] = [];
	private allowBots = false;
	private logs: string[] = [];
	private me!: WaitingPlayHandlerUser;

	constructor(
		private readonly gamemode: string
	) {}

	init(users: WaitingPlayHandlerUser[], me: WaitingPlayHandlerUser) {
		this.users = users;
		this.me = me;
	}

	add(user: WaitingPlayHandlerUser) {
		this.users.push(user);
		this.notify(`${this.showPseudo(user.pseudo)} joined the room`);
	}

	remove(user: WaitingPlayHandlerUser) {
		this.users = this.users.filter(currentUser => currentUser !== user);
		this.notify(`${this.showPseudo(user.pseudo)} left the room`);
	}

	updateBotAllow(user: WaitingPlayHandlerUser, allow: boolean) {
		this.notify(`${
			this.showPseudo(user.pseudo)
		} ${
			allow ? "accepts" : "refuses"
		} bots`);
	}


	showPseudo(pseudo: string | undefined | null) {
		if (pseudo) return escapeHTML(pseudo);
		return "<i>(anonymous)</i>";
	}

	private notify(msg: string) {
		console.log(msg);
		this.logs.push(msg);
	}

	private onAllowBotsChange() {
		sendMessage({
			allowBotsOrder: this.allowBots
		});
	}
}

export const dom = Alpine.reactive(new MainComponent());

export function initDom() {
	document.addEventListener("alpine:init", () => {
		Alpine.data("main", () => dom);
	});

	window.Alpine = Alpine;
	window.dom = dom;

	Alpine.start();
}